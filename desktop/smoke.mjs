import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { readBackup, readDatabaseBackup } from './storage.mjs';

const runtime = fileURLToPath(new URL('../.runtime', import.meta.url));
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const executable = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL(`../release/${version}/win-unpacked/MindSpace%20Personal.exe`, import.meta.url));
const previous = process.argv[3] ? resolve(process.argv[3]) : executable;
mkdirSync(runtime, { recursive: true });
const directory = mkdtempSync(join(runtime, 'desktop-test-'));
const portFile = join(directory, 'DevToolsActivePort');
const idea = { id: 'desktop-test', title: 'Проверка сборки', notes: 'Данные тестового профиля', status: 'new' };
const lastTask = 'Задача перед закрытием';

async function retry(callback) {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { return await callback(); } catch (error) { lastError = error; }
    await delay(200);
  }
  throw lastError;
}

async function connect(url) {
  const socket = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const events = [];
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('close', () => {
    for (const { reject } of pending.values()) reject(new Error('Окно закрыто.'));
    pending.clear();
  });
  socket.addEventListener('message', ({ data }) => {
    const packet = JSON.parse(data);
    if (!packet.id) {
      events.push(packet);
      return;
    }
    const request = pending.get(packet.id);
    if (!request) return;
    pending.delete(packet.id);
    if (packet.error) request.reject(new Error(packet.error.message));
    else request.resolve(packet.result);
  });
  return {
    command(method, params = {}) {
      return new Promise((resolve, reject) => {
        id += 1;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { socket.close(); },
    events,
  };
}

async function withApplication(callback, binary = executable) {
  rmSync(portFile, { force: true });
  const child = spawn(binary, ['--remote-debugging-port=0'], {
    env: { ...process.env, MINDSPACE_PERSONAL_TEST_DIR: directory },
    stdio: 'ignore',
  });
  const exited = new Promise((resolve) => {
    child.once('exit', (code) => resolve({ code }));
    child.once('error', (error) => resolve({ error }));
  });
  let page;
  let browser;
  try {
    const port = await retry(() => {
      const value = Number(readFileSync(portFile, 'utf8').split(/\r?\n/)[0]);
      assert.ok(value > 0, 'Не найден порт проверки Electron.');
      return value;
    });
    const host = `http://127.0.0.1:${port}`;
    const target = await retry(async () => {
      const response = await fetch(`${host}/json/list`, { signal: AbortSignal.timeout(2000) });
      const window = (await response.json()).find((item) => item.type === 'page' && item.url === 'mindspace://planner/index.html');
      assert.ok(window, 'Окно приложения не открылось.');
      return window;
    });
    page = await connect(target.webSocketDebuggerUrl);
    await page.command('Runtime.enable');
    await page.command('Network.enable');

    async function evaluate(expression) {
      const answer = await page.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text);
      return answer.result.value;
    }
    await retry(async () => {
      assert.equal(await evaluate("document.querySelector('.navigation')?.getAttribute('aria-label')"), 'Разделы дневника');
    });
    assert.equal(await evaluate('document.title'), 'MindSpace Personal');
    const requests = await evaluate("[...document.scripts].map((script) => script.src).concat([...document.styleSheets].filter((sheet) => sheet.cssRules.length).map((sheet) => sheet.href))");
    assert.ok(requests.some((url) => url.endsWith('.js')));
    assert.ok(requests.some((url) => url.endsWith('.css')));
    assert.ok(requests.every((url) => url.startsWith('mindspace://planner/')));
    const closedByRenderer = await callback(evaluate);

    assert.equal(page.events.filter(({ method }) => method === 'Runtime.exceptionThrown').length, 0);
    assert.equal(page.events.filter(({ method, params }) => method === 'Network.requestWillBeSent' && /^https?:/.test(params.request.url)).length, 0);
    if (!closedByRenderer) {
      const info = await (await fetch(`${host}/json/version`)).json();
      browser = await connect(info.webSocketDebuggerUrl);
      void browser.command('Browser.close').catch(() => {});
    }
    const result = await Promise.race([exited, delay(6000, { code: null }, { ref: false })]);
    assert.equal(result.code, 0, result.error?.message ?? 'Приложение не завершилось штатно.');
  } finally {
    page?.close();
    browser?.close();
    if (child.exitCode === null && child.pid) {
      child.kill();
      await exited;
    }
  }
}

try {
  await withApplication(async (evaluate) => {
    const first = await evaluate('window.mindspace.load()');
    assert.equal(first.path, join(directory, 'personal.sqlite3'));
    assert.equal(first.revision, 0);
    assert.equal(await evaluate(`window.mindspace.save(${JSON.stringify({ ...first.data, ideas: [idea] })}, 0)`), 1);
    const backup = await evaluate('window.mindspace.backup()');
    assert.deepEqual((await readBackup(backup)).ideas, [idea]);
  }, previous);
  await withApplication(async (evaluate) => {
    const second = await evaluate('window.mindspace.load()');
    assert.equal(second.revision, 1);
    assert.deepEqual(second.data.ideas, [idea]);
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent === 'Идеи')?.click(); true"), true);
    await retry(async () => {
      assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(idea.title)})`), true);
    });
    await evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent === 'Сегодня')?.click()");
    await retry(async () => {
      assert.ok(await evaluate("Boolean(document.querySelector('#quick-task'))"));
    });
    await evaluate(`{
      const input = document.querySelector('#quick-task');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(lastTask)});
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }`);
    await retry(async () => {
      assert.equal(await evaluate("document.querySelector('#quick-task').form.querySelector('[type=submit]').disabled"), false);
    });
    await evaluate("setTimeout(() => { document.querySelector('#quick-task').form.requestSubmit(); window.close(); }, 0); true");
    return true;
  });
  await withApplication(async (evaluate) => {
    const reopened = await evaluate('window.mindspace.load()');
    assert.equal(reopened.revision, 2);
    assert.equal(reopened.data.tasks[0]?.title, lastTask);
    await evaluate("document.querySelector('.day-task button[aria-label^=Таймер]').click()");
    await retry(async () => {
      assert.ok((await evaluate('window.mindspace.load()')).data.timer?.running);
    });
    await evaluate("document.querySelector('#timer-toggle').click()");
    await retry(async () => {
      assert.equal((await evaluate('window.mindspace.load()')).data.timer?.running, null);
    });
    await evaluate("document.querySelector('#timer-toggle').click()");
    await retry(async () => {
      assert.ok((await evaluate('window.mindspace.load()')).data.timer?.running);
    });
    const backupPath = await evaluate('window.mindspace.backupDatabase()');
    assert.ok((await readDatabaseBackup(backupPath)).timer.running);
    assert.deepEqual((await readDatabaseBackup(backupPath)).ideas, [idea]);
  });
  await withApplication(async (evaluate) => {
    assert.ok((await evaluate('window.mindspace.load()')).data.timer?.running);
    await evaluate("[...document.querySelectorAll('.timer-strip button')].find(b => b.textContent.trim() === 'Завершить').click()");
    await retry(async () => { assert.ok(await evaluate("document.querySelector('dialog[open] input[type=number]') !== null")); });
    await evaluate(`{
      const input = document.querySelector('dialog[open] input[type=number]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '7');
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      input.form.requestSubmit();
    }`);
    await retry(async () => {
      const data = (await evaluate('window.mindspace.load()')).data;
      assert.equal(data.timer, undefined);
      assert.equal(data.logs.reduce((sum, log) => sum + log.minutes, 0), 7);
    });
    await evaluate(`setTimeout(() => {
      const input = document.querySelector('.day-journal-fields textarea');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Заметка перед закрытием');
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      window.close();
    }, 0); true`);
    return true;
  });
  await withApplication(async (evaluate) => {
    const data = (await evaluate('window.mindspace.load()')).data;
    assert.ok(Object.values(data.days).some((day) => day.notes === 'Заметка перед закрытием'));
    assert.equal(data.logs.reduce((sum, log) => sum + log.minutes, 0), 7);
  });
  console.log('Проверены окно Windows, офлайн-загрузка, JSON и SQLite, совместимость базы, запись при закрытии и таймер с перезапуском.');
} finally {
  if (dirname(directory) === runtime) rmSync(directory, { recursive: true, maxRetries: 12, retryDelay: 100 });
}

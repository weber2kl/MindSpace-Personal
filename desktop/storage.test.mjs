import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { emptyData } from '../common/schema.mjs';
import { openStorage, readBackup, readDatabaseBackup } from './storage.mjs';

const runtime = fileURLToPath(new URL('../.runtime', import.meta.url));

function testDirectory(context) {
  mkdirSync(runtime, { recursive: true });
  const directory = mkdtempSync(join(runtime, 'storage-test-'));
  context.after(() => {
    if (dirname(directory) === runtime) rmSync(directory, { recursive: true });
  });
  return directory;
}

function fixture(title) {
  const data = emptyData();
  data.ideas.push({ id: 'idea', title, notes: '', status: 'new' });
  return data;
}

test('SQLite сохраняет записи между запусками и проверяет ревизию', (context) => {
  const directory = testDirectory(context);
  const first = openStorage(directory);
  const data = fixture('Проверка сохранения');
  try {
    assert.equal(first.load().revision, 0);
    assert.equal(first.save(data, 0), 1);
    assert.throws(() => first.save(emptyData(), 0), /Данные изменились/);
    assert.equal(readFileSync(first.load().path).subarray(0, 15).toString(), 'SQLite format 3');
  } finally {
    first.close();
  }
  const second = openStorage(directory);
  try {
    assert.deepEqual(second.load().data, data);
    assert.equal(second.load().revision, 1);
  } finally {
    second.close();
  }
});

test('после принудительного завершения процесса восстанавливается подтверждённая запись WAL', async (context) => {
  const directory = testDirectory(context);
  const data = fixture('Запись из отдельного процесса');
  const script = `
    import { openStorage } from ${JSON.stringify(new URL('./storage.mjs', import.meta.url).href)};
    const storage = openStorage(process.argv[1]);
    storage.save(JSON.parse(process.argv[2]), 0);
    process.send('committed');
    setInterval(() => {}, 10000);
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script, directory, JSON.stringify(data)], {
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  const exited = once(child, 'exit');
  try {
    await Promise.race([
      once(child, 'message', { signal: AbortSignal.timeout(5000) }),
      exited.then(([code]) => { throw new Error(`Процесс закрылся до записи: ${code}`); }),
    ]);
    assert.ok(statSync(join(directory, 'personal.sqlite3-wal')).size > 32);
  } finally {
    child.kill();
    await exited;
  }
  const storage = openStorage(directory);
  try {
    assert.deepEqual(storage.load().data, data);
  } finally {
    storage.close();
  }
});

test('ошибка SQLite не повреждает данные, повторная запись сохраняет те же идентификаторы', context => {
  const storage = openStorage(testDirectory(context));
  const db = new DatabaseSync(storage.load().path);
  try {
    const before = fixture('До ошибки');
    const after = fixture('После повторной записи');
    storage.save(before, 0);
    db.exec("CREATE TRIGGER test_failure BEFORE UPDATE ON planner_state BEGIN SELECT RAISE(ABORT,'test write failure'); END;");
    assert.throws(() => storage.save(after, 1), /test write failure/);
    assert.equal(storage.load().revision, 1);
    assert.deepEqual(storage.load().data, before);
    db.exec('DROP TRIGGER test_failure');
    assert.equal(storage.save(after, 1), 2);
    assert.deepEqual(storage.load().data, after);
  } finally { db.close(); storage.close(); }
});

test('автокопии создаются по расписанию, проверяются, открываются и вытесняют только старые автокопии', async context => {
  const storage = openStorage(testDirectory(context));
  const start = Date.UTC(2026, 10, 10, 7);
  const day = 86400000;
  try {
    assert.equal(await storage.automaticBackup(start), null);
    const baseline = fixture('До изменения');
    const latest = fixture('После изменения');
    storage.save(baseline, 0);
    const manual = await storage.backupDatabase();
    const jobs = [storage.automaticBackup(start), storage.automaticBackup(start)];
    assert.equal(jobs[0], jobs[1]);
    await jobs[0];
    assert.equal(await storage.automaticBackup(start + day - 1), null);
    for (let offset = 1; offset <= 7; offset++) await storage.automaticBackup(start + day * offset);
    const entries = storage.listBackups();
    assert.equal(entries.filter(entry => entry.kind === 'automatic').length, 7);
    assert.equal(entries.filter(entry => entry.kind === 'mindspace').length, 1);
    assert.ok(statSync(manual).isFile());
    await assert.rejects(storage.readSavedBackup('../personal.sqlite3'), /отсутствует/);
    const automatic = entries.find(entry => entry.kind === 'automatic');
    const picked = await storage.readSavedBackup(automatic.filename);
    assert.deepEqual(picked.data, baseline);
    storage.save(latest, 1);
    const restoration = storage.restore(picked.data, 2);
    assert.deepEqual(await readBackup(restoration.backupPath), latest);
    assert.deepEqual(storage.load().data, baseline);
  } finally { storage.close(); }
});

test('SQLite открывает старую схему с данными и сохраняет существующие идентификаторы при обновлении', context => {
  const directory = testDirectory(context);
  const path = join(directory, 'personal.sqlite3');
  const legacy = fixture('Старые записи');
  delete legacy.learning;
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE planner_state (
    id INTEGER PRIMARY KEY, revision INTEGER, payload TEXT
  );`);
  db.prepare('INSERT INTO planner_state VALUES (1, 41, ?)').run(JSON.stringify(legacy));
  db.close();
  const storage = openStorage(directory);
  try {
    const snapshot = storage.load();
    assert.equal(snapshot.revision, 41);
    assert.deepEqual(snapshot.data.ideas, legacy.ideas);
    assert.equal(snapshot.data.learning.verbs.length, 80);
    storage.save(snapshot.data, 41);
    assert.deepEqual(storage.load().data, snapshot.data);
  } finally { storage.close(); }
});

test('JSON экспортируется, проверяется и восстанавливается с копией текущих данных', async (context) => {
  const directory = testDirectory(context);
  const storage = openStorage(directory);
  const before = fixture('До замены');
  const after = fixture('После замены');
  try {
    assert.equal(storage.save(before, 0), 1);
    const path = join(directory, 'export.json');
    storage.exportData(path);
    assert.deepEqual(await readBackup(path), before);
    assert.deepEqual(await readBackup(storage.backup()), before);
    const restored = storage.restore(after, 1);
    assert.equal(restored.revision, 2);
    assert.deepEqual(await readBackup(restored.backupPath), before);
    assert.deepEqual(storage.load().data, after);
  } finally {
    storage.close();
  }
});

test('повреждённая копия и ошибочные связи отклоняются без записи', async (context) => {
  const directory = testDirectory(context);
  const storage = openStorage(directory);
  try {
    const path = join(directory, 'invalid.json');
    writeFileSync(path, '{');
    await assert.rejects(readBackup(path), /Не удалось прочитать JSON/);
    const data = emptyData();
    data.categories = [];
    const backup = { format: 'mindspace-personal', version: 1, data };
    writeFileSync(path, JSON.stringify(backup));
    await assert.rejects(readBackup(path), /Нет обязательных категорий/);
    writeFileSync(path, JSON.stringify({ ...backup, version: 99 }));
    await assert.rejects(readBackup(path), /поддерживаемой версии/);
    assert.throws(() => storage.save(data, 0), /Нет обязательных категорий/);
    assert.throws(() => storage.restore(data, 0), /Нет обязательных категорий/);
    assert.throws(() => storage.exportData(storage.load().path), /расширением .json/);
    assert.deepEqual(storage.load().data, emptyData());
    assert.equal(storage.load().revision, 0);
  } finally {
    storage.close();
  }
});

test('импорт прерывается, если копия прежних данных не создана', (context) => {
  const directory = testDirectory(context);
  const storage = openStorage(directory);
  const before = fixture('Исходное состояние');
  try {
    storage.save(before, 0);
    writeFileSync(join(directory, 'backups'), 'файл на месте папки');
    assert.throws(() => storage.restore(fixture('Не сохранится'), 1));
    assert.deepEqual(storage.load().data, before);
    assert.equal(storage.load().revision, 1);
  } finally {
    storage.close();
  }
});

test('копия SQLite включает незачекпоинченные данные WAL и открывается отдельно', async (context) => {
  const directory = testDirectory(context);
  const storage = openStorage(join(directory, 'source'));
  const target = openStorage(join(directory, 'target'));
  const before = fixture('Текущие записи назначения');
  const incoming = fixture('Последняя запись из WAL');
  try {
    storage.save(incoming, 0);
    assert.ok(statSync(`${storage.load().path}-wal`).size > 32);
    const mainFileOnly = join(directory, 'main-file-only.sqlite3');
    copyFileSync(storage.load().path, mainFileOnly);
    assert.throws(() => readDatabaseBackup(mainFileOnly));

    const filename = await storage.backupDatabase();
    const imported = readDatabaseBackup(filename);
    assert.deepEqual(imported, incoming);
    assert.equal(readdirSync(dirname(filename)).length, 1);
    const copied = new DatabaseSync(filename, { readOnly: true });
    try {
      assert.equal(copied.prepare('PRAGMA journal_mode').get().journal_mode, 'delete');
      assert.equal(copied.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      assert.equal(copied.prepare('SELECT revision FROM planner_state WHERE id=1').get().revision, 1);
    } finally { copied.close(); }

    target.save(before, 0);
    const restored = target.restore(imported, 1);
    assert.deepEqual(await readBackup(restored.backupPath), before);
    assert.deepEqual(target.load().data, incoming);
    assert.deepEqual(storage.load().data, incoming);
    assert.equal(storage.load().revision, 1);
  } finally {
    storage.close();
    target.close();
  }
});

test('повреждённый SQLite, посторонняя база и неверные данные отклоняются', (context) => {
  const directory = testDirectory(context);
  const damaged = join(directory, 'damaged.sqlite3');
  writeFileSync(damaged, 'not sqlite');
  assert.throws(() => readDatabaseBackup(damaged), /Не удалось прочитать копию SQLite/);

  const unrelated = join(directory, 'unrelated.sqlite3');
  const db = new DatabaseSync(unrelated);
  try {
    db.exec('PRAGMA user_version = 1');
    assert.throws(() => readDatabaseBackup(unrelated), /нет таблицы ежедневника/);
    db.exec(`CREATE TABLE planner_state(id, payload); INSERT INTO planner_state VALUES (1, '{}');`);
    assert.throws(() => readDatabaseBackup(unrelated), /Некорректные данные/);
  } finally { db.close(); }
});

test('импорт ставит таймер на паузу по времени создания копии', async (context) => {
  const directory = testDirectory(context);
  const data = fixture('Таймер в копии');
  const capture = Date.now() - 30 * 60_000;
  const start = capture - 30 * 60_000;
  const zone = 'Asia/Qyzylorda';
  data.tasks.push({
    id: 'task', title: 'Тест', date: '2026-10-01', categoryId: 'english', priority: 'normal',
    important: false, completedOn: null, stageId: null,
  });
  data.timer = {
    id: '123e4567-e89b-42d3-a456-426614174000', taskId: 'task', categoryId: 'english',
    segments: [{ from: start - 300_000, to: start - 120_000, zone }], running: { from: start, zone },
  };

  const json = join(directory, 'timer.json');
  writeFileSync(json, JSON.stringify({ format: 'mindspace-personal', version: 1, exportedAt: new Date(capture).toISOString(), data }));
  assert.deepEqual(await readBackup(json), data);
  const { timer } = await readBackup(json, { forRestore: true });
  assert.equal(timer.running, null);
  assert.deepEqual(timer.segments, [...data.timer.segments, { from: start, to: capture, zone }]);

  const storage = openStorage(directory);
  try {
    storage.save(data, 0);
    const raw = readDatabaseBackup(storage.load().path, { forRestore: true });
    assert.deepEqual(raw.timer, { ...data.timer, running: null });
    const path = await storage.backupDatabase();
    assert.deepEqual(readDatabaseBackup(path), data);
    const copy = new DatabaseSync(path, { readOnly: true });
    try {
      const { exported_at: exportedAt } = copy.prepare('SELECT exported_at FROM planner_backup').get();
      const fromCopy = readDatabaseBackup(path, { forRestore: true });
      assert.equal(fromCopy.timer.running, null);
      assert.deepEqual(fromCopy.timer.segments, [...data.timer.segments, { from: start, to: Date.parse(exportedAt), zone }]);
    } finally { copy.close(); }
    assert.deepEqual(storage.load().data.timer, data.timer);
  } finally { storage.close(); }
});

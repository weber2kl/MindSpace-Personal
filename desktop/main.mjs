import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } from 'electron';
import { mkdirSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openStorage, readBackup, readDatabaseBackup } from './storage.mjs';
import { inspectLocalUpdate } from './update-file.mjs';

const appName = 'MindSpace Personal';
const project = dirname(dirname(fileURLToPath(import.meta.url)));
const productionUrl = 'mindspace://planner/index.html';
const developmentUrl = 'http://127.0.0.1:41732/';
const development = !app.isPackaged && process.argv.includes('--development');
const pageUrl = development ? developmentUrl : productionUrl;
const override = process.env.MINDSPACE_PERSONAL_TEST_DIR;
const dataDirectory = override && isAbsolute(override)
  ? resolve(override)
  : development
    ? join(project, '.runtime', 'dev-data')
    : join(app.getPath('appData'), appName);

app.setName(appName);
app.setAppUserModelId('app.mindspace.personal');
protocol.registerSchemesAsPrivileged([
  { scheme: 'mindspace', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let window;
let storage;
let backupSchedule;
let backupFailure = '';

async function runAutomaticBackup() {
  try {
    await storage.automaticBackup();
    backupFailure = '';
  } catch (error) {
    backupFailure = error.message;
    console.error('Не удалось создать автоматическую копию:', error.message);
  }
}

function reportStartupError(error) {
  dialog.showErrorBox('Не удалось открыть MindSpace Personal', `${error.message}\n\nПапка данных: ${dataDirectory}`);
  app.quit();
}

function lockProfile() {
  try {
    mkdirSync(dataDirectory, { recursive: true });
    app.setPath('userData', dataDirectory);
    return app.requestSingleInstanceLock({ directory: dataDirectory });
  } catch (error) {
    reportStartupError(error);
    return false;
  }
}

function registerProtocol() {
  const dist = join(project, 'dist');
  protocol.handle('mindspace', async (request) => {
    const address = new URL(request.url);
    if (address.hostname !== 'planner' || request.method !== 'GET') return new Response(null, { status: 403 });

    try {
      const file = resolve(dist, `.${decodeURIComponent(address.pathname)}`);
      const inside = relative(dist, file);
      if (inside.startsWith('..') || isAbsolute(inside)) return new Response(null, { status: 403 });
      const response = await net.fetch(pathToFileURL(file).href);
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', [
        "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:", "font-src 'self'", "connect-src 'self'",
        "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'none'",
      ].join('; '));
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

function bind(channel, action) {
  ipcMain.handle(`planner:${channel}`, (event, ...arguments_) => {
    const trusted = event.sender === window?.webContents
      && event.senderFrame === event.sender.mainFrame
      && event.senderFrame.url === pageUrl;
    if (!trusted) throw new Error('Доступ к данным ежедневника запрещён.');
    return action(...arguments_);
  });
}

function registerIpc() {
  bind('version', () => app.getVersion());
  bind('localUpdate', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      title: 'Проверить локальный установщик обновления', properties: ['openFile'],
      filters: [{ name: 'Установщик MindSpace Personal', extensions: ['exe'] }],
    });
    if (canceled || !filePaths[0]) return null;
    return inspectLocalUpdate(filePaths[0], app.getVersion());
  });
  const jsonFilter = { name: 'MindSpace Personal JSON', extensions: ['json'] };
  bind('load', () => storage.load());
  bind('save', (data, revision) => storage.save(data, revision));
  bind('export', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      title: 'Экспорт ежедневника',
      defaultPath: join(app.getPath('documents'), 'MindSpace-Personal.json'),
      filters: [jsonFilter],
    });
    if (canceled || !filePath) return null;
    storage.exportData(filePath);
    return filePath;
  });
  bind('pickImport', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      title: 'Открыть резервную копию',
      properties: ['openFile'],
      filters: [
        { name: 'Копии MindSpace Personal', extensions: ['json', 'sqlite3'] },
        jsonFilter,
        { name: 'База SQLite', extensions: ['sqlite3'] },
      ],
    });
    if (canceled || !filePaths[0]) return null;
    const filename = filePaths[0];
    const extension = extname(filename).toLowerCase();
    if (extension !== '.json' && extension !== '.sqlite3') throw new Error('Выберите файл .json или .sqlite3.');
    const options = { forRestore: true };
    const data = extension === '.sqlite3' ? readDatabaseBackup(filename, options) : await readBackup(filename, options);
    return { data, filename: basename(filename) };
  });
  bind('restore', (data, revision) => storage.restore(data, revision));
  bind('backup', () => storage.backup());
  bind('backupDatabase', () => storage.backupDatabase());
  bind('listBackups', () => ({ entries: storage.listBackups(), automaticError: backupFailure }));
  bind('pickSavedBackup', filename => storage.readSavedBackup(filename));
  bind('openFolder', async () => {
    const error = await shell.openPath(dataDirectory);
    if (error) throw new Error(`Не удалось открыть папку. ${error}`);
  });
}

async function createWindow() {
  window = new BrowserWindow({
    title: appName,
    show: false,
    width: 1320,
    height: 860,
    minWidth: 820,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#101113',
    icon: join(project, 'build', 'icon.ico'),
    webPreferences: {
      preload: join(project, 'desktop', 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-redirect', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.on('closed', () => { window = undefined; });
  window.once('ready-to-show', () => window?.show());
  await window.loadURL(pageUrl);
}

if (!lockProfile()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    clearInterval(backupSchedule);
    storage?.close();
  });
  app.whenReady().then(async () => {
    storage = openStorage(dataDirectory);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    registerProtocol();
    registerIpc();
    await createWindow();
    void runAutomaticBackup();
    backupSchedule = setInterval(() => void runAutomaticBackup(), 5 * 60_000);
  }).catch(reportStartupError);
}

import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { emptyData, parseData } from '../common/schema.mjs';

const format = 'mindspace-personal';
const backupVersion = 1;
const databaseVersion = 1;
const maxBackupBytes = 128 * 1024 * 1024;
const automaticInterval = 24 * 60 * 60_000;
const automaticLimit = 7;
const backupName = /^(automatic|mindspace|before-import)-(\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z)-[\da-f]{8}\.(sqlite3|json)$/;

function pauseRestoredTimer(data, exportedAt) {
  const timer = data.timer;
  if (!timer?.running) return;
  const timestamp = typeof exportedAt === 'string' ? Date.parse(exportedAt) : NaN;
  const validCapture = Number.isFinite(timestamp) && new Date(timestamp).toISOString() === exportedAt;
  if (validCapture) {
    const end = Math.min(timestamp, Date.now());
    if (end > timer.running.from) timer.segments.push({ ...timer.running, to: end });
  }
  timer.running = null;
}

function writeJson(filename, data) {
  const backup = { format, version: backupVersion, exportedAt: new Date().toISOString(), data };
  const payload = JSON.stringify(backup, null, 2);
  if (Buffer.byteLength(payload) > maxBackupBytes) throw new Error('Резервная копия превышает 128 МБ.');

  const temporaryFile = join(dirname(filename), `.${basename(filename)}.${randomUUID()}.tmp`);
  let file;
  try {
    file = openSync(temporaryFile, 'wx', 0o600);
    try {
      writeFileSync(file, payload, 'utf8');
      fsyncSync(file);
    } finally {
      closeSync(file);
    }
    renameSync(temporaryFile, filename);
  } catch (error) {
    if (file !== undefined) {
      try { unlinkSync(temporaryFile); } catch { /* Keep the original write error. */ }
    }
    throw new Error('Не удалось записать JSON. Проверьте доступ к папке и свободное место.', { cause: error });
  }
}

export async function readBackup(filename, { forRestore = false } = {}) {
  const file = await open(filename, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maxBackupBytes) throw new Error('Выберите JSON-файл резервной копии размером до 128 МБ.');
    const bytes = Buffer.alloc(info.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== info.size) throw new Error('Файл изменился во время чтения. Попробуйте открыть его ещё раз.');

    let backup;
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, offset));
      backup = JSON.parse(text);
    } catch (error) {
      throw new Error('Не удалось прочитать JSON-файл.', { cause: error });
    }
    if (backup?.format !== format || backup.version !== backupVersion) {
      throw new Error('Этот файл не является резервной копией поддерживаемой версии MindSpace Personal.');
    }
    const data = parseData(backup.data);
    if (forRestore) pauseRestoredTimer(data, backup.exportedAt);
    return data;
  } finally {
    await file.close();
  }
}

export function readDatabaseBackup(filename, { forRestore = false } = {}) {
  let database;
  try {
    database = new DatabaseSync(filename, { readOnly: true, timeout: 5000, allowExtension: false });
    database.exec('PRAGMA trusted_schema = OFF; BEGIN');
    const { user_version: version } = database.prepare('PRAGMA user_version').get();
    if (version !== databaseVersion) throw new Error('Эта версия копии SQLite не поддерживается.');

    const integrity = database.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
      throw new Error('Копия SQLite не прошла проверку целостности.');
    }
    const { type } = database.prepare("PRAGMA table_list('planner_state')").get() ?? {};
    if (type !== 'table') throw new Error('В копии SQLite нет таблицы ежедневника.');
    const row = database.prepare('SELECT payload FROM planner_state WHERE id = 1').get();
    if (!row) throw new Error('В копии SQLite нет записей ежедневника.');
    const data = parseData(JSON.parse(row.payload));
    if (forRestore && data.timer?.running) {
      const metadata = database.prepare("PRAGMA table_list('planner_backup')").get();
      const exportedAt = metadata?.type === 'table'
        ? database.prepare('SELECT exported_at FROM planner_backup WHERE id = 1').get()?.exported_at
        : undefined;
      pauseRestoredTimer(data, exportedAt);
    }
    return data;
  } catch (error) {
    if (error.code === 'ERR_SQLITE_ERROR' || error instanceof SyntaxError) {
      throw new Error('Не удалось прочитать копию SQLite. Проверьте формат файла и доступ к нему.', { cause: error });
    }
    throw error;
  } finally {
    database?.close();
  }
}

export function openStorage(directory) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'personal.sqlite3');
  const backupDirectory = join(directory, 'backups');
  const database = new DatabaseSync(path);
  let select;
  let update;

  function transaction(callback) {
    database.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      database.exec('COMMIT');
      return result;
    } catch (error) {
      if (database.isTransaction) database.exec('ROLLBACK');
      throw error;
    }
  }

  try {
    database.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL');
    transaction(() => {
      const { user_version: version } = database.prepare('PRAGMA user_version').get();
      if (version === databaseVersion) return;
      if (version !== 0) throw new Error('Эта база создана более новой версией MindSpace Personal.');

      database.exec(`
        CREATE TABLE IF NOT EXISTS planner_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          revision INTEGER NOT NULL CHECK (revision >= 0),
          payload TEXT NOT NULL CHECK (json_valid(payload))
        ) STRICT;
        PRAGMA user_version = ${databaseVersion};
      `);
      database.prepare('INSERT OR IGNORE INTO planner_state VALUES (1, 0, ?)').run(JSON.stringify(emptyData()));
    });
    select = database.prepare('SELECT revision, payload FROM planner_state WHERE id = 1');
    update = database.prepare('UPDATE planner_state SET payload = ?, revision = revision + 1 WHERE id = 1 AND revision = ?');
  } catch (error) {
    database.close();
    throw error;
  }

  function load() {
    const row = select.get();
    if (!row) throw new Error('В базе не найдено состояние ежедневника.');
    return { data: parseData(JSON.parse(row.payload)), revision: row.revision, path };
  }

  function save(data, revision) {
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Неверная версия записи.');
    const payload = JSON.stringify(parseData(data));
    const { changes } = update.run(payload, revision);
    if (changes !== 1) throw new Error('Данные изменились. Откройте программу заново перед следующей записью.');
    return revision + 1;
  }

  function backupFilename(label, extension, now = Date.now()) {
    try {
      mkdirSync(backupDirectory, { recursive: true });
    } catch (error) {
      throw new Error('Не удалось открыть папку резервных копий. Проверьте доступ к ней.', { cause: error });
    }
    const stamp = new Date(now).toISOString().replaceAll(':', '-').replace('.', '-');
    return join(backupDirectory, `${label}-${stamp}-${randomUUID().slice(0, 8)}.${extension}`);
  }

  function makeBackup(data, label) {
    const filename = backupFilename(label, 'json');
    writeJson(filename, data);
    return filename;
  }

  async function backupDatabase(label = 'mindspace', now = Date.now()) {
    const filename = backupFilename(label, 'sqlite3', now);
    const temporaryFile = `${filename}.${randomUUID()}.tmp`;
    let reserved = false;
    try {
      const file = openSync(temporaryFile, 'wx', 0o600);
      reserved = true;
      closeSync(file);
      const source = new DatabaseSync(path, { readOnly: true, timeout: 5000 });
      const exportedAt = new Date().toISOString();
      try {
        await backup(source, temporaryFile);
      } finally {
        source.close();
      }
      const copy = new DatabaseSync(temporaryFile);
      try {
        const { journal_mode: journalMode } = copy.prepare('PRAGMA journal_mode = DELETE').get();
        if (journalMode !== 'delete') throw new Error('Не удалось подготовить автономный файл SQLite.');
        copy.exec(`
          CREATE TABLE IF NOT EXISTS planner_backup (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            exported_at TEXT NOT NULL
          ) STRICT;
        `);
        copy.prepare('INSERT OR REPLACE INTO planner_backup VALUES (1, ?)').run(exportedAt);
      } finally {
        copy.close();
      }
      readDatabaseBackup(temporaryFile);
      renameSync(temporaryFile, filename);
      return filename;
    } catch (error) {
      if (reserved) {
        for (const suffix of ['', '-wal', '-shm', '-journal']) {
          try { unlinkSync(temporaryFile + suffix); } catch { /* Keep the original backup error. */ }
        }
      }
      throw new Error(`Не удалось создать копию SQLite. ${error.message}`, { cause: error });
    }
  }

  function listBackups() {
    let entries;
    try {
      entries = readdirSync(backupDirectory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    return entries.flatMap(entry => {
      const match = entry.isFile() && backupName.exec(entry.name);
      if (!match) return [];
      const [, kind, stamp, extension] = match;
      if ((kind === 'automatic' && extension !== 'sqlite3') || (kind === 'before-import' && extension !== 'json')) return [];
      const createdAt = stamp.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z$/, 'T$1:$2:$3.$4Z');
      const time = Date.parse(createdAt);
      return Number.isFinite(time) ? [{ filename: entry.name, kind, createdAt, time, extension }] : [];
    }).sort((a, b) => b.time - a.time || a.filename.localeCompare(b.filename));
  }

  async function readSavedBackup(filename) {
    const entry = listBackups().find(item => item.filename === filename);
    if (!entry) throw new Error('Копия отсутствует. Обновите список резервных копий.');
    const path = join(backupDirectory, entry.filename);
    const options = { forRestore: true };
    const data = entry.extension === 'sqlite3' ? readDatabaseBackup(path, options) : await readBackup(path, options);
    return { data, filename: entry.filename };
  }

  let automaticJob;
  function automaticBackup(now = Date.now()) {
    if (automaticJob) return automaticJob;
    automaticJob = (async () => {
      const automatic = listBackups().filter(entry => entry.kind === 'automatic');
      for (const entry of automatic) {
        if (entry.time > now || now - entry.time >= automaticInterval) continue;
        try {
          readDatabaseBackup(join(backupDirectory, entry.filename));
          return null;
        } catch {
          // Replace a damaged recent copy with a fresh snapshot.
        }
      }
      if (load().revision === 0) return null;
      const path = await backupDatabase('automatic', now);
      const older = listBackups().filter(entry => entry.kind === 'automatic' && entry.filename !== basename(path));
      for (const entry of older.slice(automaticLimit - 1)) unlinkSync(join(backupDirectory, entry.filename));
      return path;
    })().finally(() => { automaticJob = undefined; });
    return automaticJob;
  }

  return {
    load,
    save,
    exportData(filename) {
      if (extname(filename).toLowerCase() !== '.json') throw new Error('Введите имя файла с расширением .json.');
      writeJson(filename, load().data);
    },
    backup() {
      return makeBackup(load().data, 'mindspace');
    },
    backupDatabase,
    listBackups,
    readSavedBackup,
    automaticBackup,
    restore(data, revision) {
      const next = parseData(data);
      return transaction(() => {
        const previous = load();
        if (previous.revision !== revision) throw new Error('После выбора файла ежедневник изменился. Повторите импорт.');
        const backupPath = makeBackup(previous.data, 'before-import');
        return { revision: save(next, revision), backupPath };
      });
    },
    close() {
      database.close();
    },
  };
}

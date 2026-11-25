import { useEffect, useRef, useState } from 'react';
import { Archive, Database, Download, FolderOpen, Palette, Plus, Upload } from 'lucide-react';
import { id, type Category, type Data } from './model';
import { desktop, errorText, flush, restore, useStorage, type BackupEntry } from './storage';
import type { PageProps } from './ui';

function CategoryForm({ category, onSave }: { category?: Category; onSave: (category: Category) => void }) {
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState(category?.color ?? '#ab9bea');
  return <form className="category-form" onSubmit={(event) => {
    event.preventDefault();
    if (!name.trim()) return;
    onSave({ id: category?.id ?? id(), name: name.trim(), color });
    if (!category) setName('');
  }}>
    <input type="color" aria-label={category ? `Цвет · ${category.name}` : 'Цвет новой категории'} value={color} onChange={(event) => setColor(event.currentTarget.value)} />
    <input aria-label={category ? `Название · ${category.name}` : 'Название новой категории'} placeholder="Новая категория" maxLength={300} value={name} onChange={(event) => setName(event.currentTarget.value)} required />
    <button className={`button ${category ? '' : 'primary'}`} disabled={!name.trim() || (name.trim() === category?.name && color === category.color)}>
      {category ? 'Сохранить' : <><Plus size={15} /> Добавить</>}
    </button>
  </form>;
}

export function Settings({ data, update }: PageProps) {
  const [version, setVersion] = useState('…');
  useEffect(() => { void desktop().version().then(setVersion).catch(() => setVersion('не удалось определить')); }, []);
  const storage = useStorage();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [candidate, setCandidate] = useState<{ data: Data; filename: string } | null>(null);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [backupError, setBackupError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (candidate && !dialog.current?.open) dialog.current?.showModal(); }, [candidate]);
  useEffect(() => { void refreshBackups().catch(error => setBackupError(errorText(error))); }, []);

  async function refreshBackups() {
    const result = await desktop().listBackups();
    setBackups(result.entries);
    setBackupError(result.automaticError);
  }

  async function run(action: () => Promise<string | void>) {
    setMessage('');
    setFailure('');
    setWorking(true);
    try { setMessage(await action() ?? ''); }
    catch (error) { setFailure(errorText(error)); }
    finally { setWorking(false); }
  }

  const saveCategory = (category: Category) => update((draft) => {
    const index = draft.categories.findIndex((item) => item.id === category.id);
    if (index < 0) draft.categories.push(category);
    else draft.categories[index] = category;
  });
  const disabled = working || storage.busy;

  return <div className="screen report-screen stack">
    <header className="screen-heading"><h1>Настройки</h1><p>Категории задач и хранение дневника</p></header>
    <div className="settings-grid">
      <section className="panel report-panel stack">
        <h2>Обновление приложения · {version}</h2>
        <p>Локальная установка из приложения пока недоступна: для неё требуется настроенный доверенный издатель и подписанные выпуски. Выбранный файл будет только проверен, без запуска.</p>
        <button className="button" disabled={disabled} onClick={() => void run(async () => { await flush(); await desktop().localUpdate(); })}>Проверить установщик</button>
        <p className="muted">Для текущих сборок: создайте копию ниже, закройте MindSpace Personal и вручную запустите новый установщик из вашей папки release. Выбирайте прежнюю папку установки. Записи остаются в папке данных.</p>
        <button className="button" disabled={disabled} onClick={() => void run(async () => {
          await flush();
          const path = await desktop().backupDatabase();
          await refreshBackups();
          return `Копия перед ручным обновлением создана и проверена. Теперь можно закрыть приложение.\n${path}`;
        })}>Создать копию перед обновлением</button>
      </section>
      <section className="panel report-panel stack">
        <h2><Palette size={17} /> Категории</h2>
        {data.categories.map((category) => <CategoryForm key={`${category.id}:${category.name}:${category.color}`} category={category} onSave={saveCategory} />)}
        <div className="settings-divider"><CategoryForm onSave={saveCategory} /></div>
      </section>
      <section className="panel report-panel stack">
        <h2><Database size={17} /> Данные и копии</h2>
        <p className="muted">База SQLite на этом компьютере</p>
        <code className="data-path">{storage.path}</code>
        <div className="settings-buttons">
          <button className="button" disabled={disabled} onClick={() => void run(async () => desktop().openFolder())}><FolderOpen size={16} /> Открыть папку</button>
          <button className="button" disabled={disabled} onClick={() => void run(async () => {
            await flush();
            const path = await desktop().backupDatabase();
            await refreshBackups();
            return `Копия SQLite создана и проверена\n${path}`;
          })}><Archive size={16} /> Создать копию SQLite</button>
          <button className="button" disabled={disabled} onClick={() => void run(async () => { await flush(); const filename = await desktop().exportData(); return filename ? `JSON сохранён\n${filename}` : ''; })}><Download size={16} /> Экспортировать JSON</button>
          <button className="button" disabled={disabled} onClick={() => void run(async () => setCandidate(await desktop().pickImport()))}><Upload size={16} /> Восстановить из копии</button>
        </div>
        <details className="task-details" onToggle={event => {
          if (event.currentTarget.open) void refreshBackups().catch(error => setBackupError(errorText(error)));
        }}>
          <summary>Сохранённые копии · {backups.length}</summary>
          <p className="muted">Автоматическая копия создаётся раз в 24 часа, когда программа запущена и в дневнике есть сохранённые записи. Хранятся 7 последних автоматических копий.</p>
          {!backups.length && <p className="empty">Копий пока нет.</p>}
          {backups.map(entry => <div className="report-item report-split" key={entry.filename}>
            <span>{new Date(entry.createdAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })} · {entry.kind === 'automatic' ? 'Автоматическая' : entry.kind === 'before-import' ? 'Перед восстановлением' : 'Ручная'}</span>
            <button className="button" disabled={disabled} title={entry.filename} onClick={() => void run(async () => setCandidate(await desktop().pickSavedBackup(entry.filename)))}>Выбрать</button>
          </div>)}
        </details>
        {backupError && <p className="settings-notice error" role="alert">{backupError}</p>}
        {message && <p className="settings-notice" role="status">{message}</p>}
        {failure && <p className="settings-notice error" role="alert">{failure}</p>}
      </section>
    </div>
    {candidate && <dialog className="panel restore-dialog" ref={dialog} aria-labelledby="restore-title" aria-describedby="restore-details" onClose={() => setCandidate(null)}>
      <h2 id="restore-title">Заменить данные дневника?</h2>
      <p id="restore-details">Файл <strong>{candidate.filename}</strong> прошёл проверку. Импорт заменит текущие записи. Перед заменой программа сохранит их копию в JSON.{candidate.data.timer && ' Таймер из копии будет на паузе.'}</p>
      <div className="row dialog-actions">
        <button className="button" autoFocus onClick={() => dialog.current?.close()}>Отмена</button>
        <button className="button danger" onClick={() => {
          const imported = candidate.data;
          dialog.current?.close();
          void run(async () => {
            const path = await restore(imported);
            await refreshBackups();
            return `Данные восстановлены. Предыдущая версия сохранена\n${path}`;
          });
        }}>Заменить данные</button>
      </div>
    </dialog>}
  </div>;
}

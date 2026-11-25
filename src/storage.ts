import { useSyncExternalStore } from 'react';
import { emptyDay, emptyReview, parseData, type Data } from './model';
import type { TextUpdate } from './ui';

interface DesktopApi {
  version(): Promise<string>;
  localUpdate(): Promise<null>;
  load(): Promise<{ data: Data; revision: number; path: string }>;
  save(data: Data, revision: number): Promise<number>;
  exportData(): Promise<string | null>;
  pickImport(): Promise<{ data: Data; filename: string } | null>;
  restore(data: Data, revision: number): Promise<{ revision: number; backupPath: string }>;
  backup(): Promise<string>;
  backupDatabase(): Promise<string>;
  listBackups(): Promise<{ entries: BackupEntry[]; automaticError: string }>;
  pickSavedBackup(filename: string): Promise<{ data: Data; filename: string }>;
  openFolder(): Promise<void>;
}

export type BackupEntry = { filename: string; createdAt: string; kind: 'automatic' | 'mindspace' | 'before-import'; extension: 'json' | 'sqlite3' };

declare global {
  interface Window { mindspace?: DesktopApi }
}

interface StorageState {
  data: Data | null;
  path: string;
  pending: boolean;
  error: string;
  busy: boolean;
}

let state: StorageState = { data: null, path: '', pending: false, error: '', busy: false };
let revision = 0;
let saved: Data | null = null;
let write: Promise<void> | undefined;
let closeAfterSave = false;
const subscribers = new Set<() => void>();

function change(patch: Partial<StorageState>) {
  state = { ...state, ...patch };
  for (const notify of subscribers) notify();
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

function snapshot() {
  return state;
}

export function useStorage() {
  return useSyncExternalStore(subscribe, snapshot);
}

export function desktop() {
  if (!window.mindspace) throw new Error('Откройте MindSpace Personal через Windows-приложение.');
  return window.mindspace;
}

export function errorText(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
}

export async function load() {
  if (state.busy || state.data) return;
  change({ busy: true, error: '' });
  try {
    const result = await desktop().load();
    saved = parseData(result.data);
    revision = result.revision;
    change({ data: saved, path: result.path });
  } catch (error) {
    change({ error: `Не удалось открыть данные. ${errorText(error)}` });
  } finally {
    change({ busy: false });
  }
}

export function update(mutate: (draft: Data) => void) {
  if (!state.data || state.busy) return;
  try {
    const draft = structuredClone(state.data);
    mutate(draft);
    const data = parseData(draft);
    change({ data, pending: true, error: '' });
    void flush().catch(() => {});
  } catch (error) {
    change({ error: errorText(error) });
  }
}

export const updateText: TextUpdate = (area, key, field, value) => {
  if (!state.data || state.busy || value.length > 100_000) return;
  const data = state.data;
  if (area === 'days') {
    const day = data.days[key] ?? emptyDay();
    if (day[field] === value) return;
    change({ data: { ...data, days: { ...data.days, [key]: { ...day, [field]: value } } }, pending: true, error: '' });
  } else {
    const review = data.reviews[key] ?? emptyReview();
    if (review[field] === value) return;
    change({ data: { ...data, reviews: { ...data.reviews, [key]: { ...review, [field]: value } } }, pending: true, error: '' });
  }
  void flush().catch(() => {});
};

export function flush() {
  if (write) return write;
  if (!state.pending) return Promise.resolve();
  write = Promise.resolve().then(async () => {
    try {
      while (state.data && state.data !== saved) {
        const data = state.data;
        revision = await desktop().save(data, revision);
        saved = data;
      }
      change({ pending: false });
      if (closeAfterSave) {
        closeAfterSave = false;
        window.close();
      }
    } catch (error) {
      closeAfterSave = false;
      change({ error: `Изменения пока не сохранены. ${errorText(error)}` });
      throw error;
    } finally {
      write = undefined;
    }
  });
  return write;
}

export function retry() {
  change({ error: '' });
  return flush();
}

export function discardPending() {
  if (!write && state.pending) {
    change({ data: saved, pending: false, error: '' });
  }
}

export function dismissError() {
  if (!state.pending) change({ error: '' });
}

export async function restore(data: Data) {
  if (state.busy) throw new Error('Дождитесь окончания текущей операции.');
  change({ busy: true });
  try {
    await flush();
    const validated = parseData(data);
    const result = await desktop().restore(validated, revision);
    revision = result.revision;
    saved = validated;
    change({ data: saved, pending: false, error: '' });
    return result.backupPath;
  } finally {
    change({ busy: false });
  }
}

window.addEventListener('beforeunload', (event) => {
  if (!state.pending && !state.busy) return;
  if (state.pending && !state.busy) {
    closeAfterSave = true;
    void flush().catch(() => {});
  }
  event.preventDefault();
  event.returnValue = false;
});

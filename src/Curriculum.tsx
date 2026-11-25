import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ListPlus, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { formatDate, id } from './model';
import type { LearningStatus, LearningTopic, LearningVerb } from './model';
import type { PageProps } from './ui';
import './curriculum.css';
import { bulkVerbs, undoBulkVerbs, type BulkUndo, type VerbPatch } from './bulkVerbs';

const statuses: Record<LearningStatus, string> = {
  new: 'Не изучал', studying: 'Изучаю', review: 'Повторить', mastered: 'Освоено',
};

type EditorProps = Pick<PageProps, 'data' | 'update'>;

const dateFormat = { day: 'numeric', month: 'short', year: 'numeric' } as const;
const earliest = '1000-01-01';
const latest = '9999-12-31';

function read(form: FormData, field: string) {
  return String(form.get(field) ?? '').trim();
}

function statusOptions() {
  return Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>);
}

function DateField({ name, label, value }: { name: string; label: string; value?: string | null }) {
  return <label className="field">{label}
    <input type="date" name={name} defaultValue={value ?? ''} min={earliest} max={latest} />
  </label>;
}

function StatusField({ status }: { status?: LearningStatus }) {
  return <label className="field">Статус<select name="status" aria-label="Статус" defaultValue={status ?? 'new'}>{statusOptions()}</select></label>;
}

function EditorDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog?.open) dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="panel curriculum-dialog" aria-label={title} onCancel={(event) => {
    event.preventDefault();
    onClose();
  }}>
    <header className="curriculum-dialog-head">
      <h2>{title}</h2>
      <button type="button" className="icon-button" aria-label="Закрыть" onClick={onClose}><X size={16} /></button>
    </header>
    {children}
  </dialog>;
}

function TopicEditor({ item, data, update, close, onTask }: EditorProps & {
  item?: LearningTopic; close: () => void; onTask: (topic: LearningTopic) => void;
}) {
  const [error, setError] = useState('');
  const occupied = new Set(data.learning.topics.map(({ number }) => number));
  let next = Math.max(0, ...occupied) + 1;
  if (next > 9999) {
    next = 1;
    while (next < 9999 && occupied.has(next)) next++;
  }

  function save(form: HTMLFormElement, schedule = false) {
    const fields = new FormData(form);
    const en = read(fields, 'en');
    const ru = read(fields, 'ru');
    const number = Number(read(fields, 'number'));
    const examples = read(fields, 'examples').split(/\r?\n/).map((example) => example.trim()).filter(Boolean);
    if (!en || !ru) {
      setError('Введите оба названия темы.');
      return;
    }
    if (number !== item?.number && occupied.has(number)) {
      setError(`Тема № ${number} уже есть в списке.`);
      return;
    }
    if (examples.some((example) => example.length > 300)) {
      setError('Каждый пример должен содержать не больше 300 символов.');
      return;
    }
    const rating = read(fields, 'rating');
    const topic: LearningTopic = {
      id: item?.id ?? id(), number, en, ru, page: Number(read(fields, 'page')),
      status: read(fields, 'status') as LearningStatus, practiced: fields.has('practiced'),
      studiedOn: read(fields, 'studiedOn') || null, reviewedOn: read(fields, 'reviewedOn') || null,
      notes: read(fields, 'notes'), rating: rating ? Number(rating) : null, examples,
    };
    update((draft) => {
      const index = draft.learning.topics.findIndex((existing) => existing.id === topic.id);
      if (index === -1) draft.learning.topics.push(topic);
      else draft.learning.topics[index] = topic;
    });
    close();
    if (schedule) onTask(topic);
  }

  function remove() {
    if (!item || !window.confirm(`Удалить тему «${item.en}»? Задачи по ней останутся в ежедневнике.`)) return;
    update((draft) => {
      draft.learning.topics = draft.learning.topics.filter((topic) => topic.id !== item.id);
      for (const task of draft.tasks) {
        if (task.learning?.kind === 'topic' && task.learning.id === item.id) delete task.learning;
      }
    });
    close();
  }

  return <EditorDialog title={item ? `Тема ${item.number} · ${item.en}` : 'Новая тема грамматики'} onClose={close}>
    <form className="stack" onSubmit={(event) => { event.preventDefault(); save(event.currentTarget); }}>
      <div className="curriculum-fields">
        <label className="field">Название на английском<input autoFocus required name="en" maxLength={300} defaultValue={item?.en} lang="en" /></label>
        <label className="field">Название на русском<input required name="ru" maxLength={300} defaultValue={item?.ru} /></label>
        <label className="field">Номер темы<input name="number" type="number" min={1} max={9999} required defaultValue={item?.number ?? next} /></label>
        <label className="field">Страница учебника<input name="page" type="number" min={1} max={99999} required defaultValue={item?.page} /></label>
        <StatusField status={item?.status} />
        <label className="field">Самооценка понимания
          <select name="rating" aria-label="Самооценка понимания" defaultValue={item?.rating ?? ''}>
            <option value="">Без оценки</option>
            {[1, 2, 3, 4, 5].map((rating) => <option key={rating}>{rating}</option>)}
          </select>
        </label>
        <DateField name="studiedOn" label="Дата изучения" value={item?.studiedOn} />
        <DateField name="reviewedOn" label="Последнее повторение" value={item?.reviewedOn} />
      </div>
      <label className="curriculum-check"><input type="checkbox" name="practiced" defaultChecked={item?.practiced} />Практика выполнена</label>
      <label className="field">Личные заметки<textarea name="notes" maxLength={100000} rows={3} defaultValue={item?.notes} /></label>
      <label className="field">Примеры предложений<textarea name="examples" rows={3} placeholder="По одному примеру на строку" defaultValue={item?.examples.join('\n')} /></label>
      {error && <p role="alert" className="curriculum-error">{error}</p>}
      <div className="row curriculum-actions">
        {item && <>
          <button className="icon-button danger" type="button" aria-label="Удалить тему" onClick={remove}><Trash2 size={16} /></button>
          <button className="button" type="button" onClick={(event) => {
            const form = event.currentTarget.form;
            if (form?.reportValidity()) save(form, true);
          }}><ListPlus size={16} />Создать задачу</button>
        </>}
        <button className="button curriculum-cancel" type="button" onClick={close}>Отмена</button>
        <button className="button primary" type="submit">Сохранить</button>
      </div>
    </form>
  </EditorDialog>;
}

export function Grammar({ data, update, topicId, onTopic, onTask, onTheory }: EditorProps & {
  topicId?: string; onTopic: (id: string | undefined) => void; onTask: (topic: LearningTopic) => void; onTheory: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [unpracticed, setUnpracticed] = useState(false);
  const topics = [...data.learning.topics].sort((a, b) => a.number - b.number);
  const visible = topics.filter(t => (!unpracticed || !t.practiced) && `${t.en} ${t.ru}`.toLowerCase().includes(query.toLowerCase().trim()));
  const selected = topics.find((topic) => topic.id === topicId);
  const mastered = topics.filter((topic) => topic.status === 'mastered').length;
  const practiced = topics.filter((topic) => topic.practiced).length;

  return <section className="panel curriculum-panel" aria-label="Грамматика">
    <header className="curriculum-head">
      <div className="curriculum-title">
        <h2>Темы грамматики</h2>
        <p className="muted">Освоено {mastered} из {topics.length} · Практика {practiced} из {topics.length}</p>
      </div>
      <button type="button" className="button primary" onClick={() => { onTopic(undefined); setAdding(true); }}><Plus size={16} />Добавить тему</button>
    </header>
    <div className="row"><input type="search" aria-label="Поиск тем" placeholder="Найти тему" value={query} onChange={e => setQuery(e.target.value)} /><label><input type="checkbox" checked={unpracticed} onChange={e => setUnpracticed(e.target.checked)} /> Без выполненной практики</label></div>
    {visible.length ? <div className="curriculum-scroll">
      <table className="curriculum-table" aria-label="Темы учебника">
        <thead><tr><th scope="col">№</th><th scope="col">Тема</th><th scope="col">Страница</th><th scope="col">Статус</th><th scope="col">Практика</th></tr></thead>
        <tbody>{visible.map((topic) => <tr key={topic.id}>
          <td className="curriculum-number">{topic.number}</td>
          <td><button type="button" className="curriculum-topic" onClick={() => onTopic(topic.id)}>
            <strong lang="en">{topic.en}</strong><small>{topic.ru}</small>
          </button>{/^topic-0[1-9]$|^topic-10$/.test(topic.id) && <button className="button" onClick={() => onTheory(topic.id)}>Теория</button>}<small className="muted">{topic.reviewedOn ? `Повторение: ${formatDate(topic.reviewedOn)}` : ''}</small></td>
          <td className="curriculum-number">{topic.page}</td>
          <td><select aria-label={`Статус темы ${topic.en}`} value={topic.status} onChange={(event) => {
            const status = event.currentTarget.value as LearningStatus;
            update((draft) => {
              const entry = draft.learning.topics.find(({ id }) => id === topic.id);
              if (entry) entry.status = status;
            });
          }}>{statusOptions()}</select></td>
          <td className="curriculum-center"><input type="checkbox" aria-label={`Практика: ${topic.en}`} checked={topic.practiced} onChange={(event) => {
            const practiced = event.currentTarget.checked;
            update((draft) => {
              const entry = draft.learning.topics.find(({ id }) => id === topic.id);
              if (entry) entry.practiced = practiced;
            });
          }} /></td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="curriculum-empty muted">Добавьте первую тему из учебника.</p>}
    {(selected || adding) && <TopicEditor key={selected?.id ?? 'new'} item={selected} {...{ data, update, onTask }} close={() => { setAdding(false); onTopic(undefined); }} />}
  </section>;
}

function cleanForms(value: string) {
  return [...new Set(value.split('/').map((form) => form.trim().replace(/\s+/g, ' ')).filter(Boolean))].join(' / ');
}

function VerbEditor({ item, data, update, close }: EditorProps & { item?: LearningVerb; close: () => void }) {
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const v1 = read(fields, 'v1').replace(/\s+/g, ' ');
    const v2 = cleanForms(read(fields, 'v2'));
    const v3 = cleanForms(read(fields, 'v3'));
    const ru = read(fields, 'ru');
    if (!v1 || !v2 || !v3 || !ru || v1.includes('/')) {
      setError('Введите одну форму V1, формы V2 и V3 и перевод.');
      return;
    }
    if (v2.length > 300 || v3.length > 300) {
      setError('Список вариантов для каждой формы должен быть короче 301 символа.');
      return;
    }
    if (data.learning.verbs.some((verb) => verb.id !== item?.id && verb.v1.toLowerCase() === v1.toLowerCase())) {
      setError(`Глагол «${v1}» уже есть в словаре.`);
      return;
    }
    const verb: LearningVerb = {
      id: item?.id ?? id(), group: Number(read(fields, 'group')), v1, v2, v3, ru,
      status: read(fields, 'status') as LearningStatus, hard: fields.has('hard'),
      reviewedOn: read(fields, 'reviewedOn') || null, successOn: item?.successOn ?? null,
    };
    update((draft) => {
      const index = draft.learning.verbs.findIndex((existing) => existing.id === verb.id);
      if (index === -1) draft.learning.verbs.push(verb);
      else draft.learning.verbs[index] = verb;
    });
    close();
  }

  return <EditorDialog title={item ? `Редактировать глагол · ${item.v1}` : 'Новый глагол'} onClose={close}>
    <form className="stack" onSubmit={submit}>
      <div className="curriculum-fields">
        <label className="field">V1 · Infinitive<input autoFocus name="v1" required maxLength={300} defaultValue={item?.v1} lang="en" /></label>
        <label className="field">Перевод<input name="ru" required maxLength={300} defaultValue={item?.ru} /></label>
        <label className="field">V2 · Past Simple<input name="v2" required maxLength={300} defaultValue={item?.v2} lang="en" /></label>
        <label className="field">V3 · Past Participle<input name="v3" required maxLength={300} defaultValue={item?.v3} lang="en" /></label>
        <label className="field">Группа<input name="group" type="number" min={1} max={9999} required defaultValue={item?.group ?? 1} /></label>
        <StatusField status={item?.status} />
        <DateField name="reviewedOn" label="Последнее повторение" value={item?.reviewedOn} />
        {item?.successOn && <p className="field">Последняя успешная тренировка<strong>{formatDate(item.successOn, dateFormat)}</strong></p>}
      </div>
      <p className="muted">Допустимые варианты V2 и V3 указывайте через косую черту, например <span lang="en">learnt / learned</span>.</p>
      <label className="curriculum-check"><input type="checkbox" name="hard" defaultChecked={item?.hard} />Трудное слово</label>
      {error && <p role="alert" className="curriculum-error">{error}</p>}
      <div className="row curriculum-actions">
        <button className="button curriculum-cancel" type="button" onClick={close}>Отмена</button>
        <button className="button primary" type="submit">Сохранить</button>
      </div>
    </form>
  </EditorDialog>;
}

export function Verbs({ data, update }: EditorProps) {
  const [selection, setSelection] = useState(new Set<string>());
  const [bulkStatus, setBulkStatus] = useState<LearningStatus>('mastered');
  const [undo, setUndo] = useState<BulkUndo | null>(null);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [status, setStatus] = useState('');
  const [hardOnly, setHardOnly] = useState(false);
  const [editor, setEditor] = useState<LearningVerb | 'new' | null>(null);
  const verbs = data.learning.verbs;
  const groups = [...new Set(verbs.map((verb) => verb.group))].sort((a, b) => a - b);
  const search = query.trim().toLowerCase();
  const visible = verbs.filter((verb) => (!group || verb.group === Number(group))
    && (!status || verb.status === status) && (!hardOnly || verb.hard)
    && (!search || [verb.v1, verb.v2, verb.v3, verb.ru].some((value) => value.toLowerCase().includes(search))));

  function applyBulk(patch: VerbPatch, label: string) {
    const ids = new Set(verbs.filter(v => selection.has(v.id)).map(v => v.id));
    if (!ids.size || !window.confirm(`${label}: ${ids.size} слов? Можно отменить последнее массовое действие до выхода из раздела.`)) return;
    const snapshot = structuredClone(verbs);
    setUndo(bulkVerbs(snapshot, ids, patch));
    update(draft => { bulkVerbs(draft.learning.verbs, ids, patch); });
    setSelection(new Set());
  }

  function patch(id: string, values: Partial<Pick<LearningVerb, 'status' | 'hard'>>) {
    update((draft) => {
      const item = draft.learning.verbs.find((verb) => verb.id === id);
      if (item) Object.assign(item, values);
    });
  }

  return <section className="panel curriculum-panel" aria-label="Словарь неправильных глаголов">
    <header className="curriculum-head">
      <div className="curriculum-title"><h2>Неправильные глаголы</h2><p className="muted">Освоено {verbs.filter((verb) => verb.status === 'mastered').length} из {verbs.length}</p></div>
      <button type="button" className="button primary" onClick={() => setEditor('new')}><Plus size={16} />Добавить глагол</button>
    </header>
    <div className="row curriculum-filters">
      <input type="search" aria-label="Поиск по словарю" placeholder="Поиск по форме или переводу" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
      <select aria-label="Фильтр по группе" value={group} onChange={(event) => setGroup(event.currentTarget.value)}>
        <option value="">Все группы</option>
        {groups.map((value) => <option key={value} value={value}>Группа {value}</option>)}
      </select>
      <select aria-label="Фильтр по статусу" value={status} onChange={(event) => setStatus(event.currentTarget.value)}>
        <option value="">Все статусы</option>{statusOptions()}
      </select>
      <label className="curriculum-check"><input type="checkbox" checked={hardOnly} onChange={(event) => setHardOnly(event.currentTarget.checked)} />Только трудные</label>
      <small className="curriculum-count">{visible.length} из {verbs.length}</small>
    </div>
    <div className="row bulk-toolbar">
      <button className="button" onClick={() => setSelection(new Set(verbs.map(v => v.id)))}>Выбрать все</button>
      <button className="button" onClick={() => setSelection(new Set(visible.map(v => v.id)))}>Выбрать показанные</button>
      <select aria-label="Выбрать группу слов" value="" onChange={e => setSelection(new Set(verbs.filter(v => v.group === Number(e.target.value)).map(v => v.id)))}><option value="">Выбрать группу (10 слов)</option>{groups.map(g => <option key={g} value={g}>Группа {g} · {verbs.filter(v => v.group === g).length} слов</option>)}</select>
      <button className="button" onClick={() => setSelection(new Set())}>Снять выбор ({selection.size})</button>
      <select aria-label="Массовый статус" value={bulkStatus} onChange={e => setBulkStatus(e.target.value as LearningStatus)}>{statusOptions()}</select>
      <button className="button primary" disabled={!selection.size} onClick={() => applyBulk({ status: bulkStatus }, `Статус «${statuses[bulkStatus]}»`)}>Применить статус</button>
      <button className="button" disabled={!selection.size} onClick={() => applyBulk({ hard: true }, 'Отметить трудными')}>Трудные</button>
      <button className="button" disabled={!selection.size} onClick={() => applyBulk({ hard: false }, 'Убрать отметку трудных')}>Убрать трудность</button>
      <button className="button" disabled={!undo} onClick={() => { if (undo) update(d => undoBulkVerbs(d.learning.verbs, undo)); setUndo(null); }}>Отменить массовое действие</button>
    </div>
    {visible.length ? <div className="curriculum-scroll">
      <table className="curriculum-table curriculum-verbs" aria-label="Неправильные глаголы">
        <thead><tr>
          <th scope="col">Выбор</th><th scope="col">V1</th><th scope="col">V2</th><th scope="col">V3</th><th scope="col">Перевод</th>
          <th scope="col">Группа</th><th scope="col">Статус</th><th scope="col">Повторение</th><th scope="col"><span className="curriculum-visually-hidden">Действия</span></th>
        </tr></thead>
        <tbody>{visible.map((verb) => <tr key={verb.id}>
          <td><input type="checkbox" aria-label={`Выбрать ${verb.v1}`} checked={selection.has(verb.id)} onChange={e => { const next = new Set(selection); if (e.target.checked) next.add(verb.id); else next.delete(verb.id); setSelection(next); }} /></td>
          <td lang="en"><strong>{verb.v1}</strong></td><td lang="en">{verb.v2}</td><td lang="en">{verb.v3}</td><td>{verb.ru}</td>
          <td className="curriculum-number curriculum-center">{verb.group}</td>
          <td><select aria-label={`Статус глагола ${verb.v1}`} value={verb.status} onChange={(event) => patch(verb.id, { status: event.currentTarget.value as LearningStatus })}>{statusOptions()}</select></td>
          <td className="curriculum-date">{verb.reviewedOn ? formatDate(verb.reviewedOn, dateFormat) : '—'}</td>
          <td><div className="curriculum-row-actions">
            <button type="button" className="icon-button curriculum-icon" title="Трудное слово" aria-label={`Трудное слово ${verb.v1}`} aria-pressed={verb.hard} onClick={() => patch(verb.id, { hard: !verb.hard })}>
              <Star size={15} fill={verb.hard ? 'currentColor' : 'none'} />
            </button>
            <button type="button" className="icon-button curriculum-icon" title="Редактировать" aria-label={`Редактировать глагол ${verb.v1}`} onClick={() => setEditor(verb)}><Pencil size={15} /></button>
          </div></td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="curriculum-empty muted">{verbs.length ? 'Глаголы с такими фильтрами не найдены.' : 'Добавьте первый глагол.'}</p>}
    {editor && <VerbEditor item={editor === 'new' ? undefined : editor} {...{ data, update }} close={() => setEditor(null)} />}
  </section>;
}

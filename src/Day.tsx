import { useEffect, useRef, useMemo, useState, type DragEvent, type FormEvent } from "react";
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GripVertical,
  Leaf,
  Pencil,
  Play,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  emptyDay,
  dayTaskGroup,
  ENGLISH_ID,
  formatDate,
  formatMinutes,
  id,
  isDate,
  isLateCompletion,
  rescheduleTask,
  reorderDayTasks,
  isFrogCandidate,
  monthEnd,
  monthStart,
  OTHER_ID,
  setFrog,
  shiftDate,
  today,
  toggleTaskCompletion,
  weekStart,
  type DayEntry,
  type LearningLink,
  type Task,
  type TimeLog,
} from "./model";
import type { PageProps } from "./ui";
import { startTimer } from './timer';
import "./day.css";

const priorityLabels = {
  high: "Высокий",
  normal: "Обычный",
  low: "Низкий",
};

const dateTitleOptions: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
  weekday: "long",
};

const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const earliestDate = "1000-01-01";
const latestDate = "9999-12-31";

export function MiniCalendar({
  date,
  onSelect,
  marked,
}: {
  date: string;
  onSelect: (date: string) => void;
  marked?: Set<string>;
}) {
  const [browsed, setBrowsed] = useState({ date, month: monthStart(date) });
  const month = browsed.date === date ? browsed.month : monthStart(date);
  const first = weekStart(month);
  const end = month === monthStart(latestDate) ? latestDate : monthEnd(month);
  const lastWeek = weekStart(end);
  const weekCount = Math.round((Date.parse(lastWeek) - Date.parse(first)) / (7 * 86_400_000)) + 1;
  const days = Array.from({ length: weekCount * 7 }, (_, index) => shiftDate(first, index));
  const currentDay = today();

  function move(direction: number) {
    const next = direction < 0 ? shiftDate(month, -1) : shiftDate(end, 1);
    setBrowsed({ date, month: monthStart(next) });
  }

  function select(next: string) {
    if (!isDate(next)) return;
    setBrowsed({ date: next, month: monthStart(next) });
    onSelect(next);
  }

  return (
    <div aria-label="Календарь">
      <div className="day-calendar-head">
        <button type="button" className="day-icon" aria-label="Предыдущий месяц" disabled={month === monthStart(earliestDate)} onClick={() => move(-1)}>
          <ChevronLeft size={16} />
        </button>
        <strong aria-live="polite">{formatDate(month, { month: "long", year: "numeric" })}</strong>
        <button type="button" className="day-icon" aria-label="Следующий месяц" disabled={end === latestDate} onClick={() => move(1)}>
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="day-calendar-grid">
        {weekdays.map((label) => <span key={label}>{label}</span>)}
        {days.map((day, index) => isDate(day) ? (
          <button
            key={day}
            type="button"
            aria-label={formatDate(day, dateTitleOptions)}
            aria-pressed={day === date}
            aria-current={day === currentDay ? "date" : undefined}
            className={[
              monthStart(day) !== month && "day-outside",
              day === currentDay && "day-today",
              marked?.has(day) && "day-activity",
            ].filter(Boolean).join(" ")}
            onClick={() => select(day)}
          >
            {Number(day.slice(-2))}
          </button>
        ) : <span key={index} />)}
      </div>
      <div className="day-calendar-date">
        <input
          aria-label="Перейти к дате"
          type="date"
          min={earliestDate}
          max={latestDate}
          value={date}
          onChange={(event) => event.currentTarget.value && select(event.currentTarget.value)}
        />
        <button type="button" className="button" onClick={() => select(today())}>Сегодня</button>
      </div>
    </div>
  );
}

function CategoryOptions({ categories }: { categories: PageProps["data"]["categories"] }) {
  return categories.map((category) => (
    <option key={category.id} value={category.id}>{category.name}</option>
  ));
}

function QuickAdd({
  data,
  date,
  update,
  frog = false,
  preferredCategoryId,
  onAdded,
}: PageProps & { frog?: boolean; preferredCategoryId?: string; onAdded?: (categoryId: string) => void }) {
  const [title, setTitle] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [priority, setPriority] = useState<Task['priority']>('normal');
  const [categoryId, setCategoryId] = useState("");
  const selectedCategory = data.categories.find((category) => category.id === categoryId)?.id
    ?? data.categories.find((category) => category.id === preferredCategoryId)?.id
    ?? data.categories.find((category) => category.id === OTHER_ID)?.id
    ?? data.categories[0]?.id
    ?? "";

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || !selectedCategory) return;
    const taskId = id();
    update((draft) => {
      draft.tasks.push({
        id: taskId,
        title: trimmed,
        date,
        categoryId: selectedCategory,
        priority: frog ? "high" : priority,
        important: false,
        completedOn: null,
        stageId: null,
      });
      if (frog) setFrog(draft, date, taskId);
    });
    setTitle("");
    input.current?.focus();
    onAdded?.(selectedCategory);
  }

  return (
    <form className="day-quick-add" onSubmit={add}>
      <input
        ref={input}
        id={frog ? undefined : "quick-task"}
        autoFocus={frog}
        value={title}
        onChange={(event) => setTitle(event.currentTarget.value)}
        placeholder={frog ? "Название задачи-лягушки" : "Что нужно сделать?"}
        aria-label={frog ? "Название задачи-лягушки" : "Название новой задачи"}
        maxLength={300}
        required
      />
      <select value={selectedCategory} aria-label={frog ? "Категория лягушки" : "Категория новой задачи"} onChange={(event) => setCategoryId(event.currentTarget.value)}>
        <CategoryOptions categories={data.categories} />
      </select>
      {!frog && <select aria-label="Приоритет новой задачи" value={priority} onChange={e => setPriority(e.target.value as Task['priority'])}><option value="high">🔴 Высокий</option><option value="normal">🟡 Обычный</option><option value="low">🟢 Низкий</option></select>}
      <button type="submit" className="button primary" disabled={!title.trim() || !selectedCategory}>
        <Plus size={15} /> {frog ? "Назначить" : "Добавить"}
      </button>
    </form>
  );
}

function toggleDone(update: PageProps["update"], task: Task) {
  update((draft) => toggleTaskCompletion(draft, task.id));
}

function Frog(props: PageProps & { tasks: Task[]; entry: DayEntry }) {
  const { date, update, tasks, entry } = props;
  const [creating, setCreating] = useState(false);
  const frog = tasks.find((task) => task.id === entry.frogId);

  return (
    <section className="day-panel day-frog" aria-labelledby="frog-heading">
      <div className="day-section-head">
        <div><Leaf size={19} /><h2 id="frog-heading">Съесть лягушку</h2></div>
        {frog?.completedOn && <span className="day-frog-tag">Выполнено</span>}
      </div>
      {frog ? (
        <div className="day-frog-content">
          <input
            type="checkbox"
            className="day-checkbox"
            aria-label={`Выполнить лягушку «${frog.title}»`}
            checked={!!frog.completedOn}
            onChange={() => toggleDone(update, frog)}
          />
          <span className={`day-task-name${frog.completedOn ? " is-done" : ""}`}>{frog.title}</span>
        </div>
      ) : (
        <p className="day-frog-description">Выберите самое трудное или важное дело дня.</p>
      )}
      <div className="day-frog-controls">
        <select
          aria-label="Лягушка дня"
          value={frog?.id ?? ""}
          onChange={(event) => {
            const chosen = event.currentTarget.value;
            update((draft) => setFrog(draft, date, chosen || null));
          }}
        >
          <option value="">{frog ? "Убрать из блока" : "Выбрать задачу"}</option>
          {tasks.filter((task) => isFrogCandidate(task, date)).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
        </select>
        <button type="button" className="button" aria-expanded={creating} onClick={() => setCreating(!creating)}>
          {creating ? <X size={15} /> : <Plus size={15} />}
          {creating ? "Отмена" : "Создать"}
        </button>
      </div>
      {creating && <QuickAdd {...props} frog onAdded={() => setCreating(false)} />}
      {entry.frogHistory.length > 0 && (
        <details className="day-frog-history">
          <summary>Выполненные лягушки ({entry.frogHistory.length})</summary>
          <ul>{entry.frogHistory.map((item) => <li key={item.taskId}>{item.title}</li>)}</ul>
        </details>
      )}
    </section>
  );
}

function EditTask({ task, data, update, onClose }: Pick<PageProps, "data" | "update"> & {
  task: Task;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState(task.categoryId);
  const [learningKey, setLearningKey] = useState(task.learning?.kind === 'topic' ? `topic:${task.learning.id}`
    : task.learning?.kind === 'practice' ? task.learning.sessionId ? `session:${task.learning.sessionId}` : 'practice' : '');
  const [priority, setPriority] = useState(task.priority);
  const [date, setDate] = useState(task.date);
  const [stageId, setStageId] = useState(task.stageId ?? "");

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !isDate(date) || !category) return;
    update((draft) => {
      const current = draft.tasks.find((item) => item.id === task.id);
      if (!current) return;
      rescheduleTask(draft, current, date);
      Object.assign(current, {
        title: title.trim(),
        categoryId: category,
        priority,
        date,
        stageId: stageId || null,
      });
      const learning: LearningLink | undefined = learningKey.startsWith('topic:') ? { kind: 'topic', id: learningKey.slice(6) }
        : learningKey.startsWith('session:') ? { kind: 'practice', sessionId: learningKey.slice(8) }
        : learningKey === 'practice' ? { kind: 'practice', sessionId: null } : undefined;
      if (learning) current.learning = learning;
      else delete current.learning;
    });
    onClose();
  }

  function remove() {
    if (!window.confirm(`Удалить задачу «${task.title}»? Записи времени останутся в статистике.`)) return;
    update((draft) => {
      if (draft.days[task.date]?.frogId === task.id) setFrog(draft, task.date, null);
      draft.tasks = draft.tasks.filter((item) => item.id !== task.id);
    });
    onClose();
  }

  return (
    <form className="day-inline-edit" onSubmit={save}>
      <div className="day-form-fields">
        <label className="day-field day-full">Название
          <input autoFocus required maxLength={300} value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
        </label>
        <label className="day-field">Категория
          <select value={category} disabled={!!learningKey} onChange={(event) => setCategory(event.currentTarget.value)}>
            <CategoryOptions categories={data.categories} />
          </select>
        </label>
        <label className="day-field day-full">Связь с английским
          <select value={learningKey} onChange={(event) => {
            const key = event.currentTarget.value;
            setLearningKey(key);
            if (key) setCategory(ENGLISH_ID);
          }}>
            <option value="">Без связи</option>
            <option value="practice">Повторить неправильные глаголы</option>
            <optgroup label="Грамматика">{data.learning.topics.map((topic) => <option key={topic.id} value={`topic:${topic.id}`}>{topic.number}. {topic.en}</option>)}</optgroup>
            {data.learning.sessions.length > 0 && <optgroup label="История тренировок">
              {data.learning.sessions.slice().reverse().map((session) => <option key={session.id} value={`session:${session.id}`}>{formatDate(session.date, { day: 'numeric', month: 'short', year: 'numeric' })} · {session.attempts.length} слов</option>)}
            </optgroup>}
          </select>
        </label>
        <label className="day-field">Приоритет
          <select value={priority} onChange={(event) => setPriority(event.currentTarget.value as Task["priority"])}>
            {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="day-field">Дата задачи
          <input type="date" min={earliestDate} max={latestDate} required value={date} onChange={(event) => setDate(event.currentTarget.value)} />
        </label>
        <label className="day-field">Этап большой цели
          <select value={stageId} onChange={(event) => setStageId(event.currentTarget.value)}>
            <option value="">Без связи</option>
            {data.goals.filter((goal) => goal.stages.length).map((goal) => (
              <optgroup key={goal.id} label={goal.title}>
                {goal.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.title}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <div className="day-form-actions">
        <button type="submit" className="button primary" disabled={!title.trim() || !date}>
          <Check size={15} /> {date === task.date ? "Сохранить" : "Перенести"}
        </button>
        <button type="button" className="button" onClick={onClose}>Отмена</button>
        <button type="button" className="button day-danger" disabled={data.timer?.taskId === task.id} title={data.timer?.taskId === task.id ? 'Сначала завершите таймер задачи' : undefined} onClick={remove}><Trash2 size={15} /> Удалить</button>
      </div>
    </form>
  );
}

function TimeDetails({ task, logs, update }: { task: Task; logs: TimeLog[]; update: PageProps["update"] }) {
  const [date, setDate] = useState(task.date);
  const [minutes, setMinutes] = useState("");
  const [logId, setLogId] = useState<string | null>(null);
  const sorted = [...logs].sort((first, second) => second.date.localeCompare(first.date));

  function cancelEdit() {
    setLogId(null);
    setDate(task.date);
    setMinutes("");
  }

  function addTime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(minutes);
    if (!isDate(date) || !Number.isInteger(value) || value < 1 || value > 1440) return;
    update((draft) => {
      if (logId) {
        const log = draft.logs.find((item) => item.id === logId);
        if (log) Object.assign(log, { date, minutes: value });
      } else {
        draft.logs.push({ id: id(), taskId: task.id, date, categoryId: task.categoryId, minutes: value });
      }
    });
    cancelEdit();
  }

  function deleteTime(log: TimeLog) {
    if (!window.confirm(`Удалить запись времени за ${formatDate(log.date)}?`)) return;
    update((draft) => { draft.logs = draft.logs.filter((item) => item.id !== log.id); });
    if (logId === log.id) cancelEdit();
  }

  return (
    <div className="day-time-details">
      <form className="day-time-form" onSubmit={addTime}>
        <label className="day-field">Дата работы
          <input type="date" min={earliestDate} max={latestDate} value={date} onChange={(event) => setDate(event.currentTarget.value)} required />
        </label>
        <label className="day-field">Минуты
          <input type="number" min={1} max={1440} step={1} inputMode="numeric" placeholder="30" value={minutes} onChange={(event) => setMinutes(event.currentTarget.value)} required />
        </label>
        <button className="button primary" type="submit" disabled={!date || !minutes}>{logId ? "Сохранить" : "Записать"}</button>
        {logId && <button className="button" type="button" onClick={cancelEdit}>Отмена</button>}
      </form>
      {sorted.length > 0 && <ul className="day-time-list" aria-label="Записи времени">
        {sorted.map((log) => (
          <li key={log.id}>
            <span>{formatDate(log.date, { day: "numeric", month: "short", year: "numeric" })}</span>
            <strong>{formatMinutes(log.minutes)}</strong>
            <button
              type="button"
              className="day-icon"
              aria-label={`Изменить запись времени за ${formatDate(log.date)}`}
              onClick={() => {
                setLogId(log.id);
                setDate(log.date);
                setMinutes(String(log.minutes));
              }}
            ><Pencil size={14} /></button>
            <button type="button" className="day-icon day-danger" aria-label={`Удалить запись времени за ${formatDate(log.date)}`} onClick={() => deleteTime(log)}><Trash2 size={14} /></button>
          </li>
        ))}
      </ul>}
    </div>
  );
}

type OpenLearning = (task: Task) => void;
const dayTaskDragType = 'application/x-mindspace-task-order';

type TaskOrder = {
  dragging: boolean;
  edge?: 'before' | 'after';
  start: (event: DragEvent<HTMLButtonElement>) => void;
  end: () => void;
  over: (event: DragEvent<HTMLElement>) => void;
  drop: (event: DragEvent<HTMLElement>) => void;
  step: (direction: -1 | 1) => void;
};

function TaskRow({ task, data, update, importantCount, logs, openLearning, order }: Pick<PageProps, "data" | "update"> & {
  task: Task;
  importantCount: number;
  logs: TimeLog[];
  openLearning?: OpenLearning;
  order?: TaskOrder;
}) {
  const [expanded, setExpanded] = useState<"edit" | "time" | null>(null);
  const category = data.categories.find((item) => item.id === task.categoryId);
  const minutes = logs.reduce((sum, log) => sum + log.minutes, 0);
  const canSetImportant = task.important || importantCount < 3;
  const activeTimer = data.timer?.taskId === task.id;

  function toggleImportant() {
    update((draft) => {
      const current = draft.tasks.find((item) => item.id === task.id);
      if (!current) return;
      const count = draft.tasks.filter((item) => item.date === current.date && item.important).length;
      if (current.important || count < 3) current.important = !current.important;
    });
  }

  return (
    <article className="day-task" data-english={task.categoryId === ENGLISH_ID || undefined}
      data-dragging={order?.dragging || undefined} data-drop-edge={order?.edge}
      onDragOver={order?.over} onDrop={order?.drop}>
      <div className="day-row">
        {order && <button className="day-icon day-task-grip" type="button" draggable
          aria-label={`Изменить порядок: ${task.title}`} title="Перетащить или нажать ↑ / ↓"
          onDragStart={event => { if (expanded) event.preventDefault(); else order.start(event); }}
          onDragEnd={order.end} onKeyDown={event => {
            if (expanded || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
            event.preventDefault();
            order.step(event.key === 'ArrowUp' ? -1 : 1);
          }}><GripVertical size={16} /></button>}
        <input
          className="day-checkbox"
          type="checkbox"
          aria-label={`Выполнить задачу «${task.title}»`}
          checked={!!task.completedOn}
          onChange={() => toggleDone(update, task)}
        />
        <div className="day-task-body">
          <span className={`day-task-name${task.completedOn ? " is-done" : ""}`}>{task.title}</span>
          {isLateCompletion(task) && <small className="day-late">С опозданием</small>}
          <div className="day-task-meta">
            <span><i className={`day-priority-dot ${task.priority}`} />{priorityLabels[task.priority]}</span>
            {category && <span><i className="day-category-dot" style={{ backgroundColor: category.color }} />{category.name}</span>}
            {minutes > 0 && <span><Clock3 size={11} />{formatMinutes(minutes)}</span>}
          </div>
          {task.learning && openLearning && <button type="button" className="day-learning-link" onClick={() => openLearning(task)}>
            <BookOpen size={13} /> {task.learning.kind === 'topic' ? 'Открыть тему' : task.learning.sessionId ? 'Открыть результат тренировки' : 'Открыть тренировку'}
          </button>}
        </div>
        <div className="day-task-actions">
          <button
            className="day-icon"
            type="button"
            disabled={!canSetImportant || expanded !== null}
            title={expanded ? "Закройте форму перед изменением приоритета дня" : canSetImportant ? "Главная задача" : "Уже выбраны три главные задачи"}
            aria-label={`Главная задача «${task.title}»`}
            aria-pressed={task.important}
            onClick={toggleImportant}
          ><Star size={16} fill={task.important ? "currentColor" : "none"} /></button>
          <button className="day-icon" type="button" disabled={!!data.timer && !activeTimer}
            aria-label={`Таймер задачи «${task.title}»`} aria-pressed={activeTimer}
            title={activeTimer ? 'Перейти к таймеру' : data.timer ? 'Сначала завершите текущий таймер' : 'Запустить таймер'}
            onClick={() => {
              if (activeTimer) document.getElementById('timer-toggle')?.focus();
              else update((draft) => startTimer(draft, task.id));
            }}><Play size={16} fill={activeTimer ? 'currentColor' : 'none'} /></button>
          <button
            className="day-icon"
            type="button"
            title="Записать время"
            aria-label={`Время задачи «${task.title}»`}
            aria-expanded={expanded === "time"}
            onClick={() => setExpanded(expanded === "time" ? null : "time")}
          ><Clock3 size={16} /></button>
          <button
            className="day-icon"
            type="button"
            title="Редактировать"
            aria-label={`Редактировать задачу «${task.title}»`}
            aria-expanded={expanded === "edit"}
            onClick={() => setExpanded(expanded === "edit" ? null : "edit")}
          ><Pencil size={15} /></button>
        </div>
      </div>
      {expanded === "time" && <TimeDetails task={task} logs={logs} update={update} />}
      {expanded === "edit" && <EditTask task={task} data={data} update={update} onClose={() => setExpanded(null)} />}
    </article>
  );
}

function Tasks(props: PageProps & { tasks: Task[]; openLearning?: OpenLearning }) {
  const { tasks, data, update, openLearning } = props;
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState('all');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [landing, setLanding] = useState<{ id: string; edge: 'before' | 'after' } | null>(null);
  const logsByTask = useMemo(() => {
    const result = new Map<string, TimeLog[]>();
    for (const log of data.logs) {
      const logs = result.get(log.taskId);
      if (logs) logs.push(log);
      else result.set(log.taskId, [log]);
    }
    return result;
  }, [data.logs]);
  const visible = tasks.filter((task) => (!filter || task.categoryId === filter)
    && (status === 'all' || (status === 'done') === !!task.completedOn));
  const importantCount = tasks.filter((task) => task.important).length;
  const groups = [
    { id: 'important', title: 'Главные задачи', icon: Star },
    { id: 'other', title: 'Остальные задачи' },
    { id: 'english', title: 'Английский', icon: BookOpen },
  ] as const;

  function endDrag() {
    setDraggedId(null);
    setLanding(null);
  }

  function renderGroup(group: typeof groups[number]) {
    const items = visible.filter(task => dayTaskGroup(task) === group.id);
    if (!items.length && group.id !== 'important') return null;
    const ids = items.map(task => task.id);
    const Icon = 'icon' in group ? group.icon : undefined;
    const move = (sourceId: string, targetId: string, after: boolean) => {
      update(draft => reorderDayTasks(draft, ids, sourceId, targetId, after));
    };
    const edgeAt = (event: DragEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return event.clientY >= rect.top + rect.height / 2 ? 'after' : 'before';
    };
    return <div className={`day-task-group day-task-group-${group.id}`} key={group.id} aria-label={group.title} role="group">
      <h3 className="day-task-group-head">{Icon && <Icon size={14} />} {group.title}
        <span>{group.id === 'important' ? `${importantCount} / 3` : items.length}</span>
      </h3>
      {!items.length && <p className="day-empty">{filter || status !== 'all' ? 'Нет главных задач по выбранным фильтрам.' : 'Отметьте звёздочкой до трёх задач.'}</p>}
      {items.map((task, index) => <TaskRow key={task.id} task={task} data={data} update={update}
        importantCount={importantCount} logs={logsByTask.get(task.id) ?? []} openLearning={openLearning}
        order={items.length < 2 ? undefined : {
          dragging: draggedId === task.id,
          edge: landing?.id === task.id ? landing.edge : undefined,
          start(event) {
            event.dataTransfer.setData(dayTaskDragType, task.id);
            event.dataTransfer.effectAllowed = 'move';
            const row = event.currentTarget.closest('.day-task');
            if (row) event.dataTransfer.setDragImage(row, 15, 18);
            setDraggedId(task.id);
          },
          end: endDrag,
          over(event) {
            if (!event.dataTransfer.types.includes(dayTaskDragType)) return;
            if (!draggedId || draggedId === task.id || !ids.includes(draggedId)) {
              setLanding(null);
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            const edge = edgeAt(event);
            setLanding(current => current?.id === task.id && current.edge === edge ? current : { id: task.id, edge });
          },
          drop(event) {
            const sourceId = event.dataTransfer.getData(dayTaskDragType);
            if (!ids.includes(sourceId)) return;
            event.preventDefault();
            move(sourceId, task.id, edgeAt(event) === 'after');
            endDrag();
          },
          step(direction) {
            const target = items[index + direction];
            if (target) move(task.id, target.id, direction > 0);
          },
        }} />)}
    </div>;
  }

  return (
    <section className="day-panel" aria-labelledby="day-tasks-heading" onDragOver={event => {
      if (event.dataTransfer.types.includes('application/x-mindspace-overdue')) event.preventDefault();
    }} onDrop={event => {
      const taskId = event.dataTransfer.getData('application/x-mindspace-overdue');
      if (!taskId) return;
      event.preventDefault();
      carryTask(update, taskId, props.date);
    }}>
      <div className="day-section-head">
        <div><h2 id="day-tasks-heading">Задачи дня</h2></div>
        <div className="row day-filters">
          <select aria-label="Фильтр задач по категории" value={filter} onChange={(event) => setFilter(event.currentTarget.value)}>
            <option value="">Все категории</option>
            <CategoryOptions categories={data.categories} />
          </select>
          <select aria-label="Фильтр задач по статусу" value={status} onChange={(event) => setStatus(event.currentTarget.value)}>
            <option value="all">Все статусы</option><option value="open">Открытые</option><option value="done">Выполненные</option>
          </select>
        </div>
      </div>
      <QuickAdd {...props} preferredCategoryId={filter} onAdded={(categoryId) => {
        if (filter && categoryId !== filter) setFilter("");
        if (status === 'done') setStatus('all');
      }} />
      {groups.map(renderGroup)}
      {!visible.length && <p className="day-empty">Нет задач по выбранным фильтрам.</p>}
    </section>
  );
}

function OrphanLog({ data, log, update }: Pick<PageProps, 'data' | 'update'> & { log: TimeLog }) {
  const [editing, setEditing] = useState(false);
  const category = data.categories.find((item) => item.id === log.categoryId);
  return <div className="day-orphan-log">
    <div className="day-progress-line"><span>{category?.name} · {formatMinutes(log.minutes)}</span>
      <button type="button" className="day-icon" aria-label={`Изменить время без задачи · ${category?.name} · ${log.minutes} мин`} aria-expanded={editing} onClick={() => setEditing(!editing)}><Pencil size={14} /></button>
    </div>
    {editing && <form className="day-inline-edit" onSubmit={(event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const date = String(fields.get('date'));
      const minutes = Number(fields.get('minutes'));
      if (!isDate(date) || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return;
      update((draft) => {
        const current = draft.logs.find((item) => item.id === log.id);
        if (current) Object.assign(current, { date, minutes });
      });
      setEditing(false);
    }}>
      <label className="day-field">Дата работы<input name="date" type="date" min={earliestDate} max={latestDate} defaultValue={log.date} required /></label>
      <label className="day-field">Минуты<input name="minutes" type="number" min={1} max={1440} defaultValue={log.minutes} required /></label>
      <div className="day-form-actions">
        <button className="button primary" type="submit">Сохранить</button>
        <button className="button day-danger" type="button" onClick={() => {
          if (window.confirm('Удалить эту запись времени?')) update((draft) => { draft.logs = draft.logs.filter((item) => item.id !== log.id); });
        }}>Удалить</button>
      </div>
    </form>}
  </div>;
}

function carryTask(update: PageProps['update'], taskId: string, date: string) {
  update(draft => {
    const task = draft.tasks.find(item => item.id === taskId);
    if (task && !task.completedOn && task.date < date) rescheduleTask(draft, task, date, true);
  });
}

function OverdueTasks({ data, date, update }: Pick<PageProps, 'data' | 'date' | 'update'>) {
  const tasks = data.tasks.filter(task => !task.completedOn && task.date < date && task.date < today());
  if (!tasks.length) return null;
  return <section className="day-panel" aria-labelledby="day-overdue-heading">
    <div className="day-section-head"><div><Clock3 size={17} /><h2 id="day-overdue-heading">Задачи с прошлых дней · {tasks.length}</h2></div></div>
    <p className="muted">Перетащи задачу в список дня или нажми «В план дня».</p>
    <ul className="day-overdue-list">{tasks.map(task => <li key={task.id} draggable onDragStart={event => {
      event.dataTransfer.setData('application/x-mindspace-overdue', task.id);
      event.dataTransfer.effectAllowed = 'move';
    }}>
      <strong>{task.title}</strong>
      <small>Первоначально · {formatDate(task.originalDate ?? task.date)}</small>
      <button type="button" className="button" aria-label={`В план дня: ${task.title}`} onClick={() => carryTask(update, task.id, date)}>В план дня</button>
    </li>)}</ul>
  </section>;
}

function DaySummary({ data, date, tasks, update }: Pick<PageProps, "data" | "date" | "update"> & { tasks: Task[] }) {
  const done = tasks.filter((task) => task.completedOn).length;
  const logs = data.logs.filter((log) => log.date === date);
  const taskIds = new Set(data.tasks.map((task) => task.id));
  const orphanLogs = logs.filter((log) => !taskIds.has(log.taskId));
  const total = logs.reduce((sum, log) => sum + log.minutes, 0);
  const byCategory = new Map<string, number>();
  for (const log of logs) {
    byCategory.set(log.categoryId, (byCategory.get(log.categoryId) ?? 0) + log.minutes);
  }
  const english = byCategory.get(ENGLISH_ID) ?? 0;
  const otherCategories = data.categories.filter((category) => category.id !== ENGLISH_ID && byCategory.has(category.id));

  return (
    <section className="day-panel" aria-labelledby="day-summary-heading">
      <div className="day-section-head">
        <div><Clock3 size={17} /><h2 id="day-summary-heading">Сводка дня</h2></div>
      </div>
      <div className="day-progress-line"><span>Задачи выполнены</span><strong>{done} / {tasks.length}</strong></div>
      <progress className="day-progress-bar" aria-label="Доля выполненных задач" value={done} max={tasks.length || 1} />
      <div className="day-progress-line"><span>Выполнено с опозданием</span><strong>{data.tasks.filter(task => task.completedOn === date && isLateCompletion(task)).length}</strong></div>
      <div className="day-progress-line"><span>Общее время</span><strong>{formatMinutes(total)}</strong></div>
      <div className="day-progress-line"><span>Английский</span><strong>{formatMinutes(english)}</strong></div>
      {otherCategories.length > 0 && (
        <div className="day-category-breakdown">
          {otherCategories.map((category) => (
            <div key={category.id} className="day-progress-line">
              <span><i className="day-category-dot" style={{ backgroundColor: category.color }} />{category.name}</span>
              <strong>{formatMinutes(byCategory.get(category.id) ?? 0)}</strong>
            </div>
          ))}
        </div>
      )}
      {orphanLogs.length > 0 && <details className="day-orphan-details"><summary>Время удалённых задач · {orphanLogs.length}</summary>
        {orphanLogs.map((log) => <OrphanLog key={log.id} {...{ log, data, update }} />)}
      </details>}
    </section>
  );
}

const journalFields = [
  ["notes", "Заметки дня", "Что важно держать под рукой?"],
  ["journal", "Запись в дневнике", "Как прошёл день?"],
  ["worked", "Что получилось?", ""],
  ["blocked", "Что помешало?", ""],
  ["improve", "Что улучшить?", ""],
] as const;

function Journal({ entry, date, update, updateText }: Pick<PageProps, "date" | "update" | "updateText"> & { entry: DayEntry }) {
  function patch(patchEntry: Partial<DayEntry>) {
    update((draft) => {
      draft.days[date] = { ...(draft.days[date] ?? emptyDay()), ...patchEntry };
    });
  }

  return (
    <section className="day-panel" aria-labelledby="day-journal-heading">
      <div className="day-section-head">
        <div><BookOpen size={17} /><h2 id="day-journal-heading">Дневник</h2></div>
      </div>
      <div className="day-journal-fields">
        {journalFields.map(([key, label, placeholder]) => (
          <label key={key} className="day-field">{label}
            <textarea value={entry[key]} placeholder={placeholder} rows={2} maxLength={100000} onChange={(event) => updateText('days', date, key, event.currentTarget.value)} />
          </label>
        ))}
      </div>
      <div className="day-marks">
        <label><input type="checkbox" className="day-checkbox" checked={entry.english} onChange={(event) => patch({ english: event.currentTarget.checked })} /> Занимался английским</label>
        <label><input type="checkbox" className="day-checkbox" checked={entry.diary} onChange={(event) => patch({ diary: event.currentTarget.checked })} /> Вёл дневник</label>
      </div>
    </section>
  );
}

export function Day(props: PageProps & { openLearning?: OpenLearning }) {
  const { date, setDate, data, update } = props;
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => { if (focusRequest) document.getElementById('quick-task')?.focus(); }, [date, focusRequest]);
  const tasks = data.tasks.filter((task) => task.date === date);
  const entry = data.days[date] ?? emptyDay();
  const marked = new Set([
    ...data.tasks.map((task) => task.date),
    ...data.logs.map((log) => log.date),
    ...Object.entries(data.days).filter(([, item]) => (
      item.notes.trim() || item.journal.trim() || item.worked.trim() || item.blocked.trim() ||
      item.improve.trim() || item.english || item.diary || item.frogHistory.length
    )).map(([key]) => key),
  ]);
  const dayLabel = date === today() ? "Сегодня" : date === shiftDate(today(), 1) ? "Завтра" : "План дня";

  return (
    <>
      <header className="day-page-head">
        <div>
          <p>{formatDate(date, dateTitleOptions)}</p>
          <h1>{dayLabel}</h1>
        </div>
        <div className="day-header-tools">
          <button className="button primary" onClick={() => { setDate(shiftDate(today(), 1)); setFocusRequest(n => n + 1); }}>Запланировать завтра</button>
          <button type="button" className="button" aria-label="Предыдущий день" disabled={date === earliestDate} onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft size={17} /></button>
          <button type="button" className="button" aria-label="Следующий день" disabled={date === latestDate} onClick={() => setDate(shiftDate(date, 1))}><ChevronRight size={17} /></button>
          {date !== today() && <button type="button" className="button" onClick={() => setDate(today())}>К сегодня</button>}
        </div>
      </header>
      <div className="day-layout">
        <div className="day-stack">
          <Frog key={`frog:${date}`} {...props} tasks={tasks} entry={entry} />
          <Tasks key={`tasks:${date}`} {...props} tasks={tasks} />
          <Journal key={`journal:${date}`} date={date} entry={entry} update={update} updateText={props.updateText} />
        </div>
        <div className="day-stack">
          <section className="day-panel" aria-labelledby="day-calendar-heading">
            <div className="day-section-head"><div><CalendarDays size={17} /><h2 id="day-calendar-heading">Календарь</h2></div></div>
            <MiniCalendar date={date} onSelect={setDate} marked={marked} />
          </section>
          <DaySummary data={data} date={date} tasks={tasks} update={update} />
          <OverdueTasks data={data} date={date} update={update} />
        </div>
      </div>
    </>
  );
}

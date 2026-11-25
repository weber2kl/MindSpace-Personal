import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Flag, Lightbulb,
  Link2, Pencil, Plus, RotateCcw, Target, Trash2, Trophy, X,
} from 'lucide-react';
import {
  ENGLISH_ID, formatDate, formatMinutes, id, isDate, monthStart, OTHER_ID,
  shiftDate, shiftMonth, today,
} from './model';
import type { Data, Goal, Idea, PlanItem, Stage, TaskGoal, TimeGoal } from './model';
import { completionPercent, monthlyTaskCounts, monthTimeByWeek, periodBounds, stageProgress, timeGoalProgress, timeTotals } from './analytics';
import type { PageProps } from './ui';
import './plans.css';

const shortDate: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
const fullDate: Intl.DateTimeFormatOptions = { ...shortDate, year: 'numeric' };
const monthLabel: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
const weekDayLabel: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
const weekDayShort: Intl.DateTimeFormatOptions = { weekday: 'short' };
const stagePageSize = 60;
const ideaStatuses: Record<Idea['status'], string> = {
  new: 'Новые', planned: 'В процессе', realized: 'Сделано',
};

function read(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim();
}

function rangeLabel(start: string, end: string) {
  return start === end ? formatDate(start, shortDate) : `${formatDate(start, shortDate)} — ${formatDate(end, shortDate)}`;
}

function Progress({ value, label }: { value: number; label: string }) {
  const bounded = Math.max(0, Math.min(100, value));
  return <div className="plan-progress" role="progressbar" aria-label={label} aria-valuenow={bounded}
    aria-valuetext={`${value.toLocaleString('ru-RU')}%`} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${bounded}%` }} /></div>;
}

function PeriodControls({ period, date, setDate }: {
  period: 'week' | 'month'; date: string; setDate: (value: string) => void;
}) {
  const label = period === 'week' ? 'неделя' : 'месяц';
  const move = (direction: number) => period === 'week' ? shiftDate(date, direction * 7) : shiftMonth(date, direction);
  const previous = move(-1);
  const next = move(1);
  return <div className="plan-controls">
    <button className="plan-button icon" aria-label={`Предыдущий период: ${label}`} disabled={!isDate(previous)} onClick={() => setDate(previous)}><ChevronLeft size={18} /></button>
    <button className="plan-button" onClick={() => setDate(today())}>{period === 'week' ? 'Текущая неделя' : 'Текущий месяц'}</button>
    <button className="plan-button icon" aria-label={`Следующий период: ${label}`} disabled={!isDate(next)} onClick={() => setDate(next)}><ChevronRight size={18} /></button>
  </div>;
}

function PlanDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog?.open) dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog className="plan-dialog" ref={ref} aria-label={title} onCancel={(event) => {
    event.preventDefault();
    close();
  }}>
    <div className="plan-dialog-head"><h2>{title}</h2><button type="button" className="plan-button icon quiet" onClick={close} aria-label="Закрыть"><X size={18} /></button></div>
    {children}
  </dialog>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="plan-field"><span>{label}</span>{children}</label>;
}

function Submit({ close, label = 'Сохранить' }: { close: () => void; label?: string }) {
  return <div className="plan-dialog-actions">
    <button className="plan-button" type="button" onClick={close}>Отмена</button>
    <button className="plan-button main" type="submit">{label}</button>
  </div>;
}

function PlanEditor({ data, item, period, periodDate, save, close }: {
  data: Data; item?: PlanItem; period: PlanItem['period']; periodDate: string;
  save: (item: PlanItem) => void; close: () => void;
}) {
  const monthGoals = data.plans.filter(plan => plan.period === 'month');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const title = read(values, 'title');
    if (!title) return;
    const core = { id: item?.id ?? id(), title, date: periodDate, completedOn: item?.completedOn ?? null };
    if (period === 'week') save({ ...core, period, monthGoalId: read(values, 'monthGoalId') || null,
      goalId: null, stageId: read(values, 'stageId') || null });
    else save({ ...core, period, monthGoalId: null, goalId: read(values, 'goalId') || null, stageId: item?.stageId ?? null });
  }
  return <PlanDialog title={item ? 'Редактировать план' : period === 'week' ? 'Недельная задача' : 'Цель месяца'} close={close}>
    <form onSubmit={submit}>
      <Field label="Название"><input autoFocus required pattern=".*\S.*" maxLength={300} name="title" defaultValue={item?.title} /></Field>
      {period === 'week' ? <>
        <Field label="Связь с целью месяца"><select name="monthGoalId" defaultValue={item?.monthGoalId ?? ''}>
          <option value="">Без связи</option>
          {monthGoals.map(goal => <option key={goal.id} value={goal.id}>{formatDate(goal.date, monthLabel)} · {goal.title}</option>)}
        </select></Field>
        <Field label="Связь с этапом большой цели"><select name="stageId" defaultValue={item?.stageId ?? ''}>
          <option value="">Без связи</option>
          {data.goals.flatMap(goal => goal.stages.map(stage => <option key={stage.id} value={stage.id}>{goal.title} · {stage.title}</option>))}
        </select></Field>
      </> : <Field label="Связь с большой целью"><select name="goalId" defaultValue={item?.goalId ?? ''}>
        <option value="">Без связи</option>
        {data.goals.map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
      </select></Field>}
      <Submit close={close} />
    </form>
  </PlanDialog>;
}

function PlanItems({ data, update, period, periodDate }: Pick<PageProps, 'data' | 'update'> & {
  period: PlanItem['period']; periodDate: string;
}) {
  const [editor, setEditor] = useState<PlanItem | 'new' | null>(null);
  const items = data.plans.filter(item => item.period === period && item.date === periodDate);
  const done = items.filter(item => item.completedOn).length;
  const label = period === 'week' ? 'Недельные задачи' : 'Цели месяца';
  const plansById = new Map(data.plans.map(plan => [plan.id, plan]));
  const goalsById = new Map(data.goals.map(goal => [goal.id, goal]));
  const stagesById = new Map(data.goals.flatMap(goal => goal.stages).map(stage => [stage.id, stage]));
  const weekSteps = new Map<string, { done: number; total: number }>();
  if (period === 'month') {
    for (const plan of data.plans) {
      if (!plan.monthGoalId) continue;
      const steps = weekSteps.get(plan.monthGoalId) ?? { done: 0, total: 0 };
      steps.total++;
      if (plan.completedOn) steps.done++;
      weekSteps.set(plan.monthGoalId, steps);
    }
  }
  const percent = completionPercent(done, items.length);

  function save(item: PlanItem) {
    update(draft => {
      const index = draft.plans.findIndex(plan => plan.id === item.id);
      if (index === -1) draft.plans.push(item);
      else draft.plans[index] = item;
    });
    setEditor(null);
  }

  function remove(item: PlanItem) {
    if (!window.confirm(`Удалить «${item.title}»?`)) return;
    update(draft => {
      draft.plans = draft.plans.filter(plan => plan.id !== item.id);
      for (const plan of draft.plans) if (plan.monthGoalId === item.id) plan.monthGoalId = null;
    });
  }

  return <section className="plan-panel">
    <div className="plan-panel-head">
      <h2><Target size={18} /> {label}</h2>
      <button className="plan-button main" onClick={() => setEditor('new')}><Plus size={16} /> {period === 'week' ? 'Добавить задачу' : 'Добавить цель'}</button>
    </div>
    {items.length ? <>
      <div className="plan-time-summary"><span className="plan-muted">Выполнено {done} из {items.length}</span><strong>{percent.toLocaleString('ru-RU')}%</strong></div>
      <Progress value={percent} label={label} />
      {items.map(item => {
        const parent = item.monthGoalId ? plansById.get(item.monthGoalId) : undefined;
        const goal = item.goalId ? goalsById.get(item.goalId) : undefined;
        const stage = item.stageId ? stagesById.get(item.stageId) : undefined;
        const steps = weekSteps.get(item.id);
        return <div key={item.id} className="plan-row">
          <div className={`plan-row-main${item.completedOn ? ' done' : ''}`}>
            <input type="checkbox" aria-label={`Выполнено: ${item.title}`} checked={Boolean(item.completedOn)} onChange={event => {
              const checked = event.target.checked;
              update(draft => {
                const plan = draft.plans.find(entry => entry.id === item.id);
                if (plan) plan.completedOn = checked ? today() : null;
              });
            }} />
            <div><strong>{item.title}</strong>
              {(parent || goal) && <small className="plan-muted">Цель · {parent?.title ?? goal?.title}</small>}
              {stage && <small className="plan-muted">Этап · {stage.title}</small>}
              {steps && <small className="plan-muted">Недельные шаги · {steps.done} из {steps.total}</small>}
            </div>
          </div>
          <div className="plan-row-actions">
            <button className="plan-button icon quiet" onClick={() => setEditor(item)} aria-label={`Редактировать: ${item.title}`}><Pencil size={15} /></button>
            <button className="plan-button icon quiet danger" onClick={() => remove(item)} aria-label={`Удалить: ${item.title}`}><Trash2 size={15} /></button>
          </div>
        </div>;
      })}
    </> : <p className="plan-empty">{period === 'week' ? 'На эту неделю ещё нет задач.' : 'На этот месяц ещё нет целей.'}</p>}
    {editor && <PlanEditor key={editor === 'new' ? 'new' : editor.id} item={editor === 'new' ? undefined : editor} period={period}
      periodDate={periodDate} data={data} close={() => setEditor(null)} save={save} />}
  </section>;
}

function CategoryTimes({ data, start, end }: { data: Data; start: string; end: string }) {
  const { minutes: totals, total } = useMemo(() => timeTotals(data, start, end), [data, start, end]);
  return <section className="plan-panel">
    <div className="plan-panel-head"><h2><Clock3 size={18} /> Время за неделю</h2><strong>{formatMinutes(total)}</strong></div>
    {total ? <div className="plan-tags">{data.categories.filter(category => totals.has(category.id)).map(category =>
      <span key={category.id} className="plan-tag plan-time-title"><i style={{ background: category.color }} />{category.name} · {formatMinutes(totals.get(category.id) ?? 0)}</span>)}</div> :
      <p className="plan-empty">Записи времени появятся здесь после заполнения дней.</p>}
  </section>;
}

export function Week({ data, date, setDate, update, goToDay }: PageProps) {
  const { start, end } = periodBounds('week', date);
  const days = Array.from({ length: 7 }, (_, offset) => shiftDate(start, offset));
  const tasksByDay = useMemo(() => {
    const result = new Map<string, Data['tasks']>();
    for (const task of data.tasks) {
      if (task.date < start || task.date > end) continue;
      const tasks = result.get(task.date) ?? [];
      tasks.push(task);
      result.set(task.date, tasks);
    }
    return result;
  }, [data.tasks, start, end]);
  const dayTasks = tasksByDay.get(date) ?? [];
  return <div className="plan-view">
    <header className="plan-heading"><div><h1>План на неделю</h1><p>{start.slice(0, 4) === end.slice(0, 4) ? `${rangeLabel(start, end)} · ${start.slice(0, 4)}` : `${formatDate(start, fullDate)} — ${formatDate(end, fullDate)}`}</p></div>
      <PeriodControls period="week" {...{ date, setDate }} />
    </header>
    <section className="plan-panel">
      <div className="plan-panel-head"><h2><CalendarDays size={18} /> Дни недели</h2></div>
      <div className="plan-week-days">{days.map(day => {
        const tasks = tasksByDay.get(day) ?? [];
        const completed = tasks.filter(task => task.completedOn).length;
        return <button className="plan-week-day" key={day} aria-label={formatDate(day, weekDayLabel)}
          aria-current={day === date ? 'date' : undefined} disabled={!isDate(day)} onClick={() => setDate(day)}>
          <small>{formatDate(day, weekDayShort)}</small><strong>{Number(day.slice(-2))}</strong>
          <small>{tasks.length ? `${completed} / ${tasks.length}` : '—'}</small>
        </button>;
      })}</div>
      <div className="plan-row plan-day-preview">
        <span className="plan-muted">{formatDate(date, shortDate)} · выполнено {dayTasks.filter(task => task.completedOn).length} из {dayTasks.length}</span>
        <button className="plan-button" onClick={() => goToDay(date)}>Открыть день <ChevronRight size={15} /></button>
      </div>
      {dayTasks.length > 0 && <ul className="plan-preview-list" aria-label="Задачи выбранного дня">
        {dayTasks.slice(0, 3).map(task => <li key={task.id} className={task.completedOn ? 'done' : undefined}>
          {task.completedOn && <Check size={14} />}<span>{task.title}</span>
        </li>)}
        {dayTasks.length > 3 && <li className="plan-muted">Ещё {dayTasks.length - 3}</li>}
      </ul>}
    </section>
    <PlanItems key={start} data={data} update={update} period="week" periodDate={start} />
    <CategoryTimes data={data} start={start} end={end} />
  </div>;
}

function TimeGoalEditor({ data, month, item, close, save }: {
  data: Data; month: string; item?: TimeGoal; close: () => void; save: (item: TimeGoal) => void;
}) {
  const options = data.categories.filter(category => !data.timeGoals.some(goal => goal.month === month && goal.categoryId === category.id && goal.id !== item?.id));
  return <PlanDialog title={item ? 'Изменить цель по времени' : 'Новая цель по времени'} close={close}>
    <form onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const categoryId = read(form, 'category');
      const minutes = Math.round(Number(read(form, 'hours')) * 60) + Number(read(form, 'minutes'));
      if (!options.some(category => category.id === categoryId) || !Number.isSafeInteger(minutes) || minutes <= 0 || minutes > 744 * 60) {
        const control = event.currentTarget.elements.namedItem('minutes') as HTMLInputElement;
        control.setCustomValidity('Укажите продолжительность от 1 минуты до 744 часов.');
        control.reportValidity();
        return;
      }
      save({ id: item?.id ?? id(), month, categoryId, minutes });
    }}>
      <Field label="Категория"><select autoFocus required name="category" defaultValue={item?.categoryId ?? options[0]?.id}>
        {options.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select></Field>
      <div className="plan-field-grid" onInput={event => {
        const minutes = event.currentTarget.querySelector<HTMLInputElement>('input[name="minutes"]');
        minutes?.setCustomValidity('');
      }}>
        <Field label="План, часы"><input name="hours" type="number" min={0} max={744} required defaultValue={item ? Math.floor(item.minutes / 60) : 20} /></Field>
        <Field label="План, минуты"><input name="minutes" type="number" min={0} max={59} required defaultValue={item ? item.minutes % 60 : 0} /></Field>
      </div>
      <Submit close={close} />
    </form>
  </PlanDialog>;
}

function TimeGoalCard({ data, item, weeks, edit, remove }: {
  data: Data; item: TimeGoal; weeks: ReturnType<typeof monthTimeByWeek>; edit: () => void; remove: () => void;
}) {
  const category = data.categories.find(entry => entry.id === item.categoryId);
  const total = weeks.reduce((sum, week) => sum + (week.minutes.get(item.categoryId) ?? 0), 0);
  const progress = timeGoalProgress(total, item.minutes);
  return <article className="plan-panel">
    <div className="plan-panel-head">
      <h3 className="plan-time-title"><i style={{ background: category?.color }} />{category?.name}</h3>
      <div className="plan-row-actions"><button className="plan-button icon quiet" aria-label={`Изменить цель по времени: ${category?.name}`} onClick={edit}><Pencil size={15} /></button>
        <button className="plan-button icon quiet danger" aria-label={`Удалить цель по времени: ${category?.name}`} onClick={remove}><Trash2 size={15} /></button></div>
    </div>
    <div className="plan-time-summary"><span><strong>{formatMinutes(total)}</strong> <span className="plan-muted">из {formatMinutes(item.minutes)}</span></span><strong>{progress.percent.toLocaleString('ru-RU')}%</strong></div>
    <Progress value={progress.percent} label={`Цель по времени: ${category?.name}`} />
    <small className="plan-muted">{progress.surplus ? `Сверх цели ${formatMinutes(progress.surplus)}` : progress.remaining ? `Осталось ${formatMinutes(progress.remaining)}` : 'Цель достигнута'}</small>
    <ul className="plan-weeks" aria-label="Распределение времени по неделям">{weeks.map(week => <li key={week.start}>
      <small className="plan-muted">{rangeLabel(week.start, week.end)}</small><small>{formatMinutes(week.minutes.get(item.categoryId) ?? 0)}</small>
    </li>)}</ul>
  </article>;
}

export function Month({ data, date, setDate, update }: PageProps) {
  const month = monthStart(date);
  const [editor, setEditor] = useState<TimeGoal | 'new' | null>(null);
  const goals = data.timeGoals.filter(goal => goal.month === month);
  const hasGoals = goals.length > 0;
  const weeks = useMemo(() => hasGoals ? monthTimeByWeek(data, month) : [], [data, month, hasGoals]);
  function save(item: TimeGoal) {
    update(draft => {
      const index = draft.timeGoals.findIndex(goal => goal.id === item.id);
      if (index === -1) draft.timeGoals.push(item);
      else draft.timeGoals[index] = item;
    });
    setEditor(null);
  }
  return <div className="plan-view">
    <header className="plan-heading"><div><h1>План на месяц</h1><p className="plan-month-label">{formatDate(month, monthLabel)}</p></div>
      <PeriodControls period="month" {...{ date, setDate }} />
    </header>
    <PlanItems key={month} data={data} update={update} period="month" periodDate={month} />
    <section className="plan-panel">
      <div className="plan-panel-head"><h2><Clock3 size={18} /> Цели по времени</h2>
        <button className="plan-button main" disabled={goals.length >= data.categories.length} onClick={() => setEditor('new')}><Plus size={16} /> Добавить цель по времени</button></div>
      {hasGoals ? <div className="plan-grid">{goals.map(goal => <TimeGoalCard key={goal.id} item={goal} data={data} weeks={weeks}
        edit={() => setEditor(goal)} remove={() => {
          if (window.confirm('Удалить эту цель по времени?')) update(draft => { draft.timeGoals = draft.timeGoals.filter(item => item.id !== goal.id); });
        }} />)}</div> : <p className="plan-empty">Установите план по часам для английского или другой категории.</p>}
    </section>
    {editor && <TimeGoalEditor key={editor === 'new' ? 'new' : editor.id} month={month} data={data}
      item={editor === 'new' ? undefined : editor} save={save} close={() => setEditor(null)} />}
  </div>;
}

function GoalEditor({ goal, date, save, close }: {
  goal?: Goal; date: string; save: (goal: Goal) => void; close: () => void;
}) {
  const [start, setStart] = useState(goal?.start ?? date);
  return <PlanDialog title={goal ? 'Редактировать большую цель' : 'Новая большая цель'} close={close}>
    <form onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const title = read(form, 'title');
      if (!title) return;
      save({ id: goal?.id ?? id(), title, description: read(form, 'description'), start, due: read(form, 'due') || null,
        completedOn: goal?.completedOn ?? null, notes: read(form, 'notes'), stages: goal?.stages ?? [] });
    }}>
      <Field label="Название"><input name="title" required pattern=".*\S.*" autoFocus maxLength={300} defaultValue={goal?.title} /></Field>
      <Field label="Описание результата"><textarea name="description" maxLength={100000} defaultValue={goal?.description} /></Field>
      <div className="plan-field-grid">
        <Field label="Дата начала"><input type="date" name="start" min="1000-01-01" max={goal?.completedOn ?? '9999-12-31'} required value={start} onChange={event => setStart(event.target.value)} /></Field>
        <Field label="Срок"><input type="date" name="due" min={start || '1000-01-01'} max="9999-12-31" defaultValue={goal?.due ?? ''} /></Field>
      </div>
      <Field label="Заметки"><textarea name="notes" maxLength={100000} defaultValue={goal?.notes} /></Field>
      <Submit close={close} />
    </form>
  </PlanDialog>;
}

const linkedTasks = (data: Data) => [
  ...data.tasks.map(task => ({ task, key: `day:${task.id}`, label: 'День' })),
  ...data.plans.filter(plan => plan.period === 'week').map(task => ({ task, key: `week:${task.id}`, label: 'Неделя' })),
];

function StageEditor({ data, stage, close, save }: {
  data: Data; stage?: Stage; close: () => void; save: (stage: Stage, links: Set<string>) => void;
}) {
  const [linked, setLinked] = useState(() => new Set(stage ? linkedTasks(data).filter(({ task }) => task.stageId === stage.id).map(({ key }) => key) : []));
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(stagePageSize);
  const available = useMemo(() => linkedTasks(data)
    .filter(({ task }) => !task.stageId || task.stageId === stage?.id)
    .sort((first, second) => second.task.date.localeCompare(first.task.date)), [data, stage?.id]);
  const normalizedQuery = query.toLowerCase().trim();
  const tasks = normalizedQuery ? available.filter(({ task }) => task.title.toLowerCase().includes(normalizedQuery)) : available;
  return <PlanDialog title={stage ? 'Редактировать этап' : 'Добавить этап'} close={close}>
    <form onSubmit={event => {
      event.preventDefault();
      const title = read(new FormData(event.currentTarget), 'title');
      if (title) save({ id: stage?.id ?? id(), title, done: stage?.done ?? false }, linked);
    }}>
      <Field label="Название этапа"><input required pattern=".*\S.*" autoFocus name="title" defaultValue={stage?.title} maxLength={300} /></Field>
      <Field label={`Связанные задачи · выбрано ${linked.size}`}><input type="search" placeholder="Поиск по названию" value={query} onChange={event => {
        setQuery(event.target.value);
        setLimit(stagePageSize);
      }} /></Field>
      <div className="plan-link-list" role="group" aria-label="Дневные и недельные задачи">
        {tasks.length ? tasks.slice(0, limit).map(({ task, key, label }) => <label key={key}>
          <input type="checkbox" checked={linked.has(key)} onChange={event => {
            const next = new Set(linked);
            if (event.target.checked) next.add(key);
            else next.delete(key);
            setLinked(next);
          }} /><span>{task.title}<small>{label} · {formatDate(task.date, fullDate)}</small></span>
        </label>) : <p className="plan-empty">{normalizedQuery ? 'Нет совпадений.' : 'Нет свободных дневных и недельных задач.'}</p>}
        {tasks.length > limit && <button className="plan-button" type="button" onClick={() => setLimit(current => current + stagePageSize)}>
          Показать ещё {Math.min(stagePageSize, tasks.length - limit)}
        </button>}
      </div>
      <Submit close={close} />
    </form>
  </PlanDialog>;
}

function clearStageLinks(data: Data, stageIds: Set<string>) {
  for (const item of [...data.tasks, ...data.plans]) if (item.stageId && stageIds.has(item.stageId)) item.stageId = null;
}

function GoalCard({ data, update, goal, stages, edit }: Pick<PageProps, 'data' | 'update'> & {
  goal: Goal; stages: ReturnType<typeof stageProgress>; edit: () => void;
}) {
  const [stageEditor, setStageEditor] = useState<Stage | 'new' | null>(null);
  const [completing, setCompleting] = useState(false);
  const completed = goal.stages.filter(stage => stages.get(stage.id)?.done).length;
  const progress = completionPercent(completed, goal.stages.length);
  const linkedMonth = data.plans.filter(item => item.goalId === goal.id);

  function removeGoal() {
    if (!window.confirm(`Удалить цель «${goal.title}» и её этапы?`)) return;
    update(draft => {
      draft.goals = draft.goals.filter(item => item.id !== goal.id);
      for (const item of draft.plans) if (item.goalId === goal.id) item.goalId = null;
      clearStageLinks(draft, new Set(goal.stages.map(stage => stage.id)));
    });
  }

  function saveStage(stage: Stage, linked: Set<string>) {
    update(draft => {
      const target = draft.goals.find(item => item.id === goal.id);
      if (!target) return;
      const index = target.stages.findIndex(item => item.id === stage.id);
      if (index === -1) target.stages.push(stage);
      else target.stages[index] = stage;
      for (const { task, key } of linkedTasks(draft)) {
        if (linked.has(key) && (!task.stageId || task.stageId === stage.id)) task.stageId = stage.id;
        else if (task.stageId === stage.id) task.stageId = null;
      }
    });
    setStageEditor(null);
  }

  function complete(completedOn: string | null) {
    update(draft => {
      const target = draft.goals.find(item => item.id === goal.id);
      if (target) target.completedOn = completedOn;
    });
    setCompleting(false);
  }

  return <article className="plan-panel plan-goal-card">
    <div className="plan-panel-head"><div className="plan-goal-title">
      <h2>{goal.completedOn ? <Trophy size={18} /> : <Target size={18} />} {goal.title}</h2>
      <div className="plan-goal-meta plan-muted"><span><CalendarDays size={13} /> Начало {formatDate(goal.start, fullDate)}</span>
        {goal.due && <span><Flag size={13} /> До {formatDate(goal.due, fullDate)}</span>}
        {goal.completedOn && <span><Check size={13} /> Завершена {formatDate(goal.completedOn, fullDate)}</span>}
      </div>
    </div><div className="plan-row-actions">
      <button className="plan-button icon quiet" onClick={edit} aria-label={`Редактировать цель: ${goal.title}`}><Pencil size={15} /></button>
      <button className="plan-button icon quiet danger" onClick={removeGoal} aria-label={`Удалить цель: ${goal.title}`}><Trash2 size={15} /></button>
    </div></div>
    {goal.description && <p className="plan-text">{goal.description}</p>}
    {goal.stages.length > 0 && <>
      <div className="plan-time-summary"><span className="plan-muted">Этапы · {completed} из {goal.stages.length}</span><strong>{progress.toLocaleString('ru-RU')}%</strong></div>
      <Progress value={progress} label={`Прогресс этапов: ${goal.title}`} />
    </>}
    {goal.stages.map(stage => {
      const status = stages.get(stage.id);
      const done = status?.done ?? stage.done;
      const linkedDone = status?.linkedDone ?? false;
      return <div className="plan-row" key={stage.id}>
        <div className={`plan-row-main${done ? ' done' : ''}`}>
          <input type="checkbox" checked={done} disabled={linkedDone} aria-label={`Этап выполнен: ${stage.title}`} onChange={event => {
            const checked = event.target.checked;
            update(draft => {
              const entry = draft.goals.find(item => item.id === goal.id)?.stages.find(item => item.id === stage.id);
              if (entry) entry.done = checked;
            });
          }} />
          <div><strong>{stage.title}</strong>{status && status.linked > 0 && <small className="plan-muted">{linkedDone ? 'Выполнена связанная задача' : `Связанных задач · ${status.linked}`}</small>}</div>
        </div>
        <div className="plan-row-actions">
          <button className="plan-button icon quiet" onClick={() => setStageEditor(stage)} aria-label={`Изменить этап и связи: ${stage.title}`}><Link2 size={16} /></button>
          <button className="plan-button icon quiet danger" aria-label={`Удалить этап: ${stage.title}`} onClick={() => {
            if (!window.confirm(`Удалить этап «${stage.title}»?`)) return;
            update(draft => {
              const target = draft.goals.find(item => item.id === goal.id);
              if (target) target.stages = target.stages.filter(item => item.id !== stage.id);
              clearStageLinks(draft, new Set([stage.id]));
            });
          }}><Trash2 size={15} /></button>
        </div>
      </div>;
    })}
    {goal.notes && <p className="plan-text plan-muted">{goal.notes}</p>}
    {linkedMonth.length > 0 && <div className="plan-tags" aria-label="Связанные цели месяца">{linkedMonth.map(item => <span className="plan-tag" key={item.id}><Link2 size={13} />{item.title}</span>)}</div>}
    <div className="plan-controls plan-goal-actions">
      <button className="plan-button" onClick={() => setStageEditor('new')}><Plus size={15} /> Добавить этап</button>
      <button className="plan-button" disabled={!goal.completedOn && goal.start > today()} onClick={() => {
        if (goal.completedOn) complete(null);
        else setCompleting(true);
      }}>{goal.completedOn ? <RotateCcw size={15} /> : <Check size={15} />}{goal.completedOn ? 'Вернуть в активные' : 'Завершить цель'}</button>
    </div>
    {stageEditor && <StageEditor key={stageEditor === 'new' ? 'new' : stageEditor.id} data={data}
      stage={stageEditor === 'new' ? undefined : stageEditor} close={() => setStageEditor(null)} save={saveStage} />}
    {completing && <PlanDialog title="Завершить цель" close={() => setCompleting(false)}>
      <form onSubmit={event => {
        event.preventDefault();
        const completedOn = read(new FormData(event.currentTarget), 'completedOn');
        if (completedOn) complete(completedOn);
      }}>
        <Field label="Дата завершения"><input type="date" name="completedOn" min={goal.start} max={today()} defaultValue={today()} required /></Field>
        <Submit close={() => setCompleting(false)} label="Завершить" />
      </form>
    </PlanDialog>}
  </article>;
}

function TaskGoalEditor({ item, month, data, close, save }: {
  item?: TaskGoal; month: string; data: Data; close: () => void; save: (item: TaskGoal) => void;
}) {
  const options = data.categories.filter(category => category.id === item?.categoryId ||
    !data.taskGoals?.some(goal => goal.month === month && goal.categoryId === category.id));
  const defaultCategory = options.find(category => category.id === ENGLISH_ID) ?? options[0];
  return <PlanDialog title={item ? 'Изменить цель по задачам' : 'Новая цель по задачам'} close={close}>
    <form onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const categoryId = read(form, 'category');
      const target = Number(read(form, 'target'));
      if (options.some(category => category.id === categoryId) && Number.isInteger(target) && target >= 1 && target <= 9999) {
        save({ month, categoryId, target });
      }
    }}>
      <p className="plan-month-label">{formatDate(month, monthLabel)}</p>
      <Field label="Категория"><select required name="category" defaultValue={item?.categoryId ?? defaultCategory?.id}>
        {options.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select></Field>
      <Field label="Количество задач"><input autoFocus required name="target" type="number" min={1} max={9999} step={1} defaultValue={item?.target ?? 50} /></Field>
      <Submit close={close} />
    </form>
  </PlanDialog>;
}

function MonthlyTaskGoals({ data, update }: Pick<PageProps, 'data' | 'update'>) {
  const [date, setDate] = useState(today);
  const [editor, setEditor] = useState<TaskGoal | 'new' | null>(null);
  const month = monthStart(date);
  const goals = data.taskGoals?.filter(item => item.month === month) ?? [];
  const counts = useMemo(() => monthlyTaskCounts(data, month), [data, month]);
  return <section className="plan-panel task-goals" aria-labelledby="task-goals-title">
    <div className="plan-panel-head">
      <div><h2 id="task-goals-title"><Target size={18} /> Цели по задачам</h2><p className="plan-month-label">{formatDate(month, monthLabel)}</p></div>
      <PeriodControls period="month" date={date} setDate={setDate} />
    </div>
    {goals.length ? <div className="task-goal-list">{goals.map(goal => {
      const category = data.categories.find(item => item.id === goal.categoryId);
      const count = counts.get(goal.categoryId) ?? 0;
      return <article className="task-goal" key={goal.categoryId}>
        <div className="plan-panel-head"><h3 className="plan-time-title"><i style={{ background: category?.color }} />{category?.name}</h3>
          <div className="plan-row-actions">
            <button className="plan-button icon quiet" aria-label={`Изменить цель по задачам: ${category?.name}`} onClick={() => setEditor(goal)}><Pencil size={15} /></button>
            <button className="plan-button icon quiet danger" aria-label={`Удалить цель по задачам: ${category?.name}`} onClick={() => {
              if (!window.confirm(`Удалить план по задачам для категории «${category?.name}»?`)) return;
              update(draft => {
                const remaining = draft.taskGoals?.filter(item => item.month !== month || item.categoryId !== goal.categoryId);
                if (remaining?.length) draft.taskGoals = remaining;
                else delete draft.taskGoals;
              });
            }}><Trash2 size={15} /></button>
          </div>
        </div>
        <div className="plan-time-summary"><span><strong>{count} / {goal.target}</strong> <span className="plan-muted">задач</span></span>
          <small className="plan-muted">{count >= goal.target ? 'Цель достигнута' : `Осталось ${goal.target - count}`}</small>
        </div>
        <Progress value={completionPercent(count, goal.target)} label={`Задачи за месяц: ${category?.name}`} />
      </article>;
    })}</div> : <p className="plan-empty">Задай план, например 50 задач по английскому. Выполненные дневные задачи за этот месяц посчитаются автоматически.</p>}
    <button className="plan-button" disabled={goals.length >= data.categories.length} onClick={() => setEditor('new')}><Plus size={16} /> Добавить цель по задачам</button>
    {editor && <TaskGoalEditor item={editor === 'new' ? undefined : editor} month={month} data={data} close={() => setEditor(null)} save={goal => {
      update(draft => {
        const remaining = (draft.taskGoals ?? []).filter(item => item.month !== month || item.categoryId !== (editor === 'new' ? goal.categoryId : editor.categoryId));
        draft.taskGoals = [...remaining, goal];
      });
      setEditor(null);
    }} />}
  </section>;
}

export function Goals({ data, date, update }: PageProps) {
  const [editor, setEditor] = useState<Goal | 'new' | null>(null);
  const [archive, setArchive] = useState(false);
  const stages = useMemo(() => stageProgress(data), [data]);
  const archived = data.goals.filter(goal => goal.completedOn);
  const goals = archive ? [...archived].sort((first, second) => (second.completedOn ?? '').localeCompare(first.completedOn ?? '')) : data.goals.filter(goal => !goal.completedOn);
  return <div className="plan-view">
    <header className="plan-heading"><h1>Большие цели</h1>
      <button className="plan-button main" onClick={() => setEditor('new')}><Plus size={16} /> Новая цель</button>
    </header>
    <MonthlyTaskGoals data={data} update={update} />
    <div className="plan-controls" aria-label="Список целей">
      <button className={`plan-button${archive ? '' : ' main'}`} aria-pressed={!archive} onClick={() => setArchive(false)}><Target size={16} /> Активные</button>
      <button className={`plan-button${archive ? ' main' : ''}`} aria-pressed={archive} onClick={() => setArchive(true)}><Trophy size={16} /> Достижения · {archived.length}</button>
    </div>
    <div className="plan-goal-stack">{goals.length ? goals.map(goal => <GoalCard key={goal.id} data={data} update={update}
      goal={goal} stages={stages} edit={() => setEditor(goal)} />) : <div className="plan-panel"><p className="plan-empty">{archive ? 'Здесь будут завершённые большие цели.' : 'Активных больших целей пока нет.'}</p></div>}</div>
    {editor && <GoalEditor key={editor === 'new' ? 'new' : editor.id} goal={editor === 'new' ? undefined : editor} date={date} close={() => setEditor(null)} save={goal => {
      update(draft => {
        const index = draft.goals.findIndex(item => item.id === goal.id);
        if (index === -1) draft.goals.push(goal);
        else draft.goals[index] = goal;
      });
      setEditor(null);
    }} />}
  </div>;
}

function IdeaEditor({ idea, close, save }: { idea: Idea; close: () => void; save: (idea: Idea) => void }) {
  return <PlanDialog title="Редактировать идею" close={close}>
    <form onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const title = read(form, 'title');
      if (title) save({ ...idea, title, notes: read(form, 'notes'), status: read(form, 'status') as Idea['status'] });
    }}>
      <Field label="Название"><input name="title" required pattern=".*\S.*" maxLength={300} autoFocus defaultValue={idea.title} /></Field>
      <Field label="Заметки"><textarea name="notes" maxLength={100000} defaultValue={idea.notes} /></Field>
      <Field label="Статус"><select name="status" defaultValue={idea.status}>
        {Object.entries(ideaStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></Field>
      <Submit close={close} />
    </form>
  </PlanDialog>;
}

function IdeaConversion({ idea, date, data, close, update }: Pick<PageProps, 'date' | 'data' | 'update'> & {
  idea: Idea; close: () => void;
}) {
  const [type, setType] = useState<'task' | 'goal'>('task');
  return <PlanDialog title="Запланировать идею" close={close}>
    <form onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const targetDate = read(form, 'date');
      if (!targetDate) return;
      update(draft => {
        const source = draft.ideas.find(item => item.id === idea.id);
        if (!source) return;
        if (type === 'task') draft.tasks.push({ id: id(), title: source.title, date: targetDate, categoryId: read(form, 'category'),
          priority: 'normal', important: false, completedOn: null, stageId: null });
        else draft.goals.push({ id: id(), title: source.title, description: source.notes, start: targetDate, due: null, completedOn: null, notes: '', stages: [] });
        source.status = 'planned';
      });
      close();
    }}>
      <p className="plan-text">{idea.title}</p>
      <Field label="Создать"><select autoFocus value={type} onChange={event => setType(event.target.value as typeof type)}>
        <option value="task">Дневную задачу</option><option value="goal">Большую цель</option>
      </select></Field>
      <Field label={type === 'task' ? 'Дата задачи' : 'Дата начала'}><input name="date" type="date" min="1000-01-01" max="9999-12-31" required defaultValue={date} /></Field>
      {type === 'task' && <Field label="Категория"><select name="category" defaultValue={OTHER_ID} required>
        {data.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select></Field>}
      <Submit close={close} label="Создать" />
    </form>
  </PlanDialog>;
}

export function Ideas({ data, date, update }: PageProps) {
  const [title, setTitle] = useState('');
  const [editor, setEditor] = useState<Idea | null>(null);
  const [conversion, setConversion] = useState<Idea | null>(null);
  const ideas = data.ideas.slice().reverse();
  return <div className="plan-view">
    <header className="plan-heading"><h1>Идеи</h1></header>
    <section className="plan-panel">
      <div className="plan-panel-head"><h2><Lightbulb size={18} /> Новая идея</h2></div>
      <form className="plan-quick" onSubmit={event => {
        event.preventDefault();
        const clean = title.trim();
        if (!clean) return;
        update(draft => { draft.ideas.push({ id: id(), title: clean, notes: '', status: 'new' }); });
        setTitle('');
      }}><input aria-label="Название идеи" placeholder="Запишите мысль…" value={title} maxLength={300} pattern=".*\S.*" required onChange={event => setTitle(event.target.value)} />
        <button className="plan-button main" type="submit"><Plus size={16} /> Добавить</button></form>
    </section>
    <div className="idea-board">{(['new', 'planned', 'realized'] as const).map(status => {
      const group = ideas.filter(idea => idea.status === status);
      return <section className="plan-panel idea-column" key={status} aria-labelledby={`ideas-${status}`}>
        <header className="idea-column-header"><h2 id={`ideas-${status}`}><i data-status={status} />{ideaStatuses[status]}</h2><span className="plan-tag">{group.length}</span></header>
        {group.length ? <ul className="idea-list">{group.map(idea => <li key={idea.id}>
          <h3 className="plan-goal-title">{idea.title}</h3>
          {idea.notes && <p className="plan-text idea-note">{idea.notes}</p>}
          <div className="idea-actions">
            <select aria-label={`Статус идеи: ${idea.title}`} value={idea.status} onChange={event => {
              const status = event.currentTarget.value as Idea['status'];
              update(draft => {
                const item = draft.ideas.find(item => item.id === idea.id);
                if (item) item.status = status;
              });
            }}>{Object.entries(ideaStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <button className="plan-button icon quiet" title="В задачу или цель" aria-label={`В задачу или цель: ${idea.title}`} onClick={() => setConversion(idea)}><ChevronRight size={16} /></button>
            <button className="plan-button icon quiet" title="Редактировать" aria-label={`Редактировать идею: ${idea.title}`} onClick={() => setEditor(idea)}><Pencil size={15} /></button>
            <button className="plan-button icon quiet danger" title="Удалить" aria-label={`Удалить идею: ${idea.title}`} onClick={() => {
              if (window.confirm(`Удалить идею «${idea.title}»?`)) update(draft => { draft.ideas = draft.ideas.filter(item => item.id !== idea.id); });
            }}><Trash2 size={15} /></button>
          </div>
        </li>)}</ul> : <p className="plan-empty">Пока пусто</p>}
      </section>;
    })}</div>
    {editor && <IdeaEditor key={editor.id} idea={editor} close={() => setEditor(null)} save={idea => {
      update(draft => { draft.ideas = draft.ideas.map(item => item.id === idea.id ? idea : item); });
      setEditor(null);
    }} />}
    {conversion && <IdeaConversion key={conversion.id} idea={conversion} date={date} data={data} update={update} close={() => setConversion(null)} />}
  </div>;
}

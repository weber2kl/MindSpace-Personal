import { useMemo, useState, type CSSProperties } from 'react';
import { BarChart3, BookOpen, Box, CalendarRange, Check, ChevronLeft, ChevronRight, Clock3, Cpu, Flame, Sprout, Target } from 'lucide-react';
import { ActivityCalendar } from './ActivityCalendar';
import { activityDates, completionPercent, periodBounds, streak, studyCategoryIds, studyMinutes, summarize, timeGoalProgress, timeTotals } from './analytics';
import { emptyReview, ENGLISH_ID, formatDate, formatMinutes, isDate, shiftDate, shiftMonth, today, type Data, type Review } from './model';
import type { PageProps } from './ui';

type Period = 'week' | 'month';
const monthLabel = (date: string) => formatDate(date, { month: 'long', year: 'numeric' }).replace(/\sг\.$/, '');

function PeriodControl({ period, setPeriod, date, setDate }: {
  period: Period; setPeriod: (period: Period) => void; date: string; setDate: (date: string) => void;
}) {
  const { start, end } = periodBounds(period, date);
  const move = (direction: number) => period === 'week' ? shiftDate(date, direction * 7) : shiftMonth(date, direction);
  const previous = move(-1);
  const next = move(1);
  return (
    <div className="report-controls">
      <div className="segmented" aria-label="Период">
        <button aria-pressed={period === 'week'} onClick={() => setPeriod('week')}>Неделя</button>
        <button aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>Месяц</button>
      </div>
      <div className="period-selector">
        <button className="icon-button" aria-label="Предыдущий период" disabled={!isDate(previous)} onClick={() => setDate(previous)}><ChevronLeft size={17} /></button>
        <span>{period === 'week' ? `${formatDate(start)} — ${formatDate(end, { day: 'numeric', month: 'long', year: 'numeric' })}` : monthLabel(start)}</span>
        <button className="icon-button" aria-label="Следующий период" disabled={!isDate(next)} onClick={() => setDate(next)}><ChevronRight size={17} /></button>
        <button className="button" onClick={() => setDate(today())}>Текущий</button>
      </div>
    </div>
  );
}

const studyIcons = [BookOpen, Cpu, Box] as const;
const studyLabels = ['Английский', 'ИИ', '3D'] as const;

function Metrics({ data, summary }: { data: Data; summary: ReturnType<typeof summarize> }) {
  const late = summary.completed.filter(task => task.originalDate && task.completedOn! > task.originalDate).length;
  const total = summary.completed.length + summary.incomplete.length;
  return (
    <div className="report-metrics">
      <div className="panel metric"><Check /><span>Выполнено задач</span><strong>{summary.completed.length} <small>/ {total}</small></strong><small>{completionPercent(summary.completed.length, total).toLocaleString('ru-RU')}% выполнения</small><small>С опозданием · {late}</small></div>
      <div className="panel metric"><Sprout /><span>Лягушки</span><strong>{summary.frogs.length}</strong><small>Выполнено за период</small></div>
      <section className="panel study-metric" aria-label="Общее время учёбы">
        <div className="study-total"><span><Clock3 size={17} /> Общее время учёбы</span><strong>{formatMinutes(studyMinutes(summary.minutes))}</strong>
          <small>Дней занятий · {summary.studyDays}</small></div>
        <dl className="study-breakdown">
          {studyCategoryIds.map((id, index) => {
            const Icon = studyIcons[index];
            const category = data.categories.find(item => item.id === id);
            return <div key={id}><dt><Icon size={15} style={{ color: category?.color }} /> {category?.name ?? studyLabels[index]}</dt>
              <dd>{formatMinutes(summary.minutes.get(id) ?? 0)}</dd>
              <dd className="muted study-days">Дней занятий · {summary.datesByCategory.get(id)?.size ?? 0}</dd>
            </div>;
          })}
        </dl>
      </section>
    </div>
  );
}

function Categories({ data, summary }: { data: Data; summary: ReturnType<typeof summarize> }) {
  const items = data.categories.map((category) => ({ ...category, minutes: summary.minutes.get(category.id) ?? 0 }))
    .filter((category) => category.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  return (
    <section className="panel report-panel stack">
      <h2><BarChart3 size={17} /> Время по категориям</h2>
      {items.length === 0 && <p className="empty">За этот период пока нет записей времени.</p>}
      {items.map((category) => (
        <div className="category-bar" key={category.id}>
          <div className="report-split"><span><i className="swatch" style={{ background: category.color }} />{category.name}</span><strong>{formatMinutes(category.minutes)}</strong></div>
          <progress className="progress" value={category.minutes} max={items[0].minutes} style={{ '--progress-color': category.color } as CSSProperties} aria-label={category.name} />
        </div>
      ))}
    </section>
  );
}

function EnglishTarget({ data, date, monthMinutes }: { data: Data; date: string; monthMinutes?: number }) {
  const { start, end } = periodBounds('month', date);
  const target = data.timeGoals.find((item) => item.month === start && item.categoryId === ENGLISH_ID);
  const actual = target ? monthMinutes ?? timeTotals(data, start, end).minutes.get(ENGLISH_ID) ?? 0 : 0;
  const progress = target ? timeGoalProgress(actual, target.minutes) : null;
  return (
    <section className="panel report-panel stack">
      <h2><Target size={17} /> Цель по английскому</h2>
      <p className="muted capitalized">{monthLabel(start)}</p>
      {target && progress ? <>
        <div className="report-split"><strong>{formatMinutes(actual)} / {formatMinutes(target.minutes)}</strong><strong>{progress.percent.toLocaleString('ru-RU')}%</strong></div>
        <progress className="progress" value={Math.min(actual, target.minutes)} max={target.minutes} aria-label="Месячная цель английского" />
        <p className="muted">{progress.surplus ? `Сверх цели ${formatMinutes(progress.surplus)}` : progress.remaining ? `Осталось ${formatMinutes(progress.remaining)}` : 'Цель достигнута'}</p>
      </> : <p className="empty">Цель по часам можно задать в плане на месяц.</p>}
    </section>
  );
}

export function Reports({ data, date, setDate, goToDay, updateText }: PageProps) {
  const [period, setPeriod] = useState<Period>('week');
  const { start, end } = periodBounds(period, date);
  const summary = useMemo(() => summarize(data, start, end), [data, start, end]);
  const plans = data.plans.filter((item) => item.period === period && item.date === start);
  const completedPlans = plans.filter((item) => item.completedOn).length;
  const goals = data.goals.filter((goal) => goal.completedOn && goal.completedOn >= start && goal.completedOn <= end);
  const key = `${period}:${start}`;
  const review = data.reviews[key] ?? emptyReview();
  const fields: [keyof Review, string][] = [
    ['achievements', period === 'week' ? 'Достижения' : 'Главные достижения'],
    ['difficulties', period === 'week' ? 'Трудности' : 'Проблемы'],
    ['conclusions', 'Выводы'],
    ['next', period === 'week' ? 'План на следующую неделю' : 'План следующего месяца'],
  ];
  return (
    <div className="screen report-screen stack">
      <header className="screen-heading"><h1>Итоги</h1><p>Результаты и заметки за неделю или месяц</p></header>
      <PeriodControl {...{ period, setPeriod, date, setDate }} />
      <Metrics data={data} summary={summary} />
      <div className="report-grid">
        <Categories data={data} summary={summary} />
        {period === 'month' ? <EnglishTarget data={data} date={date} monthMinutes={summary.english} /> : <section className="panel report-panel stack">
          <h2><CalendarRange size={17} /> Недельный план</h2>
          <div className="report-split"><span>Выполнено</span><strong>{completedPlans} из {plans.length}</strong></div>
          <progress className="progress" value={completedPlans} max={plans.length || 1} aria-label="Прогресс недельного плана" />
        </section>}
      </div>
      {period === 'month' && <div className="report-grid">
        <section className="panel report-panel stack">
          <h2><Target size={17} /> Месячный план</h2>
          <div className="report-split"><span>Выполнено</span><strong>{completedPlans} из {plans.length}</strong></div>
          <progress className="progress" value={completedPlans} max={plans.length || 1} aria-label="Прогресс месячного плана" />
        </section>
        <section className="panel report-panel stack">
          <h2><Check size={17} /> Завершённые большие цели</h2>
          {!goals.length && <p className="empty">За этот месяц завершённых целей нет.</p>}
          {goals.map((goal) => <div className="report-split report-item" key={goal.id}><span>{goal.title}</span><small>{formatDate(goal.completedOn!)}</small></div>)}
        </section>
      </div>}
      <div className="report-grid">
        <section className="panel report-panel stack">
          <h2><Sprout size={17} /> История лягушек</h2>
          {!summary.frogs.length && <p className="empty">Выполненные лягушки появятся здесь.</p>}
          {summary.frogs.map((item) => <button key={`${item.date}:${item.taskId}`} className="report-item report-split" onClick={() => goToDay(item.date)}><span>{item.title}</span><small>{formatDate(item.date)}</small></button>)}
        </section>
        <section className="panel report-panel stack">
          <h2><Check size={17} /> Ежедневные задачи</h2>
          {!summary.completed.length && !summary.incomplete.length && <p className="empty">За этот период задач пока нет.</p>}
          {([['Выполненные', summary.completed], ['Открытые', summary.incomplete]] as const).map(([label, tasks]) => tasks.length > 0 && (
            <details key={label} className="task-details"><summary>{label} · {tasks.length}</summary>
              {tasks.map((task) => <button className="report-item report-split" key={task.id} onClick={() => goToDay(task.date)}><span>{task.title}</span><small>{formatDate(task.completedOn ?? task.date)}</small></button>)}
            </details>
          ))}
        </section>
      </div>
      <section className="panel report-panel stack">
        <h2><BookOpen size={17} /> Личные итоги</h2>
        <div className="report-grid">
          {fields.map(([field, label]) => <label className="field" key={field}>{label}<textarea rows={3} value={review[field]} maxLength={100000}
            onChange={(event) => updateText('reviews', key, field, event.currentTarget.value)} /></label>)}
        </div>
      </section>
    </div>
  );
}

export function Statistics({ data, date, setDate, goToDay }: PageProps) {
  const [period, setPeriod] = useState<Period>('month');
  const { start, end } = periodBounds(period, date);
  const summary = useMemo(() => summarize(data, start, end), [data, start, end]);
  const activity = useMemo(() => activityDates(data), [data]);
  const now = today();
  return (
    <div className="screen report-screen stack">
      <header className="screen-heading"><h1>Статистика</h1><p>Учёт времени и история регулярности</p></header>
      <ActivityCalendar data={data} date={date} goToDay={goToDay} />
      <PeriodControl {...{ period, setPeriod, date, setDate }} />
      <Metrics data={data} summary={summary} />
      <div className="report-grid"><Categories data={data} summary={summary} /><EnglishTarget data={data} date={date} monthMinutes={period === 'month' ? summary.english : undefined} /></div>
      <div className="report-grid">
        {([['Английский', activity.english], ['Дневник', activity.diary]] as const).map(([label, dates]) => {
          const series = streak(dates, now);
          return <section className="panel report-panel stack" key={label}>
            <h2><Flame size={17} /> {label}</h2>
            <div className="streak-metrics"><div><strong>{series.current}</strong><span>Текущая серия, дн.</span></div><div><strong>{series.record}</strong><span>Рекорд, дн.</span></div></div>
          </section>;
        })}
      </div>
    </div>
  );
}

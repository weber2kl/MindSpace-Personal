import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { activityLevel, activityLevels, activityYear } from './activity';
import { formatDate, formatMinutes, shiftDate, today, type Data } from './model';
import './activity.css';

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const movement = new Map([['ArrowLeft', -7], ['ArrowRight', 7], ['ArrowUp', -1], ['ArrowDown', 1]]);
const detailDate = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } as const;
const minYear = 1000;
const maxYear = 9999;

export function ActivityCalendar({ data, date, goToDay }: { data: Data; date: string; goToDay: (date: string) => void }) {
  const { tasks, logs } = data;
  const now = today();
  const currentYear = Number(now.slice(0, 4));
  const [year, setYear] = useState(() => Number(date.slice(0, 4)));
  const [category, setCategory] = useState('');
  const [focus, setFocus] = useState<string>();
  const [hover, setHover] = useState<{ date: string; x: number; y: number; above: boolean }>();
  const yearData = useMemo(() => activityYear({ tasks, logs }, year, category), [tasks, logs, year, category]);
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const log of logs) years.add(Number(log.date.slice(0, 4)));
    for (const task of tasks) if (task.completedOn) years.add(Number(task.completedOn.slice(0, 4)));
    return [...years];
  }, [logs, tasks]);
  const years = [...new Set([...availableYears, currentYear, year])].sort((a, b) => b - a);
  const first = yearData.days[0].date;
  const last = yearData.days[yearData.days.length - 1].date;
  const tabDate = focus && focus >= first && focus <= last ? focus : year === currentYear ? now : first;
  const dayButtons = useRef(new Map<string, HTMLButtonElement>());
  const categoryName = data.categories.find((item) => item.id === category)?.name ?? 'Вся активность';
  const hovered = hover && yearData.days.find((day) => day.date === hover.date);

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, from: string, weekday: number) {
    const step = movement.get(event.key);
    if (step === undefined && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    if ((step === -1 && weekday === 0) || (step === 1 && weekday === 6)) return;
    const target = event.key === 'Home' ? first : event.key === 'End' ? last : shiftDate(from, step ?? 0);
    dayButtons.current.get(target)?.focus();
  }

  function showDetails(button: HTMLButtonElement, day: string) {
    const rect = button.getBoundingClientRect();
    const above = rect.top > 120;
    setHover({ date: day, x: rect.left + rect.width / 2, y: above ? rect.top : rect.bottom, above });
  }

  return <section className="panel activity-panel" aria-labelledby="activity-heading">
    <div className="activity-heading">
      <h2 id="activity-heading"><CalendarDays size={17} /> Календарь активности</h2>
      <div className="activity-controls">
        <select aria-label="Категория активности" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">Вся активность</option>
          {data.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <div className="activity-year">
          <button type="button" className="icon-button" disabled={year <= minYear} aria-label="Предыдущий год" onClick={() => setYear(year - 1)}><ChevronLeft size={16} /></button>
          <select aria-label="Год активности" value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {years.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <button type="button" className="icon-button" disabled={year >= maxYear} aria-label="Следующий год" onClick={() => setYear(year + 1)}><ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
    <div className="activity-scroll" onScroll={() => setHover(undefined)}>
      <div className="activity-grid" role="group" aria-label={`Активность за ${year} год`} style={{ gridTemplateColumns: `24px repeat(${yearData.weeks}, var(--activity-size))` }}>
        {weekdays.map((weekday, index) => <span aria-hidden="true" className="activity-weekday" key={weekday} style={{ gridColumn: 1, gridRow: index + 2 }}>{weekday}</span>)}
        {yearData.days.filter((day) => day.date.endsWith('-01')).map((day) => (
          <span aria-hidden="true" className="activity-month" key={day.date} style={{ gridColumn: day.week + 2, gridRow: 1 }}>{formatDate(day.date, { month: 'short' }).replace(/\.$/, '')}</span>
        ))}
        {yearData.days.map((day) => <button
          type="button"
          key={day.date}
          ref={(element) => { if (element) dayButtons.current.set(day.date, element); else dayButtons.current.delete(day.date); }}
          className="activity-cell"
          data-level={activityLevel(day.minutes)}
          data-date={day.date}
          aria-current={day.date === now ? 'date' : undefined}
          aria-label={`${formatDate(day.date, detailDate)}. ${categoryName}. ${formatMinutes(day.minutes)}. Выполнено задач ${day.completed}. Открыть день.`}
          style={{ gridColumn: day.week + 2, gridRow: day.weekday + 2 }}
          tabIndex={day.date === tabDate ? 0 : -1}
          onPointerEnter={(event) => showDetails(event.currentTarget, day.date)}
          onPointerLeave={() => setHover(undefined)}
          onFocus={(event) => { setFocus(day.date); showDetails(event.currentTarget, day.date); }}
          onBlur={() => setHover(undefined)}
          onKeyDown={(event) => moveFocus(event, day.date, day.weekday)}
          onClick={() => goToDay(day.date)}
        />)}
      </div>
    </div>
    <div className="activity-legend" aria-label="Уровни активности по записанным минутам">
      <span>Меньше</span>
      {activityLevels.map(({ label }, level) => <span className="activity-key" key={label}><i data-level={level} />{label}</span>)}
      <span>Больше</span>
    </div>
    <dl className="activity-summary">
      <div><dt>Всего за год</dt><dd>{formatMinutes(yearData.minutes)}</dd></div>
      <div><dt>Активных дней</dt><dd>{yearData.activeDays}</dd></div>
      <div><dt>Самый продуктивный день</dt><dd>{yearData.best ? `${formatDate(yearData.best.date)} · ${formatMinutes(yearData.best.minutes)}` : '—'}</dd></div>
      <div><dt>Самая длинная серия</dt><dd>{yearData.longest} дн.</dd></div>
    </dl>
    {hover && hovered && <div aria-hidden="true" className={`activity-tooltip${hover.above ? ' above' : ''}`} style={{ left: `clamp(10px, ${hover.x - 102}px, calc(100vw - 214px))`, top: hover.y }}>
      <strong>{formatDate(hovered.date, detailDate)}</strong>
      <span>{categoryName}</span>
      <span>{formatMinutes(hovered.minutes)} · задач выполнено {hovered.completed}</span>
    </div>}
  </section>;
}

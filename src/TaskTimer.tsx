import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Square, Timer as TimerIcon } from 'lucide-react';
import { formatDate, isDate, today } from './model';
import { elapsedMs, finishTimer, maxTimerMinutesPerDay, pauseTimer, resumeTimer, suggestedMinutes, type Timer, type TimerMinutes } from './timer';
import type { PageProps } from './ui';

function formatElapsed(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, '0')).join(':');
}

function TimerResult({ timer, close, save }: { timer: Timer; close: () => void; save: (rows: TimerMinutes[]) => void }) {
  const [{ rows, error }, setReview] = useState((): { rows: TimerMinutes[]; error: string | null } => {
    try {
      return { rows: suggestedMinutes(timer), error: null };
    } catch (error) {
      return { rows: [{ date: today(), minutes: 0 }], error: error instanceof RangeError
        ? error.message : 'Не удалось распределить время по дням.' };
    }
  });
  const dialog = useRef<HTMLDialogElement>(null);
  const minutes = rows.reduce((sum, row) => sum + row.minutes, 0);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="panel restore-dialog" aria-label="Результат таймера" onClose={close}>
    <h2>Сохранить время</h2>
    <form onSubmit={(event) => { event.preventDefault(); if (rows.every(row => isDate(row.date))) save(rows); }}>
      {error ? <>
        <p role="alert">{error} Чтобы завершить сессию, укажите дату и минуты вручную.</p>
        <label className="field">Дата работы
          <input type="date" min="1000-01-01" max="9999-12-31" required value={rows[0].date} onChange={(event) => {
            const date = event.currentTarget.value;
            setReview(current => ({ ...current, rows: [{ ...current.rows[0], date }] }));
          }} />
        </label>
      </> : <p>{rows.length ? 'Проверьте минуты по датам работы. Ноль исключает дату из записи.' : 'В этой сессии пока нет времени.'}</p>}
      <div className="timer-result-list">
        {rows.map((row, index) => <label className="timer-result-row" key={error ? 'manual' : row.date}>
          <span>{error ? 'Минуты' : formatDate(row.date, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <input type="number" min={0} max={maxTimerMinutesPerDay} step={1} required value={row.minutes} onChange={(event) => {
            const value = Number(event.currentTarget.value);
            setReview(current => ({ ...current, rows: current.rows.map((item, position) => position === index ? { ...item, minutes: value } : item) }));
          }} />
        </label>)}
      </div>
      <div className="row timer-result-actions">
        <button className="button" type="button" autoFocus onClick={() => dialog.current?.close()}>Назад</button>
        <button className="button danger" type="button" onClick={() => {
          if (window.confirm('Отменить эту сессию таймера? Ранее записанное время сохранится.')) save([]);
        }}>Отменить сессию</button>
        <button className="button primary" type="submit" disabled={minutes <= 0}>Сохранить минуты</button>
      </div>
    </form>
  </dialog>;
}

export function TaskTimer({ data, update, goToDay }: Pick<PageProps, 'data' | 'update' | 'goToDay'>) {
  const timer = data.timer;
  const running = Boolean(timer?.running);
  const [now, setNow] = useState(Date.now);
  const [review, setReview] = useState<string | null>(null);
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [running]);
  if (!timer) return null;
  const task = data.tasks.find((item) => item.id === timer.taskId);
  if (!task) return null;
  return <section className="timer-strip" aria-label="Таймер задачи">
    <TimerIcon size={18} />
    <button className="timer-task" title={task.title} onClick={() => goToDay(task.date)}>{task.title}</button>
    <span className="timer-elapsed" aria-label="Прошло времени">{formatElapsed(elapsedMs(timer, now))}</span>
    <span className="timer-state">{running ? 'Идёт' : 'Пауза'}</span>
    <button className="button" id="timer-toggle" onClick={() => update((draft) => {
      if (running) pauseTimer(draft, timer.id);
      else resumeTimer(draft, timer.id);
    })}>{running ? <Pause size={15} /> : <Play size={15} />}{running ? 'Пауза' : 'Продолжить'}</button>
    <button className="button" onClick={() => {
      update((draft) => pauseTimer(draft, timer.id));
      setReview(timer.id);
    }}><Square size={14} /> Завершить</button>
    {review === timer.id && !running && <TimerResult key={timer.id} timer={timer} close={() => setReview(null)} save={(rows) => {
      update((draft) => finishTimer(draft, timer.id, rows));
      setReview(null);
    }} />}
  </section>;
}

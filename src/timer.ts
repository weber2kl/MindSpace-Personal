import type { z } from 'zod';
import type { timerSchema } from '../common/schema.mjs';
import { id, isDate, type Data, type TimeLog } from './model.ts';

export type Timer = z.infer<typeof timerSchema>;
type Segment = Timer['segments'][number];
export interface TimerMinutes { date: string; minutes: number }
const minute = 60_000;
export const maxTimerMinutesPerDay = 1500;
const maxReviewDays = 366;
const maxReviewSlices = 5000;
const sliceMs = 12 * 60 * minute;

const currentZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function startTimer(data: Data, taskId: string, now = Date.now(), zone = currentZone()) {
  if (data.timer) throw new Error('Сначала завершите текущий таймер.');
  const task = data.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error('Задача для таймера отсутствует.');
  data.timer = { id: id(), taskId, categoryId: task.categoryId, segments: [], running: { from: now, zone } };
}

function segmentEnding(timer: Timer, now: number): Segment | undefined {
  return timer.running && now > timer.running.from ? { ...timer.running, to: now } : undefined;
}

export function pauseTimer(data: Data, timerId: string, now = Date.now()) {
  if (data.timer?.id !== timerId || !data.timer.running) return;
  const segment = segmentEnding(data.timer, now);
  if (segment) data.timer.segments.push(segment);
  data.timer.running = null;
}

export function resumeTimer(data: Data, timerId: string, now = Date.now(), zone = currentZone()) {
  if (data.timer?.id !== timerId || data.timer.running) return;
  const last = data.timer.segments.at(-1)?.to ?? now;
  data.timer.running = { from: Math.max(now, last), zone };
}

export function elapsedMs(timer: Timer, now = Date.now()) {
  return timer.segments.reduce((sum, item) => sum + item.to - item.from, 0)
    + (timer.running ? Math.max(0, now - timer.running.from) : 0);
}

function timeByDate(timer: Timer, now: number) {
  const totals = new Map<string, number>();
  const current = segmentEnding(timer, now);
  const calendars = new Map<string, Intl.DateTimeFormat>();
  let slices = 0;
  for (const segment of current ? [...timer.segments, current] : timer.segments) {
    let calendar = calendars.get(segment.zone);
    if (!calendar) {
      calendar = new Intl.DateTimeFormat('en-CA', {
        timeZone: segment.zone, year: 'numeric', month: '2-digit', day: '2-digit', timeZoneName: 'longOffset',
      });
      calendars.set(segment.zone, calendar);
    }
    const calendarAt = (timestamp: number) => {
      const parts = calendar.formatToParts(timestamp);
      const date = ['year', 'month', 'day'].map(unit => parts.find(part => part.type === unit)!.value).join('-');
      return { date, offset: parts.find(part => part.type === 'timeZoneName')!.value };
    };
    let cursor = segment.from;
    while (cursor < segment.to) {
      const { date, offset } = calendarAt(cursor);
      if (!isDate(date)) throw new RangeError('В сессии есть дата вне диапазона дневника.');
      if (++slices > maxReviewSlices || (!totals.has(date) && totals.size >= maxReviewDays)) {
        throw new RangeError('Сессия слишком длинная для автоматического распределения по дням.');
      }
      const sameDateAndOffset = (timestamp: number) => {
        const next = calendarAt(timestamp);
        return next.date === date && next.offset === offset;
      };
      // Split at both midnight and an offset change. A clock rollback shortly after
      // midnight can return to the preceding date, so date alone is insufficient.
      let last = Math.min(segment.to, cursor + sliceMs);
      if (!sameDateAndOffset(last - 1)) {
        let first = cursor + 1;
        while (first < last) {
          const middle = Math.floor((first + last) / 2);
          if (sameDateAndOffset(middle)) first = middle + 1;
          else last = middle;
        }
      }
      totals.set(date, (totals.get(date) ?? 0) + last - cursor);
      cursor = last;
    }
  }
  return totals;
}

export function suggestedMinutes(timer: Timer, now = Date.now()): TimerMinutes[] {
  const totals = timeByDate(timer, now);
  const rows = [...totals].map(([date, ms]) => ({ date, minutes: Math.floor(ms / minute), remainder: ms % minute }));
  rows.sort((a, b) => b.remainder - a.remainder || a.date.localeCompare(b.date));
  const remaining = Math.round(rows.reduce((sum, row) => sum + row.remainder, 0) / minute);
  for (const row of rows.slice(0, remaining)) row.minutes++;
  return rows.sort((a, b) => a.date.localeCompare(b.date)).map(({ date, minutes }) => ({ date, minutes }));
}

export function finishTimer(data: Data, timerId: string, rows: TimerMinutes[]) {
  const timer = data.timer;
  if (timer?.id !== timerId) return;
  const dates = new Set(rows.map((row) => row.date));
  if (timer.running || dates.size !== rows.length || rows.some(({ date, minutes }) =>
    !isDate(date) || !Number.isInteger(minutes) || minutes < 0 || minutes > maxTimerMinutesPerDay)) {
    throw new Error('Проверьте даты и количество минут таймера.');
  }
  const logs: TimeLog[] = rows.flatMap(({ date, minutes }) => {
    if (minutes === 0) return [];
    const entry = { id: `${timer.id}:${date}`, taskId: timer.taskId, categoryId: timer.categoryId, date };
    if (minutes <= 1440) return [{ ...entry, minutes }];
    return [{ ...entry, minutes: 1440 }, { ...entry, id: `${entry.id}:2`, minutes: minutes - 1440 }];
  });
  const existing = new Set(data.logs.map((log) => log.id));
  if (logs.some((log) => existing.has(log.id))) throw new Error('Эта сессия уже есть в записях времени.');
  data.logs.push(...logs);
  delete data.timer;
}

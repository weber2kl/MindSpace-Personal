import { shiftDate, weekStart, type Data } from './model.ts';

export const activityLevels = [
  { minimum: 0, label: '0 мин' },
  { minimum: 1, label: '1–29 мин' },
  { minimum: 30, label: '30–59 мин' },
  { minimum: 60, label: '60–119 мин' },
  { minimum: 120, label: '120+ мин' },
] as const;

export function activityLevel(minutes: number) {
  for (let level = activityLevels.length - 1; level > 0; level--) {
    if (minutes >= activityLevels[level].minimum) return level;
  }
  return 0;
}

interface ActivityDay {
  date: string;
  week: number;
  weekday: number;
  minutes: number;
  completed: number;
}

export function activityYear(data: Pick<Data, 'logs' | 'tasks'>, year: number, categoryId: string) {
  const first = `${year}-01-01`;
  const last = `${year}-12-31`;
  const monday = weekStart(first);
  const days: ActivityDay[] = [];
  const lookup = new Map<string, ActivityDay>();
  let leading = 0;
  for (let date = monday; date !== first; date = shiftDate(date, 1)) leading++;
  for (let date = first, index = leading; ; date = shiftDate(date, 1), index++) {
    const day = { date, week: Math.floor(index / 7), weekday: index % 7, minutes: 0, completed: 0 };
    days.push(day);
    lookup.set(date, day);
    if (date === last) break;
  }
  for (const log of data.logs) {
    if (categoryId && categoryId !== log.categoryId) continue;
    const day = lookup.get(log.date);
    if (day) day.minutes += log.minutes;
  }
  for (const task of data.tasks) {
    if (!task.completedOn || (categoryId && categoryId !== task.categoryId)) continue;
    const day = lookup.get(task.completedOn);
    if (day) day.completed++;
  }

  let minutes = 0;
  let activeDays = 0;
  let longest = 0;
  let run = 0;
  let best: ActivityDay | undefined;
  for (const day of days) {
    minutes += day.minutes;
    if (day.minutes > 0) {
      activeDays++;
      longest = Math.max(longest, ++run);
      if (!best || day.minutes > best.minutes) best = day;
    } else run = 0;
  }
  return { days, weeks: (days.at(-1)?.week ?? 0) + 1, minutes, activeDays, best, longest };
}

import { ENGLISH_ID, monthEnd, monthStart, shiftDate, today, weekStart, type Data, type Task } from './model.ts';

export function periodBounds(period: 'week' | 'month', date: string) {
  if (period === 'week') {
    const start = weekStart(date);
    const sunday = shiftDate(start, 6);
    return { start, end: sunday.startsWith('+') ? '9999-12-31' : sunday };
  }
  return { start: monthStart(date), end: monthEnd(date) };
}

export function frogHistory(data: Data, start: string, end: string) {
  const days = Object.entries(data.days).filter(([date]) => date >= start && date <= end);
  const activeIds = new Set(days.flatMap(([, entry]) => entry.frogId ? [entry.frogId] : []));
  const tasks = new Map<string, Task>();
  if (activeIds.size) {
    for (const task of data.tasks) if (activeIds.has(task.id)) tasks.set(task.id, task);
  }
  return days
    .flatMap(([date, entry]) => {
      const active = entry.frogId ? tasks.get(entry.frogId) : undefined;
      const records = entry.frogHistory.map((item) => ({ ...item, date }));
      if (active?.completedOn) records.push({ taskId: active.id, title: active.title, date });
      return records;
    })
    .sort((first, second) => second.date.localeCompare(first.date));
}

export function activityDates(data: Data) {
  const english = new Set<string>();
  const diary = new Set<string>();
  for (const [date, entry] of Object.entries(data.days)) {
    if (entry.english) english.add(date);
    if (entry.diary || [entry.journal, entry.worked, entry.blocked, entry.improve].some((text) => text.trim())) diary.add(date);
  }
  for (const log of data.logs) {
    if (log.categoryId === ENGLISH_ID && log.minutes > 0) english.add(log.date);
  }
  return { english, diary };
}

export function streak(dates: Set<string>, currentDate = today()) {
  const history = [...dates].filter((date) => date <= currentDate).sort();
  let previous = '';
  let consecutive = 0;
  let record = 0;
  for (const date of history) {
    consecutive = previous && shiftDate(previous, 1) === date ? consecutive + 1 : 1;
    record = Math.max(record, consecutive);
    previous = date;
  }
  const active = previous === currentDate || previous === shiftDate(currentDate, -1);
  return { current: active ? consecutive : 0, record };
}

export function timeTotals(data: Data, start: string, end: string) {
  const minutes = new Map<string, number>();
  const datesByCategory = new Map<string, Set<string>>();
  let total = 0;
  for (const log of data.logs) {
    if (log.date < start || log.date > end) continue;
    total += log.minutes;
    minutes.set(log.categoryId, (minutes.get(log.categoryId) ?? 0) + log.minutes);
    if (log.minutes > 0) {
      let dates = datesByCategory.get(log.categoryId);
      if (!dates) datesByCategory.set(log.categoryId, dates = new Set());
      dates.add(log.date);
    }
  }
  return { minutes, total, datesByCategory };
}

export const studyCategoryIds = [ENGLISH_ID, 'ai', '3d'] as const;

export function studyMinutes(minutes: ReadonlyMap<string, number>) {
  return studyCategoryIds.reduce((total, id) => total + (minutes.get(id) ?? 0), 0);
}

export function monthlyTaskCounts(data: Data, date: string) {
  const { start, end } = periodBounds('month', date);
  const counts = new Map<string, number>();
  for (const task of data.tasks) {
    if (!task.completedOn || task.completedOn < start || task.completedOn > end) continue;
    counts.set(task.categoryId, (counts.get(task.categoryId) ?? 0) + 1);
  }
  return counts;
}

export function summarize(data: Data, start: string, end: string) {
  const inPeriod = (date: string) => date >= start && date <= end;
  const { minutes, total, datesByCategory } = timeTotals(data, start, end);
  const englishDates = datesByCategory.get(ENGLISH_ID) ?? new Set<string>();
  for (const [date, day] of Object.entries(data.days)) {
    if (day.english && inPeriod(date)) englishDates.add(date);
  }
  const completed = data.tasks.filter((task) => task.completedOn && inPeriod(task.completedOn));
  const incomplete = data.tasks.filter((task) => !task.completedOn && inPeriod(task.date));
  const frogs = frogHistory(data, start, end);
  datesByCategory.set(ENGLISH_ID, englishDates);
  const studyDays = new Set(studyCategoryIds.flatMap(id => [...(datesByCategory.get(id) ?? [])])).size;
  return { minutes, total, datesByCategory, studyDays, englishDays: englishDates.size, completed, incomplete, frogs, english: minutes.get(ENGLISH_ID) ?? 0 };
}

export function completionPercent(done: number, total: number) {
  return total > 0 ? Math.floor(done * 1000 / total) / 10 : 0;
}

export function timeGoalProgress(actual: number, target: number) {
  return { percent: completionPercent(actual, target), remaining: Math.max(0, target - actual), surplus: Math.max(0, actual - target) };
}

export function stageProgress(data: Data) {
  const progress = new Map<string, { done: boolean; linked: number; linkedDone: boolean }>();
  for (const goal of data.goals) {
    for (const stage of goal.stages) progress.set(stage.id, { done: stage.done, linked: 0, linkedDone: false });
  }
  for (const items of [data.tasks, data.plans]) {
    for (const item of items) {
      const entry = item.stageId ? progress.get(item.stageId) : undefined;
      if (!entry) continue;
      entry.linked++;
      if (item.completedOn) {
        entry.done = true;
        entry.linkedDone = true;
      }
    }
  }
  return progress;
}

export function monthTimeByWeek(data: Data, month: string) {
  const end = monthEnd(month);
  const weeks = [];
  const categoryMinutesByDate = new Map<string, Map<string, number>>();
  for (let monday = weekStart(month); monday <= end; monday = shiftDate(monday, 7)) {
    const sunday = shiftDate(monday, 6);
    const lastWeek = sunday >= end || sunday.startsWith('+');
    const week = { start: monday < month ? month : monday, end: lastWeek ? end : sunday, minutes: new Map<string, number>() };
    weeks.push(week);
    for (let day = week.start; ; day = shiftDate(day, 1)) {
      categoryMinutesByDate.set(day, week.minutes);
      if (day === week.end) break;
    }
    if (lastWeek) break;
  }
  for (const log of data.logs) {
    const totals = categoryMinutesByDate.get(log.date);
    if (totals) totals.set(log.categoryId, (totals.get(log.categoryId) ?? 0) + log.minutes);
  }
  return weeks;
}

import type { z } from 'zod';
import {
  categorySchema, taskSchema, logSchema, daySchema, planSchema, timeGoalSchema, taskGoalSchema, goalSchema, stageSchema,
  ideaSchema, reviewSchema, dataSchema, advancedSessionSchema, ENGLISH_ID,
  learningLinkSchema, learningStatusSchema, learningTopicSchema, learningVerbSchema, practiceAttemptSchema, practiceSessionSchema,
} from '../common/schema.mjs';

export { emptyData, parseData, isDate, ENGLISH_ID, OTHER_ID } from '../common/schema.mjs';
export type Category = z.infer<typeof categorySchema>;
export type Task = z.infer<typeof taskSchema>;
export type TimeLog = z.infer<typeof logSchema>;
export type DayEntry = z.infer<typeof daySchema>;
export type PlanItem = z.infer<typeof planSchema>;
export type TimeGoal = z.infer<typeof timeGoalSchema>;
export type TaskGoal = z.infer<typeof taskGoalSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type Idea = z.infer<typeof ideaSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Data = z.infer<typeof dataSchema>;
export type LearningLink = z.infer<typeof learningLinkSchema>;
export type LearningStatus = z.infer<typeof learningStatusSchema>;
export type LearningTopic = z.infer<typeof learningTopicSchema>;
export type LearningVerb = z.infer<typeof learningVerbSchema>;
export type PracticeAttempt = z.infer<typeof practiceAttemptSchema>;
export type PracticeSession = z.infer<typeof practiceSessionSchema>;
export type AdvancedSession = z.infer<typeof advancedSessionSchema>;

export const id = () => crypto.randomUUID();

export function today(now = new Date()) {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function calendarDate(date: string) {
  return new Date(`${date}T12:00:00Z`);
}

function dateKey(date: Date) {
  return date.toISOString().split('T')[0];
}

export function shiftDate(date: string, days: number) {
  const value = calendarDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return dateKey(value);
}

export function weekStart(date: string) {
  return shiftDate(date, -((calendarDate(date).getUTCDay() + 6) % 7));
}

export function monthStart(date: string) {
  return `${date.slice(0, -2)}01`;
}

export function shiftMonth(date: string, months: number) {
  const start = calendarDate(monthStart(date));
  start.setUTCMonth(start.getUTCMonth() + months);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  start.setUTCDate(Math.min(Number(date.slice(-2)), end.getUTCDate()));
  return dateKey(start);
}

export function monthEnd(date: string) {
  const end = calendarDate(monthStart(date));
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return dateKey(end);
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();

export function formatDate(date: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) {
  const key = JSON.stringify(options);
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat('ru-RU', { ...options, timeZone: 'UTC' });
    if (dateFormats.size >= 32) dateFormats.clear();
    dateFormats.set(key, format);
  }
  return format.format(calendarDate(date));
}

export function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} ч` : '', rest || !hours ? `${rest} мин` : ''].filter(Boolean).join(' ');
}

export const emptyDay = (): DayEntry => ({
  notes: '', journal: '', worked: '', blocked: '', improve: '', english: false, diary: false, frogId: null, frogHistory: [],
});

export const emptyReview = (): Review => ({ achievements: '', difficulties: '', conclusions: '', next: '' });

export function isFrogCandidate(task: Task, date: string) {
  return task.date === date && (task.completedOn === null || task.completedOn === date);
}

export function toggleTaskCompletion(data: Data, taskId: string) {
  const task = data.tasks.find((item) => item.id === taskId);
  if (!task) return;
  if (task.completedOn) {
    const entry = data.days[task.completedOn];
    if (entry) entry.frogHistory = entry.frogHistory.filter((frog) => frog.taskId !== task.id);
  }
  task.completedOn = task.completedOn ? null : task.date;
}

export function isLateCompletion(task: Task) {
  return !!task.completedOn && !!task.originalDate && task.completedOn > task.originalDate;
}

export function dayTaskGroup(task: Task) {
  if (task.important) return 'important';
  return task.categoryId === ENGLISH_ID ? 'english' : 'other';
}

export function reorderDayTasks(data: Data, visibleIds: string[], sourceId: string, targetId: string, after: boolean) {
  if (sourceId === targetId) return;
  const source = data.tasks.find(task => task.id === sourceId);
  if (!source) return;
  const visible = new Set(visibleIds);
  const slots: number[] = [];
  const ordered = data.tasks.filter((task, index) => {
    if (!visible.has(task.id) || task.date !== source.date || dayTaskGroup(task) !== dayTaskGroup(source)) return false;
    slots.push(index);
    return true;
  });
  const from = ordered.findIndex(task => task.id === sourceId);
  if (from === -1 || !ordered.some(task => task.id === targetId)) return;
  ordered.splice(from, 1);
  const to = ordered.findIndex(task => task.id === targetId) + Number(after);
  ordered.splice(to, 0, source);
  slots.forEach((slot, index) => { data.tasks[slot] = ordered[index]; });
}

export function rescheduleTask(data: Data, task: Task, date: string, preserveDeadline = false) {
  if (task.date === date) return;
  if (!task.completedOn && date > task.date && (preserveDeadline || task.date < today())) task.originalDate ??= task.date;
  if (data.days[task.date]?.frogId === task.id) setFrog(data, task.date, null);
  task.important = task.important && data.tasks.filter(item => item.date === date && item.important).length < 3;
  task.date = date;
}

export function setFrog(data: Data, date: string, taskId: string | null) {
  const entry = data.days[date] ??= emptyDay();
  if (entry.frogId === taskId) return;
  if (taskId && !data.tasks.some((task) => task.id === taskId && isFrogCandidate(task, date))) {
    throw new Error('Выберите открытую задачу или задачу, выполненную в этот день.');
  }
  const previous = data.tasks.find((task) => task.id === entry.frogId);
  if (previous?.completedOn) entry.frogHistory.push({ taskId: previous.id, title: previous.title });
  entry.frogHistory = entry.frogHistory.filter((item) => item.taskId !== taskId);
  entry.frogId = taskId;
}

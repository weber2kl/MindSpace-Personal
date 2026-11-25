import { z } from 'zod';
import { seedLearning } from './curriculum.mjs';

const identifier = z.string().min(1).max(128);
const title = z.string().trim().min(1).max(300);
const text = z.string().max(100_000);
const date = z.string().refine(isDate, 'Некорректная календарная дата');
const month = date.refine((value) => value.endsWith('-01'), 'Нужен первый день месяца');
const monday = z.string().refine(isMonday, 'Нужен понедельник');
const minutes = z.number().int().positive();

export function isDate(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isMonday(value) {
  return (isDate(value) || value === '0999-12-30') && new Date(`${value}T12:00:00Z`).getUTCDay() === 1;
}

export const categorySchema = z.object({ id: identifier, name: title, color: z.string().regex(/^#[\da-f]{6}$/i) }).strict();
export const learningLinkSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('topic'), id: identifier }).strict(),
  z.object({ kind: z.literal('practice'), sessionId: identifier.nullable() }).strict(),
]);
export const taskSchema = z.object({
  id: identifier, title, date, categoryId: identifier, priority: z.enum(['high', 'normal', 'low']),
  important: z.boolean(), completedOn: date.nullable(), stageId: identifier.nullable(), learning: learningLinkSchema.optional(),
  originalDate: date.optional(),
}).strict();
export const logSchema = z.object({
  id: identifier, taskId: identifier, date, categoryId: identifier, minutes: minutes.max(1440),
}).strict();
export const daySchema = z.object({
  notes: text, journal: text, worked: text, blocked: text, improve: text, english: z.boolean(), diary: z.boolean(),
  frogId: identifier.nullable(), frogHistory: z.array(z.object({ taskId: identifier, title }).strict()).default([]),
}).strict();
const planFields = { id: identifier, title, completedOn: date.nullable(), stageId: identifier.nullable() };
export const planSchema = z.discriminatedUnion('period', [
  z.object({ ...planFields, period: z.literal('week'), date: monday, monthGoalId: identifier.nullable(), goalId: z.null() }).strict(),
  z.object({ ...planFields, period: z.literal('month'), date: month, monthGoalId: z.null(), goalId: identifier.nullable() }).strict(),
]);
export const timeGoalSchema = z.object({ id: identifier, month, categoryId: identifier, minutes: minutes.max(31 * 24 * 60) }).strict();
export const taskGoalSchema = z.object({ month, categoryId: identifier, target: z.number().int().min(1).max(9999) }).strict();
export const stageSchema = z.object({ id: identifier, title, done: z.boolean() }).strict();
export const goalSchema = z.object({
  id: identifier, title, description: text, start: date, due: date.nullable(), completedOn: date.nullable(), notes: text,
  stages: z.array(stageSchema),
}).strict();
export const ideaSchema = z.object({ id: identifier, title, notes: text, status: z.enum(['new', 'planned', 'realized']) }).strict();
export const reviewSchema = z.object({ achievements: text, difficulties: text, conclusions: text, next: text }).strict();

export const learningStatusSchema = z.enum(['new', 'studying', 'review', 'mastered']);
export const learningTopicSchema = z.object({
  id: identifier, number: z.number().int().min(1).max(9999), en: title, ru: title,
  page: z.number().int().min(1).max(99999), status: learningStatusSchema, practiced: z.boolean(),
  studiedOn: date.nullable(), reviewedOn: date.nullable(), notes: text,
  rating: z.number().int().min(1).max(5).nullable(), examples: z.array(title),
}).strict();
export const learningVerbSchema = z.object({
  id: identifier, group: z.number().int().min(1).max(9999), v1: title, v2: title, v3: title, ru: title,
  status: learningStatusSchema, hard: z.boolean(), reviewedOn: date.nullable(), successOn: date.nullable(),
}).strict();
export const practiceAttemptSchema = z.object({
  verbId: identifier, v1: title, v2: title, v3: title, ru: title,
  answer2: z.string().max(300), answer3: z.string().max(300), correct2: z.boolean(), correct3: z.boolean(),
}).strict();
export const practiceSessionSchema = z.object({ id: identifier, date, attempts: z.array(practiceAttemptSchema).min(1) }).strict();
export const theorySessionSchema = z.object({
  id: identifier, topicId: identifier, materialVersion: z.number().int().positive(), date,
  attempts: z.array(z.object({ exerciseId: identifier, answer: z.string().max(2000), correct: z.boolean().nullable() }).strict()).min(1),
}).strict();
export const advancedSessionSchema = z.object({
  id: identifier, setId: identifier, date, elapsedSeconds: z.number().int().nonnegative(), timed: z.boolean(),
  attempts: z.array(z.object({ questionId: identifier, answer: z.string().max(12000), correct: z.boolean().nullable() }).strict()).min(1),
}).strict();
const learningSchema = z.object({
  topics: z.array(learningTopicSchema), verbs: z.array(learningVerbSchema), sessions: z.array(practiceSessionSchema),
  theorySessions: z.array(theorySessionSchema).default([]),
  advancedSessions: z.array(advancedSessionSchema).optional(),
}).strict();

const timestamp = z.number().int().min(Date.UTC(1000, 0, 1)).max(Date.UTC(9999, 11, 30));
const timeZone = z.string().max(128).refine((value) => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
  catch { return false; }
}, 'Некорректный часовой пояс');
const timerStart = { from: timestamp, zone: timeZone };
export const timerSchema = z.object({
  id: z.uuid(), taskId: identifier, categoryId: identifier,
  segments: z.array(z.object({ ...timerStart, to: timestamp }).strict().refine((item) => item.to > item.from)),
  running: z.object(timerStart).strict().nullable(),
}).strict();

export const ENGLISH_ID = 'english';
export const OTHER_ID = 'other';
export const dataSchema = z.object({
  version: z.literal(1), categories: z.array(categorySchema), tasks: z.array(taskSchema), logs: z.array(logSchema),
  days: z.record(date, daySchema), plans: z.array(planSchema), timeGoals: z.array(timeGoalSchema), goals: z.array(goalSchema),
  ideas: z.array(ideaSchema), reviews: z.record(z.string().refine(validReviewKey, 'Некорректный период итогов'), reviewSchema),
  timer: timerSchema.optional(), learning: learningSchema.prefault(seedLearning), taskGoals: z.array(taskGoalSchema).optional(),
}).strict().superRefine((data, context) => {
  const addError = (path, message) => context.addIssue({ code: 'custom', path, message });
  const distinct = (items, key, path) => {
    const seen = new Set();
    for (const item of items) {
      const value = key(item);
      if (seen.has(value)) addError(path, 'Повторяющийся идентификатор или запись');
      seen.add(value);
    }
    return seen;
  };
  for (const key of ['categories', 'tasks', 'logs', 'plans', 'timeGoals', 'goals', 'ideas']) {
    distinct(data[key], (item) => item.id, [key]);
  }
  distinct(data.timeGoals, (item) => `${item.month}:${item.categoryId}`, ['timeGoals']);
  distinct(data.taskGoals ?? [], (item) => `${item.month}:${item.categoryId}`, ['taskGoals']);
  const stages = distinct(data.goals.flatMap((goal) => goal.stages), (item) => item.id, ['goals']);
  const topics = distinct(data.learning.topics, (item) => item.id, ['learning', 'topics']);
  distinct(data.learning.topics, (item) => item.number, ['learning', 'topics']);
  distinct(data.learning.verbs, (item) => item.id, ['learning', 'verbs']);
  distinct(data.learning.verbs, (item) => item.v1.toLowerCase(), ['learning', 'verbs']);
  const sessions = distinct(data.learning.sessions, (item) => item.id, ['learning', 'sessions']);
  distinct(data.learning.theorySessions, (item) => item.id, ['learning', 'theorySessions']);
  distinct(data.learning.advancedSessions ?? [], (item) => item.id, ['learning', 'advancedSessions']);
  for (const session of data.learning.advancedSessions ?? []) distinct(session.attempts, (item) => item.questionId, ['learning', 'advancedSessions', session.id]);
  for (const session of data.learning.theorySessions) distinct(session.attempts, (item) => item.exerciseId, ['learning', 'theorySessions', session.id]);
  for (const session of data.learning.sessions) distinct(session.attempts, (item) => item.verbId, ['learning', 'sessions', session.id]);
  const categories = new Set(data.categories.map((category) => category.id));
  if (!categories.has(ENGLISH_ID) || !categories.has(OTHER_ID)) addError(['categories'], 'Нет обязательных категорий');
  const tasks = new Map(data.tasks.map((task) => [task.id, task]));
  const months = new Set(data.plans.filter((item) => item.period === 'month').map((item) => item.id));
  const goals = new Set(data.goals.map((goal) => goal.id));
  const important = new Map();
  if (data.timer) {
    const { taskId, categoryId, segments, running } = data.timer;
    if (!tasks.has(taskId) || !categories.has(categoryId)) addError(['timer'], 'Не найдена задача или категория таймера');
    if (segments.some((item, index) => index > 0 && item.from < segments[index - 1].to)
      || (running && segments.at(-1)?.to > running.from)) addError(['timer'], 'Интервалы таймера пересекаются');
  }
  for (const task of data.tasks) {
    if (!categories.has(task.categoryId)) addError(['tasks'], 'Задача ссылается на отсутствующую категорию');
    if (task.stageId && !stages.has(task.stageId)) addError(['tasks'], 'Задача ссылается на отсутствующий этап');
    if (task.learning && task.categoryId !== ENGLISH_ID) addError(['tasks', task.id], 'Учебная задача должна быть в категории «Английский»');
    if (task.learning?.kind === 'topic' && !topics.has(task.learning.id)) addError(['tasks', task.id], 'Учебная тема отсутствует');
    if (task.learning?.kind === 'practice' && task.learning.sessionId && !sessions.has(task.learning.sessionId)) addError(['tasks', task.id], 'Тренировка отсутствует');
    if (task.important) {
      const count = (important.get(task.date) ?? 0) + 1;
      if (count > 3) addError(['tasks'], 'В дне может быть до трёх главных задач');
      important.set(task.date, count);
    }
  }
  for (const entry of [...data.logs, ...data.timeGoals]) {
    if (!categories.has(entry.categoryId)) addError(['categories'], 'Отсутствует категория для учёта времени');
  }
  for (const goal of data.taskGoals ?? []) {
    if (!categories.has(goal.categoryId)) addError(['taskGoals'], 'Отсутствует категория для цели по задачам');
  }
  for (const [day, entry] of Object.entries(data.days)) {
    if (entry.frogId) {
      const frog = tasks.get(entry.frogId);
      if (frog?.date !== day || (frog.completedOn && frog.completedOn !== day)) addError(['days', day], 'Лягушка должна быть открытой или выполненной в этот день');
    }
    distinct(entry.frogHistory, (item) => item.taskId, ['days', day, 'frogHistory']);
    if (entry.frogHistory.some((item) => item.taskId === entry.frogId)) addError(['days', day], 'Активная лягушка уже учтена в истории');
  }
  for (const item of data.plans) {
    if (item.monthGoalId && !months.has(item.monthGoalId)) addError(['plans'], 'Связанная месячная цель отсутствует');
    if (item.goalId && !goals.has(item.goalId)) addError(['plans'], 'Связанная большая цель отсутствует');
    if (item.stageId && !stages.has(item.stageId)) addError(['plans'], 'Связанный этап отсутствует');
  }
  for (const goal of data.goals) {
    if (goal.due && goal.due < goal.start) addError(['goals'], 'Срок цели раньше даты начала');
    if (goal.completedOn && goal.completedOn < goal.start) addError(['goals'], 'Дата завершения раньше даты начала');
  }
});

function validReviewKey(key) {
  const [period, value, extra] = key.split(':');
  if (extra !== undefined) return false;
  if (period === 'month') return isDate(value) && value.endsWith('-01');
  return period === 'week' && isMonday(value);
}

export function parseData(input) {
  const result = dataSchema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new Error(`Некорректные данные${issue?.path.length ? ` (${issue.path.join('.')})` : ''}. ${issue?.message ?? ''}`);
}

export function emptyData() {
  return parseData({
    version: 1,
    categories: [
      { id: ENGLISH_ID, name: 'Английский', color: '#ab9bea' },
      { id: 'ai', name: 'ИИ', color: '#7dbac8' },
      { id: '3d', name: '3D', color: '#e8a379' },
      { id: 'home', name: 'Быт', color: '#8bbf9e' },
      { id: OTHER_ID, name: 'Другое', color: '#a6a5b5' },
    ],
    tasks: [], logs: [], days: {}, plans: [], timeGoals: [], goals: [], ideas: [], reviews: {},
  });
}

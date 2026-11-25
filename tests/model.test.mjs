import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyData, emptyDay, monthEnd, parseData, reorderDayTasks, rescheduleTask, setFrog, shiftDate, shiftMonth, today, toggleTaskCompletion, weekStart,
} from '../src/model.ts';
import { activityDates, frogHistory, monthlyTaskCounts, monthTimeByWeek, periodBounds, stageProgress, streak, studyMinutes, summarize, timeGoalProgress } from '../src/analytics.ts';

const task = (date, extra = {}) => ({
  id: 'task', title: 'Тестовая задача', date, categoryId: 'english', priority: 'normal',
  important: false, completedOn: null, stageId: null, ...extra,
});

test('changing the order of filtered day tasks preserves hidden tasks, other groups and dates', () => {
  const data = emptyData();
  const date = '2026-11-21';
  data.tasks.push(
    task(date, { id: 'first' }),
    task(date, { id: 'completed', completedOn: date }),
    task(date, { id: 'other', categoryId: 'other' }),
    task('2026-11-22', { id: 'tomorrow' }),
    task(date, { id: 'last' }),
  );
  reorderDayTasks(data, ['first', 'last'], 'first', 'last', true);
  const expected = ['last', 'completed', 'other', 'tomorrow', 'first'];
  assert.deepEqual(parseData(data).tasks.map(item => item.id), expected);
  reorderDayTasks(data, expected, 'last', 'other', true);
  reorderDayTasks(data, expected, 'last', 'tomorrow', true);
  assert.deepEqual(data.tasks.map(item => item.id), expected);
});

test('снятие галочки после переноса выполненной лягушки очищает историю исходного дня', () => {
  const data = emptyData();
  const originalDate = '2026-11-10';
  const frog = task(originalDate);
  data.tasks.push(frog);
  setFrog(data, originalDate, frog.id);
  toggleTaskCompletion(data, frog.id);
  rescheduleTask(data, frog, '2026-11-11');
  assert.equal(frogHistory(data, originalDate, originalDate).length, 1);
  toggleTaskCompletion(data, frog.id);
  assert.deepEqual(frogHistory(parseData(data), originalDate, originalDate), []);
});

test('monthly goals use completion dates and current categories, and undo removes progress', () => {
  const data = emptyData();
  data.tasks.push(
    task('2026-10-31', { id: 'moved', completedOn: '2026-11-01' }),
    task('2026-11-01', { id: 'open' }),
    task('2026-11-30', { id: 'done', completedOn: '2026-11-30' }),
    task('2026-12-01', { id: 'future', completedOn: '2026-12-01' }),
    task('2026-11-18', { id: 'ai', categoryId: 'ai', completedOn: '2026-11-18' }),
  );
  assert.deepEqual([...monthlyTaskCounts(data, '2026-11-18')], [['english', 2], ['ai', 1]]);
  toggleTaskCompletion(data, 'done');
  assert.equal(monthlyTaskCounts(data, '2026-11-18').get('english'), 1);
  toggleTaskCompletion(data, 'open');
  assert.equal(monthlyTaskCounts(data, '2026-11-18').get('english'), 2);
  assert.equal(monthlyTaskCounts(data, '2026-12-01').get('english'), 1);
});

test('study time uses the three study categories and task goals validate independently', () => {
  assert.equal(studyMinutes(new Map([['english', 50], ['ai', 21], ['3d', 9], ['home', 42]])), 80);
  const data = emptyData();
  const goal = { month: '2026-11-01', categoryId: 'english', target: 50 };
  assert.deepEqual(parseData(data), data);
  assert.deepEqual(parseData({ ...data, taskGoals: [goal] }).taskGoals, [goal]);
  assert.throws(() => parseData({ ...data, taskGoals: [goal, goal] }));
  assert.throws(() => parseData({ ...data, taskGoals: [{ ...goal, categoryId: 'missing' }] }));
  assert.throws(() => parseData({ ...data, taskGoals: [{ ...goal, target: 0 }] }));
});

test('study days are unique across logs and categories, with manual English days included', () => {
  const data = emptyData();
  data.days['2026-11-11'] = { ...emptyDay(), english: true };
  const add = (categoryId, date) => data.logs.push({ id: String(data.logs.length), taskId: 'task', categoryId, date, minutes: 20 });
  add('ai', '2026-11-12');
  add('ai', '2026-11-12');
  add('3d', '2026-11-12');
  add('3d', '2026-11-13');
  add('3d', '2026-11-14');
  add('home', '2026-11-10');
  const result = summarize(data, '2026-11-09', '2026-11-13');
  assert.equal(result.datesByCategory.get('ai').size, 1);
  assert.equal(result.datesByCategory.get('3d').size, 2);
  assert.equal(result.englishDays, 1);
  assert.equal(result.studyDays, 3);
});

test('calendar uses civil dates, leap years and Monday–Sunday weeks', () => {
  assert.equal(today(new Date(2026, 10, 12, 0, 5)), '2026-11-12');
  assert.equal(shiftDate('2026-11-01', -1), '2026-10-31');
  assert.equal(shiftDate('2026-03-08', 1), '2026-03-09');
  assert.equal(shiftMonth('2024-01-31', 1), '2024-02-29');
  assert.equal(monthEnd('2026-02-08'), '2026-02-28');
  assert.equal(monthEnd('9999-12-20'), '9999-12-31');
  assert.equal(monthTimeByWeek(emptyData(), '9999-12-01').at(-1).end, '9999-12-31');
  assert.deepEqual(periodBounds('week', '2026-11-01'), { start: '2026-10-26', end: '2026-11-01' });
  assert.deepEqual(periodBounds('week', '9999-12-31'), { start: '9999-12-27', end: '9999-12-31' });
  assert.equal(weekStart('2027-01-03'), '2026-12-28');
});

test('18 historical days stay editable, streaks count independently and yesterday is active', () => {
  const data = emptyData();
  const now = '2026-11-12';
  for (let n = 1; n <= 18; n++) {
    const date = shiftDate(now, -n);
    data.days[date] = { ...emptyDay(), diary: true, english: true };
  }
  data.days[shiftDate(now, 1)] = { ...emptyDay(), journal: 'Будущий черновик', english: true };
  let dates = activityDates(parseData(data));
  assert.deepEqual(streak(dates.english, now), { current: 18, record: 18 });
  assert.deepEqual(streak(dates.diary, now), { current: 18, record: 18 });
  const gap = shiftDate(now, -3);
  data.days[gap].english = false;
  dates = activityDates(data);
  assert.deepEqual(streak(dates.english, now), { current: 2, record: 15 });
  assert.deepEqual(streak(dates.diary, now), { current: 18, record: 18 });
  data.logs.push({ id: 'backfill', taskId: 'task', date: gap, categoryId: 'english', minutes: 5 });
  data.days[now] = { ...emptyDay(), journal: 'Итог дня' };
  dates = activityDates(data);
  assert.deepEqual(streak(dates.english, now), { current: 18, record: 18 });
  assert.deepEqual(streak(dates.diary, now), { current: 19, record: 19 });
  assert.equal(streak(dates.english, shiftDate(now, 3)).current, 0);
});

test('actual dates and category are preserved across task moves, month boundary and deletion', () => {
  const data = emptyData();
  data.tasks.push(task('2026-10-30'));
  data.timeGoals.push({ id: 'target', month: '2026-11-01', categoryId: 'english', minutes: 1200 });
  data.logs.push(
    { id: 'oct', taskId: 'task', date: '2026-10-31', categoryId: 'english', minutes: 45 },
    { id: 'nov', taskId: 'task', date: '2026-11-01', categoryId: 'english', minutes: 80 },
    { id: 'nov-2', taskId: 'task', date: '2026-11-04', categoryId: 'english', minutes: 40 },
    { id: 'dec', taskId: 'task', date: '2026-12-01', categoryId: 'english', minutes: 150 },
  );
  const november = () => summarize(parseData(data), '2026-11-01', '2026-11-30');
  assert.equal(november().english, 120);
  assert.equal(november().englishDays, 2);
  assert.equal(november().completed.length, 0);
  assert.equal(november().english / data.timeGoals[0].minutes, .1);
  const weeks = monthTimeByWeek(data, '2026-11-01');
  assert.deepEqual(weeks[0], { start: '2026-11-01', end: '2026-11-01', minutes: new Map([['english', 80]]) });
  assert.equal(weeks[1].minutes.get('english'), 40);
  assert.deepEqual(weeks.at(-1), { start: '2026-11-30', end: '2026-11-30', minutes: new Map() });
  data.tasks[0].date = '2026-12-04';
  data.tasks[0].categoryId = 'ai';
  assert.equal(november().english, 120);
  data.tasks.length = 0;
  assert.equal(november().english, 120);
});

test('editing a historical time entry moves its original minutes between weeks, months and categories', () => {
  const data = emptyData();
  data.tasks.push(task('2026-12-28'));
  data.days['2027-01-01'] = { ...emptyDay(), english: true };
  data.logs.push(
    { id: 'editable', taskId: 'task', date: '2026-12-31', categoryId: 'english', minutes: 40 },
    { id: 'manual', taskId: 'task', date: '2027-01-01', categoryId: 'english', minutes: 35 },
    { id: 'unrelated', taskId: 'task', date: '2027-01-04', categoryId: 'ai', minutes: 30 },
  );
  assert.equal(summarize(data, '2026-12-01', '2026-12-31').total, 40);
  Object.assign(data.logs[0], { date: '2027-01-03', categoryId: 'ai', minutes: 55 });
  const updated = parseData(data);
  assert.equal(summarize(updated, '2026-12-01', '2026-12-31').total, 0);
  const january = summarize(updated, '2027-01-01', '2027-01-31');
  assert.equal(january.total, 120);
  assert.equal(january.englishDays, 1);
  assert.equal(january.english, 35);
  assert.equal(january.completed.length, 0);
  assert.equal([...january.minutes.values()].reduce((sum, value) => sum + value, 0), january.total);
  const [newYearWeek, secondWeek] = monthTimeByWeek(updated, '2027-01-01');
  assert.deepEqual(newYearWeek, { start: '2027-01-01', end: '2027-01-03', minutes: new Map([['ai', 55], ['english', 35]]) });
  assert.deepEqual(secondWeek.minutes, new Map([['ai', 30]]));
});

test('monthly time goal distinguishes one minute remaining, exact completion and overruns', () => {
  assert.deepEqual(timeGoalProgress(1199, 1200), { percent: 99.9, remaining: 1, surplus: 0 });
  assert.deepEqual(timeGoalProgress(1200, 1200), { percent: 100, remaining: 0, surplus: 0 });
  assert.deepEqual(timeGoalProgress(1500, 1200), { percent: 125, remaining: 0, surplus: 300 });
});

test('activity is counted once per day across the New Year and changing an old entry recalculates the streak', () => {
  const data = emptyData();
  for (const date of ['2026-12-30', '2026-12-31', '2027-01-01']) data.days[date] = { ...emptyDay(), diary: true, english: true };
  data.days['2027-01-04'] = { ...emptyDay(), english: true, diary: true };
  data.logs.push({ id: 'time', taskId: 'task', date: '2026-12-31', categoryId: 'english', minutes: 10 });
  const current = '2027-01-02';
  let dates = activityDates(data);
  assert.deepEqual(streak(dates.english, current), { current: 3, record: 3 });
  assert.deepEqual(streak(dates.diary, current), { current: 3, record: 3 });
  data.days['2026-12-31'].english = false;
  dates = activityDates(data);
  assert.deepEqual(streak(dates.english, current), { current: 3, record: 3 });
  data.logs[0].date = '2026-12-29';
  dates = activityDates(data);
  assert.deepEqual(streak(dates.english, current), { current: 1, record: 2 });
  assert.deepEqual(streak(dates.diary, current), { current: 3, record: 3 });
});

test('a frog uses the underlying task and completed history survives replacement and transfer', () => {
  const date = '2026-11-12';
  const data = emptyData();
  data.tasks.push(task(date), task(date, { id: 'other-task' }));
  setFrog(data, date, 'task');
  assert.equal(frogHistory(data, date, date).length, 0);
  data.tasks[0].completedOn = date;
  assert.equal(frogHistory(data, date, date).length, 1);
  setFrog(data, date, 'other-task');
  assert.equal(frogHistory(data, date, date).length, 1);
  setFrog(data, date, 'task');
  assert.equal(frogHistory(data, date, date).length, 1);
  data.tasks[0].completedOn = null;
  assert.equal(frogHistory(data, date, date).length, 0);
  data.tasks[0].completedOn = date;
  setFrog(data, date, null);
  data.tasks[0].date = shiftDate(date, 1);
  const parsed = parseData(data);
  assert.equal(parsed.tasks.length, 2);
  assert.equal(frogHistory(parsed, date, date).length, 1);
  assert.equal(summarize(parsed, date, date).completed.length, 1);
  assert.throws(() => setFrog(data, shiftDate(date, 1), 'task'), /выполненную в этот день/);
});

test('long goal, month, week and daily links validate and a shared stage counts once', () => {
  const data = emptyData();
  const date = '2026-11-09';
  const stage = { id: 'stage', title: 'Практика', done: false };
  data.goals.push({ id: 'goal', title: 'Цель', description: '', notes: '', start: date, due: null, completedOn: null, stages: [stage] });
  data.plans.push(
    { id: 'monthly', title: 'Месячная цель', period: 'month', date: '2026-11-01', completedOn: null, monthGoalId: null, goalId: 'goal', stageId: null },
    { id: 'weekly', title: 'Недельная задача', period: 'week', date, completedOn: date, monthGoalId: 'monthly', goalId: null, stageId: 'stage' },
  );
  data.tasks.push(task(date, { completedOn: date, stageId: 'stage' }));
  const valid = parseData(data);
  const progress = stageProgress(valid);
  assert.equal(valid.goals[0].stages.filter((item) => progress.get(item.id)?.done).length, 1);
  assert.deepEqual(progress.get(stage.id), { done: true, linked: 2, linkedDone: true });
  data.tasks[0].completedOn = null;
  assert.equal(stageProgress(data).get(stage.id).done, true);
  data.plans[1].completedOn = null;
  assert.deepEqual(stageProgress(data).get(stage.id), { done: false, linked: 2, linkedDone: false });
  stage.done = true;
  assert.deepEqual(stageProgress(data).get(stage.id), { done: true, linked: 2, linkedDone: false });
  data.plans[1].monthGoalId = 'missing';
  assert.throws(() => parseData(data), /месячная цель/);
});

test('imports reject invalid dates, dangling frogs, duplicate time goals and a fourth top task', () => {
  const date = '2026-11-12';
  const data = emptyData();
  data.tasks.push(task('2026-02-29'));
  assert.throws(() => parseData(data), /дата/);
  data.tasks = Array.from({ length: 4 }, (_, i) => task(date, { id: `task-${i}`, important: true }));
  assert.throws(() => parseData(data), /трёх главных/);
  data.tasks.pop();
  data.days[date] = { ...emptyDay(), frogId: 'missing' };
  assert.throws(() => parseData(data), /Лягушка/);
  data.days[date].frogId = null;
  data.timeGoals.push(...['a', 'b'].map((id) => ({ id, month: '2026-11-01', categoryId: 'english', minutes: 10 })));
  assert.throws(() => parseData(data), /Повторяющийся/);
});

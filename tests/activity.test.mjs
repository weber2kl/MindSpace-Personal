import assert from 'node:assert/strict';
import test from 'node:test';
import { activityLevel, activityYear } from '../src/activity.ts';
import { emptyData, emptyDay } from '../src/model.ts';

function fixture() {
  const data = emptyData();
  data.logs.push(
    { id: 'prev', taskId: 'lesson', categoryId: 'english', date: '2025-12-31', minutes: 100 },
    { id: 'log1', taskId: 'lesson', categoryId: 'english', date: '2026-01-01', minutes: 20 },
    { id: 'log2', taskId: 'lesson', categoryId: 'english', date: '2026-01-01', minutes: 15 },
    { id: 'log3', taskId: 'removed', categoryId: 'english', date: '2026-01-02', minutes: 5 },
    { id: 'log4', taskId: 'ai', categoryId: 'ai', date: '2026-01-02', minutes: 60 },
    { id: 'log5', taskId: 'ai', categoryId: 'ai', date: '2026-01-03', minutes: 25 },
    { id: 'last', taskId: 'lesson', categoryId: 'english', date: '2026-12-31', minutes: 22 },
    { id: 'next', taskId: 'lesson', categoryId: 'english', date: '2027-01-01', minutes: 100 },
  );
  data.tasks.push(
    { id: 'lesson', title: 'Английский', date: '2025-12-31', completedOn: '2026-01-02', categoryId: 'english', important: false, priority: 'normal', stageId: null },
    { id: 'ai', title: 'ИИ', date: '2026-01-02', completedOn: '2026-01-02', categoryId: 'ai', important: false, priority: 'normal', stageId: null },
    { id: 'another', title: 'Без времени', date: '2026-01-04', completedOn: '2026-01-04', categoryId: 'english', important: false, priority: 'normal', stageId: null },
  );
  data.days['2026-01-05'] = { ...emptyDay(), english: true };
  return data;
}

test('activity totals use actual log dates, filter categories and separate task completions from time', () => {
  const data = fixture();
  const overall = activityYear(data, 2026, '');
  const english = activityYear(data, 2026, 'english');
  const ai = activityYear(data, 2026, 'ai');
  assert.equal(overall.minutes, 147);
  assert.equal(english.minutes, 62);
  assert.equal(ai.minutes, 85);
  assert.equal(overall.activeDays, 4);
  assert.equal(overall.longest, 3);
  assert.equal(english.longest, 2);
  assert.equal(overall.best.date, '2026-01-02');
  assert.equal(overall.best.minutes, 65);
  assert.equal(english.best.date, '2026-01-01');
  assert.equal(overall.days[1].completed, 2);
  assert.equal(english.days[1].completed, 1);
  assert.equal(english.days[3].completed, 1);
  assert.equal(english.days[3].minutes, 0);
  assert.equal(english.days[4].minutes, 0);
  assert.equal(activityYear(data, 2027, 'english').minutes, 100);
});

test('activity levels have explicit minute thresholds', () => {
  assert.deepEqual([0, 1, 29, 30, 59, 60, 119, 120, 1000].map(activityLevel), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test('the activity grid includes leap days and assigns dates to Monday-first weeks', () => {
  const data = emptyData();
  const grid = activityYear(data, 2024, '');
  assert.equal(grid.days.length, 366);
  assert.equal(grid.weeks, 53);
  assert.deepEqual(grid.days[0], { date: '2024-01-01', week: 0, weekday: 0, minutes: 0, completed: 0 });
  assert.deepEqual(grid.days.find((day) => day.date === '2024-02-29'), { date: '2024-02-29', week: 8, weekday: 3, minutes: 0, completed: 0 });
  assert.deepEqual(grid.days.at(-1), { date: '2024-12-31', week: 52, weekday: 1, minutes: 0, completed: 0 });
  const sundays = activityYear(data, 2012, '');
  assert.equal(sundays.days[0].weekday, 6);
  assert.equal(sundays.weeks, 54);
  assert.equal(sundays.days.at(-1).date, '2012-12-31');
  assert.equal(activityYear(data, 1000, '').days[0].date, '1000-01-01');
  assert.equal(activityYear(data, 9999, '').days.at(-1).date, '9999-12-31');
});

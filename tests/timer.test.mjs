import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStorage } from '../desktop/storage.mjs';
import { emptyData, parseData, setFrog, toggleTaskCompletion } from '../src/model.ts';
import { elapsedMs, finishTimer, pauseTimer, resumeTimer, startTimer, suggestedMinutes } from '../src/timer.ts';
import { summarize } from '../src/analytics.ts';

const stamp = (value) => Date.parse(value);
const minute = 60_000;
const task = (id, date = '2026-11-12') => ({
  id, title: id, date, categoryId: 'english', priority: 'normal', important: false, completedOn: null, stageId: null,
});

test('timer pauses, resumes, splits at actual local midnight and never duplicates minutes', () => {
  const data = emptyData();
  data.tasks.push(task('lesson'), task('other'));
  data.logs.push({ id: 'manual', taskId: 'lesson', date: '2026-11-01', categoryId: 'english', minutes: 12 });
  startTimer(data, 'lesson', stamp('2026-10-31T18:58:00Z'), 'Asia/Qyzylorda');
  const timerId = data.timer.id;
  assert.throws(() => startTimer(data, 'other'), /текущий таймер/);
  pauseTimer(data, timerId, stamp('2026-10-31T19:01:00Z'));
  assert.equal(elapsedMs(data.timer, stamp('2026-10-31T19:03:00Z')), 3 * minute);
  resumeTimer(data, timerId, stamp('2026-10-31T19:03:00Z'), 'Asia/Qyzylorda');
  pauseTimer(data, timerId, stamp('2026-10-31T19:06:00Z'));
  const rows = suggestedMinutes(data.timer);
  assert.deepEqual(rows, [{ date: '2026-10-31', minutes: 2 }, { date: '2026-11-01', minutes: 4 }]);
  rows[1].minutes = 6;
  finishTimer(data, timerId, rows);
  finishTimer(data, timerId, rows);
  assert.equal(data.timer, undefined);
  assert.equal(parseData(data).logs.length, 3);
  assert.equal(summarize(data, '2026-11-01', '2026-11-30').english, 18);
  assert.equal(summarize(data, '2026-10-01', '2026-10-31').english, 2);
});

test('rounded timer minutes preserve total across midnight and allow a 25-hour day', () => {
  const data = emptyData();
  data.tasks.push(task('lesson'));
  startTimer(data, 'lesson', stamp('2026-10-31T23:59:30Z'), 'UTC');
  const timerId = data.timer.id;
  pauseTimer(data, timerId, stamp('2026-11-01T00:00:29Z'));
  assert.equal(suggestedMinutes(data.timer).reduce((sum, row) => sum + row.minutes, 0), 1);
  finishTimer(data, timerId, []);
  startTimer(data, 'lesson', stamp('2026-11-01T04:00:00Z'), 'America/New_York');
  pauseTimer(data, data.timer.id, stamp('2026-11-02T05:00:00Z'));
  const rows = suggestedMinutes(data.timer);
  assert.deepEqual(rows, [{ date: '2026-11-01', minutes: 1500 }]);
  finishTimer(data, data.timer.id, rows);
  assert.deepEqual(parseData(data).logs.map((log) => log.minutes), [1440, 60]);
});

test('a clock rollback just after midnight preserves minutes in both dates', () => {
  const data = emptyData();
  data.tasks.push(task('lesson'));
  startTimer(data, 'lesson', stamp('2009-11-01T02:25:00Z'), 'America/St_Johns');
  pauseTimer(data, data.timer.id, stamp('2009-11-01T04:10:00Z'));
  assert.deepEqual(suggestedMinutes(data.timer), [
    { date: '2009-10-31', minutes: 64 },
    { date: '2009-11-01', minutes: 41 },
  ]);
});

test('abnormally long timer is bounded, stays recoverable and can save corrected minutes', () => {
  const data = emptyData();
  data.tasks.push(task('lesson'));
  data.logs.push({ id: 'manual', taskId: 'lesson', date: '2026-11-12', categoryId: 'english', minutes: 10 });
  startTimer(data, 'lesson', stamp('1000-01-01T00:00:00Z'), 'UTC');
  const timerId = data.timer.id;
  pauseTimer(data, timerId, stamp('2026-11-12T12:00:00Z'));
  const previous = structuredClone(parseData(data));
  assert.throws(() => suggestedMinutes(data.timer), /Сессия слишком длинная/);
  assert.deepEqual(parseData(data), previous);
  finishTimer(data, timerId, [{ date: '2026-11-12', minutes: 15 }]);
  assert.equal(data.timer, undefined);
  assert.deepEqual(parseData(data).logs.map(log => log.minutes), [10, 15]);
});

test('database reopen resumes an unfinished session and keeps the prior manual log', () => {
  const folder = mkdtempSync(join(tmpdir(), 'mindspace-timer-test-'));
  let storage = openStorage(folder);
  try {
    const initial = storage.load();
    const data = initial.data;
    data.tasks.push(task('lesson'));
    data.logs.push({ id: 'manual', taskId: 'lesson', date: '2026-11-12', categoryId: 'english', minutes: 10 });
    const from = stamp('2026-11-12T10:00:00Z');
    startTimer(data, 'lesson', from, 'UTC');
    storage.save(data, initial.revision);
    storage.close();
    storage = openStorage(folder);
    const current = storage.load();
    assert.equal(current.data.timer.id, data.timer.id);
    assert.equal(elapsedMs(current.data.timer, from + 5 * minute), 5 * minute);
    pauseTimer(current.data, data.timer.id, from + 5 * minute);
    finishTimer(current.data, data.timer.id, suggestedMinutes(current.data.timer));
    storage.save(current.data, current.revision);
    assert.deepEqual(storage.load().data.logs.map((log) => log.minutes), [10, 5]);
  } finally {
    storage.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('undoing a completed task removes its replaced frog on the same day', () => {
  const date = '2026-11-12';
  const data = emptyData();
  data.tasks.push(task('first'), task('second'));
  setFrog(data, date, 'first');
  toggleTaskCompletion(data, 'first');
  setFrog(data, date, 'second');
  assert.equal(summarize(data, date, date).frogs.length, 1);
  toggleTaskCompletion(data, 'first');
  assert.equal(summarize(data, date, date).frogs.length, 0);
});

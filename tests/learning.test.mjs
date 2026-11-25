import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { openStorage } from '../desktop/storage.mjs';
import { emptyData, emptyDay, parseData } from '../src/model.ts';
import { activityYear } from '../src/activity.ts';
import { activityDates, timeGoalProgress, timeTotals } from '../src/analytics.ts';
import { addLearningTask } from '../src/learning.ts';
import { checkPracticeAnswer, recordPracticeSession } from '../src/practiceLogic.ts';

const orderedVerbs = [
  'do go see have make say get take know think',
  'write speak read give find buy bring come become run',
  'wear begin break choose draw eat forget keep lose understand',
  'awake be bear beat bend bind bite bleed blow build',
  'burn burst catch cost creep crow dream drink drive fall',
  'cut feed feel fight fly forbid forgive freeze grow hang',
  'spend hear hide hit hold hurt kneel lay lead learn',
  'leave meet send sell sit sleep stand tell win pay',
];

test('the initial catalog has exactly 19 numbered topics and 80 verbs in the requested groups and order', () => {
  const { learning } = emptyData();
  assert.deepEqual(learning.topics.map((topic) => topic.number), Array.from({ length: 19 }, (_, i) => i + 1));
  assert.deepEqual(learning.topics.map((topic) => topic.page), [4, 7, 10, 13, 16, 18, 23, 26, 29, 33, 37, 41, 44, 48, 53, 55, 59, 63, 66]);
  assert.deepEqual(learning.verbs.map((verb) => verb.v1), orderedVerbs.join(' ').split(' '));
  for (let group = 1; group <= 8; group++) {
    assert.deepEqual(learning.verbs.filter((verb) => verb.group === group).map((verb) => verb.v1), orderedVerbs[group - 1].split(' '));
  }
  assert.equal(new Set(learning.verbs.map((verb) => verb.id)).size, 80);
  assert.ok(learning.topics.every((topic) => topic.status === 'new' && !topic.practiced));
  assert.ok(learning.verbs.every((verb) => verb.status === 'new' && !verb.reviewedOn));
  assert.deepEqual(learning.sessions, []);
});

test('an old SQLite snapshot loads additively and reopening preserves edits, history and ids', () => {
  const folder = mkdtempSync(join(tmpdir(), 'mindspace-learning-'));
  const date = '2026-11-12';
  try {
    const initial = openStorage(folder);
    initial.close();
    const old = emptyData();
    delete old.learning;
    old.days[date] = { ...emptyDay(), journal: 'Тестовая старая запись' };
    old.tasks.push({ id: 'old', title: 'Тестовая старая задача', date, categoryId: 'english', priority: 'normal', important: true, completedOn: date, stageId: null });
    old.logs.push({ id: 'old-log', taskId: 'old', date, categoryId: 'english', minutes: 36 });
    const legacyDb = new DatabaseSync(join(folder, 'personal.sqlite3'));
    legacyDb.prepare('UPDATE planner_state SET payload = ?, revision = 9 WHERE id = 1').run(JSON.stringify(old));
    legacyDb.close();

    const upgraded = openStorage(folder);
    try {
      const loaded = upgraded.load();
      assert.equal(loaded.revision, 9);
      const { learning, ...planner } = loaded.data;
      assert.deepEqual(planner, old);
      assert.equal(learning.topics.length, 19);
      learning.topics[0].notes = 'Мои примеры';
      learning.topics[0].examples = ['I work here.'];
      learning.topics[0].status = 'studying';
      learning.verbs.push({ ...learning.verbs[0], id: 'user-show', v1: 'show', v2: 'showed', v3: 'shown', ru: 'показывать' });
      learning.verbs.at(-1).ru = 'показывать, демонстрировать';
      learning.verbs = learning.verbs.filter((verb) => verb.id !== 'verb-do');
      const practice = addLearningTask(loaded.data, date, { kind: 'practice', sessionId: null });
      recordPracticeSession(loaded.data, { id: 'session', date, attempts: [checkPracticeAnswer(learning.verbs.at(-1), 'showed', 'shown')] }, practice.id);
      upgraded.save(loaded.data, loaded.revision);
    } finally { upgraded.close(); }
    const reopened = openStorage(folder);
    try {
      const data = reopened.load().data;
      assert.equal(data.learning.topics[0].status, 'studying');
      assert.deepEqual(data.learning.topics[0].examples, ['I work here.']);
      assert.equal(data.learning.verbs.length, 80);
      assert.equal(data.learning.verbs.some((verb) => verb.id === 'verb-do'), false);
      assert.equal(data.learning.verbs.at(-1).ru, 'показывать, демонстрировать');
      assert.equal(data.learning.sessions[0].attempts[0].correct3, true);
      assert.equal(data.tasks[1].learning.sessionId, 'session');
      assert.deepEqual(data.days, old.days);
      assert.deepEqual(data.logs, old.logs);
    } finally { reopened.close(); }
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('learning links use the existing English totals, goal, activity grid and streak without adding practice time', () => {
  const data = emptyData();
  const date = '2026-11-12';
  const task = addLearningTask(data, date, { kind: 'topic', id: 'topic-01' });
  assert.equal(task.categoryId, 'english');
  const practice = addLearningTask(data, date, { kind: 'practice', sessionId: null });
  recordPracticeSession(data, { id: 'session', date, attempts: [checkPracticeAnswer(data.learning.verbs[0], 'did', 'done')] }, practice.id);
  assert.equal(data.logs.length, 0);
  assert.equal(activityDates(data).english.size, 0);
  data.logs.push({ id: 'logged', taskId: practice.id, date, categoryId: 'english', minutes: 45 });
  assert.equal(activityYear(data, 2026, 'english').minutes, 45);
  const minutes = timeTotals(data, '2026-11-01', '2026-11-30').minutes.get('english');
  assert.equal(minutes, 45);
  assert.deepEqual(timeGoalProgress(minutes, 60), { percent: 75, remaining: 15, surplus: 0 });
  assert.deepEqual([...activityDates(data).english], [date]);
  assert.equal(parseData(data).learning.sessions.length, 1);
  assert.throws(() => parseData({ ...data, tasks: [{ ...task, learning: { kind: 'topic', id: 'missing' } }] }), /Учебная тема отсутствует/);
});

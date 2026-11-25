import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyData, parseData } from '../src/model.ts';
import { addLearningTask } from '../src/learning.ts';
import { acceptsForm, checkPracticeAnswer, latestPracticeErrors, practicePool, practiceQueue, practiceStats, recordPracticeSession } from '../src/practiceLogic.ts';

const find = (data, base) => data.learning.verbs.find((item) => item.v1 === base);

test('practice recognizes valid V2/V3 alternatives and reports each form independently', () => {
  const data = emptyData();
  const be = checkPracticeAnswer(find(data, 'be'), '  wAs / WERE  ', ' BEen  ');
  assert.deepEqual([be.correct2, be.correct3], [true, true]);
  const go = checkPracticeAnswer(find(data, 'go'), 'gone', ' GONE ');
  assert.deepEqual([go.correct2, go.correct3], [false, true]);
  for (const [base, answer2, answer3] of [
    ['burn', 'burned', 'burnt'], ['dream', 'dreamt', 'dreamed'], ['learn', 'learned', 'learnt'], ['crow', 'crew', 'crowed'],
  ]) {
    const answer = checkPracticeAnswer(find(data, base), answer2, answer3);
    assert.ok(answer.correct2 && answer.correct3, base);
  }
  assert.equal(acceptsForm('was/were', '  '), false);
  assert.equal(acceptsForm('was/were', 'was/be'), false);
  assert.equal(acceptsForm('was/were', 'was/'), false);
  assert.deepEqual(practiceStats([be, go]), { total: 2, correct: 1, wrong: 1, accuracy: 50 });
});

test('group, difficulty, errors and quantity are independent practice filters', () => {
  const data = emptyData();
  find(data, 'do').hard = true;
  find(data, 'write').hard = true;
  const groups = new Set([1, 2]);
  const errors = new Set([find(data, 'see').id, find(data, 'wear').id]);
  const { verbs } = data.learning;
  assert.equal(practicePool(verbs, groups, 'all', errors).length, 20);
  assert.deepEqual(practicePool(verbs, groups, 'hard', errors).map((verb) => verb.v1), ['do', 'write']);
  assert.deepEqual(practicePool(verbs, groups, 'errors', errors).map((verb) => verb.v1), ['see']);
  assert.equal(practicePool(verbs, new Set(), 'all', errors).length, 0);
  const original = verbs.slice(0, 10);
  assert.equal(practiceQueue(original, 5, true, () => 0).length, 5);
  assert.notEqual(practiceQueue(original, 5, true, () => 0)[0].id, original[0].id);
  assert.deepEqual(practiceQueue(original, 'all', false), original);
});

test('practice history and dates survive serialization without changing mastery or logged time', () => {
  const data = emptyData();
  const task = addLearningTask(data, '2026-11-12', { kind: 'practice', sessionId: null });
  data.logs.push({ id: 'manual-1', taskId: task.id, date: task.date, categoryId: task.categoryId, minutes: 13 });
  const go = find(data, 'go');
  const attempt = checkPracticeAnswer(go, 'went', 'went');
  const first = { id: 'practice-1', date: '2026-11-12', attempts: [attempt] };
  recordPracticeSession(data, first, task.id);
  recordPracticeSession(data, first, task.id);
  assert.deepEqual([...latestPracticeErrors(data.learning.sessions)], [go.id]);
  assert.equal(go.reviewedOn, '2026-11-12');
  assert.equal(go.successOn, null);
  const second = { id: 'practice-2', date: '2026-11-13', attempts: [checkPracticeAnswer(go, 'went', 'gone')] };
  recordPracticeSession(data, second, task.id);
  assert.equal(latestPracticeErrors(data.learning.sessions).size, 0);
  go.v2 = 'went / alternate';
  const saved = parseData(JSON.parse(JSON.stringify(data)));
  assert.equal(saved.learning.sessions.length, 2);
  assert.equal(saved.learning.sessions[0].attempts[0].v2, 'went');
  assert.equal(find(saved, 'go').status, 'new');
  assert.equal(find(saved, 'go').successOn, '2026-11-13');
  assert.equal(saved.tasks[0].learning.sessionId, first.id);
  assert.equal(saved.logs.length, 1);
  assert.equal(saved.logs[0].minutes, 13);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyData, parseData } from '../src/model.ts';
import { bulkVerbs, undoBulkVerbs } from '../src/bulkVerbs.ts';
import { checkPracticeAnswer, recordPracticeSession } from '../src/practiceLogic.ts';
import { advancedSets } from '../src/advancedSets.ts';
import { advancedScore, gradeSet, wordCount } from '../src/advancedGrading.ts';
import { checkExercise, normalizeAnswer, theoryResult, recordTheoryResult } from '../src/theoryLogic.ts';
import { lessons } from '../src/lessons/index.ts';
import { openStorage, readDatabaseBackup } from '../desktop/storage.mjs';
import { checkUpdateMetadata } from '../desktop/update-file.mjs';

test('bulk operations affect selected fields only; undo preserves later individual edits and training', () => {
  const d = emptyData();
  recordPracticeSession(d, {id:'s',date:'2026-11-12',attempts:[checkPracticeAnswer(d.learning.verbs[0],'wrong','wrong')]});
  const before = structuredClone(d);
  const ids = new Set(d.learning.verbs.filter(v => v.group === 1).map(v => v.id));
  const undo = bulkVerbs(d.learning.verbs, ids, {status:'mastered',hard:true});
  assert.equal(d.learning.verbs.filter(v => v.status === 'mastered').length,10);
  assert.deepEqual(d.learning.sessions,before.learning.sessions);
  d.learning.verbs[0].status='studying';
  undoBulkVerbs(d.learning.verbs,undo);
  before.learning.verbs[0].status='studying';
  assert.deepEqual(d,before);
  const all = bulkVerbs(d.learning.verbs,new Set(d.learning.verbs.map(v => v.id)),{status:'mastered'});
  assert.equal(d.learning.verbs.filter(v => v.status === 'mastered').length,80);
  d.learning.verbs.pop();
  undoBulkVerbs(d.learning.verbs,all);
  assert.equal(d.learning.verbs.length,79,'undo must not resurrect removed words');
});

test('advanced reading grades evidence and counts skipped questions against the score', () => {
  const set = advancedSets.find(item => item.id === 'reading-repair-v1');
  const result = gradeSet(set, { q4: ' false ', q5: 'True', q6: 'True', q7: 'a follow-up survey', q8: 'Seasonal work.' }, {
    id: 'reading-test', date: '2026-11-13', elapsedSeconds: 540, timed: true,
  });
  assert.deepEqual(result.attempts.map(item => item.correct), [false, false, false, true, false, true, false, true]);
  assert.deepEqual(advancedScore(result.attempts), { correct: 3, total: 8 });
  assert.equal(wordCount('a follow-up survey'), 3);
  assert.equal(result.attempts[0].answer, '');
});

test('advanced writing saves the complete response for self-assessment alongside existing history', () => {
  const data = emptyData();
  const prior = gradeSet(advancedSets[0], { q2: 'haven’t spoken to Joel since' }, {
    id: 'grammar-test', date: '2026-11-13', elapsedSeconds: 20, timed: false,
  });
  assert.equal(prior.attempts[1].correct, true);
  const set = advancedSets.find(item => item.id === 'writing-opinion-v1');
  const answer = 'Practical lessons matter.\n\nStudents can use them outside school.';
  const result = gradeSet(set, { q1: answer }, { id: 'writing-test', date: '2026-11-13', elapsedSeconds: 30, timed: false });
  assert.deepEqual(advancedScore(result.attempts), { correct: 0, total: 0 });
  data.learning.advancedSessions = [prior, result];
  const parsed = parseData(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(parsed.learning.advancedSessions, [prior, result]);
  assert.equal(parsed.learning.advancedSessions[1].attempts[0].answer, answer);
  assert.equal(parsed.learning.advancedSessions[1].attempts[0].correct, null);
  data.learning.advancedSessions.push(result);
  assert.throws(() => parseData(data));
});

test('all ten stable topics contain substantial rules, tables, 12 explained examples, five exercise types and summaries', () => {
  assert.equal(lessons.length,10);
  assert.deepEqual(lessons.map(l=>l.topicId),emptyData().learning.topics.slice(0,10).map(t=>t.id));
  for(const lesson of lessons) {
    assert.ok(lesson.sections.length>=5,lesson.topicId);
    assert.ok(lesson.sections.flatMap(s=>s.paragraphs).join(' ').length>2500,lesson.topicId);
    assert.ok(lesson.sections.some(s=>s.table?.length>2));
    assert.equal(lesson.examples.length,12);
    assert.ok(lesson.examples.every(e=>e.en&&e.ru&&e.why));
    assert.equal(lesson.exercises.length,15);
    assert.equal(new Set(lesson.exercises.map(e=>e.kind)).size,5);
    assert.equal(new Set(lesson.exercises.map(e=>e.id)).size,15);
    assert.ok(lesson.summary.length>=4 && lesson.mistakes.length>=3);
    for(const e of lesson.exercises) {
      for(const a of e.answers) assert.equal(checkExercise(e,a),e.selfCheck?null:true);
      if(!e.selfCheck) assert.equal(checkExercise(e,'definitely wrong'),false);
      if(e.options) assert.ok(e.options.includes(e.answers[0]));
    }
  }
});

test('answer checking normalizes contractions and punctuation, but keeps grammar significant', () => {
  assert.equal(normalizeAnswer('  I DON’T understand! '),'i do not understand');
  assert.equal(normalizeAnswer('I’m not hungry.'),'i am not hungry');
  assert.equal(normalizeAnswer('They aren’t here?'),'they are not here');
  assert.equal(checkExercise(lessons[0].exercises[7],'She my sister.'),false);
  assert.equal(checkExercise(lessons[0].exercises[13],'We are home.'),null);
});

test('choice grading keeps an intentionally incorrect contracted short answer distinct', () => {
  const question = lessons[1].exercises.find(exercise => exercise.options?.includes('Yes, I’m.'));
  assert.ok(question);
  assert.equal(checkExercise(question, 'Yes, I’m.'), false);
  assert.equal(checkExercise(question, 'Yes, I am.'), true);
});

test('1.2 data upgrades additively; theory history is idempotent, persists in SQLite and survives backup', async () => {
  const folder=mkdtempSync(join(tmpdir(),'mindspace-13-'));
  let store;
  try {
    const old=emptyData(); delete old.learning.theorySessions;
    const d=parseData(old);
    assert.deepEqual(d.learning.theorySessions,[]);
    const {theorySessions,...learning}=d.learning;
    assert.deepEqual(learning,old.learning);
    const lesson=lessons[0];
    const r=theoryResult(lesson,Object.fromEntries(lesson.exercises.map(e=>[e.id,e.answers[0]])),'result','2026-10-25');
    recordTheoryResult(d,r); recordTheoryResult(d,r);
    assert.equal(d.learning.theorySessions.length,1);
    assert.equal(d.learning.topics[0].practiced,true);
    assert.equal(d.learning.topics[0].status,'new');
    assert.equal(d.learning.topics[0].reviewedOn,'2026-10-25');
    store=openStorage(folder);store.save(d,0);store.close();store=openStorage(folder);
    assert.deepEqual(store.load().data,d);
    const backup=await store.backupDatabase();assert.deepEqual(readDatabaseBackup(backup),d);
    assert.equal(parseData(parseData(d)).learning.topics.length,19);
    const corrupted=structuredClone(d);corrupted.learning.theorySessions.push(r);
    assert.throws(()=>parseData(corrupted));
    corrupted.learning.theorySessions=[{...r,attempts:[r.attempts[0],r.attempts[0]]}];
    assert.throws(()=>parseData(corrupted));
  } finally {store?.close();rmSync(folder,{recursive:true,force:true});}
});

test('local update rejects foreign executables, mismatched versions, downgrades, untested major versions and unsigned/untrusted publishers', () => {
 const current='1.3.0', name='MindSpace-Personal-Setup-1.4.0-x64.exe';
 const valid={product:'MindSpace Personal',version:'1.4.0',signature:'Valid'};
 assert.throws(()=>checkUpdateMetadata('bad.exe',valid,current),/не установщик/);
 assert.throws(()=>checkUpdateMetadata(name,{...valid,product:'Other'},current),/не установщик/);
 assert.throws(()=>checkUpdateMetadata(name,{...valid,version:'1.5.0'},current),/не совпадает/);
 assert.throws(()=>checkUpdateMetadata(name,valid,'1.4.0'),/более новую/);
 assert.throws(()=>checkUpdateMetadata(name,valid,'1.5.0'),/более новую/);
 assert.throws(()=>checkUpdateMetadata('MindSpace-Personal-Setup-2.0.0-x64.exe',{...valid,version:'2.0.0'},current),/совместимость/);
 assert.throws(()=>checkUpdateMetadata(name,{...valid,signature:'NotSigned'},current),/не имеет/);
 assert.throws(()=>checkUpdateMetadata(name,valid,current),/доверенный издатель/);
});

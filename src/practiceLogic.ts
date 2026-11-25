import type { Data, LearningVerb, PracticeAttempt, PracticeSession } from './model.ts';

export type PracticeScope = 'all' | 'hard' | 'errors';
export type PracticeCount = 5 | 10 | 20 | 'all';

const normalize = (answer: string) => answer.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();

export function acceptsForm(expected: string, answer: string) {
  const forms = new Set(expected.split('/').map(normalize).filter(Boolean));
  return answer.split('/').map(normalize).every((form) => forms.has(form));
}

export function checkPracticeAnswer(verb: LearningVerb, answer2: string, answer3: string): PracticeAttempt {
  const { id: verbId, v1, v2, v3, ru } = verb;
  return {
    verbId, v1, v2, v3, ru, answer2: answer2.trim(), answer3: answer3.trim(),
    correct2: acceptsForm(v2, answer2), correct3: acceptsForm(v3, answer3),
  };
}

export function latestPracticeErrors(sessions: PracticeSession[]) {
  const errors = new Set<string>();
  for (const session of sessions) {
    for (const attempt of session.attempts) {
      if (attempt.correct2 && attempt.correct3) errors.delete(attempt.verbId);
      else errors.add(attempt.verbId);
    }
  }
  return errors;
}

export function practiceStats(attempts: PracticeAttempt[]) {
  const total = attempts.length;
  const correct = attempts.filter((attempt) => attempt.correct2 && attempt.correct3).length;
  return { total, correct, wrong: total - correct, accuracy: total ? Math.round(100 * correct / total) : 0 };
}

export function practicePool(verbs: LearningVerb[], groups: Set<number> | null, scope: PracticeScope, errors: Set<string>) {
  return verbs.filter((verb) => (groups === null || groups.has(verb.group))
    && (scope === 'all' || (scope === 'hard' ? verb.hard : errors.has(verb.id))));
}

export function practiceQueue(pool: LearningVerb[], count: PracticeCount, shuffle: boolean, random = Math.random) {
  const queue = [...pool];
  if (shuffle) {
    for (let index = queue.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [queue[index], queue[other]] = [queue[other], queue[index]];
    }
  }
  return count === 'all' ? queue : queue.slice(0, count);
}

export function recordPracticeSession(data: Data, session: PracticeSession, sourceTaskId?: string) {
  if (!session.attempts.length || data.learning.sessions.some((item) => item.id === session.id)) return;
  data.learning.sessions.push(session);
  const answers = new Map(session.attempts.map((attempt) => [attempt.verbId, attempt]));
  for (const verb of data.learning.verbs) {
    const attempt = answers.get(verb.id);
    if (!attempt) continue;
    if (!verb.reviewedOn || verb.reviewedOn < session.date) verb.reviewedOn = session.date;
    if (attempt.correct2 && attempt.correct3 && (!verb.successOn || verb.successOn < session.date)) verb.successOn = session.date;
  }
  const task = data.tasks.find((item) => item.id === sourceTaskId);
  if (task?.learning?.kind === 'practice' && task.learning.sessionId === null) task.learning.sessionId = session.id;
}

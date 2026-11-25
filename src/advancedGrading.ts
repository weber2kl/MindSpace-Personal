import type { AdvancedSession } from './model.ts';
import type { AdvancedSet } from './advancedSets.ts';
import { normalizeAnswer } from './theoryLogic.ts';

export function wordCount(answer: string) {
  return answer.trim().split(/\s+/u).filter(word => /[\p{L}\p{N}]/u.test(word)).length;
}

export function gradeSet(set: AdvancedSet, answers: Record<string, string>, session: Omit<AdvancedSession, 'setId' | 'attempts'>): AdvancedSession {
  return {
    ...session,
    setId: set.id,
    attempts: set.questions.map(question => {
      const answer = answers[question.id]?.trim() ?? '';
      const withinLimit = question.wordLimit === undefined || wordCount(answer) <= question.wordLimit;
      return {
        questionId: question.id,
        answer,
        correct: set.skill === 'writing' ? null : Boolean(answer && withinLimit &&
          question.answers.some(expected => normalizeAnswer(expected) === normalizeAnswer(answer))),
      };
    }),
  };
}

export function advancedScore(attempts: AdvancedSession['attempts']) {
  const graded = attempts.filter(attempt => attempt.correct !== null);
  return { correct: graded.filter(attempt => attempt.correct).length, total: graded.length };
}

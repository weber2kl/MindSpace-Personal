import type { Data } from './model.ts';
import type { Exercise, Lesson } from './lessons/types.ts';

export const normalizeAnswer = (value: string) => value.normalize('NFKC').toLowerCase().trim()
  .replace(/[’‘]/g, "'").replace(/\b(can't)\b/g, 'cannot').replace(/\bwon't\b/g, 'will not')
  .replace(/n't\b/g, ' not').replace(/\bi'm\b/g, 'i am').replace(/\b(you|we|they)'re\b/g, '$1 are')
  .replace(/\b(he|she|it|that|this|there|what|who)'s\b/g, '$1 is')
  .replace(/\b(i|you|he|she|it|we|they)'ll\b/g, '$1 will')
  .replace(/[.!?]+$/g, '').replace(/\s+/g, ' ').trim();

export function checkExercise(exercise: Exercise, answer: string): boolean | null {
  if (exercise.selfCheck) return null;
  if (exercise.options) return exercise.answers.includes(answer);
  return exercise.answers.some(a => normalizeAnswer(a) === normalizeAnswer(answer));
}

export function theoryResult(lesson: Lesson, answers: Record<string, string>, id: string, date: string) {
  return { id, topicId: lesson.topicId, materialVersion: lesson.version, date,
    attempts: lesson.exercises.map(e => ({ exerciseId: e.id, answer: answers[e.id]?.trim() ?? '', correct: checkExercise(e, answers[e.id] ?? '') })) };
}

export function recordTheoryResult(data: Data, result: ReturnType<typeof theoryResult>) {
  if (data.learning.theorySessions.some(s => s.id === result.id)) return;
  data.learning.theorySessions.push(result);
  const topic = data.learning.topics.find(t => t.id === result.topicId);
  if (topic) {
    topic.practiced = true;
    if (!topic.reviewedOn || topic.reviewedOn < result.date) topic.reviewedOn = result.date;
  }
}

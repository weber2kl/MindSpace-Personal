export interface Section { title: string; paragraphs: string[]; table?: string[][] }
export interface Example { en: string; ru: string; why: string }
export interface Exercise { id: string; kind: 'gap' | 'choice' | 'fix' | 'order' | 'translate'; prompt: string; answers: string[]; explanation: string; options?: string[]; selfCheck?: boolean }
export interface Lesson { topicId: string; version: number; intro: string; sections: Section[]; examples: Example[]; exercises: Exercise[]; summary: string[]; mistakes: string[] }
export const section = (title: string, paragraphs: string[], table?: string[][]): Section => ({ title, paragraphs, table });
export const examples = (rows: string[][]): Example[] => rows.map(([en, ru, why]) => ({ en, ru, why }));
export const exercises = (rows: [Exercise['kind'], string, string, string, string[]?][]): Exercise[] => rows.map(([kind, prompt, answer, explanation, options], i) => ({ id: `e${i + 1}`, kind, prompt, answers: answer.split('|'), explanation, options, selfCheck: kind === 'translate' }));

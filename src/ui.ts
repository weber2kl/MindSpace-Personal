import type { Data, DayEntry, Review } from './model';

export type DayTextField = keyof Pick<DayEntry, 'notes' | 'journal' | 'worked' | 'blocked' | 'improve'>;
export type TextUpdate = (...args: ['days', string, DayTextField, string] | ['reviews', string, keyof Review, string]) => void;

export interface PageProps {
  data: Data;
  date: string;
  setDate: (date: string) => void;
  goToDay: (date: string) => void;
  update: (mutate: (draft: Data) => void) => void;
  updateText: TextUpdate;
}

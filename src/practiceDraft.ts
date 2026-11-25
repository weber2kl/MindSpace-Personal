import { createContext, useContext, useLayoutEffect } from 'react';

export const PracticeDraftContext = createContext<(() => () => void) | null>(null);
export const discardPracticeMessage = 'Есть незавершённая тренировка. Выйти без сохранения ответов?';

export function usePracticeDraft(pending: boolean) {
  const register = useContext(PracticeDraftContext);
  useLayoutEffect(() => pending ? register?.() : undefined, [pending, register]);
}

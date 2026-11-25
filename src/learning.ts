import { ENGLISH_ID, id, type Data, type LearningLink, type Task } from './model.ts';

export function learningTaskTitle(data: Data, link: LearningLink) {
  if (link.kind === 'practice') return 'Повторить неправильные глаголы';
  const topic = data.learning.topics.find((item) => item.id === link.id);
  if (!topic) throw new Error('Тема английского больше не доступна.');
  return `Грамматика · ${topic.en}`.slice(0, 300);
}

export function addLearningTask(data: Data, date: string, link: LearningLink, title = learningTaskTitle(data, link)) {
  const task: Task = {
    id: id(), title, date, categoryId: ENGLISH_ID, priority: 'normal', important: false,
    completedOn: null, stageId: null, learning: link,
  };
  data.tasks.push(task);
  return task;
}

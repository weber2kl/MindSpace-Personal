import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, CircleAlert, FileText, GraduationCap, History, Lightbulb, ListPlus, Play } from 'lucide-react';
import { lessons } from './lessons';
import { formatDate, id, today, type LearningTopic } from './model';
import { checkExercise, recordTheoryResult, theoryResult } from './theoryLogic';
import type { PageProps } from './ui';
import type { Lesson } from './lessons/types';
import { usePracticeDraft } from './practiceDraft';
import './theory.css';

type Props = Pick<PageProps, 'data' | 'update' | 'goToDay'> & { topicId?: string; onTopic: (id?: string) => void; onTask: (id: string) => void };
type Result = ReturnType<typeof theoryResult>;
const kindLabels = { gap: 'Заполни пропуск', choice: 'Выбери ответ', fix: 'Исправь ошибку', order: 'Составь предложение', translate: 'Переведи на английский' };
const views = [
  { id: 'summary', label: 'Главное', icon: Lightbulb },
  { id: 'rules', label: 'Правила', icon: BookOpen },
  { id: 'examples', label: 'Примеры', icon: FileText },
  { id: 'practice', label: 'Практика', icon: Play },
] as const;
type View = typeof views[number]['id'];

function score(result: Result) {
  const graded = result.attempts.filter(attempt => attempt.correct !== null);
  return `${graded.filter(attempt => attempt.correct).length} / ${graded.length}`;
}

function PracticeHistory({ history }: { history: Result[] }) {
  return <details className="lesson-history">
    <summary><History size={16} /> История практики <small>{history.length}</small></summary>
    {!history.length && <p className="muted">Пока нет прохождений.</p>}
    {history.map(attempt => <details className="lesson-history-entry" key={attempt.id}>
      <summary>{formatDate(attempt.date)} <span>{score(attempt)}</span></summary>
      <ol>{attempt.attempts.map(answer => <li key={answer.exerciseId}>
        <span lang="en">{answer.answer}</span> · {answer.correct === null ? 'самопроверка' : answer.correct ? 'верно' : 'ошибка'}
      </li>)}</ol>
    </details>)}
  </details>;
}

function LessonPractice({ lesson, data, update }: Pick<Props, 'data' | 'update'> & { lesson: Lesson }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [draft, setDraft] = useState('');
  const submitLock = useRef(false);
  const answerField = useRef<HTMLInputElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const history = data.learning.theorySessions.filter(item => item.topicId === lesson.topicId).reverse();
  const exercise = lesson.exercises[index];
  const given = answers[exercise.id];
  const checked = given !== undefined;
  const correct = checked ? checkExercise(exercise, given) : null;
  const total = lesson.exercises.length;
  const last = index === total - 1;
  usePracticeDraft(!result && (Boolean(draft.trim()) || Object.keys(answers).length > 0));

  useEffect(() => {
    if (checked) nextButton.current?.focus({ preventScroll: true });
    else if (index > 0) answerField.current?.focus({ preventScroll: true });
  }, [index, checked]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checked) {
      const answer = draft.trim();
      if (answer) setAnswers({ ...answers, [exercise.id]: answer });
      return;
    }
    if (!last) {
      setIndex(index + 1);
      setDraft('');
      return;
    }
    if (submitLock.current) return;
    submitLock.current = true;
    const next = theoryResult(lesson, answers, id(), today());
    update(data => recordTheoryResult(data, next));
    setResult(next);
  }

  function restart() {
    setIndex(0);
    setDraft('');
    setAnswers({});
    setResult(null);
    submitLock.current = false;
  }

  return <div className="lesson-content stack">
    {result ? <div className="lesson-result">
      <span className="lesson-icon"><Check size={23} /></span>
      <h3>Практика завершена</h3>
      <strong className="lesson-score">{score(result)}</strong>
      <p className="muted">Верных ответов в заданиях с автоматической проверкой</p>
      <button className="button" type="button" onClick={restart}>Пройти заново</button>
    </div> : <form className="lesson-exercise stack" onSubmit={submit}>
      <div className="lesson-exercise-meta"><span>{kindLabels[exercise.kind]}</span><strong>Задание {index + 1} из {total}</strong></div>
      <progress className="progress" max={total} value={index + Number(checked)} aria-label="Прогресс практики" />
      <h3 id="lesson-question">{exercise.prompt}</h3>
      {exercise.options ? <div className="lesson-options" role="group" aria-labelledby="lesson-question">
        {exercise.options.map(option => <button className="lesson-option" key={option} type="button" disabled={checked}
          aria-pressed={(checked ? given : draft) === option} onClick={() => setDraft(option)}>{option}</button>)}
      </div> : <label className="field">Твой ответ
        <input ref={answerField} aria-labelledby="lesson-question" autoComplete="off" lang="en" maxLength={2000} disabled={checked}
          value={checked ? given : draft} onChange={event => setDraft(event.target.value)} placeholder="Напиши ответ…" />
      </label>}
      {checked && <div className={`lesson-feedback${correct === false ? ' wrong' : ''}`} role="status">
        <strong>{correct === null ? 'Сверь с примером' : correct ? 'Верно' : 'Посмотри правильный ответ'}</strong>
        <p lang="en">{exercise.answers.join(' / ')}</p><p>{exercise.explanation}</p>
      </div>}
      <div className="lesson-actions"><button ref={nextButton} className="button primary" type="submit" disabled={!checked && !draft.trim()}>
        {!checked ? 'Проверить' : last ? 'Сохранить результат' : 'Дальше'} <ArrowRight size={16} />
      </button></div>
    </form>}
    <PracticeHistory history={history} />
  </div>;
}

function RuleTable({ rows }: { rows: string[][] }) {
  return <div className="lesson-table-wrap"><table className="lesson-table">
    <thead><tr>{rows[0].map((cell, index) => <th scope="col" key={index}>{cell}</th>)}</tr></thead>
    <tbody>{rows.slice(1).map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody>
  </table></div>;
}

function Reader({ lesson, topic, data, update, onTask, goToDay, onTopic }: Props & { lesson: Lesson; topic: LearningTopic }) {
  const [view, setView] = useState<View>('summary');
  const [ruleIndex, setRuleIndex] = useState(0);
  const [examplePage, setExamplePage] = useState(0);
  const lessonHead = useRef<HTMLElement>(null);
  const tasks = data.tasks.filter(task => task.learning?.kind === 'topic' && task.learning.id === topic.id);
  const rule = lesson.sections[ruleIndex];
  const examplesPerPage = 3;
  const start = examplePage * examplesPerPage;
  const end = Math.min(start + examplesPerPage, lesson.examples.length);

  useEffect(() => { lessonHead.current?.scrollIntoView({ block: 'nearest' }); }, [topic.id]);

  function open(next: View) {
    setView(next);
    lessonHead.current?.scrollIntoView({ block: 'nearest' });
  }

  return <article className="lesson-reader stack">
    <button className="lesson-back" onClick={() => onTopic(undefined)}><ArrowLeft size={16} /> Все темы</button>
    <header className="lesson-banner" ref={lessonHead}>
      <span className="lesson-icon"><GraduationCap size={26} /></span>
      <div><small>Тема {topic.number} · A2–A2+</small><h2 lang="en">{topic.en}</h2><p>{topic.ru}</p></div>
      <div className="lesson-banner-actions">
        {topic.practiced && <span className="lesson-complete"><Check size={14} /> Практика выполнена</span>}
        <button className="button primary" onClick={() => open('practice')}><Play size={16} /> Начать практику</button>
      </div>
    </header>
    <div className="lesson-tabs" role="group" aria-label="Части урока">{views.map(({ id, label, icon: Icon }) =>
      <button type="button" key={id} aria-pressed={view === id} onClick={() => open(id)}><Icon size={16} />{label}</button>
    )}</div>
    <div className="lesson-layout">
      <div className="lesson-main">
        {view === 'summary' && <section className="lesson-content stack">
          <h3>Что запомнить</h3>
          <div className="lesson-takeaways">{lesson.summary.map(point => <div key={point}><Check size={16} /><p>{point}</p></div>)}</div>
          <details className="lesson-history"><summary>О теме</summary><p>{lesson.intro}</p></details>
          <div className="lesson-caution"><h4><CircleAlert size={17} /> Типичные ошибки</h4><ul>{lesson.mistakes.map(mistake => <li key={mistake}>{mistake}</li>)}</ul></div>
          <div className="lesson-actions"><button className="button" onClick={() => open('rules')}>К правилам <ArrowRight size={16} /></button></div>
        </section>}
        {view === 'rules' && <section className="lesson-content stack">
          <div className="lesson-exercise-meta"><span>Правило {ruleIndex + 1} из {lesson.sections.length}</span></div>
          <h3>{rule.title}</h3>
          {rule.table && <RuleTable rows={rule.table} />}
          {rule.paragraphs.map(paragraph => <p className="lesson-explanation" key={paragraph}>{paragraph}</p>)}
          <div className="lesson-actions"><button className="button" disabled={ruleIndex === 0} onClick={() => setRuleIndex(ruleIndex - 1)}><ArrowLeft size={16} /> Назад</button>
            {ruleIndex + 1 < lesson.sections.length ? <button className="button" onClick={() => setRuleIndex(ruleIndex + 1)}>Следующее правило <ArrowRight size={16} /></button>
              : <button className="button" onClick={() => open('examples')}>К примерам <ArrowRight size={16} /></button>}
          </div>
        </section>}
        {view === 'examples' && <section className="lesson-content stack">
          <div className="lesson-exercise-meta"><h3>Примеры</h3><span>{start + 1}–{end} из {lesson.examples.length}</span></div>
          {lesson.examples.slice(start, end).map(example => <figure className="lesson-example" key={example.en}>
            <blockquote lang="en">{example.en}</blockquote><figcaption>{example.ru}</figcaption><p>{example.why}</p>
          </figure>)}
          <div className="lesson-actions"><button className="button" disabled={examplePage === 0} onClick={() => setExamplePage(examplePage - 1)}><ArrowLeft size={16} /> Назад</button>
            {end < lesson.examples.length ? <button className="button" onClick={() => setExamplePage(examplePage + 1)}>Ещё примеры <ArrowRight size={16} /></button>
              : <button className="button" onClick={() => open('practice')}>К практике <ArrowRight size={16} /></button>}
          </div>
        </section>}
        <div hidden={view !== 'practice'}><LessonPractice lesson={lesson} data={data} update={update} /></div>
      </div>
      <aside className="lesson-side stack">
        <nav className="lesson-outline" aria-label="Оглавление темы"><h3>В этой теме</h3>
          {lesson.sections.map((section, index) => <button className="lesson-outline-item" key={section.title}
            aria-current={view === 'rules' && index === ruleIndex ? 'true' : undefined} onClick={() => { setRuleIndex(index); open('rules'); }}>
            <span>{section.title}</span><ChevronRight size={14} />
          </button>)}
        </nav>
        <details className="lesson-history lesson-personal"><summary><FileText size={16} /> Мои заметки и задачи</summary>
          {topic.reviewedOn && <p className="muted">Последнее повторение · {formatDate(topic.reviewedOn)}</p>}
          <label className="field">Заметки<textarea maxLength={100000} rows={4} value={topic.notes} onChange={event => {
            const value = event.target.value;
            update(draft => {
              const item = draft.learning.topics.find(item => item.id === topic.id);
              if (item) item.notes = value;
            });
          }} /></label>
          <button className="button" onClick={() => onTask(topic.id)}><ListPlus size={16} /> Запланировать изучение</button>
          {tasks.map(task => <button className="lesson-task" key={task.id} onClick={() => goToDay(task.date)}>{task.completedOn ? '✓' : '○'} {task.title} · {formatDate(task.date)}</button>)}
        </details>
      </aside>
    </div>
  </article>;
}

export function Theory(props: Props) {
  const [query, setQuery] = useState('');
  const [unpracticed, setUnpracticed] = useState(false);
  const topic = props.data.learning.topics.find(item => item.id === props.topicId);
  const lesson = lessons.find(item => item.topicId === topic?.id);
  if (topic && lesson) return <Reader key={topic.id} {...props} topic={topic} lesson={lesson} />;

  const topics = props.data.learning.topics.filter(item =>
    `${item.en} ${item.ru}`.toLowerCase().includes(query.trim().toLowerCase()) && (!unpracticed || !item.practiced)
  ).sort((first, second) => first.number - second.number);
  const available = topics.filter(item => lessons.some(lesson => lesson.topicId === item.id));
  const unavailable = topics.filter(item => !available.includes(item));

  return <section className="theory-catalog stack">
    <header className="lesson-banner"><span className="lesson-icon"><GraduationCap size={25} /></span>
      <div><h2>Грамматика A2–A2+</h2><p>Короткие правила, живые примеры и практика</p></div>
    </header>
    <div className="row theory-filters">
      <input type="search" placeholder="Найти тему" aria-label="Поиск по теории" value={query} onChange={event => setQuery(event.target.value)} />
      <label><input type="checkbox" checked={unpracticed} onChange={event => setUnpracticed(event.target.checked)} /> Без выполненной практики</label>
    </div>
    <ul className="lesson-list">{available.map(item => <li key={item.id}>
      <button className="lesson-list-item" onClick={() => props.onTopic(item.id)}>
        <span className="lesson-list-icon">{item.practiced ? <Check size={17} /> : <BookOpen size={17} />}</span>
        <span className="lesson-list-title"><strong lang="en">{item.en}</strong><small>{item.ru}</small></span>
        {item.reviewedOn && <small className="lesson-list-date">Повторение · {formatDate(item.reviewedOn)}</small>}
        <ChevronRight size={17} />
      </button>
    </li>)}</ul>
    {unavailable.length > 0 && <details className="lesson-history"><summary>Темы без уроков <small>{unavailable.length}</small></summary>
      <ul>{unavailable.map(item => <li key={item.id}>{item.en} · {item.ru}</li>)}</ul>
    </details>}
    {topics.length === 0 && <p className="muted">Темы не найдены.</p>}
  </section>;
}

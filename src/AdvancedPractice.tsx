import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ClipboardList, Clock3, History, PencilLine, Timer } from 'lucide-react';
import { advancedSets, type AdvancedSet } from './advancedSets';
import { advancedScore, gradeSet, wordCount } from './advancedGrading';
import { formatDate, id, today, type AdvancedSession } from './model';
import type { PageProps } from './ui';
import { discardPracticeMessage, usePracticeDraft } from './practiceDraft';
import './advanced-practice.css';

const skills = [
  { id: 'grammar', label: 'Грамматика', icon: ClipboardList, description: 'Перефразирование и исправление ошибок без вариантов ответа.' },
  { id: 'reading', label: 'Чтение', icon: BookOpen, description: 'Заголовки, True / False / Not Given и пропуски по тексту.' },
  { id: 'writing', label: 'Письмо', icon: PencilLine, description: 'Эссе и сравнение данных с образцом и самопроверкой.' },
] as const;

const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const findSet = (id: string) => advancedSets.find(set => set.id === id);
type Props = Pick<PageProps, 'data' | 'update'>;
type Run = { set: AdvancedSet; startedAt: number; timed: boolean };

function Passage({ set }: { set: AdvancedSet }) {
  return <section className="advanced-passage" aria-label={set.skill === 'reading' ? 'Текст для чтения' : 'Данные для отчёта'} lang="en" tabIndex={0}>
    {set.passage?.map((paragraph, position) => <p key={paragraph}>{set.skill === 'reading' && <strong>{String.fromCharCode(65 + position)} </strong>}{paragraph}</p>)}
  </section>;
}

function Result({ session, back }: { session: AdvancedSession; back: () => void }) {
  const set = findSet(session.setId);
  const score = advancedScore(session.attempts);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const attempts = onlyErrors ? session.attempts.filter(answer => answer.correct === false) : session.attempts;

  return <section className="panel advanced-workspace stack">
    <div className="advanced-header"><div><small>Разбор · {formatDate(session.date)} · {formatClock(session.elapsedSeconds)}{session.timed && set && session.elapsedSeconds >= set.minutes * 60 ? ' · Время вышло' : ''}</small>
      <h2>{set?.title ?? 'Тренировка'}</h2></div><button className="button" onClick={back}><ArrowLeft size={16} /> К наборам</button></div>
    <div className="advanced-result-band">
      <div><span>{score.total ? 'Верных ответов' : 'Ответ сохранён'}</span><strong>{score.total ? `${score.correct} / ${score.total}` : `${wordCount(session.attempts[0].answer)} слов`}</strong></div>
      {score.total > 0 && <label><input type="checkbox" checked={onlyErrors} onChange={event => setOnlyErrors(event.target.checked)} /> Только ошибки и пропуски</label>}
    </div>
    {set?.passage && <details className="lesson-history"><summary>{set.skill === 'reading' ? 'Свериться с текстом' : 'Показать данные'}</summary><Passage set={set} /></details>}
    {set?.checklist && <div className="advanced-checklist"><h3>Проверь свою работу</h3>{set.checklist.map(item => <label key={item}><input type="checkbox" />{item}</label>)}</div>}
    {attempts.length === 0 && <p className="muted">Все ответы верны.</p>}
    {attempts.map(attempt => {
      const question = set?.questions.find(item => item.id === attempt.questionId);
      const number = session.attempts.indexOf(attempt) + 1;
      const status = attempt.correct === null ? 'Самопроверка' : attempt.correct ? 'Верно' : attempt.answer ? 'Ошибка' : 'Пропуск';
      return <article className="advanced-review" key={attempt.questionId}>
        <header><small>Задание {number}</small><span className={attempt.correct === true ? 'practice-ok' : attempt.correct === false ? 'practice-error' : 'muted'}>{status}</span></header>
        {question && <h3 lang="en">{question.prompt}</h3>}
        <div><small>Твой ответ</small><p className="advanced-response" lang="en">{attempt.answer || 'Нет ответа'}</p></div>
        {question && <div className="advanced-key"><small>{score.total ? 'Правильный ответ' : 'Образец'}</small>
          {question.answers.length > 0 && <strong lang="en">{question.answers.join(' / ')}</strong>}
          <p lang={score.total ? 'ru' : 'en'}>{question.explanation}</p></div>}
      </article>;
    })}
  </section>;
}

function Exam({ run, save, close }: { run: Run; save: (session: AdvancedSession) => void; close: () => void }) {
  const { set, startedAt, timed } = run;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [elapsed, setElapsed] = useState(0);
  const answerRef = useRef(answers);
  const submitted = useRef(false);
  const question = set.questions[index];
  const answer = answers[question.id] ?? '';
  const limit = set.minutes * 60;
  const answered = Object.values(answers).filter(value => value.trim()).length;
  const remaining = Math.max(0, limit - elapsed);
  usePracticeDraft(answered > 0);

  const submit = useCallback(() => {
    if (submitted.current) return;
    submitted.current = true;
    const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    save(gradeSet(set, answerRef.current, { id: id(), date: today(), timed, elapsedSeconds: timed ? Math.min(limit, seconds) : seconds }));
  }, [save, set, startedAt, timed, limit]);

  useEffect(() => {
    const tick = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      setElapsed(seconds);
      if (timed && seconds >= limit) submit();
    };
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [startedAt, limit, timed, submit]);

  function change(value: string) {
    if (timed && Date.now() - startedAt >= limit * 1000) {
      submit();
      return;
    }
    const next = { ...answerRef.current, [question.id]: value };
    answerRef.current = next;
    setAnswers(next);
  }

  function finish() {
    const missing = set.questions.length - answered;
    if (missing && !window.confirm(`Без ответа: ${missing}. Завершить тренировку?`)) return;
    submit();
  }

  return <section className="panel advanced-workspace stack">
    <div className="advanced-header"><div><small>{set.level} · {timed ? 'На время' : 'Свободная практика'}</small><h2>{set.title}</h2></div>
      <div className="row"><span className={`advanced-clock${timed && remaining <= 60 ? ' urgent' : ''}`} aria-label={timed ? 'Осталось времени' : 'Прошло времени'}><Clock3 size={16} /> {formatClock(timed ? remaining : elapsed)}</span>
        <button className="button" onClick={() => { if (!answered || window.confirm(discardPracticeMessage)) close(); }}>Выйти</button></div>
    </div>
    <div className={`advanced-exam${set.passage ? ' split' : ''}`}>
      {set.passage && <Passage set={set} />}
      <div className="advanced-question stack">
        <div className="advanced-question-meta"><small>{question.instruction}</small><strong>{index + 1} / {set.questions.length}</strong></div>
        <h3 id="advanced-question" lang="en">{question.prompt}</h3>
        {question.options ? <div className="lesson-options" role="group" aria-labelledby="advanced-question">
          {question.options.map(option => <button key={option} className="lesson-option" aria-pressed={answer === option} onClick={() => change(option)}>{option}</button>)}
        </div> : set.skill === 'writing' ? <div className="stack">
          <textarea aria-label="Твой ответ" lang="en" rows={10} maxLength={12000} value={answer} onChange={event => change(event.target.value)} />
          <small>Слов · {wordCount(answer)}</small>
        </div> : <label className="field">Твой ответ<input lang="en" autoComplete="off" maxLength={2000} value={answer} onChange={event => change(event.target.value)} /></label>}
        {question.wordLimit && wordCount(answer) > question.wordLimit && <small className="practice-error">Ответ превышает лимит слов.</small>}
        <div className="advanced-question-nav">
          <button className="button" disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft size={16} /> Назад</button>
          {index < set.questions.length - 1 && <button className="button" onClick={() => setIndex(index + 1)}>Дальше <ArrowRight size={16} /></button>}
        </div>
      </div>
    </div>
    <footer className="advanced-header">
      <nav className="advanced-number-nav" aria-label="Вопросы">{set.questions.map((item, position) =>
        <button key={item.id} type="button" className="button" aria-current={index === position ? 'step' : undefined}
          data-answered={Boolean(answers[item.id]?.trim())} aria-label={`Задание ${position + 1}`} onClick={() => setIndex(position)}>{position + 1}</button>
      )}</nav>
      <button className="button primary" disabled={set.skill === 'writing' && !answered} onClick={finish}><Check size={16} /> Завершить и разобрать</button>
    </footer>
  </section>;
}

export function AdvancedPractice({ data, update }: Props) {
  const [timed, setTimed] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [selected, setSelected] = useState<AdvancedSession | null>(null);
  const history = (data.learning.advancedSessions ?? []).slice().reverse();
  const save = useCallback((session: AdvancedSession) => {
    update(draft => { (draft.learning.advancedSessions ??= []).push(session); });
    setRun(null);
    setSelected(session);
  }, [update]);

  if (selected) return <Result key={selected.id} session={selected} back={() => setSelected(null)} />;
  if (run) return <Exam run={run} save={save} close={() => setRun(null)} />;

  return <div className="stack">
    <header className="panel advanced-mode"><div><h2>Практика B1–B2</h2><p className="muted">Выбери набор. Разбор откроется после сдачи.</p></div>
      <div className="segmented" aria-label="Режим тренировки"><button aria-pressed={!timed} onClick={() => setTimed(false)}>Без лимита</button>
        <button aria-pressed={timed} onClick={() => setTimed(true)}>На время</button></div>
    </header>
    <div className="advanced-catalog">{skills.map(({ id, label, icon: Icon, description }) => <section className="panel advanced-skill" key={id}>
      <header><span className="advanced-icon"><Icon size={20} /></span><h2>{label}</h2></header><p className="muted">{description}</p>
      {advancedSets.filter(set => set.skill === id).map(set => <button key={set.id} className="advanced-set" onClick={() => setRun({ set, timed, startedAt: Date.now() })}>
        <span><strong>{set.title}</strong><small>{set.level} · {set.questions.length === 1 ? '1 задание' : `${set.questions.length} заданий`}{timed ? ` · ${set.minutes} мин` : ''}</small></span>
        {timed ? <Timer size={17} /> : <ArrowRight size={17} />}
      </button>)}
    </section>)}</div>
    <section className="panel advanced-workspace stack"><h2 className="advanced-history-title"><History size={17} /> История сложной практики</h2>
      {history.length ? history.map(session => {
        const score = advancedScore(session.attempts);
        return <button className="advanced-set" key={session.id} onClick={() => setSelected(session)}><span>
          <strong>{findSet(session.setId)?.title ?? 'Тренировка'}</strong><small>{formatDate(session.date)} · {session.timed ? 'На время' : 'Без лимита'}</small></span>
          <span>{score.total ? `${score.correct} / ${score.total}` : 'Самопроверка'}</span></button>;
      }) : <p className="muted">Здесь появятся завершённые попытки.</p>}
    </section>
  </div>;
}

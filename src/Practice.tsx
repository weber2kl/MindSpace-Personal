import { useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CalendarPlus, Check, CircleHelp, History, RotateCcw, X } from 'lucide-react';
import { formatDate, id, today, type Data, type LearningVerb, type PracticeAttempt, type PracticeSession } from './model';
import {
  checkPracticeAnswer, latestPracticeErrors, practicePool, practiceQueue, practiceStats, recordPracticeSession,
  type PracticeCount, type PracticeScope,
} from './practiceLogic';
import type { PageProps } from './ui';
import { discardPracticeMessage, usePracticeDraft } from './practiceDraft';
import './practice.css';

const longDate: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
const counts: PracticeCount[] = [5, 10, 20, 'all'];
const historyPageSize = 8;

interface Round {
  id: string;
  queue: LearningVerb[];
  attempts: PracticeAttempt[];
  index: number;
  taskId?: string;
}

interface PracticeProps {
  data: Data;
  update: PageProps['update'];
  sessionId?: string;
  sourceTaskId?: string;
  onSession: (id: string | undefined) => void;
  onTask: (sessionId: string | null) => void;
}

function AnswerDetails({ attempt }: { attempt: PracticeAttempt }) {
  return <div className="practice-answer-grid">
    {([
      ['V2', attempt.correct2, attempt.answer2, attempt.v2],
      ['V3', attempt.correct3, attempt.answer3, attempt.v3],
    ] as const).map(([form, correct, answer, expected]) => <div className="practice-answer" key={form}>
      <strong className={correct ? 'practice-ok' : 'practice-error'}>
        {correct ? <Check size={15} /> : <X size={15} />}{form} · {correct ? 'Верно' : 'Ошибка'}
      </strong>
      <dl><dt>Ваш ответ</dt><dd lang="en">{answer || '—'}</dd><dt>Допустимые формы</dt><dd lang="en">{expected}</dd></dl>
    </div>)}
  </div>;
}

function Question({ check }: { check: (answer2: string, answer3: string) => void }) {
  const [answer2, setAnswer2] = useState('');
  const [answer3, setAnswer3] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (answer2.trim() || answer3.trim()) check(answer2, answer3);
  }
  return <form className="stack" onSubmit={submit}>
    <div className="practice-answer-grid">
      <label className="field">V2 · Past Simple<input autoFocus lang="en" autoComplete="off" spellCheck={false} maxLength={120} value={answer2} onChange={(event) => setAnswer2(event.currentTarget.value)} /></label>
      <label className="field">V3 · Past Participle<input lang="en" autoComplete="off" spellCheck={false} maxLength={120} value={answer3} onChange={(event) => setAnswer3(event.currentTarget.value)} /></label>
    </div>
    <div className="row">
      <button className="button primary" type="submit" disabled={!answer2.trim() && !answer3.trim()}><Check size={16} /> Проверить</button>
      <button className="button" type="button" onClick={() => check(answer2, answer3)}>Показать ответ</button>
    </div>
  </form>;
}

function Exercise({ round, onCheck, onNext, onCancel }: { round: Round; onCheck: (answer2: string, answer3: string) => void; onNext: () => void; onCancel: () => void }) {
  const verb = round.queue[round.index];
  const feedback = round.attempts[round.index];
  const last = round.index === round.queue.length - 1;
  return <section className="panel practice-panel practice-exercise stack" aria-labelledby="practice-exercise-heading">
    <header className="practice-heading">
      <div><h2 id="practice-exercise-heading">Вспомни формы</h2><p className="muted">Слово {round.index + 1} из {round.queue.length} · Группа {verb.group}</p></div>
      {!last || !feedback ? <button className="button" type="button" onClick={onCancel}>Выйти из тренировки</button> : null}
    </header>
    <progress className="progress" value={round.attempts.length} max={round.queue.length} aria-label="Проверено слов" />
    <p className="practice-prompt"><strong lang="en">{verb.v1}</strong><span>{verb.ru}</span></p>
    {feedback ? <div className="stack" aria-live="polite">
      <AnswerDetails attempt={feedback} />
      <button className="button primary practice-start" type="button" autoFocus onClick={onNext}>{last ? 'К результатам' : 'Следующее слово'} <ArrowRight size={16} /></button>
    </div> : <Question key={round.index} check={onCheck} />}
  </section>;
}

function SessionResult({ session, onBack, onRetry, onTask }: { session: PracticeSession; onBack: () => void; onRetry?: () => void; onTask: () => void }) {
  const stats = practiceStats(session.attempts);
  const errors = session.attempts.filter((attempt) => !attempt.correct2 || !attempt.correct3);
  const correct = session.attempts.filter((attempt) => attempt.correct2 && attempt.correct3);
  return <section className="panel practice-panel stack" aria-labelledby="practice-result-heading">
    <header className="practice-heading">
      <div><h2 id="practice-result-heading">Результат тренировки</h2><p className="muted">{formatDate(session.date, longDate)}</p></div>
      <button className="button" type="button" onClick={onBack}><ArrowLeft size={16} /> К тренировкам</button>
    </header>
    <div className="practice-metrics">
      <div><strong>{stats.total}</strong><span>Проверено слов</span></div>
      <div><strong className="practice-ok">{stats.correct}</strong><span>Полностью верно</span></div>
      <div><strong className={stats.wrong ? 'practice-error' : undefined}>{stats.wrong}</strong><span>С ошибками</span></div>
      <div><strong>{stats.accuracy}%</strong><span>Точность</span></div>
    </div>
    <div className="row">
      {onRetry && <button className="button primary" type="button" onClick={onRetry}><RotateCcw size={16} /> Повторить ошибки</button>}
      <button className="button" type="button" onClick={onTask}><CalendarPlus size={16} /> Создать задачу по тренировке</button>
    </div>
    {errors.length ? <div className="stack">
      <h3>Ошибки для повторения</h3>
      {errors.map((attempt) => <article className="practice-attempt stack" key={attempt.verbId}>
        <p><strong lang="en">{attempt.v1}</strong> · {attempt.ru}</p>
        <AnswerDetails attempt={attempt} />
      </article>)}
    </div> : <p className="practice-ok practice-result-ok"><Check size={16} /> Обе формы верны у каждого слова.</p>}
    {correct.length > 0 && <details className="practice-correct-list"><summary>Правильные ответы · {correct.length}</summary>
      <ul>{correct.map((attempt) => <li key={attempt.verbId}><strong lang="en">{attempt.v1}</strong><span lang="en">{attempt.answer2} · {attempt.answer3}</span></li>)}</ul>
    </details>}
  </section>;
}

export function Practice({ data, update, sessionId, sourceTaskId, onSession, onTask }: PracticeProps) {
  const { verbs, sessions } = data.learning;
  const [groups, setGroups] = useState<Set<number> | null>(null);
  const [scope, setScope] = useState<PracticeScope>('all');
  const [count, setCount] = useState<PracticeCount>(10);
  const [shuffle, setShuffle] = useState(true);
  const [round, setRound] = useState<Round | null>(null);
  const unfinished = !!round && round.attempts.length < round.queue.length;
  usePracticeDraft(unfinished);
  const [historyLimit, setHistoryLimit] = useState(historyPageSize);
  const errors = useMemo(() => latestPracticeErrors(sessions), [sessions]);
  const allGroups = [...new Set(verbs.map((verb) => verb.group))].sort((a, b) => a - b);
  const pool = practicePool(verbs, groups, scope, errors);
  const matchingErrors = verbs.filter((verb) => errors.has(verb.id));
  const selected = sessions.find((session) => session.id === sessionId);
  const recent = sessions.slice(-historyLimit).reverse();
  const lastSuccess = [...sessions].reverse().find((session) => session.attempts.every((attempt) => attempt.correct2 && attempt.correct3));

  function start(queue: LearningVerb[], taskId?: string) {
    if (!queue.length) return;
    onSession(undefined);
    setRound({ id: id(), queue, attempts: [], index: 0, taskId });
  }

  if (round) return <Exercise round={round} onCheck={(answer2, answer3) => {
    if (round.attempts.length !== round.index) return;
    const attempts = [...round.attempts, checkPracticeAnswer(round.queue[round.index], answer2, answer3)];
    if (attempts.length === round.queue.length) {
      const session = { id: round.id, date: today(), attempts };
      update((draft) => recordPracticeSession(draft, session, round.taskId));
    }
    setRound({ ...round, attempts });
  }} onNext={() => {
    if (round.index === round.queue.length - 1) {
      setRound(null);
      onSession(round.id);
    } else setRound({ ...round, index: round.index + 1 });
  }} onCancel={() => {
    if (window.confirm(discardPracticeMessage)) setRound(null);
  }} />;

  if (selected) {
    const retry = practicePool(verbs, null, 'errors', latestPracticeErrors([selected]));
    return <SessionResult session={selected} onBack={() => onSession(undefined)} onTask={() => onTask(selected.id)}
      onRetry={retry.length ? () => start(practiceQueue(retry, 'all', shuffle), sourceTaskId) : undefined} />;
  }

  return <div className="practice-layout">
    <section className="panel practice-panel stack" aria-labelledby="practice-start-heading">
      <header className="practice-heading"><h2 id="practice-start-heading"><CircleHelp size={18} /> Вспомни формы</h2>
        <button className="button" type="button" onClick={() => onTask(null)}><CalendarPlus size={16} /> Запланировать повторение</button></header>
      <fieldset className="practice-fieldset">
        <legend>Группы</legend>
        <div className="row">
          <button className="button" type="button" aria-pressed={groups === null} onClick={() => setGroups(null)}>Все группы</button>
          {allGroups.map((group) => <button className="button practice-group" type="button" aria-label={`Группа ${group}`} key={group} aria-pressed={groups?.has(group) ?? false} onClick={() => {
            const next = new Set(groups ?? []);
            if (next.has(group)) next.delete(group);
            else next.add(group);
            setGroups(next.size === allGroups.length ? null : next);
          }}>{group}</button>)}
        </div>
      </fieldset>
      <div className="practice-options">
        <label className="field">Слова<select value={scope} onChange={(event) => setScope(event.currentTarget.value as PracticeScope)}>
          <option value="all">Все слова</option><option value="hard">Только трудные</option><option value="errors">Только с ошибками</option>
        </select></label>
        <label className="field">Вопросов<select value={count} onChange={(event) => {
          const next = event.currentTarget.value;
          setCount(next === 'all' ? next : Number(next) as PracticeCount);
        }}>{counts.map((item) => <option value={item} key={item}>{item === 'all' ? 'Все доступные' : item}</option>)}</select></label>
      </div>
      <label className="practice-check"><input type="checkbox" checked={shuffle} onChange={(event) => setShuffle(event.currentTarget.checked)} /> Перемешать слова</label>
      <div className="practice-heading">
        <button className="button primary" type="button" disabled={!pool.length} onClick={() => start(practiceQueue(pool, count, shuffle), sourceTaskId)}>Начать тренировку <ArrowRight size={16} /></button>
        <small role="status">{pool.length ? `Вопросов · ${count === 'all' ? pool.length : Math.min(count, pool.length)}` : 'По этим условиям слов нет.'}</small>
      </div>
    </section>
    <section className="panel practice-panel stack" aria-labelledby="practice-review-heading">
      <h2 id="practice-review-heading"><RotateCcw size={17} /> Повторение</h2>
      <dl className="practice-summary"><dt>Трудных слов</dt><dd>{verbs.filter((verb) => verb.hard).length}</dd>
        <dt>С последней ошибкой</dt><dd>{matchingErrors.length}</dd>
        <dt>Последняя тренировка без ошибок</dt><dd>{lastSuccess ? formatDate(lastSuccess.date, longDate) : '—'}</dd></dl>
      {matchingErrors.length > 0 && <details className="practice-correct-list"><summary>Слова с ошибками</summary><ul>
        {matchingErrors.map((verb) => <li key={verb.id}><strong lang="en">{verb.v1}</strong><span>{verb.ru}</span></li>)}
      </ul></details>}
      <button className="button practice-start" type="button" disabled={!matchingErrors.length} onClick={() => start(practiceQueue(matchingErrors, 'all', shuffle), sourceTaskId)}><RotateCcw size={15} /> Повторить ошибки</button>
    </section>
    <section className="panel practice-panel practice-history stack" aria-labelledby="practice-history-heading">
      <h2 id="practice-history-heading"><History size={17} /> История тренировок</h2>
      {recent.length === 0 ? <p className="empty">Здесь появятся результаты завершённых тренировок.</p> : <div className="practice-history-list">
        {recent.map((session) => {
          const { correct, total, accuracy } = practiceStats(session.attempts);
          return <button key={session.id} className="practice-history-item" type="button" onClick={() => onSession(session.id)}>
            <strong>{formatDate(session.date, longDate)}</strong><span>{correct} из {total} правильно · {accuracy}%</span><ArrowRight size={16} />
          </button>;
        })}
      </div>}
      {sessions.length > recent.length && <button className="button practice-start" type="button" onClick={() => setHistoryLimit(historyLimit + historyPageSize)}>Показать ещё</button>}
    </section>
  </div>;
}

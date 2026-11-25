import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChartNoAxesColumn, Clock3, List, Plus, RotateCcw } from 'lucide-react';
import { timeGoalProgress, timeTotals } from './analytics';
import { Grammar, Verbs } from './Curriculum';
import { Practice } from './Practice';
import { AdvancedPractice } from './AdvancedPractice';
import { Theory } from './Theory';
import { latestPracticeErrors, practiceStats } from './practiceLogic';
import { addLearningTask, learningTaskTitle } from './learning';
import { ENGLISH_ID, formatDate, formatMinutes, isDate, monthEnd, monthStart, today, type Data, type LearningLink } from './model';
import type { PageProps } from './ui';
import './english.css';

const sections = [
  { id: 'theory', label: 'Теория', icon: BookOpen },
  { id: 'grammar', label: 'Грамматика', icon: BookOpen },
  { id: 'verbs', label: 'Неправильные глаголы', icon: List },
  { id: 'practice', label: 'Практика и повторение', icon: RotateCcw },
  { id: 'progress', label: 'Прогресс', icon: ChartNoAxesColumn },
] as const;

type EnglishTab = typeof sections[number]['id'];
export type EnglishRoute = { tab: EnglishTab; topicId?: string; sessionId?: string; sourceTaskId?: string; practiceMode?: 'advanced' | 'verbs' };

function EnglishProgress({ data, openPractice }: { data: Data; openPractice: (id: string) => void }) {
  const { topics, verbs, sessions } = data.learning;
  const ordered = [...sessions].reverse().sort((a, b) => b.date.localeCompare(a.date));
  const recent = ordered.slice(0, 5);
  const latest = ordered[0];
  const accuracy = recent.length ? Math.round(recent.reduce((sum, session) => {
    const { correct, total } = practiceStats(session.attempts);
    return sum + correct / total;
  }, 0) * 100 / recent.length) : null;
  const errors = latestPracticeErrors(sessions);
  const topicCount = topics.filter((item) => item.status === 'mastered').length;
  const practiced = topics.filter((item) => item.practiced).length;
  const verbCount = verbs.filter((item) => item.status === 'mastered').length;
  const reviewCount = verbs.filter((item) => item.hard || item.status === 'review' || errors.has(item.id)).length;
  const month = monthStart(today());
  const minutes = timeTotals(data, month, monthEnd(month)).minutes.get(ENGLISH_ID) ?? 0;
  const target = data.timeGoals.find((item) => item.month === month && item.categoryId === ENGLISH_ID);
  const targetProgress = target ? timeGoalProgress(minutes, target.minutes) : null;

  return <div className="stack">
    <div className="english-progress-grid">
      <section className="panel english-progress-card">
        <h2><BookOpen size={17} /> Грамматика</h2>
        <div className="english-metric"><span>Освоено тем</span><strong>{topicCount} / {topics.length}</strong></div>
        <progress className="progress" aria-label="Освоено тем грамматики" max={topics.length || 1} value={topicCount} />
        <div className="english-metric"><span>Практика выполнена</span><strong>{practiced} / {topics.length}</strong></div>
        <progress className="progress" aria-label="Практика по грамматике" max={topics.length || 1} value={practiced} />
      </section>
      <section className="panel english-progress-card">
        <h2><List size={17} /> Неправильные глаголы</h2>
        <div className="english-metric"><span>Освоено слов</span><strong>{verbCount} / {verbs.length}</strong></div>
        <progress className="progress" aria-label="Освоено глаголов" max={verbs.length || 1} value={verbCount} />
        <div className="english-metric"><span>Слов на повторение</span><strong>{reviewCount}</strong></div>
      </section>
      <section className="panel english-progress-card">
        <h2><RotateCcw size={17} /> Тренировки</h2>
        <div className="english-metric"><span>Последняя тренировка</span>{latest ? <button type="button" className="button" onClick={() => openPractice(latest.id)}>{formatDate(latest.date)}</button> : <strong>—</strong>}</div>
        <div className="english-metric"><span>Средняя точность{recent.length > 0 ? ` · последних ${recent.length}` : ''}</span><strong>{accuracy === null ? '—' : `${accuracy}%`}</strong></div>
      </section>
      <section className="panel english-progress-card">
        <h2><Clock3 size={17} /> Время за месяц</h2>
        <div className="english-metric"><span>Записано в ежедневнике</span><strong>{formatMinutes(minutes)}</strong></div>
        {target && targetProgress ? <>
          <div className="english-metric"><span>Цель {formatMinutes(target.minutes)}</span><strong>{targetProgress.percent.toLocaleString('ru-RU')}%</strong></div>
          <progress className="progress" aria-label="Месячная цель английского" max={target.minutes} value={Math.min(minutes, target.minutes)} />
          <small>{targetProgress.surplus > 0 ? `Сверх цели ${formatMinutes(targetProgress.surplus)}` : targetProgress.remaining > 0 ? `Осталось ${formatMinutes(targetProgress.remaining)}` : 'Цель выполнена'}</small>
        </> : <small>Цель по часам можно задать в плане на месяц.</small>}
      </section>
    </div>
  </div>;
}

function ScheduleLearning({ data, link, defaultDate, close, schedule }: {
  data: Data; link: LearningLink; defaultDate: string; close: () => void; schedule: (date: string, title: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="panel restore-dialog" aria-label="Учебная задача" onClose={close}>
    <h2>Добавить в ежедневник</h2>
    <form className="english-schedule" onSubmit={(event) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      const date = String(values.get('date'));
      const title = String(values.get('title')).trim();
      if (isDate(date) && title) schedule(date, title);
    }}>
      <label className="field">Название задачи<input name="title" maxLength={300} required pattern=".*\S.*" defaultValue={learningTaskTitle(data, link)} /></label>
      <label className="field">Дата задачи<input name="date" type="date" min="1000-01-01" max="9999-12-31" defaultValue={defaultDate} required /></label>
      <small>Время этой задачи учитывается в категории «Английский».</small>
      <div className="row dialog-actions"><button type="button" className="button" onClick={() => dialog.current?.close()}>Отмена</button><button className="button primary" type="submit"><Plus size={16} /> Создать задачу</button></div>
    </form>
  </dialog>;
}

export function English({ data, date, update, goToDay, route, onRoute, canLeavePractice }: Omit<PageProps, 'goToDay'> & {
  route: EnglishRoute; onRoute: (route: EnglishRoute) => void;
  goToDay: (date: string) => boolean; canLeavePractice: () => boolean;
}) {
  const [schedule, setSchedule] = useState<LearningLink | null>(null);
  const { tab } = route;
  const practiceMode = route.practiceMode ?? (route.sessionId || route.sourceTaskId ? 'verbs' : 'advanced');
  const counts = useMemo(() => ({ mastered: data.learning.topics.filter((item) => item.status === 'mastered').length,
    practiced: data.learning.topics.filter((item) => item.practiced).length }), [data.learning.topics]);
  function navigate(next: EnglishRoute) {
    if (canLeavePractice()) onRoute(next);
  }
  return <div className="screen english-screen stack">
    <header className="screen-heading"><h1>Английский</h1><p>{counts.mastered} из {data.learning.topics.length} тем освоено · практика по {counts.practiced} темам</p></header>
    <div className="row english-tabs" role="group" aria-label="Разделы английского">
      {sections.map(({ id, label, icon: Icon }) => <button type="button" className={`button${tab === id ? ' primary' : ''}`} aria-pressed={tab === id} key={id} onClick={() => {
        if (tab !== id) navigate({ tab: id });
      }}><Icon size={16} />{label}</button>)}
    </div>
    {tab === 'grammar' && <Grammar data={data} update={update} topicId={route.topicId} onTopic={(topicId) => onRoute({ tab, topicId })}
      onTheory={topicId => onRoute({ tab: 'theory', topicId })}
      onTask={(topic) => setSchedule({ kind: 'topic', id: topic.id })} />}
    {tab === 'theory' && <Theory data={data} update={update} topicId={route.topicId} onTopic={topicId => navigate({ tab, topicId })} onTask={id => setSchedule({ kind: 'topic', id })} goToDay={goToDay} />}
    {tab === 'verbs' && <Verbs data={data} update={update} />}
    {tab === 'practice' && <>
      <div className="segmented english-practice-modes" aria-label="Вид практики">
        <button aria-pressed={practiceMode === 'advanced'} onClick={() => {
          if (practiceMode !== 'advanced') navigate({ tab, practiceMode: 'advanced' });
        }}>Сложные задания</button>
        <button aria-pressed={practiceMode === 'verbs'} onClick={() => {
          if (practiceMode !== 'verbs') navigate({ tab, practiceMode: 'verbs' });
        }}>Тренажёр глаголов</button>
      </div>
      {practiceMode === 'advanced' ? <AdvancedPractice data={data} update={update} />
        : <Practice key={route.sourceTaskId ?? 'practice'} data={data} update={update} sessionId={route.sessionId}
          sourceTaskId={route.sourceTaskId} onSession={(sessionId) => onRoute({ ...route, practiceMode: 'verbs', sessionId })}
          onTask={(sessionId) => setSchedule({ kind: 'practice', sessionId })} />}
    </>}
    {tab === 'progress' && <EnglishProgress data={data} openPractice={(sessionId) => onRoute({ tab: 'practice', sessionId })} />}
    {schedule && <ScheduleLearning data={data} link={schedule} defaultDate={date} close={() => setSchedule(null)} schedule={(when, title) => {
      if (!goToDay(when)) return;
      update((draft) => { addLearningTask(draft, when, schedule, title); });
      setSchedule(null);
    }} />}
  </div>;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, BarChart3, BookOpen, CalendarDays, CalendarRange, Check, ChevronRight, CircleDot, ClipboardList, House, Lightbulb, LoaderCircle, Orbit, Plus, Settings2, Target } from 'lucide-react';
import { Day } from './Day';
import { Goals, Ideas, Month, Week } from './Plans';
import { Reports, Statistics } from './Reports';
import { Settings } from './Settings';
import { English, type EnglishRoute } from './English';
import { TaskTimer } from './TaskTimer';
import { lessons } from './lessons';
import { formatDate, isDate, today, type Task } from './model';
import { discardPending, dismissError, load, retry, update, updateText, useStorage } from './storage';
import { discardPracticeMessage, PracticeDraftContext } from './practiceDraft';

const navigation = [
  { id: 'day', label: 'Сегодня', icon: House, component: Day },
  { id: 'week', label: 'Неделя', icon: CalendarRange, component: Week },
  { id: 'month', label: 'Месяц', icon: CalendarDays, component: Month },
  { id: 'goals', label: 'Большие цели', icon: Target, component: Goals },
  { id: 'ideas', label: 'Идеи', icon: Lightbulb, component: Ideas },
  { id: 'english', label: 'Английский', icon: BookOpen, component: null },
  { id: 'reports', label: 'Итоги', icon: ClipboardList, component: Reports },
  { id: 'statistics', label: 'Статистика', icon: BarChart3, component: Statistics },
  { id: 'settings', label: 'Настройки', icon: Settings2, component: Settings },
] as const;
type Page = typeof navigation[number]['id'];

export default function App() {
  const storage = useStorage();
  const [page, setPage] = useState<Page>('day');
  const [date, setSelectedDate] = useState(today);
  const [now, setNow] = useState(today);
  const [english, setEnglish] = useState<EnglishRoute>({ tab: 'theory' });
  const main = useRef<HTMLElement>(null);
  const quickPending = useRef(false);
  const practiceDrafts = useRef(0);
  const registerPracticeDraft = useCallback(() => {
    practiceDrafts.current += 1;
    return () => { practiceDrafts.current -= 1; };
  }, []);
  const canLeavePractice = () => practiceDrafts.current === 0 || window.confirm(discardPracticeMessage);
  const setDate = (value: string) => { if (isDate(value)) setSelectedDate(value); };
  const goToDay = (value: string) => {
    if (!canLeavePractice()) return false;
    setDate(value);
    setPage('day');
    main.current?.scrollTo(0, 0);
    return true;
  };
  const openLearning = (task: Task) => {
    if (!task.learning) return;
    if (task.learning.kind === 'topic') {
      const topicId = task.learning.id;
      setEnglish({ tab: lessons.some(l => l.topicId === topicId) ? 'theory' : 'grammar', topicId });
    }
    else if (task.learning.sessionId) setEnglish({ tab: 'practice', sessionId: task.learning.sessionId });
    else setEnglish({ tab: 'practice', sourceTaskId: task.id });
    setPage('english');
  };
  const quickTask = () => {
    const input = document.getElementById('quick-task');
    if (input) input.focus();
    else if (canLeavePractice()) { quickPending.current = true; setPage('day'); }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(today()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    main.current?.scrollTo(0, 0);
    if (page === 'day' && quickPending.current) {
      quickPending.current = false;
      document.getElementById('quick-task')?.focus();
    }
  }, [page]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && (event.code === 'KeyN' || event.key.toLowerCase() === 'n') && !document.querySelector('dialog[open], main[inert]')) {
        event.preventDefault();
        quickTask();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  if (!storage.data) {
    return <div className="loading"><div className="brand-mark"><Orbit size={25} /></div><h1>MindSpace Personal</h1>
      <p role="status">{storage.error || 'Открываем дневник…'}</p>
      {storage.error && <button className="button primary" onClick={() => void load()}>Повторить</button>}
    </div>;
  }

  const selected = navigation.find((item) => item.id === page)!;
  const Screen = selected.component;
  const props = { data: storage.data, date, setDate, goToDay, update, updateText };
  const renderNav = (items: readonly (typeof navigation)[number][]) => items.map(({ id, label, icon: Icon }) => (
    <button className="navigation-item" key={id} aria-current={page === id ? 'page' : undefined} title={label} onClick={() => {
      if (id === 'day') goToDay(now);
      else if (id !== page && canLeavePractice()) {
        if (id === 'english') setEnglish({ tab: 'theory' });
        setPage(id);
      }
    }}>
      <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{page === id && <ChevronRight className="nav-arrow" size={14} />}
    </button>
  ));
  return (
    <PracticeDraftContext.Provider value={registerPracticeDraft}><div className="app-shell">
      <aside className="sidebar" inert={storage.busy}>
        <button className="brand" onClick={() => goToDay(now)} aria-label="MindSpace Personal — сегодня">
          <span className="brand-mark"><Orbit size={22} strokeWidth={1.75} /></span>
          <span className="brand-text"><strong>MindSpace</strong><small>Personal</small></span>
        </button>
        <nav className="navigation" aria-label="Разделы дневника">
          <div className="nav-group"><div className="nav-label">Планирование</div>{renderNav(navigation.slice(0, 3))}</div>
          <div className="nav-group"><div className="nav-label">Личное</div>{renderNav(navigation.slice(3, 6))}</div>
          <div className="nav-group"><div className="nav-label">Обзор</div>{renderNav(navigation.slice(6, 8))}</div>
        </nav>
        <div className="sidebar-bottom">
          {renderNav(navigation.slice(8))}
          <div className="sidebar-date"><CircleDot size={12} /><span>{formatDate(now, { day: 'numeric', month: 'long', weekday: 'short' })}</span></div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb"><span>Дневник</span><ChevronRight size={13} /><strong>{page === 'day' && date !== now ? 'План дня' : selected.label}</strong></div>
          <div className="top-actions">
            <span className={`save-status ${storage.error ? 'save-error' : ''}`} role="status" title={storage.path}>
              {storage.error ? <AlertCircle size={14} /> : storage.pending || storage.busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}
              <span>{storage.error ? 'Требуется внимание' : storage.pending ? 'Сохранение' : storage.busy ? 'Обработка' : 'Сохранено'}</span>
            </span>
            <button className="button top-quick" onClick={quickTask} title="Ctrl+N" disabled={storage.busy}><Plus size={16} /><span>Задача</span></button>
          </div>
        </header>
        {storage.data.timer && <div inert={storage.busy}><TaskTimer data={storage.data} update={update} goToDay={goToDay} /></div>}
        {storage.error && <div className="save-alert" role="alert"><AlertCircle size={17} /><span>{storage.error}</span>
          {storage.pending ? <><button className="button" onClick={() => void retry().catch(() => {})}>Повторить</button>
            <button className="button" onClick={() => { if (window.confirm('Отменить изменения после последнего сохранения?')) discardPending(); }}>Отменить изменения</button></>
            : <button className="button" onClick={dismissError}>Закрыть</button>}
        </div>}
        <main ref={main} className="app-main" aria-busy={storage.busy} inert={storage.busy}>
          {page === 'english' ? <English {...props} route={english} onRoute={setEnglish} canLeavePractice={canLeavePractice} /> : page === 'day' ? <Day {...props} openLearning={openLearning} /> : Screen && <Screen {...props} />}
        </main>
      </div>
    </div></PracticeDraftContext.Provider>
  );
}

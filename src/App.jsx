// App — HUD overlay layout: circuit background · central visualizer · floating draggable panels · header/footer.

import { useState, useEffect, useRef, useCallback } from 'react';
import TodoList              from './components/TodoList';
import ChatBot               from './components/ChatBot';
import FolderOrganizer       from './components/FolderOrganizer';
import JarvisVisualizer      from './components/JarvisVisualizer';
import StartupOverlay        from './components/StartupOverlay';
import HelpModal             from './components/HelpModal';
import WebsitePreview           from './components/WebsitePreview';
import WebsiteGeneratorPanel   from './components/WebsiteGeneratorPanel';
import QuickTodoList         from './components/QuickTodoList';
import CircuitBackground     from './components/CircuitBackground';
import HudHeader             from './components/HudHeader';
import HudFooter             from './components/HudFooter';
import { useDraggable }           from './hooks/useDraggable';
import { useTelegramPolling }    from './hooks/useTelegramPolling';
import { useAmbientPlaying }     from './hooks/useAmbientPlaying';
import { createCalendarEvent, getCalendarEventsForRange, isSignedIn } from './lib/googleCalendar';
import {
  playAmbient,
  toggleAmbient,
  setAmbientVolume,
  duckAmbient,
  duckAmbientForSpeech,
  restoreAmbient,
} from './lib/ambientSound';
import { isTTSEnabled, setTTSEnabled } from './lib/ttsManager';

const STORAGE_KEY  = 'taski-todos';
const STARTUP_FLAG = 'taski-startup-done';

function loadTodosSync() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export default function App() {
  // ── Todos ─────────────────────────────────────────────────────────────────
  const [todos, setTodos] = useState(loadTodosSync);
  const todosReady = useRef(false);

  useEffect(() => {
    async function init() {
      if (window.taskiAPI?.isElectron) {
        const fileTodos = await window.taskiAPI.loadTodos();
        setTodos(fileTodos);
      }
      todosReady.current = true;
    }
    init();
  }, []);

  useEffect(() => {
    if (!todosReady.current) return;
    if (window.taskiAPI?.isElectron) {
      window.taskiAPI.saveTodos(todos);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    }
  }, [todos]);

  function handleAdd(todo) {
    setTodos((prev) => [todo, ...prev]);
    if (todo.date) {
      createCalendarEvent(todo)
        .then(() =>
          setTodos((prev) =>
            prev.map((t) => (t.id === todo.id ? { ...t, calendarAdded: true } : t))
          )
        )
        .catch(() => {});
    }
  }

  function handleToggle(id) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  function handleDelete(id) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  const pending   = todos.filter((t) => !t.done);
  const completed = todos.filter((t) => t.done);
  const [quickTodoCount, setQuickTodoCount] = useState(0);

  // ── Jarvis state ──────────────────────────────────────────────────────────
  const [visualizerState, setVisualizerState] = useState('idle');
  const [isMuted,         setIsMuted]         = useState(() => !isTTSEnabled());
  const micToggleRef  = useRef(null);
  const registerMicToggle = useCallback((fn) => { micToggleRef.current = fn; }, []);
  const handleMicClick    = useCallback(() => { micToggleRef.current?.(); }, []);

  // Sync mute state from ttsManager whenever ANY panel (chat, website generator, this
  // component itself) changes it — this is the single source of truth for TTS on/off.
  useEffect(() => {
    function handleTtsChange(e) {
      setIsMuted(!e.detail.enabled);
    }
    window.addEventListener('taski-tts-changed', handleTtsChange);
    return () => window.removeEventListener('taski-tts-changed', handleTtsChange);
  }, []);

  // One-time migration: a past bug left taski_tts_enabled stuck at "false" with no
  // visible way to unmute. Reset it once so voice works again; afterwards the user's
  // mute choice is respected normally.
  useEffect(() => {
    if (!localStorage.getItem('taski_tts_migration_v2')) {
      setTTSEnabled(true); // dispatches taski-tts-changed, which updates isMuted
      localStorage.setItem('taski_tts_migration_v2', 'done');
    }
  }, []);

  function handleMuteToggle() {
    const newEnabled = !isTTSEnabled();
    setTTSEnabled(newEnabled);
    setIsMuted(!newEnabled);
  }

  // ── Chat insert (for footer buttons) ────────────────────────────────────────
  const chatInsertRef = useRef(null);
  const registerChatInsert = useCallback((fn) => { chatInsertRef.current = fn; }, []);
  const [isMicSupported, setIsMicSupported] = useState(true);
  const registerMicSupport = useCallback((supported) => { setIsMicSupported(supported); }, []);

  // ── Telegram polling ──────────────────────────────────────────────────────
  const {
    isActive:      tgActive,
    status:        tgStatus,
    lastMessage:   tgLastMessage,
    messageCount:  tgMessageCount,
    startPolling:  tgStart,
    stopPolling:   tgStop,
    hasToken:      tgHasToken,
  } = useTelegramPolling();

  // Notify chatbot when a Telegram message arrives
  useEffect(() => {
    if (!tgLastMessage) return;
    window.dispatchEvent(new CustomEvent('taski-telegram-message', { detail: tgLastMessage }));
  }, [tgLastMessage]);

  // ── Startup ───────────────────────────────────────────────────────────────
  const [startupDone, setStartupDone] = useState(() =>
    Boolean(sessionStorage.getItem(STARTUP_FLAG))
  );
  function handleStartupDone() {
    sessionStorage.setItem(STARTUP_FLAG, '1');
    setStartupDone(true);
  }

  // ── Ambient music ─────────────────────────────────────────────────────────
  // Playback truth lives in ambientSound.js; this just subscribes to it.
  const isAmbientPlaying = useAmbientPlaying();
  const [ambientVolume, setAmbientVolumeState] = useState(40);

  useEffect(() => {
    let cancelled = false;
    const resume = () => { playAmbient(); };
    // Only fall back to a first-gesture retry when autoplay is actually blocked —
    // otherwise the retry would fight a deliberate pause on the user's first click.
    playAmbient().then((started) => {
      if (cancelled || started) return;
      document.addEventListener('click',      resume, { once: true });
      document.addEventListener('keydown',    resume, { once: true });
      document.addEventListener('touchstart', resume, { once: true });
    });
    return () => {
      cancelled = true;
      document.removeEventListener('click',      resume);
      document.removeEventListener('keydown',    resume);
      document.removeEventListener('touchstart', resume);
    };
  }, []);

  useEffect(() => {
    if (!isAmbientPlaying) return;
    if (visualizerState === 'listening' || visualizerState === 'processing') {
      duckAmbient();
    } else if (visualizerState === 'speaking') {
      duckAmbientForSpeech();
    } else {
      restoreAmbient();
    }
  }, [visualizerState, isAmbientPlaying]);

  function handleAmbientVolume(val) {
    setAmbientVolumeState(val);
    setAmbientVolume(val / 100);
  }

  // ── Auto morning briefing ─────────────────────────────────────────────────
  const [briefingShown, setBriefingShown] = useState(false);

  useEffect(() => {
    const lastBriefing = localStorage.getItem('taski_last_briefing');
    const today        = new Date().toISOString().split('T')[0];
    const hour         = new Date().getHours();
    const isMorning    = hour >= 6 && hour <= 11;

    if (isMorning && lastBriefing !== today) {
      const timer = setTimeout(() => {
        if (!briefingShown) {
          setBriefingShown(true);
          localStorage.setItem('taski_last_briefing', today);
          window.dispatchEvent(new CustomEvent('taski-briefing'));
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── UI modals + toggles ───────────────────────────────────────────────────
  const [helpModalOpen,         setHelpModalOpen]         = useState(false);
  const [websitePreviewData,    setWebsitePreviewData]    = useState(null);
  const [folderOrgOpen,         setFolderOrgOpen]         = useState(false);
  const [websiteGeneratorOpen,  setWebsiteGeneratorOpen]  = useState(false);
  const [websiteInitialPrompt,  setWebsiteInitialPrompt]  = useState('');
  const [savedSitesCount,       setSavedSitesCount]       = useState(0);

  function openWebsiteGenerator(prompt) {
    setWebsiteInitialPrompt(prompt || '');
    setWebsiteGeneratorOpen(true);
  }

  // Load saved website count on startup so the footer badge is accurate immediately
  useEffect(() => {
    async function loadSavedSitesCount() {
      if (window.taskiAPI?.websitesList) {
        const result = await window.taskiAPI.websitesList();
        if (result.success) setSavedSitesCount(result.sites.length);
      }
    }
    loadSavedSitesCount();
  }, []);

  // Ctrl+Shift+W toggles the website builder from anywhere in the app
  useEffect(() => {
    function handleKeydown(e) {
      if (e.ctrlKey && e.shiftKey && e.key === 'W') {
        setWebsiteGeneratorOpen(prev => !prev);
      }
    }
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, []);

  // ── Panel z-index ordering (last in array = on top) ──────────────────────
  const [panelOrder, setPanelOrder] = useState(['calendar', 'todo', 'chat']);
  function bringToFront(id) {
    setPanelOrder((prev) => [...prev.filter((p) => p !== id), id]);
  }

  // ── Window width for Jarvis sizing ────────────────────────────────────────
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);

  // ── Fullscreen change → force layout recalc ──────────────────────────────
  useEffect(() => {
    if (window.taskiAPI?.onFullscreenChange) {
      window.taskiAPI.onFullscreenChange(() => {
        window.dispatchEvent(new Event('resize'));
      });
    }
  }, []);

  useEffect(() => {
    function onResize() { setWindowWidth(window.innerWidth); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const vizSize = Math.min(Math.max(windowWidth * 0.45, 280), 560);

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      height:        '100vh',
      width:         '100vw',
      overflow:      'hidden',
      position:      'relative',
    }}>
      {!startupDone && (
        <StartupOverlay onDone={handleStartupDone} isMuted={isMuted} />
      )}

      {/* ════ HUD Header ════ */}
      <div style={{ flexShrink: 0, height: '52px', zIndex: 100, position: 'relative' }}>
        <HudHeader
          isAmbientPlaying={isAmbientPlaying}
          ambientVolume={ambientVolume}
          onAmbientToggle={() => toggleAmbient()}
          onVolumeChange={handleAmbientVolume}
          onHelp={() => setHelpModalOpen(true)}
        />
      </div>

      {/* ════ Content area — full screen with Jarvis centered ════ */}
      <div style={{
        flex:      1,
        position:  'relative',
        overflow:  'hidden',
        minHeight: 0,
      }}>
        {/* ── Background layer ── */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0, pointerEvents: 'none' }}>
          <CircuitBackground />
          <div aria-hidden="true" style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(0,100,200,0.08) 0%, transparent 70%)',
          }} />
          <div aria-hidden="true" style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.025) 2px, rgba(0,0,0,0.025) 4px)',
          }} />
        </div>

        {/* ── Jarvis Visualizer — centered ── */}
        <div style={{
          position:       'absolute',
          inset:          0,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          zIndex:         2,
          pointerEvents:  'none',
        }}>
          <JarvisVisualizer
            state={visualizerState}
            onMicClick={handleMicClick}
            isMuted={isMuted}
            onMuteToggle={handleMuteToggle}
            isSupported={isMicSupported}
            size={vizSize}
          />
        </div>

        {/* ════ Floating Panel — Calendar Tasks ════ */}
        <CalendarPanel
          panelZIndex={panelOrder.indexOf('calendar') + 10}
          onBringToFront={() => bringToFront('calendar')}
          pending={pending}
          completed={completed}
          handleAdd={handleAdd}
          handleToggle={handleToggle}
          handleDelete={handleDelete}
        />

        {/* ════ Floating Panel — Quick Todo List ════ */}
        <TodoPanel
          panelZIndex={panelOrder.indexOf('todo') + 10}
          onBringToFront={() => bringToFront('todo')}
          setQuickTodoCount={setQuickTodoCount}
          quickTodoCount={quickTodoCount}
        />

        {/* ════ Floating Panel — Chat ════ */}
        <ChatPanel
          panelZIndex={panelOrder.indexOf('chat') + 10}
          onBringToFront={() => bringToFront('chat')}
          visualizerState={visualizerState}
          setVisualizerState={setVisualizerState}
          registerMicToggle={registerMicToggle}
          registerMicSupport={registerMicSupport}
          isMuted={isMuted}
          setIsMuted={setIsMuted}
          isMicSupported={isMicSupported}
          setWebsitePreviewData={setWebsitePreviewData}
          registerChatInsert={registerChatInsert}
          openWebsiteGenerator={openWebsiteGenerator}
        />
      </div>

      {/* ════ HUD Footer — flex item, always visible ════ */}
      <div style={{ flexShrink: 0, height: '48px', zIndex: 100, position: 'relative' }}>
        <HudFooter
          onFiles={() => setFolderOrgOpen(true)}
          onImagen={() => chatInsertRef.current?.('/imagen ')}
          onWebsite={() => setWebsiteGeneratorOpen(true)}
          onSkills={() => chatInsertRef.current?.('/')}
          savedSitesCount={savedSitesCount}
          visualizerState={visualizerState}
          tgActive={tgActive}
          tgStatus={tgStatus}
          tgLastMessage={tgLastMessage}
          tgMessageCount={tgMessageCount}
          tgHasToken={tgHasToken}
          onTgStart={tgStart}
          onTgStop={tgStop}
        />
      </div>

      {/* ════ Folder Organizer Modal ════ */}
      {folderOrgOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setFolderOrgOpen(false); }}
        >
          <div style={{
            width: '600px', maxWidth: '90vw', maxHeight: '80vh',
            background: 'rgba(2,15,35,0.95)',
            border: '1px solid rgba(0,212,255,0.3)',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 0 60px rgba(0,212,255,0.15)',
            display: 'flex', flexDirection: 'column',
            animation: 'modalFlashIn 0.3s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(0,212,255,0.12)', background: 'rgba(0,212,255,0.04)' }}>
              <span style={{ fontFamily: "'Rajdhani'", fontSize: '11px', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#00d4ff' }}>📁 FILE ORGANIZER</span>
              <button onClick={() => setFolderOrgOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,212,255,0.5)', fontSize: '18px', lineHeight: 1, padding: '0 4px' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ff2d55'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(0,212,255,0.5)'; }}
              >×</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <FolderOrganizer />
            </div>
          </div>
        </div>
      )}

      {/* ════ Help Modal ════ */}
      <HelpModal isOpen={helpModalOpen} onClose={() => setHelpModalOpen(false)} />

      {/* ════ Website Preview (legacy) ════ */}
      {websitePreviewData && (
        <WebsitePreview
          htmlContent={websitePreviewData.html}
          prompt={websitePreviewData.prompt}
          onClose={() => setWebsitePreviewData(null)}
          onRegenerate={() => setWebsitePreviewData(null)}
        />
      )}

      {/* ════ Website Generator (full-screen builder) ════ */}
      {websiteGeneratorOpen && (
        <WebsiteGeneratorPanel
          initialPrompt={websiteInitialPrompt}
          onClose={() => {
            setWebsiteGeneratorOpen(false);
            setWebsiteInitialPrompt('');
            if (window.taskiAPI?.websitesList) {
              window.taskiAPI.websitesList().then(result => {
                if (result.success) setSavedSitesCount(result.sites.length);
              });
            }
          }}
        />
      )}

      {/* ── Panel scrollbar + animation styles ── */}
      <style>{`
        @keyframes panelExpand {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .panel-scroll,
        .task-list,
        .todo-list-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(0,212,255,0.25) transparent;
        }
        .panel-scroll::-webkit-scrollbar,
        .task-list::-webkit-scrollbar,
        .todo-list-scroll::-webkit-scrollbar { width: 3px; }
        .panel-scroll::-webkit-scrollbar-track,
        .task-list::-webkit-scrollbar-track,
        .todo-list-scroll::-webkit-scrollbar-track { background: transparent; }
        .panel-scroll::-webkit-scrollbar-thumb,
        .task-list::-webkit-scrollbar-thumb,
        .todo-list-scroll::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.25); border-radius: 2px; }
        .panel-scroll::-webkit-scrollbar-thumb:hover,
        .task-list::-webkit-scrollbar-thumb:hover,
        .todo-list-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0,212,255,0.5); }
      `}</style>
    </div>
  );
}

// ── Calendar panel helpers ────────────────────────────────────────────────────

function getWeekRange(offset) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() + offset * 7);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  return { startOfWeek, endOfWeek };
}

function getWeekLabel(offset) {
  if (offset === 0)  return 'THIS WEEK';
  if (offset === -1) return 'LAST WEEK';
  if (offset === 1)  return 'NEXT WEEK';
  if (offset > 1)    return `+${offset} WEEKS`;
  return `${offset} WEEKS`;
}

function groupEventsByDay(events) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const todayKey = now.toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const tmw = new Date(now); tmw.setDate(now.getDate() + 1);
  const tomorrowKey = tmw.toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });

  const groups = {};
  events.forEach((event) => {
    // For all-day events the start is a bare date string; add T00:00:00 to parse as local
    const d = event.allDay ? new Date(event.start + 'T00:00:00') : new Date(event.start);
    const dateKey = d.toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const dayKey  = d.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
    const label   = dateKey === todayKey ? `TODAY · ${dayKey}` : dateKey === tomorrowKey ? `TOMORROW · ${dayKey}` : dayKey;
    if (!groups[label]) groups[label] = [];
    groups[label].push(event);
  });
  return groups;
}

// ── Floating Calendar Tasks Panel ─────────────────────────────────────────────

function CalendarPanel({
  panelZIndex, onBringToFront,
  pending, completed, handleAdd, handleToggle, handleDelete,
}) {
  const { isDragging, onMouseDown, dragStyle } = useDraggable({
    x: 20, y: 72,
    storageKey: 'taski_pos_calendar',
  });

  const [isExpanded,      setIsExpanded]      = useState(() => localStorage.getItem('taski_calendar_expanded') === 'true');
  const [showForm,        setShowForm]        = useState(false);
  const [weekOffset,      setWeekOffset]      = useState(0);
  const [weekEvents,      setWeekEvents]      = useState([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [calConnected,    setCalConnected]    = useState(false);
  const [taskTitle,       setTaskTitle]       = useState('');
  const [taskDate,        setTaskDate]        = useState('');
  const [taskStart,       setTaskStart]       = useState('');
  const [taskEnd,         setTaskEnd]         = useState('');
  const [isAddingTask,    setIsAddingTask]    = useState(false);

  useEffect(() => { localStorage.setItem('taski_calendar_expanded', String(isExpanded)); }, [isExpanded]);

  useEffect(() => {
    function onExpandEvt(e) { if (e.detail?.panel === 'calendar') setIsExpanded(true); }
    window.addEventListener('taski-expand-panel', onExpandEvt);
    window.addEventListener('taski-panel-expand', onExpandEvt);
    return () => {
      window.removeEventListener('taski-expand-panel', onExpandEvt);
      window.removeEventListener('taski-panel-expand', onExpandEvt);
    };
  }, []);

  // Load calendar events whenever the panel is expanded or the week changes
  useEffect(() => {
    if (!isExpanded) return;
    let cancelled = false;
    const authOk = isSignedIn();
    setCalConnected(authOk);
    if (!authOk) { setWeekEvents([]); return; }
    setIsLoadingEvents(true);
    const { startOfWeek, endOfWeek } = getWeekRange(weekOffset);
    getCalendarEventsForRange(startOfWeek, endOfWeek)
      .then((evs) => { if (!cancelled) setWeekEvents(evs); })
      .catch((err) => { console.error('[CalPanel]', err.message); if (!cancelled) setWeekEvents([]); })
      .finally(() => { if (!cancelled) setIsLoadingEvents(false); });
    return () => { cancelled = true; };
  }, [weekOffset, isExpanded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showForm) {
      setTaskTitle('');
      setTaskDate('');
      setTaskStart('');
      setTaskEnd('');
    }
  }, [showForm]);

  function handleCollapse() { setIsExpanded(false); setShowForm(false); }
  function handleToggleForm() {
    if (!isExpanded) setIsExpanded(true);
    setShowForm((p) => !p);
  }
  function handleDeleteEvent(id) { setWeekEvents((prev) => prev.filter((e) => e.id !== id)); }

  async function handleAddTask() {
    if (!taskTitle.trim() || !taskDate) return;
    setIsAddingTask(true);
    try {
      await createCalendarEvent({ title: taskTitle.trim(), date: taskDate, time: taskStart || '', endTime: taskEnd || null });
      setShowForm(false);
      const { startOfWeek, endOfWeek } = getWeekRange(weekOffset);
      const evs = await getCalendarEventsForRange(startOfWeek, endOfWeek);
      setWeekEvents(evs);
    } catch (err) {
      console.error('[handleAddTask]', err);
    } finally {
      setIsAddingTask(false);
    }
  }

  const groupedEvents = groupEventsByDay(weekEvents);
  const badgeCount    = calConnected && weekEvents.length > 0 ? weekEvents.length : pending.length;

  // Shared nav button style
  const navBtnStyle = {
    background: 'transparent', border: '1px solid rgba(0,212,255,0.2)', borderRadius: '4px',
    color: 'rgba(0,212,255,0.6)', width: '22px', height: '22px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
    flexShrink: 0, transition: 'all 0.15s', padding: 0, lineHeight: 1,
  };

  return (
    <div
      onClick={onBringToFront}
      style={{
        ...dragStyle,
        zIndex: isDragging ? 1000 : panelZIndex,
        width: '300px',
        maxHeight: isExpanded ? 'calc(60vh - 80px)' : '44px',
        overflow: 'hidden',
        transition: 'max-height 0.3s cubic-bezier(0.16,1,0.3,1)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header — always visible */}
      <div
        onMouseDown={onMouseDown}
        style={{
          height: '44px', minHeight: '44px', flexShrink: 0,
          display: 'flex', alignItems: 'center', padding: '0 10px', gap: '6px',
          background: 'rgba(2,15,35,0.92)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(0,212,255,0.25)',
          borderRadius: isExpanded ? '10px 10px 0 0' : '10px',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          transition: 'border-radius 0.2s',
        }}
      >
        <span style={{ color: 'rgba(0,212,255,0.2)', fontSize: '14px', flexShrink: 0 }}>⠿</span>
        <span style={{
          fontSize: '10px', fontFamily: "'Rajdhani', sans-serif", fontWeight: 600,
          color: '#00d4ff', letterSpacing: '0.12em', textTransform: 'uppercase',
          flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          🗓 CALENDAR TASKS
        </span>
        {badgeCount > 0 && (
          <span style={{
            background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.3)',
            borderRadius: '10px', padding: '1px 6px', fontSize: '10px',
            fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, color: '#00d4ff', flexShrink: 0,
          }}>
            {badgeCount}
          </span>
        )}
        <PanelToggleBtn isExpanded={isExpanded} onExpand={() => setIsExpanded(true)} onCollapse={handleCollapse} />
        {isExpanded && <PanelCreateBtn showForm={showForm} onToggle={handleToggleForm} />}
      </div>

      {/* Content — only when expanded */}
      {isExpanded && (
        <div
          className="panel-content"
          style={{
            background: 'rgba(2,15,35,0.88)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(0,212,255,0.25)',
            borderTop: '1px solid rgba(0,212,255,0.08)',
            borderRadius: '0 0 10px 10px',
            overflow: 'hidden',
            flex: 1, minHeight: 0,
            display: 'flex', flexDirection: 'column',
            animation: 'panelExpand 0.25s ease-out',
          }}
        >
          {/* Add-task form — never clips */}
          {showForm && (
            <div style={{
              flexShrink: 0,
              padding: '10px 12px',
              background: 'rgba(0,212,255,0.03)',
              borderBottom: '1px solid rgba(0,212,255,0.1)',
              display: 'flex', flexDirection: 'column', gap: '7px',
              animation: 'slideDown 0.2s ease-out',
            }}>
              <div style={{
                fontSize: '9px', color: 'rgba(0,212,255,0.4)', fontFamily: "'Rajdhani', sans-serif",
                letterSpacing: '0.15em', textTransform: 'uppercase',
              }}>
                ADD NEW TASK
              </div>

              {/* Title input */}
              <input
                type="text"
                placeholder="Task title..."
                value={taskTitle}
                onChange={e => setTaskTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && taskTitle.trim() && taskDate) handleAddTask(); }}
                autoFocus
                style={{
                  background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)',
                  borderRadius: '6px', padding: '6px 10px', color: '#e0f4ff',
                  fontFamily: "'Rajdhani', sans-serif", fontSize: '12px', width: '100%',
                  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
                }}
                onFocus={e => { e.target.style.borderColor = 'rgba(0,212,255,0.6)'; e.target.style.boxShadow = '0 0 0 2px rgba(0,212,255,0.08)'; }}
                onBlur={e  => { e.target.style.borderColor = 'rgba(0,212,255,0.2)';  e.target.style.boxShadow = 'none'; }}
              />

              {/* Date + time row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px' }}>
                {[
                  { type: 'date', value: taskDate, onChange: e => setTaskDate(e.target.value),  min: new Date().toISOString().split('T')[0] },
                  { type: 'time', value: taskStart, onChange: e => setTaskStart(e.target.value) },
                  { type: 'time', value: taskEnd,   onChange: e => setTaskEnd(e.target.value)   },
                ].map(({ type, value, onChange, min }) => (
                  <input
                    key={type + (min || '')}
                    type={type}
                    value={value}
                    onChange={onChange}
                    min={min}
                    style={{
                      background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)',
                      borderRadius: '6px', padding: '5px 6px', color: '#e0f4ff',
                      fontFamily: "'Rajdhani', sans-serif", fontSize: '11px',
                      outline: 'none', colorScheme: 'dark', width: '100%', boxSizing: 'border-box',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'rgba(0,212,255,0.6)'; }}
                    onBlur={e  => { e.target.style.borderColor = 'rgba(0,212,255,0.2)'; }}
                  />
                ))}
              </div>

              {/* ADD TO CALENDAR button — always visible */}
              <button
                onClick={handleAddTask}
                disabled={!taskTitle.trim() || !taskDate || isAddingTask}
                style={{
                  background:    taskTitle.trim() && taskDate ? 'rgba(0,212,255,0.12)' : 'rgba(0,212,255,0.03)',
                  border:        `1px solid ${taskTitle.trim() && taskDate ? 'rgba(0,212,255,0.5)' : 'rgba(0,212,255,0.12)'}`,
                  borderRadius:  '6px',
                  padding:       '8px 12px',
                  color:         taskTitle.trim() && taskDate ? '#00d4ff' : 'rgba(0,212,255,0.25)',
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '11px',
                  fontWeight:    600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  cursor:        taskTitle.trim() && taskDate && !isAddingTask ? 'pointer' : 'not-allowed',
                  width:         '100%',
                  transition:    'all 0.2s',
                  display:       'flex',
                  alignItems:    'center',
                  justifyContent: 'center',
                  gap:            '5px',
                }}
                onMouseEnter={e => {
                  if (taskTitle.trim() && taskDate) {
                    e.currentTarget.style.background  = 'rgba(0,212,255,0.2)';
                    e.currentTarget.style.boxShadow   = '0 0 12px rgba(0,212,255,0.2)';
                    e.currentTarget.style.borderColor = 'rgba(0,212,255,0.8)';
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background  = taskTitle.trim() && taskDate ? 'rgba(0,212,255,0.12)' : 'rgba(0,212,255,0.03)';
                  e.currentTarget.style.boxShadow   = 'none';
                  e.currentTarget.style.borderColor = taskTitle.trim() && taskDate ? 'rgba(0,212,255,0.5)' : 'rgba(0,212,255,0.12)';
                }}
              >
                {isAddingTask ? '⟳ ADDING...' : '+ ADD TO CALENDAR'}
              </button>
            </div>
          )}

          {/* Week navigation bar */}
          <div style={{
            display: 'flex', alignItems: 'center', padding: '5px 10px',
            borderBottom: '1px solid rgba(0,212,255,0.08)', gap: '6px', flexShrink: 0,
          }}>
            <button
              onClick={() => setWeekOffset((p) => p - 1)}
              style={navBtnStyle}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#00d4ff'; e.currentTarget.style.color = '#00d4ff'; e.currentTarget.style.background = 'rgba(0,212,255,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)'; e.currentTarget.style.color = 'rgba(0,212,255,0.6)'; e.currentTarget.style.background = 'transparent'; }}
            >‹</button>

            <span style={{
              flex: 1, textAlign: 'center', fontSize: '10px', fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 600, letterSpacing: '0.1em',
              color: weekOffset === 0 ? '#00d4ff' : 'rgba(0,212,255,0.5)',
            }}>
              {getWeekLabel(weekOffset)}
            </span>

            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                style={{
                  background: 'transparent', border: '1px solid rgba(0,212,255,0.2)', borderRadius: '4px',
                  color: 'rgba(0,212,255,0.5)', padding: '2px 6px', cursor: 'pointer',
                  fontSize: '9px', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em', transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#00d4ff'; e.currentTarget.style.borderColor = '#00d4ff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(0,212,255,0.5)'; e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)'; }}
              >NOW</button>
            )}

            <button
              onClick={() => setWeekOffset((p) => p + 1)}
              style={navBtnStyle}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#00d4ff'; e.currentTarget.style.color = '#00d4ff'; e.currentTarget.style.background = 'rgba(0,212,255,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)'; e.currentTarget.style.color = 'rgba(0,212,255,0.6)'; e.currentTarget.style.background = 'transparent'; }}
            >›</button>
          </div>

          {/* Loading */}
          {isLoadingEvents && (
            <div style={{ padding: '16px', textAlign: 'center', fontSize: '10px', color: 'rgba(0,212,255,0.4)', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em' }}>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
              {' '}LOADING EVENTS...
            </div>
          )}

          {/* Not connected */}
          {!calConnected && !isLoadingEvents && (
            <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: '11px', color: 'rgba(0,212,255,0.3)', fontFamily: "'Rajdhani', sans-serif", lineHeight: 1.5 }}>
              Click <strong style={{ color: 'rgba(0,212,255,0.5)' }}>CAL</strong> in footer<br />to connect Google Calendar
            </div>
          )}

          {/* Events list grouped by day — scrollable, takes remaining space */}
          {calConnected && !isLoadingEvents && (
            <div
              className="panel-scroll"
              style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,212,255,0.2) transparent' }}
            >
              {Object.keys(groupedEvents).length === 0 ? (
                <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: '11px', color: 'rgba(0,212,255,0.25)', fontFamily: "'Rajdhani', sans-serif", lineHeight: 1.6 }}>
                  No events {getWeekLabel(weekOffset).toLowerCase()}<br />
                  <span style={{ fontSize: '10px', color: 'rgba(0,212,255,0.15)' }}>Click + to add one</span>
                </div>
              ) : (
                Object.entries(groupedEvents)
                  .sort(([labelA], [labelB]) => {
                    const priority = (l) => l.includes('TODAY') ? 0 : l.includes('TOMORROW') ? 1 : 2;
                    return priority(labelA) - priority(labelB);
                  })
                  .map(([dayLabel, dayEvts]) => {
                    const isToday    = dayLabel.includes('TODAY');
                    const isTomorrow = dayLabel.includes('TOMORROW');
                    return (
                      <div key={dayLabel}>
                        <div style={
                          isToday ? {
                            padding: '6px 10px 4px', fontSize: '11px', fontFamily: "'Rajdhani', sans-serif",
                            fontWeight: 700, color: '#00d4ff', letterSpacing: '0.12em',
                            textTransform: 'uppercase', borderBottom: '1px solid rgba(0,212,255,0.1)',
                            background: 'rgba(0,212,255,0.05)',
                          } : isTomorrow ? {
                            padding: '6px 10px 4px', fontSize: '11px', fontFamily: "'Rajdhani', sans-serif",
                            fontWeight: 600, color: '#7dd4f0', letterSpacing: '0.1em',
                            textTransform: 'uppercase', borderBottom: '1px solid rgba(0,212,255,0.07)',
                          } : {
                            padding: '6px 10px 4px', fontSize: '10px', fontFamily: "'Rajdhani', sans-serif",
                            fontWeight: 600, color: 'rgba(0,212,255,0.45)', letterSpacing: '0.1em',
                            textTransform: 'uppercase', borderBottom: '1px solid rgba(0,212,255,0.06)',
                          }
                        }>
                          {dayLabel}
                        </div>
                        {dayEvts.map((evt) => (
                          <EventRow key={evt.id} event={evt} onDelete={handleDeleteEvent} />
                        ))}
                      </div>
                    );
                  })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Floating Todo List Panel ───────────────────────────────────────────────────

function TodoPanel({
  panelZIndex, onBringToFront,
  setQuickTodoCount, quickTodoCount,
}) {
  const { isDragging, onMouseDown, dragStyle } = useDraggable({
    x: 20, y: 72 + 300,
    storageKey: 'taski_pos_todo',
  });

  const [isExpanded, setIsExpanded] = useState(() => {
    return localStorage.getItem('taski_todo_expanded') === 'true';
  });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    localStorage.setItem('taski_todo_expanded', String(isExpanded));
  }, [isExpanded]);

  useEffect(() => {
    function onExpandEvt(e) {
      if (e.detail?.panel === 'todo') setIsExpanded(true);
    }
    window.addEventListener('taski-expand-panel', onExpandEvt);
    window.addEventListener('taski-panel-expand', onExpandEvt);
    return () => {
      window.removeEventListener('taski-expand-panel', onExpandEvt);
      window.removeEventListener('taski-panel-expand', onExpandEvt);
    };
  }, []);

  function handleCollapse() { setIsExpanded(false); setShowForm(false); }
  function handleToggleForm() {
    if (!isExpanded) setIsExpanded(true);
    setShowForm((p) => !p);
  }

  return (
    <div
      onClick={onBringToFront}
      style={{
        ...dragStyle,
        zIndex: isDragging ? 1000 : panelZIndex,
        width: '300px',
        maxHeight: isExpanded ? 'calc(60vh - 80px)' : '44px',
        overflow: 'hidden',
        transition: 'max-height 0.3s cubic-bezier(0.16,1,0.3,1)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header — always visible */}
      <div
        onMouseDown={onMouseDown}
        style={{
          height: '44px', minHeight: '44px', flexShrink: 0,
          display: 'flex', alignItems: 'center', padding: '0 10px', gap: '6px',
          background: 'rgba(2,15,35,0.92)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(0,212,255,0.25)',
          borderRadius: isExpanded ? '10px 10px 0 0' : '10px',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          transition: 'border-radius 0.2s',
        }}
      >
        <span style={{ color: 'rgba(0,212,255,0.2)', fontSize: '14px', flexShrink: 0 }}>⠿</span>
        <span style={{
          fontSize: '10px', fontFamily: "'Rajdhani', sans-serif", fontWeight: 600,
          color: '#00d4ff', letterSpacing: '0.12em', textTransform: 'uppercase',
          flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          ✓ TO DO LIST
        </span>
        {quickTodoCount > 0 && (
          <span style={{
            background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.3)',
            borderRadius: '10px', padding: '1px 6px', fontSize: '10px',
            fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, color: '#00d4ff', flexShrink: 0,
          }}>
            {quickTodoCount}
          </span>
        )}
        <PanelToggleBtn isExpanded={isExpanded} onExpand={() => setIsExpanded(true)} onCollapse={handleCollapse} />
        {isExpanded && <PanelCreateBtn showForm={showForm} onToggle={handleToggleForm} />}
      </div>

      {/* Content — only when expanded */}
      {isExpanded && (
        <div
          className="panel-content"
          style={{
            background: 'rgba(2,15,35,0.88)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(0,212,255,0.25)',
            borderTop: '1px solid rgba(0,212,255,0.08)',
            borderRadius: '0 0 10px 10px',
            overflow: 'hidden',
            flex: 1,
            minHeight: 0,
            display: 'flex', flexDirection: 'column',
            animation: 'panelExpand 0.25s ease-out',
          }}
        >
          <QuickTodoList onCountChange={setQuickTodoCount} showForm={showForm} />
        </div>
      )}
    </div>
  );
}

// ── Floating Chat Panel ────────────────────────────────────────────────────────

function ChatPanel({
  panelZIndex, onBringToFront,
  visualizerState, setVisualizerState,
  registerMicToggle, registerMicSupport,
  isMuted, setIsMuted, isMicSupported,
  setWebsitePreviewData, registerChatInsert,
  openWebsiteGenerator,
}) {
  const { isDragging, onMouseDown, dragStyle } = useDraggable({
    x: typeof window !== 'undefined' ? window.innerWidth - 360 : 600,
    y: 72,
    storageKey: 'taski_pos_chat',
  });

  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem('taski_chat_expanded');
    return saved === null ? true : saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('taski_chat_expanded', isExpanded.toString());
  }, [isExpanded]);

  useEffect(() => {
    function handleExpand(e) {
      if (e.detail?.panel === 'chat') setIsExpanded(true);
    }
    window.addEventListener('taski-expand-panel', handleExpand);
    return () => window.removeEventListener('taski-expand-panel', handleExpand);
  }, []);

  const dotColor = visualizerState === 'processing' ? '#ffaa00'
    : visualizerState === 'idle' ? '#00d4ff'
    : '#00ff88';

  return (
    <div
      onClick={onBringToFront}
      style={{
        ...dragStyle,
        zIndex: isDragging ? 1000 : panelZIndex,
        width: '340px',
        height: isExpanded ? 'calc(100vh - 144px)' : 'auto',
        maxHeight: isExpanded ? 'calc(100vh - 144px)' : 'none',
        transition: 'max-height 0.3s cubic-bezier(0.16,1,0.3,1)',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '10px',
      }}
    >
      {/* Drag header — always visible */}
      <div
        onMouseDown={onMouseDown}
        style={{
          height: '44px',
          minHeight: '44px',
          cursor: isDragging ? 'grabbing' : 'grab',
          background: 'rgba(2,15,35,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(0,212,255,0.25)',
          borderRadius: '10px 10px 0 0',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: '8px',
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        <span style={{ color: 'rgba(0,212,255,0.25)', fontSize: '14px', cursor: isDragging ? 'grabbing' : 'grab', flexShrink: 0 }}>⠿</span>
        <span style={{
          fontSize: '12px', fontFamily: "'Orbitron', sans-serif",
          color: '#00d4ff', letterSpacing: '0.08em', flex: 1,
        }}>
          TASKI
        </span>
        <span style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: dotColor, boxShadow: `0 0 6px ${dotColor}`,
          display: 'inline-block', flexShrink: 0,
        }} />
        <ExpandBtn isExpanded={isExpanded} onToggle={() => setIsExpanded((p) => !p)} />
      </div>

      {/* ChatBot content */}
      <div
        className="panel-content"
        style={{
          background: 'rgba(2,15,35,0.88)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(0,212,255,0.25)',
          borderTop: '1px solid rgba(0,212,255,0.08)',
          borderRadius: '0 0 10px 10px',
          overflow: 'hidden',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <ChatBot
          onVisualizerState={setVisualizerState}
          registerMicToggle={registerMicToggle}
          registerMicSupport={registerMicSupport}
          isMuted={isMuted}
          onWebsiteGenerated={setWebsitePreviewData}
          registerChatInsert={registerChatInsert}
          isCollapsed={!isExpanded}
          onExpand={() => setIsExpanded(true)}
          openWebsiteGenerator={openWebsiteGenerator}
        />
      </div>
    </div>
  );
}

// ── Small helper components ────────────────────────────────────────────────────

function ExpandBtn({ isExpanded, onToggle }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={isExpanded ? 'Collapse' : 'Expand'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:   hovered ? 'rgba(0,212,255,0.15)' : (isExpanded ? 'rgba(0,212,255,0.1)' : 'transparent'),
        border:       `1px solid ${hovered ? '#00d4ff' : 'rgba(0,212,255,0.3)'}`,
        borderRadius: '50%',
        width:        '22px',
        height:       '22px',
        cursor:       'pointer',
        color:        '#00d4ff',
        fontSize:     '16px',
        fontWeight:   300,
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        flexShrink:   0,
        transition:   'all 0.2s',
        lineHeight:   1,
        padding:      0,
        paddingBottom: '1px',
        boxShadow:    hovered ? '0 0 8px rgba(0,212,255,0.3)' : 'none',
      }}
    >
      {isExpanded ? '−' : '+'}
    </button>
  );
}

// Expand/collapse toggle for CalendarPanel and TodoPanel headers.
// Collapsed: shows a single [+] that expands the panel.
// Expanded: shows a [−] that collapses it (create-new button renders separately).
function PanelToggleBtn({ isExpanded, onExpand, onCollapse }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); isExpanded ? onCollapse() : onExpand(); }}
      title={isExpanded ? 'Collapse' : 'Expand'}
      style={{
        width: '24px', height: '24px', borderRadius: '6px',
        border: '1px solid rgba(0,212,255,0.3)',
        background: 'transparent',
        color: '#00d4ff',
        cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0, fontSize: '16px',
        fontWeight: 300, transition: 'all 0.15s', padding: 0, lineHeight: 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(0,212,255,0.6)';
        e.currentTarget.style.background = 'rgba(0,212,255,0.12)';
        e.currentTarget.style.boxShadow = '0 0 8px rgba(0,212,255,0.2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(0,212,255,0.3)';
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {isExpanded ? '−' : '+'}
    </button>
  );
}

// Create [+/×] button for CalendarPanel and TodoPanel headers
function PanelCreateBtn({ showForm, onToggle }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={showForm ? 'Close form' : 'Add new'}
      style={{
        width: '24px', height: '24px', borderRadius: '6px',
        border: showForm ? '1px solid rgba(255,68,68,0.4)' : '1px solid rgba(0,212,255,0.25)',
        background: showForm ? 'rgba(255,68,68,0.1)' : 'rgba(0,212,255,0.08)',
        color: showForm ? '#ff6666' : '#00d4ff',
        cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0, fontSize: '16px',
        fontWeight: 300, transition: 'all 0.15s', padding: 0,
        lineHeight: 1, paddingBottom: '1px',
      }}
      onMouseEnter={(e) => {
        if (!showForm) {
          e.currentTarget.style.borderColor = 'rgba(0,212,255,0.7)';
          e.currentTarget.style.background = 'rgba(0,212,255,0.15)';
          e.currentTarget.style.boxShadow = '0 0 10px rgba(0,212,255,0.25)';
        }
      }}
      onMouseLeave={(e) => {
        if (!showForm) {
          e.currentTarget.style.borderColor = 'rgba(0,212,255,0.25)';
          e.currentTarget.style.background = 'rgba(0,212,255,0.08)';
          e.currentTarget.style.boxShadow = 'none';
        }
      }}
    >
      {showForm ? '×' : '+'}
    </button>
  );
}

function EventRow({ event, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const timeStr = event.allDay
    ? 'All day'
    : event.start
      ? new Date(event.start).toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
      : '';
  const endStr = !event.allDay && event.end
    ? new Date(event.end).toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
    : '';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', padding: '5px 10px', gap: '6px',
        minHeight: '34px', maxHeight: '34px',
        borderBottom: '1px solid rgba(0,212,255,0.05)',
        background: hovered ? 'rgba(0,212,255,0.04)' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <span style={{ width: '6px', height: '6px', minWidth: '6px', borderRadius: '50%', border: '1.5px solid rgba(0,212,255,0.5)', flexShrink: 0 }} />
      <span style={{
        flex: 1, fontSize: '12px', color: '#e0f4ff', fontFamily: "'Rajdhani', sans-serif",
        fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
      }}>
        {event.summary}
      </span>
      <span style={{
        fontSize: '11px', fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, color: '#00d4ff',
        background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)',
        borderRadius: '4px', padding: '1px 6px', whiteSpace: 'nowrap', flexShrink: 0,
        letterSpacing: '0.03em', minWidth: '72px', textAlign: 'center',
      }}>
        {event.allDay ? 'All day' : timeStr}{!event.allDay && endStr && endStr !== timeStr ? `–${endStr}` : ''}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(event.id); }}
        style={{
          background: 'transparent', border: 'none',
          color: hovered ? 'rgba(255,68,68,0.6)' : 'transparent',
          cursor: hovered ? 'pointer' : 'default',
          fontSize: '13px', padding: '0', flexShrink: 0,
          width: '18px', height: '18px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'color 0.15s',
          pointerEvents: hovered ? 'auto' : 'none',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#ff4444'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,68,68,0.6)'; }}
      >×</button>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily:    "'Rajdhani', sans-serif",
      fontSize:      '9px',
      fontWeight:    600,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color:         'rgba(74,155,190,0.6)',
      margin:        '6px 0 5px 2px',
    }}>
      {children}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'center',
      padding:       '16px 0',
      gap:           '8px',
    }}>
      <svg width="30" height="30" viewBox="0 0 44 44" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="42" height="42" rx="3" stroke="rgba(0,212,255,0.12)" strokeWidth="1"/>
        <rect x="7" y="13" width="30" height="1" fill="rgba(0,212,255,0.1)"/>
        <rect x="7" y="21" width="30" height="1" fill="rgba(0,212,255,0.1)"/>
        <rect x="7" y="29" width="30" height="1" fill="rgba(0,212,255,0.1)"/>
      </svg>
      <p style={{
        fontFamily:    "'Rajdhani', sans-serif",
        fontSize:      '10px',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color:         'rgba(30,77,107,0.8)',
        margin:        0,
        textAlign:     'center',
      }}>
        {text}
      </p>
    </div>
  );
}

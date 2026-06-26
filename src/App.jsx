// App — HUD overlay layout: circuit background · central visualizer · floating panels · header/footer.

import { useState, useEffect, useRef, useCallback } from 'react';
import TodoForm         from './components/TodoForm';
import TodoList         from './components/TodoList';
import ChatBot          from './components/ChatBot';
import FolderOrganizer  from './components/FolderOrganizer';
import JarvisVisualizer from './components/JarvisVisualizer';
import StartupOverlay   from './components/StartupOverlay';
import HelpModal        from './components/HelpModal';
import WebsitePreview   from './components/WebsitePreview';
import QuickTodoList    from './components/QuickTodoList';
import FloatingPanel    from './components/FloatingPanel';
import CircuitBackground from './components/CircuitBackground';
import HudHeader        from './components/HudHeader';
import HudFooter        from './components/HudFooter';
import { createCalendarEvent } from './lib/googleCalendar';
import {
  startAmbient,
  stopAmbient,
  setAmbientVolume,
  duckAmbient,
  duckAmbientForSpeech,
  restoreAmbient,
} from './lib/ambientSound';

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
    setCalendarFormOpen(false);
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
  const [isMuted,         setIsMuted]         = useState(false);
  const micToggleRef  = useRef(null);
  const registerMicToggle = useCallback((fn) => { micToggleRef.current = fn; }, []);
  const handleMicClick    = useCallback(() => { micToggleRef.current?.(); }, []);

  // ── Chat insert (for footer buttons) ────────────────────────────────────────
  const chatInsertRef = useRef(null);
  const registerChatInsert = useCallback((fn) => { chatInsertRef.current = fn; }, []);
  const [isMicSupported, setIsMicSupported] = useState(true);
  const registerMicSupport = useCallback((supported) => { setIsMicSupported(supported); }, []);

  // ── Startup ───────────────────────────────────────────────────────────────
  const [startupDone, setStartupDone] = useState(() =>
    Boolean(sessionStorage.getItem(STARTUP_FLAG))
  );
  function handleStartupDone() {
    sessionStorage.setItem(STARTUP_FLAG, '1');
    setStartupDone(true);
  }

  // ── Ambient music ─────────────────────────────────────────────────────────
  const [isAmbientPlaying, setIsAmbientPlaying] = useState(true);
  const [ambientVolume,    setAmbientVolumeState] = useState(40);

  useEffect(() => {
    startAmbient();
    const resume = () => startAmbient();
    document.addEventListener('click',      resume, { once: true });
    document.addEventListener('keydown',    resume, { once: true });
    document.addEventListener('touchstart', resume, { once: true });
    return () => {
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

  function toggleAmbient() {
    if (isAmbientPlaying) { stopAmbient(); setIsAmbientPlaying(false); }
    else                  { startAmbient(); setIsAmbientPlaying(true); }
  }
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
  const [helpModalOpen,     setHelpModalOpen]     = useState(false);
  const [websitePreviewData, setWebsitePreviewData] = useState(null);
  const [calendarFormOpen,   setCalendarFormOpen]   = useState(false);
  const [folderOrgOpen,      setFolderOrgOpen]      = useState(false);
  const [chatMinimized,      setChatMinimized]       = useState(false);
  const [quickTodoFormOpen,  setQuickTodoFormOpen]  = useState(false);

  // ── Fullscreen change → force layout recalc ──────────────────────────────
  useEffect(() => {
    if (window.taskiAPI?.onFullscreenChange) {
      window.taskiAPI.onFullscreenChange(() => {
        window.dispatchEvent(new Event('resize'));
      });
    }
  }, []);

  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      height:         '100vh',
      width:          '100vw',
      overflow:       'hidden',
      position:       'relative',
    }}>
      {!startupDone && (
        <StartupOverlay onDone={handleStartupDone} isMuted={isMuted} />
      )}

      {/* ════ HUD Header — flex item, never clips in fullscreen ════ */}
      <HudHeader
        isAmbientPlaying={isAmbientPlaying}
        ambientVolume={ambientVolume}
        onAmbientToggle={toggleAmbient}
        onVolumeChange={handleAmbientVolume}
        onHelp={() => setHelpModalOpen(true)}
      />

      {/* ════ Content area — fills space between header and footer ════ */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>

        {/* ── Background layer ── */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0 }}>
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

        {/* ── Visualizer (behind panels, above background) ── */}
        <div
          aria-label="TASKI central visualizer"
          style={{
            position:      'absolute',
            top:           '50%',
            left:          '50%',
            transform:     'translate(-50%, -50%)',
            zIndex:        2,
            pointerEvents: 'none',
            display:       'flex',
            flexDirection: 'column',
            alignItems:    'center',
          }}
        >
          <JarvisVisualizer
            state={visualizerState}
            onMicClick={handleMicClick}
            isMuted={isMuted}
            onMuteToggle={() => setIsMuted((m) => !m)}
            isSupported={isMicSupported}
          />
        </div>

        {/* ── Left Upper Panel — Calendar Tasks ── */}
        <div style={{
          position:  'absolute',
          top:       '10px',
          left:      '16px',
          width:     '380px',
          zIndex:    10,
          animation: 'panelFadeIn 0.3s ease',
        }}>
          <FloatingPanel
            title="CALENDAR TASKS"
            icon="🗓"
            badge={pending.length || undefined}
            headerActions={
              <ToggleAddBtn
                open={calendarFormOpen}
                onClick={() => setCalendarFormOpen((v) => !v)}
              />
            }
          >
            {/* Collapsible add form */}
            <div style={{
              overflow:   'hidden',
              maxHeight:  calendarFormOpen ? '280px' : '0',
              transition: 'max-height 300ms ease',
              flexShrink: 0,
            }}>
              <div style={{ padding: '8px 12px 6px', borderBottom: '1px solid rgba(0,212,255,0.08)' }}>
                <TodoForm onAdd={handleAdd} />
              </div>
            </div>

            {/* Task list — scrolls when content overflows */}
            <div
              className="task-list panel-scroll"
              style={{
                maxHeight:  calendarFormOpen ? '0' : 'calc(45vh - 60px)',
                overflowY:  'auto',
                overflowX:  'hidden',
                minHeight:  0,
                padding:    calendarFormOpen ? '0' : '8px 10px',
                transition: 'max-height 300ms ease, padding 300ms ease',
              }}
            >
              {pending.length > 0 ? (
                <>
                  <SectionLabel>Pending · {pending.length}</SectionLabel>
                  <TodoList todos={pending} onToggle={handleToggle} onDelete={handleDelete} />
                </>
              ) : null}
              {completed.length > 0 ? (
                <>
                  <SectionLabel>Done · {completed.length}</SectionLabel>
                  <TodoList todos={completed} onToggle={handleToggle} onDelete={handleDelete} />
                </>
              ) : null}
              {todos.length === 0 && (
                <EmptyState text="No calendar tasks yet" />
              )}
            </div>
          </FloatingPanel>
        </div>

        {/* ── Left Lower Panel — To Do List ── */}
        <div style={{
          position:  'absolute',
          bottom:    '10px',
          left:      '16px',
          width:     '380px',
          zIndex:    10,
          animation: 'panelFadeIn 0.3s ease 0.1s both',
        }}>
          <FloatingPanel
            title="TO DO LIST"
            icon="✓"
            badge={quickTodoCount || undefined}
            headerActions={
              <ToggleAddBtn
                open={quickTodoFormOpen}
                onClick={() => setQuickTodoFormOpen((v) => !v)}
              />
            }
          >
            <div style={{
              display:        'flex',
              flexDirection:  'column',
              maxHeight:      'calc(45vh - 60px)',
              overflow:       'hidden',
            }}>
              <QuickTodoList onCountChange={setQuickTodoCount} showForm={quickTodoFormOpen} />
            </div>
          </FloatingPanel>
        </div>

        {/* ── Right Panel — Chat ── */}
        <div style={{
          position:     'absolute',
          top:          '10px',
          right:        '16px',
          width:        '340px',
          height:       chatMinimized ? '44px' : 'calc(100% - 20px)',
          zIndex:       10,
          borderRadius: '12px',
          overflow:     'hidden',
          border:       '1px solid rgba(0,212,255,0.22)',
          boxShadow:
            '0 0 0 1px rgba(0,212,255,0.08), 0 8px 32px rgba(0,0,0,0.65), inset 0 1px 0 rgba(0,212,255,0.1)',
          background:   'rgba(2, 15, 35, 0.82)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          transition:   'height 300ms ease',
          animation:    'panelFadeIn 0.3s ease 0.05s both',
        }}>
          <div aria-hidden="true" style={{
            position: 'absolute', top: 0, left: '5%', width: '90%', height: '1px', zIndex: 1,
            background: 'linear-gradient(90deg,transparent,rgba(0,212,255,0.8) 30%,rgba(0,212,255,1) 50%,rgba(0,212,255,0.8) 70%,transparent)',
          }} />
          {chatMinimized ? (
            <button
              onClick={() => setChatMinimized(false)}
              style={{
                width: '100%', height: '44px', background: 'none', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                padding: '0 14px',
              }}
            >
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00d4ff', boxShadow: '0 0 6px #00d4ff', animation: 'statusPulse 2s ease-in-out infinite' }} />
              <span style={{ fontFamily: "'Orbitron'", fontSize: '12px', letterSpacing: '0.12em', color: '#00d4ff' }}>TASKI · ONLINE</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => setChatMinimized(true)}
                aria-label="Minimize chat"
                style={{
                  position: 'absolute', top: '10px', right: '10px', zIndex: 10,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(0,212,255,0.4)', fontSize: '16px', lineHeight: 1, padding: '2px 6px',
                  transition: 'color 150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#00d4ff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(0,212,255,0.4)'; }}
              >
                –
              </button>
              <ChatBot
                onVisualizerState={setVisualizerState}
                registerMicToggle={registerMicToggle}
                registerMicSupport={registerMicSupport}
                isMuted={isMuted}
                onWebsiteGenerated={setWebsitePreviewData}
                registerChatInsert={registerChatInsert}
              />
            </>
          )}
        </div>

      </div>{/* end content area */}

      {/* ════ HUD Footer — flex item, always visible in fullscreen ════ */}
      <HudFooter
        onFiles={() => setFolderOrgOpen(true)}
        onImagen={() => chatInsertRef.current?.('/imagen ')}
        onWebsite={() => chatInsertRef.current?.('/website ')}
        onSkills={() => chatInsertRef.current?.('/')}
        visualizerState={visualizerState}
      />

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

      {/* ════ Website Preview ════ */}
      {websitePreviewData && (
        <WebsitePreview
          htmlContent={websitePreviewData.html}
          prompt={websitePreviewData.prompt}
          onClose={() => setWebsitePreviewData(null)}
          onRegenerate={() => setWebsitePreviewData(null)}
        />
      )}

      {/* ── Panel scrollbar styles ── */}
      <style>{`
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

// ── Small helper components ────────────────────────────────────────────────────

function ToggleAddBtn({ open, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={open ? 'Close add form' : 'Add new task'}
      style={{
        width:          '22px',
        height:         '22px',
        borderRadius:   '50%',
        border:         '1px solid rgba(0,212,255,0.5)',
        background:     open ? 'rgba(0,212,255,0.15)' : 'transparent',
        color:          '#00d4ff',
        fontSize:       '14px',
        lineHeight:     1,
        cursor:         'pointer',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        transition:     'all 150ms ease',
        flexShrink:     0,
        fontFamily:     'monospace',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background='rgba(0,212,255,0.2)'; e.currentTarget.style.boxShadow='0 0 8px rgba(0,212,255,0.4)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background=open ? 'rgba(0,212,255,0.15)' : 'transparent'; e.currentTarget.style.boxShadow='none'; }}
    >
      {open ? '×' : '+'}
    </button>
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
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      padding:        '20px 0',
      gap:            '8px',
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

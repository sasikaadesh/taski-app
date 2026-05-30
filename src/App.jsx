// App — root layout: three-zone Jarvis interface.
// LEFT: TASKI branding + todo form + todo list.
// CENTER: JarvisVisualizer animated SVG.
// RIGHT: ChatBot full-height panel.

import { useState, useEffect, useRef, useCallback } from 'react';
import TodoForm        from './components/TodoForm';
import TodoList        from './components/TodoList';
import ChatBot         from './components/ChatBot';
import FolderOrganizer from './components/FolderOrganizer';
import JarvisVisualizer from './components/JarvisVisualizer';
import StartupOverlay   from './components/StartupOverlay';
import DateTimeGadget   from './components/DateTimeGadget';
import LocationGadget   from './components/LocationGadget';
import MusicControls    from './components/MusicControls';
import HelpModal        from './components/HelpModal';
import { HelpCircle }   from 'lucide-react';
import { createCalendarEvent } from './lib/googleCalendar';
import {
  startAmbient,
  stopAmbient,
  setAmbientVolume,
  duckAmbient,
  duckAmbientForSpeech,
  restoreAmbient,
} from './lib/ambientSound';

const STORAGE_KEY    = 'taski-todos';
const STARTUP_FLAG   = 'taski-startup-done';

function loadTodos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export default function App() {
  // ── Todos ─────────────────────────────────────────────────────────────────
  const [todos, setTodos] = useState(loadTodos);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
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
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  }

  function handleDelete(id) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  const pending   = todos.filter((t) => !t.done);
  const completed = todos.filter((t) => t.done);

  // ── Jarvis state ──────────────────────────────────────────────────────────
  const [visualizerState, setVisualizerState] = useState('idle');
  const [isMuted, setIsMuted]                 = useState(false);

  // micToggleRef is populated by ChatBot on mount so the visualizer can trigger it
  const micToggleRef = useRef(null);
  const registerMicToggle = useCallback((fn) => {
    micToggleRef.current = fn;
  }, []);

  const handleMicClick = useCallback(() => {
    micToggleRef.current?.();
  }, []);

  // ── Startup animation (once per session) ──────────────────────────────────
  const [startupDone, setStartupDone] = useState(() =>
    Boolean(sessionStorage.getItem(STARTUP_FLAG))
  );

  function handleStartupDone() {
    sessionStorage.setItem(STARTUP_FLAG, '1');
    setStartupDone(true);
  }

  // ── Ambient music state ───────────────────────────────────────────────────
  const [isAmbientPlaying, setIsAmbientPlaying] = useState(true);
  const [ambientVolume,    setAmbientVolumeState] = useState(40); // 0–100

  // Attempt autoplay immediately; re-attempt on first interaction as fallback
  // (browsers may block autoplay until the user has interacted with the page)
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

  // Duck / restore ambient music based on visualizer state
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
    if (isAmbientPlaying) {
      stopAmbient();
      setIsAmbientPlaying(false);
    } else {
      startAmbient();
      setIsAmbientPlaying(true);
    }
  }

  function handleAmbientVolume(val) {
    setAmbientVolumeState(val);
    setAmbientVolume(val / 100);
  }

  // ── Help modal ────────────────────────────────────────────────────────────
  const [helpModalOpen, setHelpModalOpen] = useState(false);

  // ── Responsive: mobile todo sidebar ──────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── isMicSupported (queried from ChatBot via a registered callback) ───────
  const [isMicSupported, setIsMicSupported] = useState(true);
  const registerMicSupport = useCallback((supported) => {
    setIsMicSupported(supported);
  }, []);

  return (
    <>
      {/* ── Startup overlay (plays once per session) ── */}
      {!startupDone && (
        <StartupOverlay onDone={handleStartupDone} isMuted={isMuted} />
      )}

      {/* ── Three-zone layout ── */}
      <div
        style={{
          display:       'flex',
          height:        '100svh',
          overflow:      'hidden',
          position:      'relative',
        }}
      >

        {/* ════════════════════════════════════════
            LEFT ZONE — branding + todos
        ════════════════════════════════════════ */}
        <div
          className="left-zone"
          style={{
            width:         '30%',
            minWidth:      '280px',
            flexShrink:    0,
            display:       'flex',
            flexDirection: 'column',
            borderRight:   '1px solid rgba(0,212,255,0.15)',
            overflow:      'hidden',
          }}
        >
          {/* Brand header */}
          <div
            style={{
              padding:      '24px 24px 16px',
              borderBottom: '1px solid rgba(0,212,255,0.1)',
              flexShrink:   0,
              background:   'rgba(0,212,255,0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {/* Logo + title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* Tron T icon */}
                <div
                  style={{
                    width:          '32px',
                    height:         '32px',
                    border:         '1px solid #00d4ff',
                    borderRadius:   '3px',
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    boxShadow:      '0 0 14px rgba(0,212,255,0.3), inset 0 0 10px rgba(0,212,255,0.05)',
                    flexShrink:     0,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <rect x="1" y="2" width="14" height="2" fill="#00d4ff"/>
                    <rect x="6.5" y="4" width="3" height="10" fill="#00d4ff"/>
                  </svg>
                </div>

                <div>
                  <h1
                    style={{
                      fontFamily:    "'Orbitron', sans-serif",
                      fontSize:      '22px',
                      fontWeight:    700,
                      letterSpacing: '0.1em',
                      color:         '#00d4ff',
                      textShadow:    '0 0 20px rgba(0,212,255,0.8)',
                      margin:        0,
                      lineHeight:    1,
                    }}
                  >
                    TASKI
                  </h1>
                  <p
                    style={{
                      fontFamily:    "'Rajdhani', sans-serif",
                      fontSize:      '10px',
                      letterSpacing: '0.12em',
                      color:         'rgba(0,212,255,0.45)',
                      textTransform: 'uppercase',
                      margin:        '3px 0 0',
                      lineHeight:    1,
                    }}
                  >
                    Smart Scheduling
                  </p>
                </div>
              </div>

              {/* Help button */}
              <HelpButton onClick={() => setHelpModalOpen(true)} />
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
              <span
                style={{
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '10px',
                  fontWeight:    500,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  padding:       '2px 10px',
                  borderRadius:  '100px',
                  background:    'rgba(0,212,255,0.08)',
                  border:        '1px solid rgba(0,212,255,0.25)',
                  color:         '#00d4ff',
                }}
              >
                {pending.length} pending
              </span>
              {completed.length > 0 && (
                <span
                  style={{
                    fontFamily:    "'Rajdhani', sans-serif",
                    fontSize:      '10px',
                    fontWeight:    500,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    padding:       '2px 10px',
                    borderRadius:  '100px',
                    background:    'rgba(0,255,136,0.06)',
                    border:        '1px solid rgba(0,255,136,0.25)',
                    color:         '#00ff88',
                  }}
                >
                  {completed.length} done
                </span>
              )}
            </div>
          </div>

          {/* Scrollable content: form + list */}
          <div
            style={{
              flex:       1,
              overflowY:  'auto',
              padding:    '20px 20px 24px',
              display:    'flex',
              flexDirection: 'column',
              gap:        '20px',
            }}
          >
            {/* Todo form */}
            <TodoForm onAdd={handleAdd} />

            {/* Pending list */}
            {pending.length > 0 && (
              <section>
                <h2
                  style={{
                    fontFamily:    "'Rajdhani', sans-serif",
                    fontSize:      '10px',
                    fontWeight:    500,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color:         'rgba(74,155,190,0.7)',
                    marginBottom:  '10px',
                    margin:        '0 0 10px',
                  }}
                >
                  Pending · {pending.length}
                </h2>
                <TodoList todos={pending} onToggle={handleToggle} onDelete={handleDelete} />
              </section>
            )}

            {/* Completed list */}
            {completed.length > 0 && (
              <section>
                <h2
                  style={{
                    fontFamily:    "'Rajdhani', sans-serif",
                    fontSize:      '10px',
                    fontWeight:    500,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color:         'rgba(74,155,190,0.7)',
                    margin:        '0 0 10px',
                  }}
                >
                  Completed · {completed.length}
                </h2>
                <TodoList todos={completed} onToggle={handleToggle} onDelete={handleDelete} />
              </section>
            )}

            {todos.length === 0 && (
              <div
                style={{
                  display:        'flex',
                  flexDirection:  'column',
                  alignItems:     'center',
                  justifyContent: 'center',
                  paddingTop:     '40px',
                  gap:            '12px',
                }}
              >
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
                  <rect x="1" y="1" width="42" height="42" rx="3" stroke="rgba(0,212,255,0.15)" strokeWidth="1"/>
                  <rect x="7" y="13" width="30" height="1" fill="rgba(0,212,255,0.12)"/>
                  <rect x="7" y="21" width="30" height="1" fill="rgba(0,212,255,0.12)"/>
                  <rect x="7" y="29" width="30" height="1" fill="rgba(0,212,255,0.12)"/>
                  <rect x="7" y="11" width="3" height="3" fill="rgba(0,212,255,0.25)"/>
                  <rect x="7" y="19" width="3" height="3" fill="rgba(0,212,255,0.25)"/>
                  <rect x="7" y="27" width="3" height="3" fill="rgba(0,212,255,0.25)"/>
                </svg>
                <p
                  style={{
                    fontFamily:    "'Rajdhani', sans-serif",
                    fontSize:      '12px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color:         'rgba(30,77,107,0.9)',
                    margin:        0,
                    textAlign:     'center',
                  }}
                >
                  No tasks — add one above
                </p>
              </div>
            )}

            {/* Folder organizer — visible only when running in Electron */}
            <FolderOrganizer />
          </div>
        </div>

        {/* ════════════════════════════════════════
            CENTER ZONE — Jarvis visualizer + gadgets
        ════════════════════════════════════════ */}
        <div
          className="center-zone"
          style={{
            flex:      1,
            display:   'flex',
            flexDirection: 'column',
            position:  'relative',
            overflow:  'hidden',
          }}
        >
          {/* Background scan-line effect */}
          <div
            aria-hidden="true"
            style={{
              position:      'absolute',
              inset:         0,
              background:    'linear-gradient(to bottom, transparent 40%, rgba(0,212,255,0.015) 50%, transparent 60%)',
              animation:     'scanLine 6s ease-in-out infinite',
              pointerEvents: 'none',
              zIndex:        0,
            }}
          />

          {/* Scrollable inner column */}
          <div
            style={{
              position:       'relative',
              zIndex:         1,
              flex:           1,
              overflowY:      'auto',
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              padding:        '32px 24px 40px',
              gap:            0,
            }}
          >
            {/* Visualizer */}
            <JarvisVisualizer
              state={visualizerState}
              onMicClick={handleMicClick}
              isMuted={isMuted}
              onMuteToggle={() => setIsMuted((m) => !m)}
              isSupported={isMicSupported}
            />

            {/* Gap between visualizer and DateTime */}
            <div style={{ height: '32px', flexShrink: 0 }} />

            {/* DateTime gadget (includes its own top + bottom dividers) */}
            <DateTimeGadget />

            {/* Gap + Location gadget */}
            <div style={{ height: '24px', flexShrink: 0 }} />
            <LocationGadget />

            {/* Dashed divider before music controls */}
            <div style={{ height: '24px', flexShrink: 0 }} />
            <div
              aria-hidden="true"
              style={{
                width:     '80%',
                borderTop: '1px dashed rgba(0,212,255,0.2)',
                marginBottom: '20px',
              }}
            />

            {/* Ambient music controls */}
            <MusicControls
              playing={isAmbientPlaying}
              volume={ambientVolume}
              onToggle={toggleAmbient}
              onVolumeChange={handleAmbientVolume}
            />
          </div>
        </div>

        {/* ════════════════════════════════════════
            RIGHT ZONE — ChatBot panel
        ════════════════════════════════════════ */}
        <div
          className="right-zone"
          style={{
            width:       '35%',
            minWidth:    '300px',
            maxWidth:    '480px',
            flexShrink:  0,
            borderLeft:  '1px solid rgba(0,212,255,0.15)',
            display:     'flex',
            flexDirection: 'column',
            overflow:    'hidden',
          }}
        >
          <ChatBot
            onVisualizerState={setVisualizerState}
            registerMicToggle={registerMicToggle}
            registerMicSupport={registerMicSupport}
            isMuted={isMuted}
          />
        </div>
      </div>

      {/* ── Responsive: mobile todo toggle button ── */}
      <style>{`
        @media (max-width: 900px) {
          .left-zone {
            position: fixed !important;
            top: 0;
            left: ${sidebarOpen ? '0' : '-100%'};
            height: 100svh;
            width: 85% !important;
            min-width: unset !important;
            max-width: 360px;
            z-index: 200;
            background: var(--color-bg-base);
            transition: left 300ms ease;
            border-right: 1px solid rgba(0,212,255,0.25) !important;
          }
          .center-zone {
            display: flex !important;
            width: 100% !important;
            flex: 1 !important;
          }
          .right-zone {
            position: fixed !important;
            bottom: 0;
            left: 0;
            right: 0;
            height: 45svh;
            width: 100% !important;
            min-width: unset !important;
            max-width: unset !important;
            border-left: none !important;
            border-top: 1px solid rgba(0,212,255,0.2);
            z-index: 100;
          }
        }
      `}</style>

      {/* Mobile sidebar toggle */}
      <button
        className="mobile-todo-btn"
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label={sidebarOpen ? 'Close task panel' : 'Open task panel'}
        style={{
          display:        'none',
          position:       'fixed',
          top:            '12px',
          left:           '12px',
          zIndex:         300,
          background:     'rgba(0,212,255,0.08)',
          border:         '1px solid rgba(0,212,255,0.4)',
          borderRadius:   '6px',
          padding:        '8px 12px',
          color:          '#00d4ff',
          fontFamily:     "'Rajdhani', sans-serif",
          fontSize:       '12px',
          letterSpacing:  '0.1em',
          textTransform:  'uppercase',
          cursor:         'pointer',
        }}
      >
        {sidebarOpen ? '✕ Close' : '☰ Tasks'}
      </button>
      <style>{`
        @media (max-width: 900px) {
          .mobile-todo-btn { display: block !important; }
        }
      `}</style>

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
          style={{
            display:    'none',
            position:   'fixed',
            inset:      0,
            background: 'rgba(0,0,0,0.6)',
            zIndex:     150,
          }}
          className="sidebar-backdrop"
        />
      )}
      <style>{`
        @media (max-width: 900px) {
          .sidebar-backdrop { display: block !important; }
        }
      `}</style>

      {/* Help modal — rendered at root level so it overlays everything */}
      <HelpModal isOpen={helpModalOpen} onClose={() => setHelpModalOpen(false)} />
    </>
  );
}

// ── Help icon button ──────────────────────────────────────────────────────────

function HelpButton({ onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      {hovered && (
        <span
          style={{
            position:      'absolute',
            bottom:        '100%',
            left:          '50%',
            transform:     'translateX(-50%)',
            marginBottom:  '6px',
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '10px',
            fontWeight:    600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color:         'var(--color-neon-cyan)',
            background:    'var(--color-bg-overlay)',
            border:        '1px solid var(--color-border)',
            borderRadius:  '3px',
            padding:       '2px 8px',
            whiteSpace:    'nowrap',
            pointerEvents: 'none',
          }}
        >
          HELP
        </span>
      )}
      <button
        onClick={onClick}
        aria-label="Open help"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width:        '32px',
          height:       '32px',
          borderRadius: '50%',
          border:       '1px solid var(--color-border)',
          background:   hovered ? 'var(--color-bg-raised)' : 'transparent',
          color:        hovered ? 'var(--color-neon-cyan)' : 'var(--color-text-secondary)',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          cursor:       'pointer',
          boxShadow:    hovered ? '0 0 12px rgba(0,212,255,0.5)' : 'none',
          transition:   'all 200ms ease-in-out',
          flexShrink:   0,
        }}
      >
        <HelpCircle size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

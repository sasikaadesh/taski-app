// App — root layout: header, two-column todo panel, calendar banner, floating chatbot.

import { useState, useEffect } from 'react';
import TodoForm from './components/TodoForm';
import TodoList from './components/TodoList';
import ChatBot from './components/ChatBot';
import { createCalendarEvent } from './lib/googleCalendar';

const STORAGE_KEY = 'taski-todos';

function loadTodos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [todos, setTodos] = useState(loadTodos);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  function handleAdd(todo) {
    // Add to local state immediately so the UI is responsive.
    // Conflict detection already ran inside TodoForm BEFORE this is called,
    // so we never race against a just-created calendar event here.
    setTodos((prev) => [todo, ...prev]);

    if (todo.date) {
      createCalendarEvent(todo)
        .then(() => {
          setTodos((prev) =>
            prev.map((t) => (t.id === todo.id ? { ...t, calendarAdded: true } : t))
          );
        })
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

  return (
    <div style={{ minHeight: '100svh' }}>

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-40"
        style={{
          background:  'var(--color-bg-muted)',
          borderBottom: '1px solid var(--color-border)',
          boxShadow:   '0 1px 20px rgba(0,212,255,0.1)',
        }}
      >
        <div className="max-w-[1200px] mx-auto px-8 py-4 flex items-center justify-between">
          {/* Logo + name */}
          <div className="flex items-center gap-3">
            {/* Tron-style icon box — outlined, not filled */}
            <div
              style={{
                width:        '36px',
                height:       '36px',
                border:       '1px solid var(--color-neon-cyan)',
                borderRadius: '4px',
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'center',
                boxShadow:    '0 0 12px rgba(0,212,255,0.3), inset 0 0 12px rgba(0,212,255,0.05)',
              }}
            >
              {/* Custom T mark in Tron style */}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <rect x="1" y="2" width="16" height="2" fill="#00d4ff"/>
                <rect x="7.5" y="4" width="3" height="12" fill="#00d4ff"/>
              </svg>
            </div>

            <div>
              <h1
                style={{
                  fontFamily:   "'Orbitron', sans-serif",
                  fontSize:     '20px',
                  fontWeight:   700,
                  letterSpacing: '0.08em',
                  color:        'var(--color-neon-cyan)',
                  textShadow:   '0 0 20px rgba(0,212,255,0.8)',
                  lineHeight:   1,
                  margin:       0,
                }}
              >
                TASKI
              </h1>
              <p
                style={{
                  fontFamily:   "'Rajdhani', sans-serif",
                  fontSize:     '11px',
                  letterSpacing: '0.08em',
                  color:        'var(--color-text-secondary)',
                  textTransform: 'uppercase',
                  marginTop:    '2px',
                  lineHeight:   1,
                }}
              >
                Smart todos, smarter scheduling
              </p>
            </div>
          </div>

          {/* Stats badges */}
          <div className="flex items-center gap-2">
            <span
              style={{
                fontFamily:   "'Rajdhani', sans-serif",
                fontSize:     '11px',
                fontWeight:   500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding:       '3px 12px',
                borderRadius:  '100px',
                background:    'var(--color-neon-cyan-glow)',
                border:        '1px solid var(--color-neon-cyan-border)',
                color:         'var(--color-neon-cyan)',
                boxShadow:     '0 0 10px rgba(0,212,255,0.3)',
              }}
            >
              {pending.length} pending
            </span>

            {completed.length > 0 && (
              <span
                style={{
                  fontFamily:   "'Rajdhani', sans-serif",
                  fontSize:     '11px',
                  fontWeight:   500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding:       '3px 12px',
                  borderRadius:  '100px',
                  background:    'rgba(0,255,136,0.08)',
                  border:        '1px solid rgba(0,255,136,0.3)',
                  color:         'var(--color-success)',
                  boxShadow:     '0 0 10px rgba(0,255,136,0.2)',
                }}
              >
                {completed.length} done
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-[1200px] mx-auto px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">

          {/* ── Left column: form (conflict banner is rendered inside TodoForm) ── */}
          <div className="lg:sticky lg:top-[81px]">
            <TodoForm onAdd={handleAdd} />
          </div>

          {/* ── Right column: todo lists ── */}
          <div>
            {pending.length > 0 && (
              <section>
                <h2
                  style={{
                    fontFamily:   "'Rajdhani', sans-serif",
                    fontSize:     '11px',
                    fontWeight:   500,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color:        'var(--color-text-secondary)',
                    marginBottom: '12px',
                  }}
                >
                  Pending · {pending.length}
                </h2>
                <TodoList todos={pending} onToggle={handleToggle} onDelete={handleDelete} />
              </section>
            )}

            {completed.length > 0 && (
              <section className={pending.length > 0 ? 'mt-8' : ''}>
                <h2
                  style={{
                    fontFamily:   "'Rajdhani', sans-serif",
                    fontSize:     '11px',
                    fontWeight:   500,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color:        'var(--color-text-secondary)',
                    marginBottom: '12px',
                  }}
                >
                  Completed · {completed.length}
                </h2>
                <TodoList todos={completed} onToggle={handleToggle} onDelete={handleDelete} />
              </section>
            )}

            {todos.length === 0 && (
              <div
                className="flex flex-col items-center justify-center py-20 gap-4"
                style={{ color: 'var(--color-text-dim)' }}
              >
                {/* Tron-style empty state grid icon */}
                <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true">
                  <rect x="1" y="1" width="50" height="50" rx="4" stroke="rgba(0,212,255,0.2)" strokeWidth="1"/>
                  <rect x="8"  y="15" width="36" height="1" fill="rgba(0,212,255,0.15)"/>
                  <rect x="8"  y="25" width="36" height="1" fill="rgba(0,212,255,0.15)"/>
                  <rect x="8"  y="35" width="36" height="1" fill="rgba(0,212,255,0.15)"/>
                  <rect x="8"  y="13" width="3"  height="3" fill="rgba(0,212,255,0.3)"/>
                  <rect x="8"  y="23" width="3"  height="3" fill="rgba(0,212,255,0.3)"/>
                  <rect x="8"  y="33" width="3"  height="3" fill="rgba(0,212,255,0.3)"/>
                </svg>
                <p
                  style={{
                    fontFamily:   "'Rajdhani', sans-serif",
                    fontSize:     '13px',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color:        'var(--color-text-dim)',
                  }}
                >
                  No tasks — add one to begin
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Floating ChatBot ── */}
      <ChatBot />
    </div>
  );
}

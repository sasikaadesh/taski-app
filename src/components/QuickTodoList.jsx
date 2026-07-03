/* QuickTodoList — simple local todo list saved to Documents/Taski/quicktodos.json */

import { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';

function getTomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function isTomorrow(dueDate) {
  return dueDate === 'tomorrow' || dueDate === getTomorrowStr();
}

function formatDueLabel(dueDate) {
  if (dueDate === 'tomorrow' || dueDate === getTomorrowStr()) return 'TOMORROW';
  if (dueDate === 'this-week') return 'THIS WEEK';
  try {
    const d = new Date(dueDate + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  } catch { return dueDate; }
}

const PRIORITY_COLORS = {
  high:   'var(--color-danger)',
  medium: 'var(--color-warning)',
  low:    'var(--color-success)',
};

function getDayLabel(offset) {
  if (offset === 0)  return 'TODAY';
  if (offset === -1) return 'YESTERDAY';
  if (offset === 1)  return 'TOMORROW';
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
}

function getDateForOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

function getTodosForDay(todos, offset) {
  const targetDate   = getDateForOffset(offset);
  const todayStr     = getDateForOffset(0);
  const tomorrowStr  = getDateForOffset(1);
  const yesterdayStr = getDateForOffset(-1);

  return todos.filter((todo) => {
    let due = todo.dueDate;
    if (!due) return offset === 0; // no due date → only on today

    if (due === 'today')     due = todayStr;
    if (due === 'tomorrow')  due = tomorrowStr;
    if (due === 'yesterday') due = yesterdayStr;
    if (due === 'this-week') return offset === 0; // this-week → show on today only

    return due === targetDate;
  });
}

export default function QuickTodoList({ onCountChange, showForm = true }) {
  const [todos,        setTodos]        = useState([]);
  const [newTitle,     setNewTitle]     = useState('');
  const [newDate,      setNewDate]      = useState(() => new Date().toISOString().split('T')[0]);
  const [activeDateBtn,setActiveDateBtn]= useState('today');
  const [newPriority,  setNewPriority]  = useState('medium');
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime,   setNewEndTime]   = useState('');
  const [timeError,    setTimeError]    = useState('');
  const [timeWarning,  setTimeWarning]  = useState('');
  const [showDone,     setShowDone]     = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [dayOffset,    setDayOffset]    = useState(0);

  useEffect(() => {
    async function load() {
      if (window.taskiAPI?.quickTodosLoad) {
        const data = await window.taskiAPI.quickTodosLoad();
        setTodos(data || []);
      } else {
        const saved = localStorage.getItem('taski-quicktodos');
        setTodos(saved ? JSON.parse(saved) : []);
      }
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    onCountChange?.(todos.filter((t) => !t.done).length);
  }, [todos, onCountChange]);

  async function saveTodos(updated) {
    setTodos(updated);
    if (window.taskiAPI?.quickTodosSave) {
      await window.taskiAPI.quickTodosSave(updated);
    } else {
      localStorage.setItem('taski-quicktodos', JSON.stringify(updated));
    }
  }

  function handleAdd() {
    if (!newTitle.trim()) return;
    if (newStartTime && newEndTime && newEndTime <= newStartTime) {
      setTimeError('End time must be after start');
      return;
    }
    const todo = {
      id:        `qt_${Date.now()}`,
      title:     newTitle.trim(),
      dueDate:   newDate,
      dueTime:   newStartTime || null,
      endTime:   newEndTime   || null,
      priority:  newPriority,
      done:      false,
      createdAt: new Date().toISOString(),
    };
    saveTodos([todo, ...todos]);
    setNewTitle('');
    setNewDate(new Date().toISOString().split('T')[0]);
    setActiveDateBtn('today');
    setNewPriority('medium');
    setNewStartTime('');
    setNewEndTime('');
    setTimeError('');
    setTimeWarning('');
  }

  function handleStartTimeChange(val) {
    setNewStartTime(val);
    setTimeError('');
    if (!val && newEndTime) setTimeWarning('Add a start time too');
    else setTimeWarning('');
  }

  function handleEndTimeChange(val) {
    setNewEndTime(val);
    setTimeError('');
    if (val && !newStartTime) setTimeWarning('Add a start time too');
    else setTimeWarning('');
    if (newStartTime && val && val <= newStartTime) setTimeError('End time must be after start');
  }

  function handleComplete(id) {
    saveTodos(todos.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }

  function handleDelete(id) {
    saveTodos(todos.filter(t => t.id !== id));
  }

  if (loading) return null;

  const canAdd  = newTitle.trim().length > 0;

  const dayTodos    = getTodosForDay(todos, dayOffset);
  const activeTodos = dayTodos.filter((t) => !t.done);
  const doneTodos   = dayTodos.filter((t) => t.done);

  // Shared nav button style
  const navBtnStyle = {
    background: 'transparent', border: '1px solid rgba(0,212,255,0.2)', borderRadius: '4px',
    color: 'rgba(0,212,255,0.6)', width: '22px', height: '22px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
    flexShrink: 0, transition: 'all 0.15s', padding: 0, lineHeight: 1,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* ── Add form — never scrolls ─────────────── */}
      {showForm && <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 10px', borderBottom: '1px solid rgba(0,212,255,0.1)' }}>

        {/* Title input */}
        <input
          type="text"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="What needs to be done?"
          style={{
            width:       '100%',
            boxSizing:   'border-box',
            background:  'var(--color-bg-raised)',
            border:      '1px solid var(--color-border)',
            borderRadius:'4px',
            padding:     '8px 12px',
            color:       'var(--color-text-primary)',
            fontFamily:  "'Rajdhani', sans-serif",
            fontSize:    '14px',
            outline:     'none',
          }}
          onFocus={e  => { e.target.style.borderColor = 'var(--color-neon-cyan)'; e.target.style.boxShadow = '0 0 8px rgba(0,212,255,0.2)'; }}
          onBlur={e   => { e.target.style.borderColor = 'var(--color-border)';    e.target.style.boxShadow = 'none'; }}
        />

        {/* Date quick-select buttons */}
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'nowrap' }}>
          {[
            { key: 'today',    label: 'TODAY',     getDate: () => new Date() },
            { key: 'tomorrow', label: 'TOMORROW',  getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); return d; } },
            { key: 'week',     label: 'THIS WEEK', getDate: () => { const d = new Date(); d.setDate(d.getDate() + 7); return d; } },
          ].map(({ key, label, getDate }) => {
            const active = activeDateBtn === key;
            return (
              <button
                key={key}
                onClick={() => { setNewDate(getDate().toISOString().split('T')[0]); setActiveDateBtn(key); }}
                style={{
                  flex: 1, padding: '4px 4px', borderRadius: '6px',
                  border: `1px solid ${active ? 'rgba(0,212,255,0.7)' : 'rgba(0,212,255,0.2)'}`,
                  background: active ? 'rgba(0,212,255,0.15)' : 'transparent',
                  color: active ? '#00d4ff' : 'rgba(0,212,255,0.5)',
                  fontFamily: "'Rajdhani', sans-serif", fontSize: '10px', fontWeight: 600,
                  letterSpacing: '0.05em', cursor: 'pointer', textTransform: 'uppercase',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
              >
                {label}
              </button>
            );
          })}
          <input
            type="date"
            value={newDate}
            min={new Date().toISOString().split('T')[0]}
            onChange={e => { setNewDate(e.target.value); setActiveDateBtn('custom'); }}
            style={{
              flex: 1, background: activeDateBtn === 'custom' ? 'rgba(0,212,255,0.1)' : 'rgba(0,212,255,0.05)',
              border: `1px solid ${activeDateBtn === 'custom' ? 'rgba(0,212,255,0.5)' : 'rgba(0,212,255,0.2)'}`,
              borderRadius: '6px', padding: '4px 6px', color: '#e0f4ff',
              fontFamily: "'Rajdhani', sans-serif", fontSize: '10px', colorScheme: 'dark',
              cursor: 'pointer', width: '36px', minWidth: '36px', outline: 'none',
            }}
          />
        </div>

        {/* Time pickers — FROM / TO */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { label: 'FROM ⏰', value: newStartTime, onChange: handleStartTimeChange },
            { label: 'TO ⏰',   value: newEndTime,   onChange: handleEndTimeChange },
          ].map(({ label, value, onChange }) => (
            <div key={label} style={{ flex: 1 }}>
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: '10px', letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--color-text-secondary)',
                marginBottom: '3px',
              }}>
                {label}
              </div>
              <input
                type="time"
                value={value}
                onChange={e => onChange(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background:  'var(--color-bg-raised)',
                  border:      '1px solid var(--color-border)',
                  borderRadius: '4px',
                  padding:     '6px 10px',
                  color:       'var(--color-text-primary)',
                  fontFamily:  "'Rajdhani', sans-serif",
                  fontSize:    '13px',
                  outline:     'none',
                  colorScheme: 'dark',
                }}
                onFocus={e  => { e.target.style.borderColor = 'var(--color-neon-cyan)'; e.target.style.boxShadow = '0 0 8px rgba(0,212,255,0.2)'; }}
                onBlur={e   => { e.target.style.borderColor = 'var(--color-border)';    e.target.style.boxShadow = 'none'; }}
              />
            </div>
          ))}
        </div>

        {/* Time validation messages */}
        {timeError && (
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '11px', color: 'var(--color-danger)',
            marginTop: '-4px',
          }}>
            {timeError}
          </div>
        )}
        {!timeError && timeWarning && (
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '11px', color: 'var(--color-text-secondary)',
            marginTop: '-4px',
          }}>
            {timeWarning}
          </div>
        )}

        {/* Priority selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '11px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color:         'var(--color-text-secondary)',
            flexShrink:    0,
          }}>
            Priority:
          </span>
          {['high', 'medium', 'low'].map(p => {
            const active = newPriority === p;
            return (
              <button
                key={p}
                onClick={() => setNewPriority(p)}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          '5px',
                  background:   active ? 'rgba(0,212,255,0.06)' : 'transparent',
                  border:       'none',
                  cursor:       'pointer',
                  padding:      '2px 6px',
                  borderRadius: '4px',
                }}
              >
                <span style={{
                  width:        '8px',
                  height:       '8px',
                  borderRadius: '50%',
                  background:   PRIORITY_COLORS[p],
                  display:      'inline-block',
                  flexShrink:   0,
                  boxShadow:    active ? `0 0 6px ${PRIORITY_COLORS[p]}` : 'none',
                }} />
                <span style={{
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '11px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color:         active ? 'var(--color-text-primary)' : 'var(--color-text-dim)',
                }}>
                  {p === 'medium' ? 'MED' : p.toUpperCase()}
                </span>
              </button>
            );
          })}
        </div>

        {/* Add button */}
        <button
          onClick={handleAdd}
          disabled={!canAdd}
          style={{
            background:    canAdd ? 'rgba(0,212,255,0.12)' : 'rgba(0,212,255,0.04)',
            border:        `1px solid ${canAdd ? 'rgba(0,212,255,0.45)' : 'rgba(0,212,255,0.15)'}`,
            borderRadius:  '6px',
            padding:       '8px',
            color:         canAdd ? '#00d4ff' : 'rgba(0,212,255,0.3)',
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '11px',
            fontWeight:    600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor:        canAdd ? 'pointer' : 'not-allowed',
            width:         '100%',
            marginBottom:  '10px',
            transition:    'all 0.2s',
            display:       'block',
            flexShrink:    0,
          }}
          onMouseEnter={e => {
            if (canAdd) {
              e.currentTarget.style.background  = 'rgba(0,212,255,0.2)';
              e.currentTarget.style.boxShadow   = '0 0 12px rgba(0,212,255,0.2)';
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background  = canAdd ? 'rgba(0,212,255,0.12)' : 'rgba(0,212,255,0.04)';
            e.currentTarget.style.boxShadow   = 'none';
          }}
        >
          + ADD TODO
        </button>
      </div>}

      {/* ── Day navigation bar ───────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '5px 10px',
        borderBottom: '1px solid rgba(0,212,255,0.08)', gap: '6px', flexShrink: 0,
      }}>
        <button
          onClick={() => setDayOffset((p) => p - 1)}
          style={navBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#00d4ff'; e.currentTarget.style.color = '#00d4ff'; e.currentTarget.style.background = 'rgba(0,212,255,0.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)'; e.currentTarget.style.color = 'rgba(0,212,255,0.6)'; e.currentTarget.style.background = 'transparent'; }}
        >‹</button>

        <span style={{
          flex: 1, textAlign: 'center', fontSize: '10px', fontFamily: "'Rajdhani', sans-serif",
          fontWeight: 600, letterSpacing: '0.1em',
          color: dayOffset === 0 ? '#00d4ff' : 'rgba(0,212,255,0.5)',
        }}>
          {getDayLabel(dayOffset)}
        </span>

        {dayOffset !== 0 && (
          <button
            onClick={() => setDayOffset(0)}
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
          onClick={() => setDayOffset((p) => p + 1)}
          style={navBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#00d4ff'; e.currentTarget.style.color = '#00d4ff'; e.currentTarget.style.background = 'rgba(0,212,255,0.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)'; e.currentTarget.style.color = 'rgba(0,212,255,0.6)'; e.currentTarget.style.background = 'transparent'; }}
        >›</button>
      </div>

      {/* ── Count summary ─────────────────────────── */}
      {dayTodos.length > 0 && (
        <div style={{
          padding: '3px 10px', fontSize: '9px', fontFamily: "'Rajdhani', sans-serif",
          color: 'rgba(0,212,255,0.3)', letterSpacing: '0.08em',
          borderBottom: '1px solid rgba(0,212,255,0.05)',
        }}>
          {activeTodos.length} pending{doneTodos.length > 0 ? ` · ${doneTodos.length} done` : ''}
        </div>
      )}

      {/* ── Todo list — scrollable ───────────────── */}
      <div className="todo-list-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, padding: '4px 10px' }}>
        {dayTodos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <p style={{
              fontFamily: "'Rajdhani', sans-serif", fontSize: '12px', letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--color-text-dim)', margin: 0, lineHeight: 1.7,
            }}>
              NO TODOS FOR {getDayLabel(dayOffset)}{dayOffset === 0 && <><br />Click + to add one</>}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>

            {activeTodos.map((t) => (
              <TodoItem key={t.id} todo={t} onComplete={handleComplete} onDelete={handleDelete} />
            ))}

            {doneTodos.length > 0 && (
              <>
                <button
                  onClick={() => setShowDone((v) => !v)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: 'var(--color-text-dim)', padding: '4px 0', textAlign: 'left',
                  }}
                >
                  {showDone ? '[ HIDE COMPLETED ]' : `[ SHOW ${doneTodos.length} COMPLETED ]`}
                </button>
                {showDone && doneTodos.map((t) => (
                  <TodoItem key={t.id} todo={t} onComplete={handleComplete} onDelete={handleDelete} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TodoGroup({ title, count, todos, onComplete, onDelete }) {
  return (
    <div>
      {/* Section header with divider lines */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
        <span style={{
          fontFamily:    "'Rajdhani', sans-serif",
          fontSize:      '10px',
          fontWeight:    600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color:         'var(--color-text-secondary)',
          whiteSpace:    'nowrap',
        }}>
          {title}
        </span>
        <span style={{
          background:   'rgba(0,212,255,0.1)',
          border:       '1px solid rgba(0,212,255,0.3)',
          color:        'var(--color-neon-cyan)',
          borderRadius: '100px',
          fontSize:     '10px',
          padding:      '1px 6px',
          fontFamily:   "'Rajdhani', sans-serif",
        }}>
          {count}
        </span>
        <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {todos.map(t => (
          <TodoItem key={t.id} todo={t} onComplete={onComplete} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

const PRIORITY_PILL = {
  high:   { bg: 'rgba(255,68,68,0.12)',  border: 'rgba(255,68,68,0.4)',  color: '#ff6666', label: 'HIGH' },
  medium: { bg: 'rgba(255,170,0,0.12)', border: 'rgba(255,170,0,0.4)',  color: '#ffaa00', label: 'MED'  },
  low:    { bg: 'rgba(0,255,136,0.1)',  border: 'rgba(0,255,136,0.35)', color: '#00ff88', label: 'LOW'  },
};

function MetaPill({ children, bg, border, color }) {
  return (
    <span style={{
      fontFamily:    "'Rajdhani', sans-serif",
      fontSize:      '10px',
      letterSpacing: '0.06em',
      borderRadius:  '4px',
      padding:       '1px 5px',
      background:    bg,
      border:        `1px solid ${border}`,
      color,
      whiteSpace:    'nowrap',
      flexShrink:    0,
    }}>
      {children}
    </span>
  );
}

function TodoItem({ todo, onComplete, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const pri = PRIORITY_PILL[todo.priority] || PRIORITY_PILL.medium;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:      'flex',
        alignItems:   'flex-start',
        gap:          '8px',
        padding:      '7px 10px',
        background:   hovered ? 'var(--color-bg-overlay)' : 'var(--color-bg-raised)',
        border:       '1px solid var(--color-border)',
        borderRadius: '4px',
        opacity:      todo.done ? 0.5 : 1,
        transition:   'all 150ms ease',
      }}
    >
      {/* Checkbox */}
      <button
        onClick={() => onComplete(todo.id)}
        aria-label={todo.done ? 'Mark incomplete' : 'Mark complete'}
        style={{
          width:        '16px',
          height:       '16px',
          minWidth:     '16px',
          marginTop:    '2px',
          borderRadius: '50%',
          border:       `1px solid ${todo.done ? 'var(--color-success)' : 'var(--color-border)'}`,
          background:   todo.done ? 'var(--color-success)' : 'transparent',
          cursor:       'pointer',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          flexShrink:   0,
          padding:      0,
          transition:   'all 150ms ease',
        }}
      >
        {todo.done && <Check size={9} color="#000" strokeWidth={3} />}
      </button>

      {/* Title + meta pills */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily:     "'Rajdhani', sans-serif",
          fontSize:       '13px',
          fontWeight:     todo.done ? 400 : 500,
          color:          todo.done ? 'var(--color-text-dim)' : '#e0f4ff',
          textDecoration: todo.done ? 'line-through' : 'none',
          overflow:       'hidden',
          textOverflow:   'ellipsis',
          whiteSpace:     'nowrap',
        }}>
          {todo.title}
        </div>

        {/* Metadata pills row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', flexWrap: 'wrap' }}>
          <MetaPill
            bg="rgba(0,212,255,0.1)"
            border="rgba(0,212,255,0.3)"
            color="#00d4ff"
          >
            {formatDueLabel(todo.dueDate)}
          </MetaPill>

          {todo.dueTime && (
            <MetaPill
              bg="rgba(0,212,255,0.08)"
              border="rgba(0,212,255,0.25)"
              color="#7dd4f0"
            >
              {todo.dueTime}{todo.endTime ? `-${todo.endTime}` : ''}
            </MetaPill>
          )}

          <MetaPill bg={pri.bg} border={pri.border} color={pri.color}>
            {pri.label}
          </MetaPill>
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(todo.id)}
        aria-label="Delete todo"
        style={{
          background:  'none',
          border:      'none',
          cursor:      'pointer',
          color:       hovered ? 'rgba(255,68,68,0.8)' : 'transparent',
          padding:     '2px',
          marginTop:   '1px',
          display:     'flex',
          alignItems:  'center',
          flexShrink:  0,
          transition:  'color 150ms ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#ff4444'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = hovered ? 'rgba(255,68,68,0.8)' : 'transparent'; }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

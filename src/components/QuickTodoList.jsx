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

export default function QuickTodoList({ onCountChange }) {
  const [todos,        setTodos]        = useState([]);
  const [newTitle,     setNewTitle]     = useState('');
  const [newDate,      setNewDate]      = useState('tomorrow');
  const [newPriority,  setNewPriority]  = useState('medium');
  const [customDate,   setCustomDate]   = useState('');
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime,   setNewEndTime]   = useState('');
  const [timeError,    setTimeError]    = useState('');
  const [timeWarning,  setTimeWarning]  = useState('');
  const [showDone,     setShowDone]     = useState(false);
  const [loading,      setLoading]      = useState(true);

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
    onCountChange?.(todos.filter(t => !t.done).length);
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
    const dueDate = newDate === 'custom' ? (customDate || 'tomorrow') : newDate;
    const todo = {
      id:        `qt_${Date.now()}`,
      title:     newTitle.trim(),
      dueDate,
      dueTime:   newStartTime || null,
      endTime:   newEndTime   || null,
      priority:  newPriority,
      done:      false,
      createdAt: new Date().toISOString(),
    };
    saveTodos([todo, ...todos]);
    setNewTitle('');
    setNewDate('tomorrow');
    setNewPriority('medium');
    setCustomDate('');
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

  const activeTodos  = todos.filter(t => !t.done);
  const doneTodos    = todos.filter(t => t.done);
  const tomorrowList = activeTodos.filter(t => isTomorrow(t.dueDate));
  const thisWeekList = activeTodos.filter(t => !isTomorrow(t.dueDate));
  const minDate      = getTomorrowStr();
  const canAdd       = newTitle.trim().length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* ── Add form ─────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

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
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {[
            { key: 'tomorrow',  label: 'TOMORROW' },
            { key: 'this-week', label: 'THIS WEEK' },
            { key: 'custom',    label: 'DATE 📅' },
          ].map(({ key, label }) => {
            const active = newDate === key;
            return (
              <button
                key={key}
                onClick={() => setNewDate(key)}
                style={{
                  padding:       '4px 10px',
                  borderRadius:  '100px',
                  border:        `1px solid ${active ? 'var(--color-neon-cyan)' : 'var(--color-border)'}`,
                  background:    active ? 'var(--color-neon-cyan-glow)' : 'transparent',
                  color:         active ? 'var(--color-neon-cyan)' : 'var(--color-text-secondary)',
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '11px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  cursor:        'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
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

        {/* Custom date picker */}
        {newDate === 'custom' && (
          <input
            type="date"
            value={customDate}
            min={minDate}
            onChange={e => setCustomDate(e.target.value)}
            style={{
              background:   'var(--color-bg-raised)',
              border:       '1px solid var(--color-border)',
              borderRadius: '4px',
              padding:      '6px 10px',
              color:        'var(--color-text-primary)',
              fontFamily:   "'Rajdhani', sans-serif",
              fontSize:     '13px',
              outline:      'none',
              colorScheme:  'dark',
            }}
          />
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
            width:         '100%',
            padding:       '8px',
            background:    'transparent',
            border:        `1px solid ${canAdd ? 'var(--color-neon-cyan)' : 'var(--color-border)'}`,
            borderRadius:  '4px',
            color:         canAdd ? 'var(--color-neon-cyan)' : 'var(--color-text-dim)',
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '13px',
            fontWeight:    600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor:        canAdd ? 'pointer' : 'not-allowed',
            boxShadow:     canAdd ? '0 0 8px rgba(0,212,255,0.2)' : 'none',
            transition:    'all 200ms ease',
          }}
        >
          + ADD TODO
        </button>
      </div>

      {/* ── Todo list ─────────────────────────────── */}
      {activeTodos.length === 0 && doneTodos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <p style={{
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '12px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color:         'var(--color-text-dim)',
            margin:        0,
            lineHeight:    1.7,
          }}>
            NO TODOS YET<br />
            Add tasks for tomorrow<br />
            or the coming week
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

          {tomorrowList.length > 0 && (
            <TodoGroup title="TOMORROW" count={tomorrowList.length} todos={tomorrowList} onComplete={handleComplete} onDelete={handleDelete} />
          )}

          {thisWeekList.length > 0 && (
            <TodoGroup title="THIS WEEK" count={thisWeekList.length} todos={thisWeekList} onComplete={handleComplete} onDelete={handleDelete} />
          )}

          {doneTodos.length > 0 && (
            <>
              <button
                onClick={() => setShowDone(v => !v)}
                style={{
                  background:    'none',
                  border:        'none',
                  cursor:        'pointer',
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '11px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color:         'var(--color-text-dim)',
                  padding:       '4px 0',
                  textAlign:     'left',
                }}
              >
                {showDone ? '[ HIDE COMPLETED ]' : `[ SHOW ${doneTodos.length} COMPLETED ]`}
              </button>
              {showDone && doneTodos.map(t => (
                <TodoItem key={t.id} todo={t} onComplete={handleComplete} onDelete={handleDelete} />
              ))}
            </>
          )}
        </div>
      )}
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

function TodoItem({ todo, onComplete, onDelete }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:      'flex',
        alignItems:   'center',
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

      {/* Title + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily:     "'Rajdhani', sans-serif",
          fontSize:       '13px',
          color:          todo.done ? 'var(--color-text-dim)' : 'var(--color-text-primary)',
          textDecoration: todo.done ? 'line-through' : 'none',
          overflow:       'hidden',
          textOverflow:   'ellipsis',
          whiteSpace:     'nowrap',
        }}>
          {todo.title}
        </div>
        <div style={{
          fontFamily:    "'Rajdhani', sans-serif",
          fontSize:      '10px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color:         'var(--color-text-dim)',
          marginTop:     '1px',
        }}>
          {formatDueLabel(todo.dueDate)}
          {todo.dueTime && ` · ${todo.dueTime}${todo.endTime ? `-${todo.endTime}` : ''}`}
          {` · ${todo.priority === 'medium' ? 'MED' : todo.priority.toUpperCase()}`}
        </div>
      </div>

      {/* Priority dot */}
      <span style={{
        width:        '7px',
        height:       '7px',
        borderRadius: '50%',
        background:   PRIORITY_COLORS[todo.priority] || PRIORITY_COLORS.medium,
        flexShrink:   0,
      }} />

      {/* Delete */}
      <button
        onClick={() => onDelete(todo.id)}
        aria-label="Delete todo"
        style={{
          background:  'none',
          border:      'none',
          cursor:      'pointer',
          color:       hovered ? 'var(--color-danger)' : 'transparent',
          padding:     '2px',
          display:     'flex',
          alignItems:  'center',
          flexShrink:  0,
          transition:  'all 150ms ease',
          boxShadow:   hovered ? '0 0 6px rgba(255,45,85,0.4)' : 'none',
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

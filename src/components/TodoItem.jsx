// TodoItem — renders a single todo row with toggle-complete and delete actions.

import { Trash2, Calendar, Clock, CalendarCheck } from 'lucide-react';

/**
 * Props:
 *   todo     — { id, title, date, time, done, calendarAdded }
 *   onToggle(id) — flip done/undone
 *   onDelete(id) — remove the todo
 */
export default function TodoItem({ todo, onToggle, onDelete }) {
  return (
    <div
      className="group flex items-start gap-3"
      style={{
        background:    'var(--color-bg-raised)',
        border:        '1px solid var(--color-border)',
        borderLeft:    todo.done
          ? '2px solid var(--color-success)'
          : '2px solid transparent',
        borderRadius:  '6px',
        padding:       '16px',
        opacity:       todo.done ? 0.5 : 1,
        transition:    'border-color 250ms cubic-bezier(0.16,1,0.3,1), background 250ms cubic-bezier(0.16,1,0.3,1), box-shadow 250ms cubic-bezier(0.16,1,0.3,1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background   = 'var(--color-bg-overlay)';
        e.currentTarget.style.boxShadow    = '0 0 15px var(--color-neon-cyan-glow)';
        if (!todo.done) {
          e.currentTarget.style.borderLeft = '2px solid var(--color-neon-cyan)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background   = 'var(--color-bg-raised)';
        e.currentTarget.style.boxShadow    = 'none';
        e.currentTarget.style.borderLeft   = todo.done
          ? '2px solid var(--color-success)'
          : '2px solid transparent';
      }}
    >
      {/* ── Square Tron checkbox ── */}
      <button
        onClick={() => onToggle(todo.id)}
        aria-label={todo.done ? 'Mark incomplete' : 'Mark complete'}
        className="mt-0.5 flex-shrink-0 flex items-center justify-center"
        style={{
          width:        '18px',
          height:       '18px',
          minWidth:     '18px',
          borderRadius: '0px',                    /* sharp — no rounded corners */
          border:       todo.done
            ? '1px solid var(--color-neon-cyan)'
            : '1px solid var(--color-border)',
          background:   todo.done ? 'var(--color-neon-cyan)' : 'transparent',
          boxShadow:    todo.done ? '0 0 10px rgba(0,212,255,0.6)' : 'none',
          cursor:       'pointer',
          transition:   'background 150ms, border-color 150ms, box-shadow 150ms',
          padding:      0,
        }}
      >
        {todo.done && (
          /* Checkmark in dark bg color so it reads on the cyan fill */
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
            <path
              d="M1 4l3 3 5-6"
              stroke="var(--color-bg-base)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {/* ── Content ── */}
      <div className="flex-1 min-w-0">
        <p
          style={{
            fontFamily:     "'Rajdhani', sans-serif",
            fontSize:       '16px',
            fontWeight:     todo.done ? 400 : 500,
            letterSpacing:  '0.03em',
            color:          todo.done ? 'var(--color-text-dim)' : 'var(--color-text-primary)',
            textDecoration: todo.done ? 'line-through' : 'none',
            margin:         0,
            overflow:       'hidden',
            textOverflow:   'ellipsis',
            whiteSpace:     'nowrap',
          }}
        >
          {todo.title}
        </p>

        {(todo.date || todo.time) && (
          <div className="flex items-center gap-3 mt-1">
            {todo.date && (
              <span
                style={{
                  fontFamily:   "'Rajdhani', sans-serif",
                  fontSize:     '12px',
                  letterSpacing: '0.04em',
                  color:        'var(--color-text-dim)',
                  display:      'flex',
                  alignItems:   'center',
                  gap:          '4px',
                }}
              >
                <Calendar size={11} aria-hidden="true" />
                {todo.date}
              </span>
            )}
            {todo.time && (
              <span
                style={{
                  fontFamily:   "'Rajdhani', sans-serif",
                  fontSize:     '12px',
                  letterSpacing: '0.04em',
                  color:        'var(--color-text-dim)',
                  display:      'flex',
                  alignItems:   'center',
                  gap:          '4px',
                }}
              >
                <Clock size={11} aria-hidden="true" />
                {todo.time}
              </span>
            )}
          </div>
        )}

        {todo.calendarAdded && (
          <span
            style={{
              fontFamily:   "'Rajdhani', sans-serif",
              fontSize:     '11px',
              fontWeight:   500,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color:        'var(--color-success)',
              textShadow:   '0 0 8px rgba(0,255,136,0.6)',
              display:      'flex',
              alignItems:   'center',
              gap:          '4px',
              marginTop:    '4px',
            }}
          >
            <CalendarCheck size={11} aria-hidden="true" />
            Added to Google Calendar ✓
          </span>
        )}
      </div>

      {/* ── Delete button — visible only on row hover ── */}
      <button
        onClick={() => onDelete(todo.id)}
        aria-label="Delete task"
        className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100"
        style={{
          color:      'var(--color-text-dim)',
          background: 'none',
          border:     'none',
          cursor:     'pointer',
          padding:    '2px',
          minWidth:   '44px',
          minHeight:  '44px',
          display:    'flex',
          alignItems:   'center',
          justifyContent: 'center',
          transition: 'color 150ms, text-shadow 150ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color       = 'var(--color-danger)';
          e.currentTarget.style.textShadow  = '0 0 8px rgba(255,45,85,0.8)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color       = 'var(--color-text-dim)';
          e.currentTarget.style.textShadow  = 'none';
        }}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

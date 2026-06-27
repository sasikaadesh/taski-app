// TodoItem — compact single-row calendar task with bright date/time pill.

import { useState } from 'react';
import { Trash2, CalendarCheck } from 'lucide-react';

function formatDatePill(date, time, endTime) {
  if (!date && !time) return null;
  let datePart = '';
  if (date) {
    try {
      const d = new Date(date + 'T00:00:00');
      datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch { datePart = date; }
  }
  let timePart = '';
  if (time) {
    timePart = endTime ? `${time}-${endTime}` : time;
  }
  if (datePart && timePart) return `${datePart} · ${timePart}`;
  return datePart || timePart;
}

export default function TodoItem({ todo, onToggle, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const pill = formatDatePill(todo.date, todo.time, todo.endTime);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          '8px',
        padding:      '5px 10px',
        minHeight:    '36px',
        borderBottom: '1px solid rgba(0,212,255,0.06)',
        background:   hovered ? 'rgba(0,212,255,0.04)' : 'transparent',
        opacity:      todo.done ? 0.45 : 1,
        transition:   'all 150ms ease',
      }}
    >
      {/* Checkbox circle */}
      <button
        onClick={() => onToggle(todo.id)}
        aria-label={todo.done ? 'Mark incomplete' : 'Mark complete'}
        style={{
          width:        '14px',
          height:       '14px',
          minWidth:     '14px',
          borderRadius: '50%',
          border:       `1.5px solid ${todo.done ? '#00ff88' : 'rgba(0,212,255,0.4)'}`,
          background:   todo.done ? '#00ff88' : 'transparent',
          boxShadow:    todo.done ? '0 0 6px rgba(0,255,136,0.5)' : 'none',
          cursor:       'pointer',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          flexShrink:   0,
          padding:      0,
          transition:   'all 150ms ease',
        }}
      >
        {todo.done && (
          <svg width="7" height="6" viewBox="0 0 10 8" fill="none" aria-hidden="true">
            <path d="M1 4l3 3 5-6" stroke="#050a0e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {/* Title */}
      <span style={{
        fontFamily:    "'Rajdhani', sans-serif",
        fontSize:      '12px',
        fontWeight:    todo.done ? 400 : 500,
        color:         todo.done ? 'var(--color-text-dim)' : '#e0f4ff',
        textDecoration: todo.done ? 'line-through' : 'none',
        flex:          1,
        overflow:      'hidden',
        textOverflow:  'ellipsis',
        whiteSpace:    'nowrap',
        letterSpacing: '0.02em',
      }}>
        {todo.title}
      </span>

      {/* Date/time pill */}
      {pill && (
        <span style={{
          fontFamily:  "'Rajdhani', sans-serif",
          fontSize:    '10px',
          color:       '#00d4ff',
          background:  'rgba(0,212,255,0.12)',
          border:      '1px solid rgba(0,212,255,0.35)',
          borderRadius: '4px',
          padding:     '2px 6px',
          whiteSpace:  'nowrap',
          flexShrink:  0,
          letterSpacing: '0.04em',
        }}>
          {pill}
        </span>
      )}

      {/* Calendar synced badge */}
      {todo.calendarAdded && (
        <CalendarCheck size={11} color="#00ff88" style={{ flexShrink: 0 }} aria-label="Added to Google Calendar" />
      )}

      {/* Delete — hover only */}
      <button
        onClick={() => onDelete(todo.id)}
        aria-label="Delete task"
        style={{
          background: 'none',
          border:     'none',
          cursor:     'pointer',
          color:      hovered ? 'rgba(255,68,68,0.8)' : 'transparent',
          padding:    '2px',
          display:    'flex',
          alignItems: 'center',
          flexShrink: 0,
          transition: 'color 150ms ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#ff4444'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = hovered ? 'rgba(255,68,68,0.8)' : 'transparent'; }}
      >
        <Trash2 size={12} aria-hidden="true" />
      </button>
    </div>
  );
}

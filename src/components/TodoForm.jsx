// TodoForm — input form for creating a new todo with title, date, start time, and end time.
// Conflict check runs BEFORE the todo is added to the calendar so the newly
// created event can never be mistaken for a pre-existing conflict.

import { useState } from 'react';
import { Plus, Calendar, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { getCalendarEvents } from '../lib/googleCalendar';

// ── Conflict detection ────────────────────────────────────────────────────────

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/**
 * Fetch existing events for `date` and return the first one that overlaps with
 * the interval [startTime, endTime] (HH:MM). If endTime is omitted, the new
 * event is treated as 1 hour long for overlap purposes.
 * Returns null on no overlap or calendar fetch failure.
 */
async function findConflict(date, startTime, endTime) {
  let events;
  try {
    events = await getCalendarEvents(date);
  } catch {
    return null;
  }

  if (!events.length || !startTime) return null;

  const toMins = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };

  const newStart = toMins(startTime);
  const newEnd   = endTime ? toMins(endTime) : newStart + 60;

  return (
    events.find((ev) => {
      if (ev.allDay || !ev.start || !ev.end) return false;
      const evStart = toMins(new Date(ev.start).toTimeString().slice(0, 5));
      const evEnd   = toMins(new Date(ev.end).toTimeString().slice(0, 5));
      // Standard interval overlap: [newStart, newEnd) ∩ [evStart, evEnd)
      return newStart < evEnd && evStart < newEnd;
    }) ?? null
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TodoForm({ onAdd }) {
  const [title,        setTitle]        = useState('');
  const [date,         setDate]         = useState('');
  const [time,         setTime]         = useState('');
  const [endTime,      setEndTime]      = useState('');
  const [endTimeError, setEndTimeError] = useState('');
  const [checking,     setChecking]     = useState(false);
  const [conflict,     setConflict]     = useState(null);

  function resetForm() {
    setTitle('');
    setDate('');
    setTime('');
    setEndTime('');
    setEndTimeError('');
    setConflict(null);
  }

  function handleStartTimeChange(e) {
    const newStart = e.target.value;
    setTime(newStart);
    // If end time now precedes the new start time, clear end time
    if (endTime && newStart && endTime <= newStart) {
      setEndTime('');
      setEndTimeError('END TIME MUST BE AFTER START TIME');
    }
  }

  function handleEndTimeChange(e) {
    const newEnd = e.target.value;
    setEndTime(newEnd);
    if (newEnd && time && newEnd <= time) {
      setEndTimeError('END TIME MUST BE AFTER START TIME');
    } else {
      setEndTimeError('');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || checking || conflict || endTimeError) return;

    const todo = {
      id:      crypto.randomUUID(),
      title:   trimmed,
      date,
      time,
      endTime: endTime || null,
      done:    false,
    };

    if (!date || !time) {
      onAdd(todo);
      resetForm();
      return;
    }

    setChecking(true);
    try {
      const conflictEvent = await findConflict(date, time, endTime || null);
      if (conflictEvent) {
        setConflict({ event: conflictEvent, pendingTodo: todo });
      } else {
        onAdd(todo);
        resetForm();
      }
    } catch {
      onAdd(todo);
      resetForm();
    } finally {
      setChecking(false);
    }
  }

  function handleChangeTime() {
    setTime('');
    setEndTime('');
    setEndTimeError('');
    setConflict(null);
    setTimeout(() => document.getElementById('todo-time')?.focus(), 50);
  }

  function handleAddAnyway() {
    if (!conflict) return;
    onAdd(conflict.pendingTodo);
    resetForm();
  }

  const isLocked  = checking || conflict !== null;
  const canSubmit = Boolean(title.trim()) && !isLocked && !endTimeError;

  const inputBase = {
    background:    'var(--color-bg-raised)',
    border:        '1px solid var(--color-border)',
    borderRadius:  '4px',
    color:         isLocked ? 'var(--color-text-dim)' : 'var(--color-text-primary)',
    padding:       '10px 14px',
    width:         '100%',
    fontSize:      '15px',
    fontFamily:    "'Rajdhani', sans-serif",
    fontWeight:    400,
    letterSpacing: '0.03em',
    outline:       'none',
    transition:    'border-color 250ms cubic-bezier(0.16,1,0.3,1), box-shadow 250ms cubic-bezier(0.16,1,0.3,1)',
    opacity:       isLocked ? 0.5 : 1,
    cursor:        isLocked ? 'not-allowed' : 'text',
  };

  const labelStyle = {
    fontFamily:    "'Rajdhani', sans-serif",
    fontSize:      '11px',
    fontWeight:    500,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color:         'var(--color-text-secondary)',
    display:       'flex',
    alignItems:    'center',
    gap:           '4px',
  };

  const onFocusInput = (e) => {
    if (isLocked) return;
    e.target.style.borderColor = 'var(--color-border-bright)';
    e.target.style.boxShadow   = '0 0 0 3px var(--color-neon-cyan-glow), 0 0 15px rgba(0,212,255,0.2)';
  };
  const onBlurInput = (e) => {
    e.target.style.borderColor = 'var(--color-border)';
    e.target.style.boxShadow   = 'none';
  };

  return (
    <div>
      <form
        onSubmit={handleSubmit}
        style={{
          background:   'var(--color-bg-raised)',
          border:       '1px solid var(--color-border)',
          borderRadius: '6px',
          padding:      '24px',
          transition:   'border-color 250ms cubic-bezier(0.16,1,0.3,1), box-shadow 250ms cubic-bezier(0.16,1,0.3,1)',
        }}
        className="flex flex-col gap-4"
        onMouseEnter={(e) => {
          if (isLocked) return;
          e.currentTarget.style.borderColor = 'var(--color-border-bright)';
          e.currentTarget.style.boxShadow   = '0 0 20px var(--color-neon-cyan-glow)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border)';
          e.currentTarget.style.boxShadow   = 'none';
        }}
      >
        <h2
          style={{
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '16px',
            fontWeight:    700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color:         'var(--color-text-primary)',
            margin:        0,
          }}
        >
          Add a task
        </h2>

        {/* Title */}
        <div className="flex flex-col gap-1.5">
          <label style={labelStyle} htmlFor="todo-title">Task title</label>
          <input
            id="todo-title"
            type="text"
            placeholder="What do you need to do?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isLocked}
            style={{ ...inputBase, caretColor: 'var(--color-neon-cyan)' }}
            onFocus={onFocusInput}
            onBlur={onBlurInput}
          />
        </div>

        {/* Date row */}
        <div className="flex flex-col gap-1.5">
          <label style={labelStyle} htmlFor="todo-date">
            <Calendar size={11} aria-hidden="true" />
            Date
          </label>
          <input
            id="todo-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={isLocked}
            style={inputBase}
            onFocus={onFocusInput}
            onBlur={onBlurInput}
          />
        </div>

        {/* Start Time + End Time row */}
        <div className="flex gap-3">
          {/* Start time picker */}
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <label style={labelStyle} htmlFor="todo-time">
              <Clock size={11} aria-hidden="true" />
              Start Time
            </label>
            <input
              id="todo-time"
              type="time"
              value={time}
              onChange={handleStartTimeChange}
              disabled={isLocked}
              style={inputBase}
              onFocus={onFocusInput}
              onBlur={onBlurInput}
            />
          </div>

          {/* End time picker */}
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <label style={labelStyle} htmlFor="todo-end-time">
              <Clock size={11} aria-hidden="true" />
              End Time
            </label>
            <input
              id="todo-end-time"
              type="time"
              value={endTime}
              onChange={handleEndTimeChange}
              disabled={isLocked}
              style={{
                ...inputBase,
                borderColor: endTimeError ? 'var(--color-danger)' : undefined,
              }}
              onFocus={(e) => {
                if (isLocked) return;
                e.target.style.borderColor = endTimeError
                  ? 'var(--color-danger)'
                  : 'var(--color-border-bright)';
                e.target.style.boxShadow = '0 0 0 3px var(--color-neon-cyan-glow), 0 0 15px rgba(0,212,255,0.2)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = endTimeError
                  ? 'var(--color-danger)'
                  : 'var(--color-border)';
                e.target.style.boxShadow = 'none';
              }}
            />
            {endTimeError && (
              <span
                style={{
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '11px',
                  color:         'var(--color-danger)',
                  letterSpacing: '0.04em',
                  lineHeight:    1.3,
                  marginTop:     '2px',
                }}
              >
                {endTimeError}
              </span>
            )}
          </div>
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            background:     'transparent',
            border:         '1px solid var(--color-neon-cyan)',
            borderRadius:   '4px',
            color:          'var(--color-neon-cyan)',
            fontFamily:     "'Rajdhani', sans-serif",
            fontSize:       '14px',
            fontWeight:     500,
            letterSpacing:  '0.1em',
            textTransform:  'uppercase',
            padding:        '12px 24px',
            width:          '100%',
            cursor:         canSubmit ? 'pointer' : 'not-allowed',
            opacity:        canSubmit ? 1 : 0.35,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            gap:            '8px',
            transition:     'box-shadow 250ms cubic-bezier(0.16,1,0.3,1), background 250ms cubic-bezier(0.16,1,0.3,1), transform 150ms',
          }}
          onMouseEnter={(e) => {
            if (!canSubmit) return;
            e.currentTarget.style.background = 'var(--color-neon-cyan-glow)';
            e.currentTarget.style.boxShadow  = '0 0 20px rgba(0,212,255,0.4), inset 0 0 20px rgba(0,212,255,0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.boxShadow  = 'none';
          }}
          onMouseDown={(e) => { if (canSubmit) e.currentTarget.style.transform = 'scale(0.98)'; }}
          onMouseUp={(e)   => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {checking ? (
            <>
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              Checking calendar…
            </>
          ) : (
            <>
              <Plus size={16} aria-hidden="true" />
              Add task
            </>
          )}
        </button>
      </form>

      {/* ── Conflict banner ── */}
      {conflict && (
        <div
          style={{
            marginTop:    '12px',
            background:   'var(--color-neon-orange-glow)',
            border:       '1px solid rgba(255,107,0,0.3)',
            borderLeft:   '2px solid var(--color-neon-orange)',
            borderRadius: '4px',
            padding:      '16px',
          }}
        >
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle
              size={16}
              className="flex-shrink-0 mt-0.5"
              style={{ color: 'var(--color-neon-orange)' }}
              aria-hidden="true"
            />
            <p
              style={{
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '14px',
                letterSpacing: '0.03em',
                lineHeight:    1.5,
                color:         'var(--color-neon-orange)',
                margin:        0,
              }}
            >
              ⚠️ You already have{' '}
              <strong>"{conflict.event.summary}"</strong>
              {conflict.event.start && !conflict.event.allDay
                ? ` at ${fmtTime(conflict.event.start)}`
                : ''}
              . Adding this task will overlap — would you like to pick a different time?
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleChangeTime}
              style={{
                flex:           1,
                background:     'transparent',
                border:         '1px solid var(--color-neon-orange)',
                borderRadius:   '4px',
                color:          'var(--color-neon-orange)',
                fontFamily:     "'Rajdhani', sans-serif",
                fontSize:       '13px',
                fontWeight:     500,
                letterSpacing:  '0.08em',
                textTransform:  'uppercase',
                padding:        '9px 12px',
                cursor:         'pointer',
                transition:     'background 250ms, box-shadow 250ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,107,0,0.12)';
                e.currentTarget.style.boxShadow  = '0 0 12px rgba(255,107,0,0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.boxShadow  = 'none';
              }}
            >
              Change time
            </button>

            <button
              onClick={handleAddAnyway}
              style={{
                flex:           1,
                background:     'transparent',
                border:         '1px solid var(--color-text-dim)',
                borderRadius:   '4px',
                color:          'var(--color-text-secondary)',
                fontFamily:     "'Rajdhani', sans-serif",
                fontSize:       '13px',
                fontWeight:     500,
                letterSpacing:  '0.08em',
                textTransform:  'uppercase',
                padding:        '9px 12px',
                cursor:         'pointer',
                transition:     'border-color 250ms, color 250ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-text-secondary)';
                e.currentTarget.style.color       = 'var(--color-text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-text-dim)';
                e.currentTarget.style.color       = 'var(--color-text-secondary)';
              }}
            >
              Add anyway
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

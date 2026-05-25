// CalendarBanner — shows Claude's calendar conflict suggestion below the TodoForm.

import { X, CalendarCheck, AlertTriangle, Loader2 } from 'lucide-react';

/**
 * Props:
 *   suggestion  string  — Claude's text reply (empty = hidden)
 *   loading     bool    — show spinner while Claude is thinking
 *   error       string  — error message (empty = no error)
 *   onDismiss   fn      — clear the banner
 */

const dismissBtn = {
  background: 'none',
  border:     'none',
  cursor:     'pointer',
  padding:    '2px',
  lineHeight: 1,
  transition: 'opacity 150ms',
};

const textStyle = {
  fontFamily:   "'Rajdhani', sans-serif",
  fontSize:     '14px',
  letterSpacing: '0.03em',
  lineHeight:   1.5,
};

export default function CalendarBanner({ suggestion, loading, error, onDismiss }) {
  if (!loading && !suggestion && !error) return null;

  /* ── Loading state ────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div
        className="mt-4 flex items-center gap-3"
        style={{
          background:   'var(--color-neon-cyan-glow)',
          border:       '1px solid var(--color-neon-cyan-border)',
          borderLeft:   '2px solid var(--color-neon-cyan)',
          borderRadius: '4px',
          padding:      '16px',
        }}
      >
        <Loader2
          size={15}
          className="animate-spin flex-shrink-0"
          style={{ color: 'var(--color-neon-cyan)' }}
          aria-hidden="true"
        />
        <span style={{ ...textStyle, color: 'var(--color-text-secondary)' }}>
          Checking your Google Calendar for conflicts…
        </span>
      </div>
    );
  }

  /* ── Error state ──────────────────────────────────────────────────────── */
  if (error) {
    return (
      <div
        className="mt-4 flex items-start gap-3"
        style={{
          background:   'var(--color-neon-orange-glow)',
          border:       '1px solid rgba(255,107,0,0.25)',
          borderLeft:   '2px solid var(--color-neon-orange)',
          borderRadius: '4px',
          padding:      '16px',
        }}
      >
        <AlertTriangle
          size={15}
          className="flex-shrink-0 mt-0.5"
          style={{ color: 'var(--color-neon-orange)' }}
          aria-hidden="true"
        />
        <div className="flex-1">
          <p
            style={{
              ...textStyle,
              fontWeight: 500,
              color:      'var(--color-neon-orange)',
              textShadow: '0 0 8px rgba(255,107,0,0.5)',
              margin:     0,
            }}
          >
            Couldn't check calendar
          </p>
          <p
            style={{
              ...textStyle,
              fontSize:   '12px',
              color:      'var(--color-neon-orange)',
              opacity:    0.8,
              margin:     '2px 0 0',
            }}
          >
            {error}
          </p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{ ...dismissBtn, color: 'var(--color-neon-orange)' }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.6'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }

  /* ── Suggestion / conflict state ──────────────────────────────────────── */
  const isConflict = /conflict|clash|overlap|busy|meeting|already|suggest|instead|try/i.test(suggestion);

  if (isConflict) {
    return (
      <div
        className="mt-4 flex items-start gap-3"
        style={{
          background:   'var(--color-neon-orange-glow)',
          border:       '1px solid rgba(255,107,0,0.25)',
          borderLeft:   '2px solid var(--color-neon-orange)',
          borderRadius: '4px',
          padding:      '16px',
        }}
      >
        <CalendarCheck
          size={15}
          className="flex-shrink-0 mt-0.5"
          style={{
            color:      'var(--color-neon-orange)',
            textShadow: '0 0 8px rgba(255,107,0,0.6)',
          }}
          aria-hidden="true"
        />
        <p
          className="flex-1 leading-relaxed"
          style={{ ...textStyle, color: 'var(--color-neon-orange)', margin: 0 }}
        >
          {suggestion}
        </p>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{ ...dismissBtn, color: 'var(--color-neon-orange)' }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.6'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }

  /* ── Clear / all-good state ───────────────────────────────────────────── */
  return (
    <div
      className="mt-4 flex items-start gap-3"
      style={{
        background:   'rgba(0,255,136,0.05)',
        border:       '1px solid rgba(0,255,136,0.2)',
        borderLeft:   '2px solid var(--color-success)',
        borderRadius: '4px',
        padding:      '16px',
      }}
    >
      <CalendarCheck
        size={15}
        className="flex-shrink-0 mt-0.5"
        style={{ color: 'var(--color-success)' }}
        aria-hidden="true"
      />
      <p
        className="flex-1 leading-relaxed"
        style={{
          ...textStyle,
          color:      'var(--color-success)',
          textShadow: '0 0 8px rgba(0,255,136,0.4)',
          margin:     0,
        }}
      >
        {suggestion}
      </p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{ ...dismissBtn, color: 'var(--color-success)' }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.6'; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

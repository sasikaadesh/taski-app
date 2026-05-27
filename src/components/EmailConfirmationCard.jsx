// EmailConfirmationCard — Tron-themed card shown in chat before sending an email.
// Supports view mode (To / Subject / body preview) and full edit mode.

// Email is never sent without explicit user confirmation via this card's Send button.

import { useState } from 'react';
import { CheckCircle, X, Edit2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

// ── Shared style atoms ────────────────────────────────────────────────────────

const FONT_MONO = "'Rajdhani', sans-serif";
const FONT_HEAD = "'Orbitron', sans-serif";

const LABEL_STYLE = {
  fontFamily:    FONT_MONO,
  fontSize:      '10px',
  fontWeight:    600,
  letterSpacing: '0.14em',
  color:         'var(--color-text-secondary)',
  textTransform: 'uppercase',
  display:       'block',
  marginBottom:  '3px',
};

const VALUE_STYLE = {
  fontFamily:    FONT_MONO,
  fontSize:      '13px',
  letterSpacing: '0.02em',
  color:         'var(--color-text-primary)',
  lineHeight:    1.5,
  wordBreak:     'break-all',
};

const INPUT_BASE = {
  width:         '100%',
  background:    'var(--color-bg)',
  border:        '1px solid var(--color-border)',
  borderRadius:  '3px',
  padding:       '5px 8px',
  color:         'var(--color-text-primary)',
  fontFamily:    FONT_MONO,
  fontSize:      '13px',
  letterSpacing: '0.02em',
  outline:       'none',
  caretColor:    'var(--color-neon-cyan)',
  transition:    'border-color 200ms, box-shadow 200ms',
};

function Field({ label, children }) {
  return (
    <div>
      <span style={LABEL_STYLE}>{label}</span>
      {children}
    </div>
  );
}

function EditInput({ value, onChange, multiline }) {
  const focusBorder = (e) => {
    e.target.style.borderColor = 'var(--color-border-bright)';
    e.target.style.boxShadow   = '0 0 0 2px var(--color-neon-cyan-glow)';
  };
  const blurBorder = (e) => {
    e.target.style.borderColor = 'var(--color-border)';
    e.target.style.boxShadow   = 'none';
  };

  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={focusBorder}
        onBlur={blurBorder}
        style={{ ...INPUT_BASE, minHeight: '90px', resize: 'vertical' }}
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={focusBorder}
      onBlur={blurBorder}
      style={INPUT_BASE}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * @param {{ to, subject, body, cc }}  draft    — current draft data
 * @param {(field, value) => void}      onChange — called on every field edit
 * @param {() => Promise<void>}         onSend   — called when user clicks Send; may throw
 * @param {() => void}                  onCancel — called when user clicks Cancel
 */
export default function EmailConfirmationCard({ draft, onChange, onSend, onCancel }) {
  const [editing,   setEditing]   = useState(false);
  const [expanded,  setExpanded]  = useState(false);
  const [sending,   setSending]   = useState(false);
  const [sendError, setSendError] = useState('');

  // Body preview (first 3 lines when collapsed)
  const bodyLines   = (draft.body ?? '').split('\n');
  const hasMore     = bodyLines.length > 3;
  const previewText = hasMore && !expanded
    ? bodyLines.slice(0, 3).join('\n') + '\n…'
    : draft.body;

  // ── Send handler ────────────────────────────────────────────────────────────
  async function handleSendClick() {
    setSending(true);
    setSendError('');
    try {
      // Email is never sent without explicit user confirmation via this button.
      await onSend();
      // On success the parent replaces this card — nothing else to do here.
    } catch (err) {
      const code = err?.message ?? '';
      if (code === 'GMAIL_INVALID_EMAIL') {
        setSendError("That doesn't look like a valid email address. Can you double check it?");
      } else if (code === 'GMAIL_AUTH_CANCELLED' || code === 'GMAIL_SCOPE_MISSING') {
        setSendError('Please reconnect Google to enable email sending.');
      } else if (code === 'GMAIL_RATE_LIMIT') {
        setSendError("Gmail is busy right now — please try again in a moment.");
      } else {
        setSendError("Couldn't send the email. Please try again.");
      }
    } finally {
      setSending(false);
    }
  }

  // ── Button style helpers ────────────────────────────────────────────────────
  const btnBase = {
    flex:           1,
    padding:        '6px 8px',
    background:     'transparent',
    borderRadius:   '3px',
    cursor:         'pointer',
    fontFamily:     FONT_MONO,
    fontSize:       '11px',
    fontWeight:     700,
    letterSpacing:  '0.12em',
    textTransform:  'uppercase',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            '4px',
    transition:     'border-color 150ms, box-shadow 150ms, background 150ms, color 150ms',
  };

  return (
    <div
      style={{
        background:   'var(--color-bg-raised)',
        border:       '1px solid var(--color-neon-cyan-border)',
        borderRadius: '6px',
        padding:      '14px',
        boxShadow:    '0 0 24px var(--color-neon-cyan-glow)',
        width:        '100%',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display:       'flex',
          alignItems:    'center',
          gap:           '8px',
          marginBottom:  '12px',
          paddingBottom: '10px',
          borderBottom:  '1px solid var(--color-border)',
        }}
      >
        <span style={{ fontSize: '14px' }} aria-hidden="true">📧</span>
        <span
          style={{
            fontFamily:    FONT_HEAD,
            fontSize:      '11px',
            fontWeight:    700,
            letterSpacing: '0.14em',
            color:         'var(--color-neon-cyan)',
            textShadow:    '0 0 10px rgba(0,212,255,0.5)',
          }}
        >
          READY TO SEND
        </span>
      </div>

      {/* ── Fields ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>

        {/* To */}
        <Field label="To">
          {editing
            ? <EditInput value={draft.to}      onChange={(v) => onChange('to',      v)} />
            : <span style={VALUE_STYLE}>{draft.to}</span>
          }
        </Field>

        {/* Subject */}
        <Field label="Subject">
          {editing
            ? <EditInput value={draft.subject} onChange={(v) => onChange('subject', v)} />
            : <span style={VALUE_STYLE}>{draft.subject}</span>
          }
        </Field>

        {/* Body */}
        <Field label="Message">
          {editing ? (
            <EditInput value={draft.body} onChange={(v) => onChange('body', v)} multiline />
          ) : (
            <>
              <div
                style={{
                  fontFamily:    FONT_MONO,
                  fontSize:      '12px',
                  letterSpacing: '0.02em',
                  lineHeight:    1.55,
                  color:         'var(--color-text-secondary)',
                  whiteSpace:    'pre-wrap',
                  background:    'rgba(0,0,0,0.2)',
                  border:        '1px solid var(--color-border)',
                  borderRadius:  '3px',
                  padding:       '7px 9px',
                  maxHeight:     expanded ? '240px' : undefined,
                  overflowY:     expanded ? 'auto' : undefined,
                }}
              >
                {previewText}
              </div>
              {hasMore && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  style={{
                    display:        'flex',
                    alignItems:     'center',
                    gap:            '3px',
                    marginTop:      '4px',
                    background:     'none',
                    border:         'none',
                    cursor:         'pointer',
                    color:          'var(--color-neon-cyan)',
                    fontFamily:     FONT_MONO,
                    fontSize:       '10px',
                    fontWeight:     600,
                    letterSpacing:  '0.08em',
                    textTransform:  'uppercase',
                    padding:        0,
                    opacity:        0.8,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8'; }}
                >
                  {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  {expanded ? 'COLLAPSE' : 'EXPAND'}
                </button>
              )}
            </>
          )}
        </Field>
      </div>

      {/* ── Send error ── */}
      {sendError && (
        <div
          style={{
            fontFamily:    FONT_MONO,
            fontSize:      '12px',
            letterSpacing: '0.03em',
            color:         'var(--color-danger)',
            background:    'rgba(255,45,85,0.08)',
            border:        '1px solid rgba(255,45,85,0.25)',
            borderRadius:  '3px',
            padding:       '5px 9px',
            marginBottom:  '10px',
            lineHeight:    1.5,
          }}
        >
          {sendError}
        </div>
      )}

      {/* ── Action buttons ── */}
      <div style={{ display: 'flex', gap: '6px' }}>

        {/* ✏️ EDIT / SAVE */}
        <button
          onClick={() => setEditing((v) => !v)}
          style={{
            ...btnBase,
            border: '1px solid var(--color-border)',
            color:  'var(--color-text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-bright)';
            e.currentTarget.style.color       = 'var(--color-text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border)';
            e.currentTarget.style.color       = 'var(--color-text-secondary)';
          }}
        >
          <Edit2 size={10} aria-hidden="true" />
          {editing ? 'SAVE' : 'EDIT'}
        </button>

        {/* ✕ CANCEL */}
        <button
          onClick={onCancel}
          style={{
            ...btnBase,
            border: '1px solid rgba(255,107,0,0.4)',
            color:  'var(--color-neon-orange)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,107,0,0.85)';
            e.currentTarget.style.boxShadow   = '0 0 10px rgba(255,107,0,0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,107,0,0.4)';
            e.currentTarget.style.boxShadow   = 'none';
          }}
        >
          <X size={10} aria-hidden="true" />
          CANCEL
        </button>

        {/* ✓ SEND */}
        <button
          onClick={handleSendClick}
          disabled={sending}
          style={{
            ...btnBase,
            border:  '1px solid var(--color-neon-cyan)',
            color:   'var(--color-neon-cyan)',
            opacity: sending ? 0.5 : 1,
            cursor:  sending ? 'not-allowed' : 'pointer',
          }}
          onMouseEnter={(e) => {
            if (!sending) {
              e.currentTarget.style.boxShadow = '0 0 14px rgba(0,212,255,0.5)';
              e.currentTarget.style.background = 'var(--color-neon-cyan-glow)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.background = 'transparent';
          }}
          onMouseDown={(e) => { if (!sending) e.currentTarget.style.transform = 'scale(0.96)'; }}
          onMouseUp={(e)   => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {sending
            ? <><Loader2 size={10} className="animate-spin" aria-hidden="true" /> SENDING…</>
            : <><CheckCircle size={10} aria-hidden="true" /> SEND ✓</>
          }
        </button>
      </div>
    </div>
  );
}

// TelegramConfirmCard — Tron-themed card shown in chat before an agent Telegram send.

import { useState } from 'react';

const btnBase = {
  flex:          1,
  padding:       '7px 0',
  borderRadius:  '4px',
  fontFamily:    "'Orbitron', sans-serif",
  fontSize:      '10px',
  fontWeight:    700,
  letterSpacing: '0.12em',
  cursor:        'pointer',
};

export default function TelegramConfirmCard({ draft, onChange, onSend, onCancel }) {
  const [editing, setEditing] = useState(false);

  return (
    <div
      style={{
        background:   'rgba(2,15,35,0.88)',
        border:       '1px solid rgba(0,212,255,0.35)',
        borderRadius: '6px',
        padding:      '12px',
        boxShadow:    '0 0 18px rgba(0,212,255,0.12)',
      }}
    >
      <div
        style={{
          fontFamily:    "'Orbitron', sans-serif",
          fontSize:      '9px',
          fontWeight:    700,
          letterSpacing: '0.15em',
          color:         '#00d4ff',
          marginBottom:  '8px',
        }}
      >
        📤 TELEGRAM DRAFT — CONFIRM TO SEND
      </div>

      {editing ? (
        <textarea
          value={draft.message}
          onChange={(e) => onChange(e.target.value)}
          rows={Math.min(14, draft.message.split('\n').length + 2)}
          style={{
            width:        '100%',
            boxSizing:    'border-box',
            background:   'rgba(0,0,0,0.35)',
            border:       '1px solid rgba(0,212,255,0.3)',
            borderRadius: '4px',
            padding:      '8px 10px',
            fontFamily:   "'Rajdhani', sans-serif",
            fontSize:     '13px',
            lineHeight:   1.55,
            color:        'var(--color-text-primary)',
            resize:       'vertical',
            outline:      'none',
          }}
        />
      ) : (
        <div
          style={{
            whiteSpace:   'pre-wrap',
            fontFamily:   "'Rajdhani', sans-serif",
            fontSize:     '13px',
            lineHeight:   1.55,
            color:        'var(--color-text-primary)',
            border:       '1px solid rgba(0,212,255,0.15)',
            borderRadius: '4px',
            padding:      '8px 10px',
            maxHeight:    '260px',
            overflowY:    'auto',
          }}
        >
          {draft.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <button
          onClick={onSend}
          style={{
            ...btnBase,
            background: 'rgba(0,212,255,0.15)',
            border:     '1px solid #00d4ff',
            color:      '#00d4ff',
            boxShadow:  '0 0 10px rgba(0,212,255,0.25)',
          }}
        >
          ▶ SEND
        </button>
        <button
          onClick={() => setEditing((p) => !p)}
          style={{
            ...btnBase,
            background: 'transparent',
            border:     '1px solid rgba(0,212,255,0.35)',
            color:      'rgba(0,212,255,0.8)',
          }}
        >
          {editing ? '✓ DONE' : '✏ EDIT'}
        </button>
        <button
          onClick={onCancel}
          style={{
            ...btnBase,
            background: 'transparent',
            border:     '1px solid rgba(255,45,85,0.4)',
            color:      'rgba(255,45,85,0.8)',
          }}
        >
          ✖ CANCEL
        </button>
      </div>
    </div>
  );
}

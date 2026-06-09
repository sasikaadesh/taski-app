// ChatMessage — renders a single chat message with Tron-themed markdown.

import { useMemo } from 'react';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

/**
 * Props:
 *   message          — text content to render
 *   role             — 'user' | 'assistant'
 *   sources          — web search source objects [{title, url}]
 *   reconnectGmail   — boolean, show reconnect button when true
 *   onReconnectGoogle — callback for reconnect button
 */
export default function ChatMessage({
  message,
  role,
  sources,
  reconnectGmail,
  onReconnectGoogle,
}) {
  const html = useMemo(() => {
    if (!message) return '';
    return marked.parse(message);
  }, [message]);

  // ── User bubble ──────────────────────────────────────────────────────────
  if (role === 'user') {
    return (
      <div
        style={{
          maxWidth:      '84%',
          padding:       '9px 13px',
          borderRadius:  '4px',
          fontFamily:    "'Rajdhani', sans-serif",
          fontSize:      '14px',
          letterSpacing: '0.02em',
          lineHeight:    1.5,
          background:    'rgba(0,212,255,0.07)',
          border:        '1px solid rgba(0,212,255,0.28)',
          color:         'var(--color-text-primary)',
        }}
      >
        {message}
      </div>
    );
  }

  // ── Assistant bubble ─────────────────────────────────────────────────────
  return (
    <div
      style={{
        padding:      '9px 13px',
        borderRadius: '4px',
        background:   'var(--color-bg-raised)',
        border:       '1px solid rgba(0,212,255,0.15)',
        width:        '100%',
      }}
    >
      {/* TASKI label */}
      <span
        style={{
          fontFamily:    "'Orbitron', sans-serif",
          fontSize:      '9px',
          fontWeight:    700,
          letterSpacing: '0.15em',
          color:         '#00d4ff',
          display:       'block',
          marginBottom:  '4px',
          opacity:       0.7,
        }}
      >
        TASKI
      </span>

      {/* Markdown content */}
      <div
        className="taski-message"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* Web search sources */}
      {sources?.length > 0 && (
        <div style={{
          marginTop:  '10px',
          paddingTop: '8px',
          borderTop:  '1px solid rgba(0,212,255,0.1)',
        }}>
          <div style={{
            color:         'rgba(0,212,255,0.55)',
            letterSpacing: '0.08em',
            marginBottom:  '5px',
            display:       'flex',
            alignItems:    'center',
            gap:           '4px',
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '10px',
            fontWeight:    600,
            textTransform: 'uppercase',
          }}>
            🌐 WEB SOURCES
          </div>
          {sources.map((source, si) => (
            <div key={si} style={{
              color:        'rgba(0,212,255,0.5)',
              marginBottom: '3px',
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
              fontFamily:   "'Rajdhani', sans-serif",
              fontSize:     '11px',
            }}>
              <span style={{ color: 'rgba(0,212,255,0.3)', marginRight: '4px' }}>{si + 1}.</span>
              <a
                href={source.url}
                onClick={(e) => {
                  e.preventDefault();
                  if (window.taskiAPI?.openExternal) {
                    window.taskiAPI.openExternal(source.url);
                  } else {
                    window.open(source.url, '_blank', 'noopener,noreferrer');
                  }
                }}
                style={{ color: 'rgba(0,212,255,0.6)', textDecoration: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.target.style.color = '#00d4ff'; }}
                onMouseLeave={(e) => { e.target.style.color = 'rgba(0,212,255,0.6)'; }}
                title={source.url}
              >
                {source.title || source.url}
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Reconnect Google */}
      {reconnectGmail && onReconnectGoogle && (
        <button
          onClick={onReconnectGoogle}
          style={{
            display:             'block',
            marginTop:           '8px',
            fontFamily:          "'Rajdhani', sans-serif",
            fontSize:            '12px',
            letterSpacing:       '0.04em',
            color:               '#00d4ff',
            background:          'none',
            border:              'none',
            cursor:              'pointer',
            padding:             0,
            textDecoration:      'underline',
            textUnderlineOffset: '3px',
          }}
        >
          Reconnect Google →
        </button>
      )}
    </div>
  );
}

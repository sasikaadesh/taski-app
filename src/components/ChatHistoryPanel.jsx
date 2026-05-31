/* ChatHistoryPanel — slide-in history browser for saved chat sessions */

import { useState } from 'react';
import { X, Search } from 'lucide-react';

const GROUP_ORDER = ['TODAY', 'YESTERDAY', 'THIS WEEK', 'OLDER'];

function getGroup(dateStr) {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  if (d >= today)     return 'TODAY';
  if (d >= yesterday) return 'YESTERDAY';
  if (d >= weekAgo)   return 'THIS WEEK';
  return 'OLDER';
}

export default function ChatHistoryPanel({ sessions, onClose, onView, onExport, onDelete }) {
  const [search,         setSearch]         = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const filtered = search
    ? sessions.filter(s => s.firstMessage?.toLowerCase().includes(search.toLowerCase()))
    : sessions;

  const groups = {};
  for (const g of GROUP_ORDER) groups[g] = [];
  for (const s of filtered) groups[getGroup(s.lastMessageAt)].push(s);

  const hasAny = filtered.length > 0;

  function confirmDelete(id) {
    if (deleteConfirmId === id) {
      onDelete(id);
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(prev => prev === id ? null : prev), 3000);
    }
  }

  return (
    <>
      <style>{`
        @keyframes slideInHistory {
          from { transform: translateX(100%); opacity: 0.6; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .history-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(0,212,255,0.2) transparent;
        }
        .history-scroll::-webkit-scrollbar { width: 3px; }
        .history-scroll::-webkit-scrollbar-track { background: transparent; }
        .history-scroll::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.2); border-radius: 2px; }
      `}</style>

      <div style={{
        position:      'absolute',
        inset:         0,
        background:    'var(--color-bg-muted)',
        zIndex:        20,
        display:       'flex',
        flexDirection: 'column',
        animation:     'slideInHistory 300ms cubic-bezier(0.16,1,0.3,1) forwards',
        borderLeft:    '1px solid var(--color-border)',
      }}>

        {/* Header */}
        <div style={{
          padding:        '18px 20px 14px',
          borderBottom:   '1px solid rgba(0,212,255,0.12)',
          background:     'rgba(0,212,255,0.02)',
          flexShrink:     0,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
        }}>
          <span style={{
            fontFamily:    "'Orbitron', sans-serif",
            fontSize:      '13px',
            fontWeight:    700,
            letterSpacing: '0.1em',
            color:         'var(--color-neon-cyan)',
            textShadow:    '0 0 12px rgba(0,212,255,0.5)',
          }}>
            CHAT HISTORY
          </span>
          <button
            onClick={onClose}
            aria-label="Close chat history"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-secondary)', padding: '4px',
              display: 'flex', alignItems: 'center',
              transition: 'color 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-danger)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Search */}
        <div style={{
          padding:      '10px 14px',
          borderBottom: '1px solid rgba(0,212,255,0.06)',
          flexShrink:   0,
        }}>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{
              position: 'absolute', left: '10px', top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-dim)', pointerEvents: 'none',
            }} aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search chats..."
              style={{
                width: '100%', boxSizing: 'border-box',
                background:   'var(--color-bg-raised)',
                border:       '1px solid var(--color-border)',
                borderRadius: '4px',
                padding:      '6px 10px 6px 30px',
                color:        'var(--color-text-primary)',
                fontFamily:   "'Rajdhani', sans-serif",
                fontSize:     '13px',
                outline:      'none',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--color-neon-cyan)'; e.target.style.boxShadow = '0 0 8px rgba(0,212,255,0.15)'; }}
              onBlur={e  => { e.target.style.borderColor = 'var(--color-border)';    e.target.style.boxShadow = 'none'; }}
            />
          </div>
        </div>

        {/* Session list */}
        <div className="history-scroll" style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 20px' }}>
          {!hasAny && (
            <div style={{
              textAlign: 'center', padding: '32px 0',
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '12px', letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-dim)',
            }}>
              {search ? 'No matching chats' : 'No chat history yet'}
            </div>
          )}

          {GROUP_ORDER.map(groupName => {
            const gs = groups[groupName];
            if (!gs || gs.length === 0) return null;
            return (
              <div key={groupName} style={{ marginBottom: '8px' }}>
                <div style={{
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '10px',
                  fontWeight:    600,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color:         'var(--color-text-dim)',
                  padding:       '10px 2px 4px',
                }}>
                  {groupName}
                </div>
                {gs.map(session => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    onView={() => onView(session)}
                    onExport={() => onExport(session.id)}
                    onDelete={() => confirmDelete(session.id)}
                    confirmDelete={deleteConfirmId === session.id}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function SessionCard({ session, onView, onExport, onDelete, confirmDelete }) {
  const [hovered, setHovered] = useState(false);
  const timeStr = new Date(session.lastMessageAt).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  });
  const preview = (session.firstMessage || 'New chat').substring(0, 40);
  const hasMore = (session.firstMessage?.length || 0) > 40;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding:      '9px 10px',
        marginBottom: '4px',
        background:   hovered ? 'var(--color-bg-overlay)' : 'var(--color-bg-raised)',
        border:       '1px solid var(--color-border)',
        borderRadius: '4px',
        transition:   'all 150ms ease',
      }}
    >
      <div style={{
        fontFamily:   "'Rajdhani', sans-serif",
        fontSize:     '13px',
        color:        'var(--color-text-primary)',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
        marginBottom: '5px',
      }}>
        {preview}{hasMore ? '…' : ''}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        <span style={{
          fontFamily:    "'Rajdhani', sans-serif",
          fontSize:      '10px',
          letterSpacing: '0.04em',
          color:         'var(--color-text-dim)',
          flexShrink:    0,
        }}>
          {session.messageCount} msg{session.messageCount !== 1 ? 's' : ''} · {timeStr}
        </span>
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <ActionBtn label="VIEW"   onClick={onView}   />
          <ActionBtn label="EXPORT" onClick={onExport} />
          <button
            onClick={onDelete}
            style={{
              background:    confirmDelete ? 'rgba(255,45,85,0.1)' : 'none',
              border:        `1px solid ${confirmDelete ? 'var(--color-danger)' : 'rgba(0,212,255,0.15)'}`,
              borderRadius:  '3px',
              padding:       '2px 6px',
              cursor:        'pointer',
              color:         confirmDelete ? 'var(--color-danger)' : 'var(--color-text-dim)',
              fontFamily:    "'Rajdhani', sans-serif",
              fontSize:      '10px',
              letterSpacing: '0.04em',
              transition:    'all 150ms ease',
            }}
          >
            {confirmDelete ? 'SURE?' : '🗑'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ label, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background:    hov ? 'rgba(0,212,255,0.08)' : 'none',
        border:        '1px solid rgba(0,212,255,0.15)',
        borderRadius:  '3px',
        padding:       '2px 6px',
        cursor:        'pointer',
        color:         hov ? 'var(--color-neon-cyan)' : 'var(--color-text-secondary)',
        fontFamily:    "'Rajdhani', sans-serif",
        fontSize:      '10px',
        fontWeight:    600,
        letterSpacing: '0.06em',
        transition:    'all 150ms ease',
      }}
    >
      {label}
    </button>
  );
}

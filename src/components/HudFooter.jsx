// HudFooter — fixed full-width bottom bar: status indicators · quick actions · session info.

import { useState, useEffect, useRef } from 'react';
import { isAuthenticated, signIn } from '../lib/googleAuth';

// ── Status dot ────────────────────────────────────────────────────────────────

// status: 'connected' | 'connecting' | 'disconnected' | undefined (falls back to active bool)
function StatusDot({ label, active, onClick, title, status }) {
  const isOn   = status === 'connected'  || (status === undefined && active);
  const isBusy = status === 'connecting';

  const dotColor = isOn ? '#00ff88' : isBusy ? '#ffaa00' : 'rgba(255,45,85,0.7)';
  const dotGlow  = isOn ? '0 0 6px #00ff88' : isBusy ? '0 0 6px #ffaa00' : '0 0 4px rgba(255,45,85,0.5)';
  const txtColor = isOn ? 'rgba(0,255,136,0.7)' : isBusy ? 'rgba(255,170,0,0.7)' : 'rgba(255,45,85,0.5)';

  const content = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      <div style={{
        width:        '6px',
        height:       '6px',
        borderRadius: '50%',
        background:   dotColor,
        boxShadow:    dotGlow,
        animation:    (isOn || isBusy) ? 'statusPulse 2.5s ease-in-out infinite' : 'none',
        flexShrink:   0,
      }} />
      <span style={{
        fontFamily:    "'Rajdhani', sans-serif",
        fontSize:      '9px',
        fontWeight:    600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color:         txtColor,
      }}>
        {label}
      </span>
    </div>
  );
  if (onClick) {
    return (
      <button
        onClick={onClick}
        title={title}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}
      >
        {content}
      </button>
    );
  }
  return content;
}

// ── Quick action button ───────────────────────────────────────────────────────

function ActionBtn({ icon, label, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            '5px',
        background:     hov ? 'rgba(0,212,255,0.1)' : 'transparent',
        border:         `1px solid ${hov ? 'rgba(0,212,255,0.5)' : 'rgba(0,212,255,0.15)'}`,
        borderRadius:   '5px',
        padding:        '4px 10px',
        cursor:         'pointer',
        color:          hov ? '#00d4ff' : 'rgba(0,212,255,0.4)',
        transition:     'all 150ms ease',
        boxShadow:      hov ? '0 0 10px rgba(0,212,255,0.2)' : 'none',
        fontFamily:     "'Rajdhani', sans-serif",
        fontSize:       '9px',
        fontWeight:     600,
        letterSpacing:  '0.14em',
        textTransform:  'uppercase',
        flexShrink:     0,
      }}
    >
      <span style={{ fontSize: '12px', lineHeight: 1 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ── Session timer ─────────────────────────────────────────────────────────────

function SessionTimer() {
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const h  = Math.floor(elapsed / 3600);
  const m  = Math.floor((elapsed % 3600) / 60);
  const s  = elapsed % 60;
  const fmt = `${String(h).padStart(1,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  return (
    <span style={{
      fontFamily:    "'Rajdhani', sans-serif",
      fontSize:      '9px',
      letterSpacing: '0.1em',
      color:         'rgba(0,212,255,0.3)',
    }}>
      SESSION {fmt}
    </span>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

function Divider() {
  return (
    <div aria-hidden="true" style={{
      width:     '1px',
      height:    '24px',
      background: 'rgba(0,212,255,0.12)',
      flexShrink: 0,
      margin:    '0 10px',
    }} />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HudFooter({
  onFiles,
  onImagen,
  onWebsite,
  onSkills,
  visualizerState,
  calConnected = false,
  gmailConnected = false,
}) {
  const aiReady = visualizerState !== 'processing';

  const [googleStatus, setGoogleStatus] = useState('checking');
  const [connecting,   setConnecting]   = useState(false);

  useEffect(() => {
    const checkAuth = () => {
      setGoogleStatus(isAuthenticated() ? 'connected' : 'disconnected');
    };
    checkAuth();
    const interval = setInterval(checkAuth, 15000);
    return () => clearInterval(interval);
  }, []);

  async function handleGoogleConnect() {
    if (connecting) return;
    setConnecting(true);
    setGoogleStatus('connecting');
    try {
      await signIn();
      setGoogleStatus('connected');
    } catch (e) {
      console.error('Google connect failed:', e.message);
      setGoogleStatus('disconnected');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div
      style={{
        position:       'relative',
        flexShrink:     0,
        height:         '48px',
        width:          '100%',
        zIndex:         100,
        background:     'rgba(2, 10, 25, 0.9)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop:      '1px solid rgba(0,212,255,0.12)',
        display:        'flex',
        alignItems:     'center',
        padding:        '0 20px',
        gap:            0,
        userSelect:     'none',
      }}
    >
      {/* ── Status indicators ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        <StatusDot
          label="CAL"
          status={googleStatus === 'checking' ? 'disconnected' : googleStatus}
          onClick={googleStatus === 'disconnected' ? handleGoogleConnect : undefined}
          title={googleStatus === 'disconnected' ? 'Click to connect Google' : undefined}
        />
        <StatusDot
          label="GMAIL"
          status={googleStatus === 'checking' ? 'disconnected' : googleStatus}
          onClick={googleStatus === 'disconnected' ? handleGoogleConnect : undefined}
          title={googleStatus === 'disconnected' ? 'Click to connect Google' : undefined}
        />
        <StatusDot label="AI" active={aiReady} />
      </div>

      <Divider />

      {/* ── Quick actions ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
        <ActionBtn icon="📁" label="FILES"   onClick={onFiles} />
        <ActionBtn icon="🖼" label="IMAGEN"  onClick={onImagen} />
        <ActionBtn icon="✨" label="WEBSITE" onClick={onWebsite} />
        <ActionBtn icon="⚡" label="SKILLS"  onClick={onSkills} />
      </div>

      <Divider />

      {/* ── Right: online indicator + session + version ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{
            width:        '6px',
            height:       '6px',
            borderRadius: '50%',
            background:   '#00d4ff',
            boxShadow:    '0 0 6px #00d4ff',
            animation:    'statusPulse 2s ease-in-out infinite',
          }} />
          <span style={{
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '9px',
            fontWeight:    600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color:         'rgba(0,212,255,0.55)',
          }}>
            TASKI ONLINE
          </span>
        </div>
        <SessionTimer />
        <span style={{
          fontFamily:    "'Rajdhani', sans-serif",
          fontSize:      '9px',
          letterSpacing: '0.1em',
          color:         'rgba(0,212,255,0.2)',
        }}>
          v1.0
        </span>
      </div>
    </div>
  );
}

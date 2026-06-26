// HudHeader — fixed full-width top bar: logo · datetime · music controls · fullscreen · help.

import { useState, useEffect, useRef } from 'react';
import { HelpCircle } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function padZ(n) { return String(n).padStart(2, '0'); }

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatTime(d) {
  return `${padZ(d.getHours())}:${padZ(d.getMinutes())}:${padZ(d.getSeconds())}`;
}
function formatDate(d) {
  const DAY = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${DAY[d.getDay()]} ${padZ(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}
function getTzLabel() {
  const offset = -new Date().getTimezoneOffset();
  const sign   = offset >= 0 ? '+' : '-';
  const abs    = Math.abs(offset);
  const hh     = Math.floor(abs / 60);
  const mm     = abs % 60;
  return `GMT${sign}${padZ(hh)}:${padZ(mm)}`;
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

function PlayIcon() {
  return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><polygon points="3,1.5 14,8 3,14.5" fill="#00d4ff"/></svg>;
}
function PauseIcon() {
  return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="4" height="12" rx="1" fill="#00d4ff"/><rect x="10" y="2" width="4" height="12" rx="1" fill="#00d4ff"/></svg>;
}

// ── Divider ───────────────────────────────────────────────────────────────────

function Divider() {
  return (
    <div aria-hidden="true" style={{
      width:     '1px',
      height:    '28px',
      background: 'rgba(0,212,255,0.15)',
      flexShrink: 0,
      margin:    '0 12px',
    }} />
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

const headerBtnStyle = {
  background:     'transparent',
  border:         '1px solid rgba(0,212,255,0.2)',
  borderRadius:   '4px',
  color:          'rgba(0,212,255,0.6)',
  width:          '28px',
  height:         '28px',
  cursor:         'pointer',
  fontSize:       '14px',
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  flexShrink:     0,
  transition:     'all 200ms ease',
  lineHeight:     1,
  padding:        0,
};

export default function HudHeader({
  isAmbientPlaying,
  ambientVolume,
  onAmbientToggle,
  onVolumeChange,
  onHelp,
}) {
  const now = useNow();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isFullscreenRef = useRef(false);
  isFullscreenRef.current = isFullscreen;

  useEffect(() => {
    if (window.taskiAPI?.windowGetFullscreen) {
      window.taskiAPI.windowGetFullscreen().then(setIsFullscreen).catch(() => {});
    }
  }, []);

  useEffect(() => {
    async function handleKey(e) {
      if (e.key === 'F11') {
        e.preventDefault();
        if (isFullscreenRef.current) {
          await window.taskiAPI?.windowRestore?.();
          setIsFullscreen(false);
        } else {
          await window.taskiAPI?.windowFullscreen?.();
          setIsFullscreen(true);
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  async function toggleFullscreen() {
    if (isFullscreen) {
      await window.taskiAPI?.windowRestore?.();
      setIsFullscreen(false);
    } else {
      await window.taskiAPI?.windowFullscreen?.();
      setIsFullscreen(true);
    }
  }

  return (
    <div
      style={{
        position:       'relative',
        flexShrink:     0,
        height:         '52px',
        width:          '100%',
        zIndex:         100,
        background:     'rgba(2, 10, 25, 0.9)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom:   '1px solid rgba(0,212,255,0.15)',
        display:        'flex',
        alignItems:     'center',
        padding:        '0 20px',
        gap:            0,
        userSelect:     'none',
      }}
    >
      {/* ── Logo ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <div style={{
          width:          '28px',
          height:         '28px',
          border:         '1px solid #00d4ff',
          borderRadius:   '3px',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          boxShadow:      '0 0 10px rgba(0,212,255,0.3), inset 0 0 8px rgba(0,212,255,0.05)',
          flexShrink:     0,
        }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1" y="2" width="14" height="2" fill="#00d4ff"/>
            <rect x="6.5" y="4" width="3" height="10" fill="#00d4ff"/>
          </svg>
        </div>
        <div>
          <div style={{
            fontFamily:    "'Orbitron', sans-serif",
            fontSize:      '14px',
            fontWeight:    700,
            letterSpacing: '0.12em',
            color:         '#00d4ff',
            textShadow:    '0 0 16px rgba(0,212,255,0.8)',
            lineHeight:    1,
          }}>
            TASKI
          </div>
          <div style={{
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '8px',
            letterSpacing: '0.14em',
            color:         'rgba(0,212,255,0.4)',
            textTransform: 'uppercase',
            marginTop:     '2px',
            lineHeight:    1,
          }}>
            SMART SCHEDULING
          </div>
        </div>
      </div>

      <Divider />

      {/* ── DateTime (center) ── */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px' }}>
        <div style={{
          fontFamily:    "'Orbitron', sans-serif",
          fontSize:      '18px',
          fontWeight:    700,
          letterSpacing: '0.06em',
          color:         '#00d4ff',
          textShadow:    '0 0 14px rgba(0,212,255,0.7)',
          lineHeight:    1,
        }}>
          {formatTime(now)}
        </div>
        <div>
          <div style={{
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '10px',
            fontWeight:    500,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color:         'rgba(74,155,190,0.8)',
            lineHeight:    1,
          }}>
            {formatDate(now)}
          </div>
          <div style={{
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '9px',
            letterSpacing: '0.08em',
            color:         'rgba(30,77,107,0.9)',
            marginTop:     '2px',
            lineHeight:    1,
          }}>
            {getTzLabel()}
          </div>
        </div>
      </div>

      <Divider />

      {/* ── Music controls ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontFamily: "'Rajdhani'", fontSize: '9px', letterSpacing: '0.12em', color: 'rgba(0,212,255,0.4)', textTransform: 'uppercase' }}>
          AMBIENT
        </span>
        <button
          onClick={onAmbientToggle}
          aria-label={isAmbientPlaying ? 'Pause music' : 'Play music'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '4px', display: 'flex', alignItems: 'center', opacity: 0.85,
            transition: 'opacity 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85'; }}
        >
          {isAmbientPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <input
          type="range" min={0} max={100} value={ambientVolume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          aria-label="Ambient music volume"
          style={{ width: '80px', cursor: 'pointer', accentColor: '#00d4ff', flexShrink: 0 }}
        />
      </div>

      <Divider />

      {/* ── Fullscreen + Help buttons ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('taski-briefing'))}
          title="Morning Briefing"
          style={headerBtnStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0,212,255,0.7)';
            e.currentTarget.style.color       = '#00d4ff';
            e.currentTarget.style.background  = 'rgba(0,212,255,0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)';
            e.currentTarget.style.color       = 'rgba(0,212,255,0.6)';
            e.currentTarget.style.background  = 'transparent';
          }}
        >
          🌅
        </button>

        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen (F11)' : 'Fullscreen (F11)'}
          style={headerBtnStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0,212,255,0.7)';
            e.currentTarget.style.color       = '#00d4ff';
            e.currentTarget.style.background  = 'rgba(0,212,255,0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)';
            e.currentTarget.style.color       = 'rgba(0,212,255,0.6)';
            e.currentTarget.style.background  = 'transparent';
          }}
        >
          {isFullscreen ? '⊡' : '⛶'}
        </button>

        <button
          onClick={onHelp}
          aria-label="Open help"
          style={{
            width:          '32px',
            height:         '32px',
            borderRadius:   '50%',
            border:         '1px solid rgba(0,212,255,0.3)',
            background:     'transparent',
            color:          'rgba(0,212,255,0.6)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            cursor:         'pointer',
            transition:     'all 200ms ease',
            flexShrink:     0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#00d4ff';
            e.currentTarget.style.color       = '#00d4ff';
            e.currentTarget.style.boxShadow   = '0 0 12px rgba(0,212,255,0.5)';
            e.currentTarget.style.background  = 'rgba(0,212,255,0.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0,212,255,0.3)';
            e.currentTarget.style.color       = 'rgba(0,212,255,0.6)';
            e.currentTarget.style.boxShadow   = 'none';
            e.currentTarget.style.background  = 'transparent';
          }}
        >
          <HelpCircle size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

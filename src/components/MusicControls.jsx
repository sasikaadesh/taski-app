// MusicControls — play/pause + volume slider for the ambient Web Audio background layer.

import { useEffect, useRef } from 'react';

// ── SVG icons ─────────────────────────────────────────────────────────────────

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <polygon points="3,1.5 14,8 3,14.5" fill="#00d4ff" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2"  y="2" width="4" height="12" rx="1" fill="#00d4ff" />
      <rect x="10" y="2" width="4" height="12" rx="1" fill="#00d4ff" />
    </svg>
  );
}

// ── Component (controlled) ────────────────────────────────────────────────────
/**
 * Props:
 *   playing       boolean  — is ambient currently playing
 *   volume        number   — 0–100
 *   onToggle      fn       — called when play/pause clicked
 *   onVolumeChange fn(val) — called with new 0–100 value
 */
export default function MusicControls({ playing, volume, onToggle, onVolumeChange }) {
  const sliderRef = useRef(null);

  // Keep the slider's CSS filled-track in sync with the value
  useEffect(() => {
    if (sliderRef.current) {
      sliderRef.current.style.setProperty('--pct', `${volume}%`);
    }
  }, [volume]);

  return (
    <div
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            '10px',
        padding:        '8px 16px',
        background:     'var(--color-bg-raised)',
        border:         '1px solid rgba(0,212,255,0.15)',
        borderRadius:   '4px',
        boxShadow:      'inset 0 0 12px rgba(0,212,255,0.03)',
      }}
    >
      {/* Play / Pause */}
      <button
        onClick={onToggle}
        aria-label={playing ? 'Pause ambient music' : 'Play ambient music'}
        aria-pressed={playing}
        style={{
          background: 'none',
          border:     'none',
          padding:    0,
          cursor:     'pointer',
          color:      '#00d4ff',
          display:    'flex',
          alignItems: 'center',
          flexShrink: 0,
          lineHeight: 0,
          transition: 'opacity 150ms',
          opacity:    0.85,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85'; }}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      {/* Volume slider */}
      <input
        ref={sliderRef}
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={(e) => onVolumeChange(Number(e.target.value))}
        aria-label="Ambient music volume"
        style={{
          width:       '110px',
          cursor:      'pointer',
          accentColor: '#00d4ff',
          flexShrink:  0,
        }}
      />

      {/* Music note + label */}
      <span
        style={{
          fontFamily:    "'Rajdhani', sans-serif",
          fontSize:      '11px',
          fontWeight:    500,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color:         'rgba(0,212,255,0.4)',
          flexShrink:    0,
          userSelect:    'none',
        }}
      >
        ♪ AMBIENT
      </span>
    </div>
  );
}

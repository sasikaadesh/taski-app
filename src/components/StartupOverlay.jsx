// StartupOverlay — animated startup sequence that plays once per browser session.
// Fades in the TASKI logo, draws SVG rings, then calls onDone() after 1.5 seconds.

import { useEffect, useState } from 'react';

const CX = 120;
const CY = 120;
const R1 = 85;
const R2 = 67;
const R3 = 50;
const circ = (r) => +(2 * Math.PI * r).toFixed(2);

export default function StartupOverlay({ onDone, isMuted }) {
  const [phase, setPhase] = useState('enter'); // 'enter' | 'draw' | 'exit'

  // ── Play greeting via TTS ─────────────────────────────────────────────────
  useEffect(() => {
    if (isMuted || !window.speechSynthesis) return;

    const greeting = 'Taski system online. Good to see you.';

    const doSpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find((v) => v.name === 'Google UK English Male');
      const fallback  = voices.find((v) => v.lang.startsWith('en') && v.name.toLowerCase().includes('male'));

      const utterance     = new SpeechSynthesisUtterance(greeting);
      utterance.rate      = 0.9;
      utterance.pitch     = 0.85;
      utterance.volume    = 1.0;
      utterance.voice     = preferred || fallback || null;

      window.speechSynthesis.speak(utterance);
    };

    // Chrome needs a brief delay + voiceschanged may fire if voices aren't ready yet
    const timer = setTimeout(() => {
      if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true });
      } else {
        doSpeak();
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      window.speechSynthesis.removeEventListener('voiceschanged', doSpeak);
      window.speechSynthesis.cancel();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Advance through phases and call onDone ────────────────────────────────
  useEffect(() => {
    // Phase 1: let the title fade in (300ms)
    const t1 = setTimeout(() => setPhase('draw'), 300);
    // Phase 2: rings draw for ~800ms, then start exit
    const t2 = setTimeout(() => setPhase('exit'), 1200);
    // Phase 3: fade out complete → unmount
    const t3 = setTimeout(() => onDone(), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Taski system initializing"
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         9999,
        background:     '#000',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '32px',
        opacity:        phase === 'exit' ? 0 : 1,
        transition:     'opacity 400ms ease',
        pointerEvents:  phase === 'exit' ? 'none' : 'auto',
      }}
    >
      {/* ── TASKI heading ── */}
      <div
        style={{
          animation:     phase !== 'enter' ? 'startupFadeIn 0.5s ease forwards' : 'none',
          opacity:       phase === 'enter' ? 0 : 1,
        }}
      >
        <h1
          style={{
            fontFamily:    "'Orbitron', sans-serif",
            fontSize:      'clamp(36px, 6vw, 56px)',
            fontWeight:    900,
            letterSpacing: '0.18em',
            color:         '#00d4ff',
            textShadow:    '0 0 40px rgba(0,212,255,0.9), 0 0 80px rgba(0,212,255,0.4)',
            margin:        0,
            lineHeight:    1,
          }}
        >
          TASKI
        </h1>
        <p
          style={{
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '13px',
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color:         'rgba(0,212,255,0.5)',
            margin:        '8px 0 0',
            textAlign:     'center',
            animation:     'startupSubFade 0.6s ease 0.3s both',
          }}
        >
          SYSTEM ONLINE
        </p>
      </div>

      {/* ── Animated rings (stroke-dashoffset draw) ── */}
      <svg
        viewBox="0 0 240 240"
        width="200"
        height="200"
        style={{
          opacity:    phase === 'enter' ? 0 : 1,
          transition: 'opacity 0.3s ease',
          overflow:   'visible',
        }}
      >
        {/* Outer ring */}
        <circle
          cx={CX} cy={CY} r={R1}
          fill="none"
          stroke="#00d4ff"
          strokeWidth="1.5"
          opacity="0.7"
          strokeDasharray={circ(R1)}
          strokeDashoffset={phase === 'draw' || phase === 'exit' ? 0 : circ(R1)}
          style={{
            transition:    'stroke-dashoffset 0.8s ease',
            transformOrigin: `${CX}px ${CY}px`,
          }}
        />

        {/* Middle ring */}
        <circle
          cx={CX} cy={CY} r={R2}
          fill="none"
          stroke="#00d4ff"
          strokeWidth="2.5"
          opacity="0.6"
          strokeDasharray={circ(R2)}
          strokeDashoffset={phase === 'draw' || phase === 'exit' ? 0 : circ(R2)}
          style={{
            transition:    'stroke-dashoffset 0.7s ease 0.1s',
            transformOrigin: `${CX}px ${CY}px`,
          }}
        />

        {/* Inner dashed ring */}
        <circle
          cx={CX} cy={CY} r={R3}
          fill="none"
          stroke="#00d4ff"
          strokeWidth="1.5"
          strokeDasharray="8 5"
          opacity={phase === 'draw' || phase === 'exit' ? 0.5 : 0}
          style={{ transition: 'opacity 0.4s ease 0.4s' }}
        />

        {/* Center circle */}
        <circle
          cx={CX} cy={CY} r="32"
          fill="rgba(0,212,255,0.05)"
          stroke="#00d4ff"
          strokeWidth="1"
          opacity={phase === 'draw' || phase === 'exit' ? 0.7 : 0}
          style={{ transition: 'opacity 0.3s ease 0.5s' }}
        />

        {/* TASKI text in center */}
        <text
          x={CX} y={CY + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          opacity={phase === 'draw' || phase === 'exit' ? 0.9 : 0}
          style={{
            fontFamily:    "'Orbitron', sans-serif",
            fontSize:      '11px',
            fontWeight:    700,
            letterSpacing: '0.1em',
            fill:          '#00d4ff',
            transition:    'opacity 0.3s ease 0.6s',
          }}
        >
          TASKI
        </text>
      </svg>

      {/* ── Initializing status text ── */}
      <div
        style={{
          fontFamily:    "'Rajdhani', sans-serif",
          fontSize:      '11px',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color:         'rgba(0,212,255,0.35)',
          opacity:       phase === 'draw' ? 1 : 0,
          transition:    'opacity 0.4s ease',
        }}
      >
        Initializing TASKI...
      </div>
    </div>
  );
}

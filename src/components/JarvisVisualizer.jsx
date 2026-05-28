// JarvisVisualizer — animated SVG circular AI visualizer in 4 states:
// idle | listening | processing | speaking

import { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const CX   = 180;   // SVG viewport center x
const CY   = 180;   // SVG viewport center y
const R_OUT = 128;  // outer ring radius
const R_MID = 102;  // middle ring radius
const R_INN = 78;   // inner ring radius (dashed)
const R_CTR = 48;   // center circle radius
const R_BAR = 152;  // orbit radius for equalizer bars
const N_BARS = 12;  // number of equalizer bars

// ── Bar heights by state (target ranges) ──────────────────────────────────────
const BAR_IDLE_H     = 5;
const BAR_LISTEN_MAX = 18;
const BAR_SPEAK_MAX  = 34;

// ── Ring rotation speeds (animation-duration in seconds) ──────────────────────
const SPEED = {
  idle:       { outer: 12, mid: 9,  inn: 15 },
  listening:  { outer:  4, mid: 3,  inn:  5 },
  processing: { outer:  6, mid: 4.5,inn:  7 },
  speaking:   { outer:  5, mid: 3.5,inn:  6 },
};

// ── Color per state ───────────────────────────────────────────────────────────
const STATE_COLOR = {
  idle:       '#00d4ff',
  listening:  '#00d4ff',
  processing: '#ff6b00',
  speaking:   '#00d4ff',
};

const STATE_OPACITY = {
  idle:       0.42,
  listening:  1.0,
  processing: 0.85,
  speaking:   1.0,
};

// ── Circumferences for stroke-dasharray ───────────────────────────────────────
const circ = (r) => +(2 * Math.PI * r).toFixed(2);

// ── Sonar ping radii offsets for LISTENING ────────────────────────────────────
const SONAR_DELAYS = [0, 0.5, 1.0]; // seconds offset per ring

export default function JarvisVisualizer({
  state        = 'idle',
  onMicClick,
  isMuted,
  onMuteToggle,
  isSupported  = true,
}) {
  const animFrameRef = useRef(null);
  const tRef         = useRef(0);
  const [barHeights, setBarHeights] = useState(() => Array(N_BARS).fill(BAR_IDLE_H));
  const isVisible    = useRef(true);

  // ── Bar animation via rAF ─────────────────────────────────────────────────
  const runBars = useCallback(() => {
    tRef.current += 0.035;
    const t = tRef.current;

    let heights;
    if (state === 'speaking') {
      heights = Array.from({ length: N_BARS }, (_, i) => {
        // Different frequency + phase per bar → convincing audio-eq effect
        const phase = i * (Math.PI * 2 / N_BARS);
        const wave  = Math.abs(
          Math.sin(t * 2.2 + phase) * 0.6 +
          Math.sin(t * 3.7 + phase * 1.3) * 0.4
        );
        return BAR_IDLE_H + wave * BAR_SPEAK_MAX;
      });
    } else if (state === 'listening') {
      heights = Array.from({ length: N_BARS }, (_, i) => {
        const phase = i * (Math.PI * 2 / N_BARS);
        const wave  = Math.abs(Math.sin(t * 1.6 + phase));
        return BAR_IDLE_H + wave * BAR_LISTEN_MAX;
      });
    } else {
      heights = Array(N_BARS).fill(BAR_IDLE_H);
    }

    setBarHeights(heights);
    if (isVisible.current) {
      animFrameRef.current = requestAnimationFrame(runBars);
    }
  }, [state]);

  // Start/stop animation loop
  useEffect(() => {
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(runBars);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [runBars]);

  // Page Visibility API — pause when tab is hidden
  useEffect(() => {
    const onViz = () => {
      isVisible.current = !document.hidden;
      if (!document.hidden) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = requestAnimationFrame(runBars);
      }
    };
    document.addEventListener('visibilitychange', onViz);
    return () => document.removeEventListener('visibilitychange', onViz);
  }, [runBars]);

  // ── Derived values ────────────────────────────────────────────────────────
  const color   = STATE_COLOR[state]   ?? '#00d4ff';
  const opacity = STATE_OPACITY[state] ?? 0.42;
  const speed   = SPEED[state]         ?? SPEED.idle;

  // Ring style factory
  const ringStyle = (dur, direction = 'CW', extraStyle = {}) => ({
    transformOrigin: `${CX}px ${CY}px`,
    animation: `rotateRing${direction} ${dur}s linear infinite`,
    ...extraStyle,
  });

  // Center group style
  const centerGroupStyle = state === 'speaking' ? {
    transformOrigin: `${CX}px ${CY}px`,
    animation: 'speakingRingScale 0.9s ease-in-out infinite',
  } : state === 'listening' ? {
    transformOrigin: `${CX}px ${CY}px`,
    animation: 'speakingRingScale 0.5s ease-in-out infinite',
  } : {};

  // ── State label ───────────────────────────────────────────────────────────
  const stateLabel = {
    idle:       '',
    listening:  'LISTENING...',
    processing: 'PROCESSING...',
    speaking:   'SPEAKING...',
  }[state] ?? '';

  const stateLabelColor = state === 'processing' ? '#ff6b00' : '#00d4ff';

  return (
    <div
      style={{
        display:         'flex',
        flexDirection:   'column',
        alignItems:      'center',
        gap:             '16px',
        userSelect:      'none',
      }}
    >
      {/* ── SVG Visualizer ── */}
      <div style={{ position: 'relative' }}>
        <svg
          viewBox="0 0 360 360"
          width="300"
          height="300"
          aria-label={`Jarvis visualizer — ${state}`}
          role="img"
          style={{ overflow: 'visible' }}
        >
          {/* ══ Background subtle glow disc ══ */}
          <circle
            cx={CX} cy={CY} r={R_OUT + 20}
            fill="none"
            stroke={color}
            strokeWidth="1"
            opacity={state === 'speaking' ? 0.08 : 0.03}
            style={state === 'speaking' ? { animation: 'speakOuterGlow 1.2s ease-in-out infinite' } : {}}
          />

          {/* ══ SPEAKING: outer pulse glow ring ══ */}
          {state === 'speaking' && (
            <circle
              cx={CX} cy={CY} r={R_OUT + 10}
              fill="rgba(0,212,255,0.06)"
              stroke="#00d4ff"
              strokeWidth="2"
              style={{ animation: 'speakingRingScale 1.0s ease-in-out infinite' }}
            />
          )}

          {/* ══ LISTENING: sonar ping circles ══ */}
          {state === 'listening' && SONAR_DELAYS.map((delay, i) => (
            <circle
              key={i}
              cx={CX} cy={CY} r="52"
              fill="none"
              stroke="#00d4ff"
              strokeWidth="1.5"
              style={{
                animation: `sonarPing 2s ease-out ${delay}s infinite`,
                transformOrigin: `${CX}px ${CY}px`,
              }}
            />
          ))}

          {/* ══ LISTENING: 8 radiating lines ══ */}
          {state === 'listening' && Array.from({ length: 8 }, (_, i) => {
            const ang = (i * 45 - 90) * Math.PI / 180;
            const x2  = CX + 138 * Math.cos(ang);
            const y2  = CY + 138 * Math.sin(ang);
            return (
              <line
                key={i}
                x1={CX} y1={CY} x2={x2} y2={y2}
                stroke="#00d4ff"
                strokeWidth="1"
                strokeDasharray="80"
                strokeDashoffset="80"
                style={{
                  animation: `sonarLinePing 1.8s ease-out ${i * 0.15}s infinite`,
                }}
              />
            );
          })}

          {/* ══ PROCESSING: loading arc around center ══ */}
          {state === 'processing' && (
            <g style={{ transformOrigin: `${CX}px ${CY}px`, animation: 'loadingArcSpin 1s linear infinite' }}>
              <circle
                cx={CX} cy={CY} r={R_CTR + 10}
                fill="none"
                stroke="#ff6b00"
                strokeWidth="2"
                strokeDasharray={`${circ(R_CTR + 10) * 0.25} ${circ(R_CTR + 10) * 0.75}`}
                strokeLinecap="round"
              />
            </g>
          )}

          {/* ══ Equalizer bars (12, evenly around orbit R_BAR) ══ */}
          {Array.from({ length: N_BARS }, (_, i) => {
            const angle = (i * (360 / N_BARS)) * Math.PI / 180;
            const bx    = CX + R_BAR * Math.cos(angle - Math.PI / 2);
            const by    = CY + R_BAR * Math.sin(angle - Math.PI / 2);
            const h     = barHeights[i] ?? BAR_IDLE_H;
            const barOpacity = state === 'idle' ? 0.3 : 0.85;
            return (
              <g
                key={i}
                transform={`translate(${CX}, ${CY}) rotate(${i * (360 / N_BARS)})`}
                style={{ transformOrigin: `${CX}px ${CY}px` }}
              >
                <rect
                  x="-2"
                  y={-(R_BAR + h)}
                  width="4"
                  height={h}
                  rx="2"
                  fill={color}
                  opacity={barOpacity}
                />
              </g>
            );
          })}

          {/* ══ Outer ring (slow CW) ══ */}
          <g style={ringStyle(speed.outer, 'CW')}>
            <circle
              cx={CX} cy={CY} r={R_OUT}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              opacity={opacity}
            />
            {/* Dot decorations on outer ring at 8 evenly spaced positions */}
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i * 45 - 90) * Math.PI / 180;
              return (
                <circle
                  key={i}
                  cx={CX + R_OUT * Math.cos(a)}
                  cy={CY + R_OUT * Math.sin(a)}
                  r="2.5"
                  fill={color}
                  opacity={opacity * 1.5}
                />
              );
            })}
          </g>

          {/* ══ Middle ring (CCW, slightly faster) ══ */}
          <g style={ringStyle(speed.mid, 'CCW')}>
            <circle
              cx={CX} cy={CY} r={R_MID}
              fill="none"
              stroke={color}
              strokeWidth="3"
              opacity={opacity}
            />
          </g>

          {/* ══ Inner ring (CW dashed) ══ */}
          <g style={ringStyle(speed.inn, 'CW')}>
            <circle
              cx={CX} cy={CY} r={R_INN}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeDasharray="10 6"
              opacity={opacity}
            />
          </g>

          {/* ══ Center circle group — pulsing in speaking/listening ══ */}
          <g style={centerGroupStyle}>
            {/* Center fill disc */}
            <circle
              cx={CX} cy={CY} r={R_CTR}
              fill={`rgba(${state === 'processing' ? '255,107,0' : '0,212,255'},0.06)`}
              stroke={color}
              strokeWidth="1.5"
              opacity={opacity + 0.3}
            />

            {/* Inner circle — solid glow */}
            <circle
              cx={CX} cy={CY} r={R_CTR - 8}
              fill={`rgba(${state === 'processing' ? '255,107,0' : '0,212,255'},0.04)`}
              stroke={color}
              strokeWidth="0.5"
              opacity={opacity + 0.2}
              style={{
                animation: state === 'idle' ? 'jarvisGlowPulse 3s ease-in-out infinite' : 'none',
              }}
            />

            {/* TASKI text inside center */}
            <text
              x={CX}
              y={CY + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontFamily:    "'Orbitron', sans-serif",
                fontSize:      '14px',
                fontWeight:    700,
                letterSpacing: '0.12em',
                fill:          color,
                opacity:       opacity + 0.4,
              }}
            >
              TASKI
            </text>
          </g>
        </svg>
      </div>

      {/* ── State label ── */}
      <div style={{ height: '20px', display: 'flex', alignItems: 'center' }}>
        {stateLabel && (
          <span
            style={{
              fontFamily:    "'Rajdhani', sans-serif",
              fontSize:      '13px',
              fontWeight:    600,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color:         stateLabelColor,
              textShadow:    `0 0 12px ${stateLabelColor}`,
              animation:     state === 'listening' ? 'recordPulse 1s ease-in-out infinite' : 'none',
            }}
          >
            {stateLabel}
          </span>
        )}
      </div>

      {/* ── Controls: Mic + Mute ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>

        {/* Mic button */}
        {isSupported && (
          <button
            onClick={onMicClick}
            aria-label={state === 'listening' ? 'Stop listening' : 'Start voice input'}
            aria-pressed={state === 'listening'}
            style={{
              width:          '52px',
              height:         '52px',
              borderRadius:   '50%',
              border:         state === 'listening'
                ? '2px solid #00d4ff'
                : '1px solid rgba(0,212,255,0.4)',
              background:     state === 'listening'
                ? 'rgba(0,212,255,0.12)'
                : 'rgba(0,212,255,0.04)',
              color:          state === 'listening' ? '#00d4ff' : 'rgba(0,212,255,0.6)',
              cursor:         'pointer',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              transition:     'all 200ms ease',
              boxShadow:      state === 'listening'
                ? '0 0 24px rgba(0,212,255,0.5), inset 0 0 16px rgba(0,212,255,0.08)'
                : 'none',
              animation:      state === 'listening' ? 'glowPulse 1.5s ease-in-out infinite' : 'none',
            }}
            onMouseEnter={(e) => {
              if (state !== 'listening') {
                e.currentTarget.style.borderColor  = 'rgba(0,212,255,0.8)';
                e.currentTarget.style.color        = '#00d4ff';
                e.currentTarget.style.boxShadow    = '0 0 16px rgba(0,212,255,0.35)';
                e.currentTarget.style.background   = 'rgba(0,212,255,0.08)';
              }
            }}
            onMouseLeave={(e) => {
              if (state !== 'listening') {
                e.currentTarget.style.borderColor  = 'rgba(0,212,255,0.4)';
                e.currentTarget.style.color        = 'rgba(0,212,255,0.6)';
                e.currentTarget.style.boxShadow    = 'none';
                e.currentTarget.style.background   = 'rgba(0,212,255,0.04)';
              }
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.94)'; }}
            onMouseUp={(e)   => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {state === 'listening'
              ? <MicOff size={20} aria-hidden="true" />
              : <Mic    size={20} aria-hidden="true" />
            }
          </button>
        )}

        {/* Mute/Unmute TTS button */}
        <button
          onClick={onMuteToggle}
          aria-label={isMuted ? 'Unmute voice' : 'Mute voice'}
          aria-pressed={isMuted}
          title={isMuted ? 'Voice is muted — click to unmute' : 'Click to mute TASKI voice'}
          style={{
            width:          '40px',
            height:         '40px',
            borderRadius:   '50%',
            border:         '1px solid rgba(0,212,255,0.3)',
            background:     'rgba(0,212,255,0.03)',
            color:          isMuted ? 'rgba(0,212,255,0.3)' : 'rgba(0,212,255,0.55)',
            cursor:         'pointer',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            transition:     'all 200ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0,212,255,0.6)';
            e.currentTarget.style.color       = '#00d4ff';
            e.currentTarget.style.boxShadow   = '0 0 10px rgba(0,212,255,0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0,212,255,0.3)';
            e.currentTarget.style.color       = isMuted ? 'rgba(0,212,255,0.3)' : 'rgba(0,212,255,0.55)';
            e.currentTarget.style.boxShadow   = 'none';
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; }}
          onMouseUp={(e)   => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {isMuted
            ? <VolumeX size={16} aria-hidden="true" />
            : <Volume2 size={16} aria-hidden="true" />
          }
        </button>
      </div>
    </div>
  );
}

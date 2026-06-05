// JarvisVisualizer — large HUD-style animated ring system. Central visual element.
// States: idle | listening | processing | speaking

import { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

// ── SVG constants ──────────────────────────────────────────────────────────────
const CX = 250;
const CY = 250;

// Ring radii (outermost → innermost)
const R1 = 220; // outermost
const R2 = 202;
const R3 = 184;
const R4 = 166; // main bright ring (tick marks)
const R5 = 148; // inner bright
const R6 = 130;
const R7 = 112;
const R8 =  94; // innermost
const RC =  64; // center circle
const R_BAR = 178; // equalizer bar orbit

const N_BARS = 12;
const BAR_IDLE_H    = 4;
const BAR_LISTEN_MAX = 20;
const BAR_SPEAK_MAX  = 38;

const SONAR_DELAYS = [0, 0.55, 1.1];

// ── State color map ────────────────────────────────────────────────────────────
const STATE_COLOR = {
  idle:       '#00d4ff',
  listening:  '#00d4ff',
  processing: '#ff8c00',
  speaking:   '#00d4ff',
};

// ── Speed map (animation-duration in seconds) ──────────────────────────────────
const SPEED = {
  idle:       { r1:60, r2:45, r3:30, r4:20, r5:15, r6:25, r7:10, r8:8 },
  listening:  { r1:20, r2:15, r3:10, r4: 7, r5: 5, r6: 8, r7: 3, r8:3 },
  processing: { r1:30, r2:22, r3:15, r4:10, r5: 8, r6:12, r7: 5, r8:4 },
  speaking:   { r1:25, r2:18, r3:12, r4: 8, r5: 6, r6:10, r7: 4, r8:3 },
};

// ── Opacity map ────────────────────────────────────────────────────────────────
const BASE_OPQ = {
  idle:       0.32,
  listening:  0.85,
  processing: 0.72,
  speaking:   0.90,
};

// ── Circumference helper ───────────────────────────────────────────────────────
const circ = (r) => +(2 * Math.PI * r).toFixed(2);

// ── Ring style factory ─────────────────────────────────────────────────────────
function ringStyle(dur, dir = 'CW', extra = {}) {
  return {
    transformOrigin: `${CX}px ${CY}px`,
    animation: `rotateRing${dir} ${dur}s linear infinite`,
    ...extra,
  };
}

// ── Tick marks around ring 4 ───────────────────────────────────────────────────
function TickMarks({ color, opacity }) {
  const ticks = [];
  for (let i = 0; i < 72; i++) {
    const ang    = (i * 5 - 90) * Math.PI / 180;
    const isLg   = i % 6 === 0;
    const isMed  = i % 3 === 0;
    const inner  = R4 - (isLg ? 12 : isMed ? 7 : 4);
    const cos    = Math.cos(ang);
    const sin    = Math.sin(ang);
    ticks.push(
      <line
        key={i}
        x1={CX + inner * cos}
        y1={CY + inner * sin}
        x2={CX + R4 * cos}
        y2={CY + R4 * sin}
        stroke={color}
        strokeWidth={isLg ? 1.5 : isMed ? 1 : 0.5}
        opacity={isLg ? Math.min(opacity + 0.3, 1) : opacity * 0.7}
      />
    );
  }
  return <g>{ticks}</g>;
}

// ── Mini ring element ──────────────────────────────────────────────────────────
function MiniRing({ angleDeg, color }) {
  const dist  = R1 + 28;
  const ang   = (angleDeg - 90) * Math.PI / 180;
  const mx    = CX + dist * Math.cos(ang);
  const my    = CY + dist * Math.sin(ang);
  const R     = 16;

  return (
    <g style={{ transformOrigin: `${mx}px ${my}px`, animation: 'rotateRingCCW 8s linear infinite' }}>
      <circle cx={mx} cy={my} r={R}     fill="none" stroke={color} strokeWidth="1"   opacity="0.35" />
      <circle cx={mx} cy={my} r={R - 6} fill="none" stroke={color} strokeWidth="0.5" opacity="0.25"
        strokeDasharray="4 3" />
      <circle cx={mx} cy={my} r="2"     fill={color} opacity="0.5" />
    </g>
  );
}

// ── Triangle indicator ─────────────────────────────────────────────────────────
function TriangleIndicator({ angleDeg, color, opacity }) {
  const dist = R1 - 14;
  const ang  = (angleDeg - 90) * Math.PI / 180;
  const tx   = CX + dist * Math.cos(ang);
  const ty   = CY + dist * Math.sin(ang);
  const S    = 6;
  // Rotated to point inward
  const rot  = angleDeg + 180;
  return (
    <polygon
      points={`0,${-S} ${S * 0.7},${S * 0.6} ${-S * 0.7},${S * 0.6}`}
      fill={color}
      opacity={opacity}
      transform={`translate(${tx},${ty}) rotate(${rot})`}
    />
  );
}

// ── HUD data readout lines ─────────────────────────────────────────────────────
function HudReadouts({ color, calConnected, speaking }) {
  const lines = [
    { label: 'SYS',  value: 'ONLINE',    active: true },
    { label: 'CAL',  value: calConnected ? 'SYNCED' : 'OFFLINE', active: calConnected },
    { label: 'AI',   value: speaking ? 'SPEAKING' : 'READY',     active: true },
  ];
  return (
    <g>
      {lines.map((l, i) => (
        <g key={l.label}>
          <text
            x={CX + R1 + 8}
            y={CY - 28 + i * 16}
            style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '9px', letterSpacing: '0.1em' }}
            fill={l.active ? color : 'rgba(74,155,190,0.35)'}
            opacity={0.7}
          >
            {l.label}: {l.value}
          </text>
        </g>
      ))}
    </g>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function JarvisVisualizer({
  state        = 'idle',
  onMicClick,
  isMuted,
  onMuteToggle,
  isSupported  = true,
}) {
  const animFrameRef = useRef(null);
  const tRef         = useRef(0);
  const isVisible    = useRef(true);
  const [barHeights, setBarHeights] = useState(() => Array(N_BARS).fill(BAR_IDLE_H));

  // Bar animation
  const runBars = useCallback(() => {
    tRef.current += 0.035;
    const t = tRef.current;
    let heights;

    if (state === 'speaking') {
      heights = Array.from({ length: N_BARS }, (_, i) => {
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

  useEffect(() => {
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(runBars);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [runBars]);

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

  // Derived
  const color   = STATE_COLOR[state] ?? '#00d4ff';
  const baseOpq = BASE_OPQ[state]    ?? 0.32;
  const speed   = SPEED[state]       ?? SPEED.idle;
  const isProc  = state === 'processing';

  const centerGroupStyle = (state === 'speaking' || state === 'listening')
    ? { transformOrigin: `${CX}px ${CY}px`, animation: `speakingRingScale ${state === 'speaking' ? 0.9 : 0.5}s ease-in-out infinite` }
    : {};

  const stateLabel = { idle: '', listening: 'LISTENING...', processing: 'PROCESSING...', speaking: 'SPEAKING...' }[state] ?? '';

  // SVG size: large, responsive
  const svgSize = 'min(62vmin, 500px)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}>

      {/* ── Main SVG ── */}
      <div style={{ position: 'relative', pointerEvents: 'none' }}>
        <svg
          viewBox="0 0 500 500"
          width={svgSize}
          height={svgSize}
          aria-label={`TASKI visualizer — ${state}`}
          role="img"
          style={{ overflow: 'visible', display: 'block' }}
        >
          {/* ── Background radial glow disc ── */}
          <defs>
            <radialGradient id="centerFill" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="rgba(0,60,120,0.85)" />
              <stop offset="60%"  stopColor="rgba(0,30,80,0.9)" />
              <stop offset="100%" stopColor="rgba(0,10,30,1)" />
            </radialGradient>
            <filter id="cyanGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {/* Outer ambient glow */}
          <circle cx={CX} cy={CY} r={R1 + 40}
            fill="none" stroke={color} strokeWidth="1"
            opacity={state === 'speaking' ? 0.07 : 0.025}
            style={state === 'speaking' ? { animation: 'speakOuterGlow 1.2s ease-in-out infinite' } : {}}
          />

          {/* ── LISTENING: sonar pings ── */}
          {state === 'listening' && SONAR_DELAYS.map((delay, i) => (
            <circle key={i} cx={CX} cy={CY} r="70"
              fill="none" stroke="#00d4ff" strokeWidth="1.5"
              style={{ animation: `sonarPing 2.2s ease-out ${delay}s infinite`, transformOrigin: `${CX}px ${CY}px` }}
            />
          ))}

          {/* ── LISTENING: 8 radiating lines ── */}
          {state === 'listening' && Array.from({ length: 8 }, (_, i) => {
            const ang = (i * 45 - 90) * Math.PI / 180;
            const x2  = CX + 240 * Math.cos(ang);
            const y2  = CY + 240 * Math.sin(ang);
            return (
              <line key={i} x1={CX} y1={CY} x2={x2} y2={y2}
                stroke="#00d4ff" strokeWidth="1"
                strokeDasharray="120" strokeDashoffset="120"
                style={{ animation: `sonarLinePing 1.8s ease-out ${i * 0.15}s infinite` }}
              />
            );
          })}

          {/* ── PROCESSING: spinning arc around center ── */}
          {isProc && (
            <g style={{ transformOrigin: `${CX}px ${CY}px`, animation: 'loadingArcSpin 1s linear infinite' }}>
              <circle cx={CX} cy={CY} r={RC + 14}
                fill="none" stroke="#ff8c00" strokeWidth="2.5"
                strokeDasharray={`${circ(RC+14)*0.25} ${circ(RC+14)*0.75}`}
                strokeLinecap="round"
              />
            </g>
          )}

          {/* ── Ring 1 — outermost, thin dashed, slow CW ── */}
          <g style={ringStyle(speed.r1, 'CW')}>
            <circle cx={CX} cy={CY} r={R1}
              fill="none" stroke="#00a8ff" strokeWidth="1"
              strokeDasharray="4 2" opacity={baseOpq * 0.8}
            />
          </g>

          {/* ── Ring 2 — segmented + ticks every 30°, CCW ── */}
          <g style={ringStyle(speed.r2, 'CCW')}>
            <circle cx={CX} cy={CY} r={R2}
              fill="none" stroke="#00c8ff" strokeWidth="2"
              strokeDasharray={`${circ(R2) * 0.9 / 12} ${circ(R2) * 0.1 / 12}`}
              opacity={baseOpq + 0.08}
            />
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i * 30 - 90) * Math.PI / 180;
              return <circle key={i} cx={CX + R2 * Math.cos(a)} cy={CY + R2 * Math.sin(a)}
                r="2" fill="#00c8ff" opacity={baseOpq + 0.1} />;
            })}
          </g>

          {/* ── Ring 3 — partly dashed, CW, glowing ── */}
          <g style={ringStyle(speed.r3, 'CW')}>
            <circle cx={CX} cy={CY} r={R3}
              fill="none" stroke="#00d4ff" strokeWidth="3"
              strokeDasharray={`${circ(R3)*0.65/6} ${circ(R3)*0.35/6}`}
              opacity={baseOpq + 0.18}
              filter="url(#cyanGlow)"
            />
          </g>

          {/* ── Ring 4 — MAIN solid bright ring with tick marks ── */}
          <g style={ringStyle(speed.r4, 'CW')}>
            <circle cx={CX} cy={CY} r={R4}
              fill="none" stroke="#00e5ff" strokeWidth="4"
              opacity={Math.min(baseOpq + 0.5, 1)}
              style={{ filter: 'drop-shadow(0 0 12px #00d4ff) drop-shadow(0 0 24px #0088ff)' }}
            />
            <TickMarks color="#00e5ff" opacity={baseOpq} />
            {/* Cardinal triangle indicators (12/3/6/9) */}
            {[0, 90, 180, 270].map((a) => (
              <TriangleIndicator key={a} angleDeg={a} color="#00e5ff" opacity={Math.min(baseOpq + 0.3, 0.9)} />
            ))}
          </g>

          {/* ── Ring 5 — 8 bright arcs, CW ── */}
          <g style={ringStyle(speed.r5, 'CW')}>
            <circle cx={CX} cy={CY} r={R5}
              fill="none" stroke="#00f0ff" strokeWidth="3"
              strokeDasharray={`${circ(R5)*0.8/8} ${circ(R5)*0.2/8}`}
              opacity={baseOpq + 0.22}
              style={{ filter: 'drop-shadow(0 0 8px #00d4ff)' }}
            />
          </g>

          {/* ── Ring 6 — dashed CCW, small dots ── */}
          <g style={ringStyle(speed.r6, 'CCW')}>
            <circle cx={CX} cy={CY} r={R6}
              fill="none" stroke="#0088ff" strokeWidth="2"
              strokeDasharray="6 4" opacity={baseOpq * 0.6}
            />
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i * 45 - 90) * Math.PI / 180;
              return <circle key={i} cx={CX + R6 * Math.cos(a)} cy={CY + R6 * Math.sin(a)}
                r="2" fill="#0088ff" opacity={baseOpq * 0.7} />;
            })}
          </g>

          {/* ── Ring 7 — fast dashed CW ── */}
          <g style={ringStyle(speed.r7, 'CW')}>
            <circle cx={CX} cy={CY} r={R7}
              fill="none" stroke="#00d4ff" strokeWidth="1.5"
              strokeDasharray="8 6" opacity={baseOpq * 0.5}
            />
          </g>

          {/* ── Ring 8 — innermost, fast CCW ── */}
          <g style={ringStyle(speed.r8, 'CCW')}>
            <circle cx={CX} cy={CY} r={R8}
              fill="none" stroke="#0066cc" strokeWidth="1"
              strokeDasharray="4 4" opacity={baseOpq * 0.4}
            />
          </g>

          {/* ── Equalizer bars ── */}
          {Array.from({ length: N_BARS }, (_, i) => {
            const ang    = (i * (360 / N_BARS)) * Math.PI / 180;
            const h      = barHeights[i] ?? BAR_IDLE_H;
            const barOp  = state === 'idle' ? 0.3 : 0.85;
            return (
              <g key={i} transform={`translate(${CX},${CY}) rotate(${i * (360 / N_BARS)})`}>
                <rect x="-2" y={-(R_BAR + h)} width="4" height={h} rx="2"
                  fill={color} opacity={barOp} />
              </g>
            );
          })}

          {/* ── Mini-ring floating elements at 45°, 135°, 270° ── */}
          <MiniRing angleDeg={45}  color={color} />
          <MiniRing angleDeg={135} color={color} />
          <MiniRing angleDeg={270} color={color} />

          {/* ── Center circle group ── */}
          <g style={centerGroupStyle}>
            <circle cx={CX} cy={CY} r={RC}
              fill="url(#centerFill)"
              stroke={color}
              strokeWidth="2"
              opacity={1}
              style={{
                boxShadow: `0 0 30px ${color}`,
                filter: `drop-shadow(0 0 12px ${color}40)`,
              }}
            />
            {/* Inner ring decoration */}
            <circle cx={CX} cy={CY} r={RC - 10}
              fill="none" stroke={color} strokeWidth="0.5"
              opacity={baseOpq * 0.6}
              style={state === 'idle' ? { animation: 'jarvisGlowPulse 3s ease-in-out infinite' } : {}}
            />

            {/* TASKI label */}
            <text x={CX} y={CY - 5}
              textAnchor="middle" dominantBaseline="middle"
              style={{
                fontFamily:    "'Orbitron', sans-serif",
                fontSize:      '18px',
                fontWeight:    700,
                letterSpacing: '0.14em',
                fill:          color,
                textShadow:    `0 0 20px ${color}`,
                opacity:       Math.min(baseOpq + 0.5, 1),
              }}
            >
              TASKI
            </text>

            {/* State label below */}
            <text x={CX} y={CY + 16}
              textAnchor="middle" dominantBaseline="middle"
              style={{
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '9px',
                letterSpacing: '0.2em',
                fill:          stateLabel ? color : 'transparent',
                opacity:       0.7,
                textTransform: 'uppercase',
              }}
            >
              {stateLabel || 'IDLE'}
            </text>
          </g>

          {/* ── HUD corner readouts ── */}
          <HudReadouts color={color} calConnected={false} speaking={state === 'speaking'} />

          {/* ── SPEAKING pulse ring ── */}
          {state === 'speaking' && (
            <circle cx={CX} cy={CY} r={R1 + 10}
              fill="rgba(0,212,255,0.04)" stroke="#00d4ff" strokeWidth="2"
              style={{ animation: 'speakingRingScale 1.0s ease-in-out infinite', transformOrigin: `${CX}px ${CY}px` }}
            />
          )}
        </svg>
      </div>

      {/* ── Controls (pointer-events: auto overrides parent none) ── */}
      <div
        style={{
          display:       'flex',
          alignItems:    'center',
          gap:           '16px',
          marginTop:     '12px',
          pointerEvents: 'auto',
        }}
      >
        {isSupported && (
          <button
            onClick={onMicClick}
            aria-label={state === 'listening' ? 'Stop listening' : 'Start voice input'}
            aria-pressed={state === 'listening'}
            style={{
              width:          '48px',
              height:         '48px',
              borderRadius:   '50%',
              border:         state === 'listening' ? '2px solid #00d4ff' : '1px solid rgba(0,212,255,0.4)',
              background:     state === 'listening' ? 'rgba(0,212,255,0.12)' : 'rgba(0,212,255,0.04)',
              color:          state === 'listening' ? '#00d4ff' : 'rgba(0,212,255,0.6)',
              cursor:         'pointer',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              transition:     'all 200ms ease',
              boxShadow:      state === 'listening' ? '0 0 24px rgba(0,212,255,0.5)' : 'none',
              animation:      state === 'listening' ? 'glowPulse 1.5s ease-in-out infinite' : 'none',
            }}
            onMouseEnter={(e) => { if (state !== 'listening') { e.currentTarget.style.borderColor='rgba(0,212,255,0.8)'; e.currentTarget.style.color='#00d4ff'; e.currentTarget.style.boxShadow='0 0 16px rgba(0,212,255,0.35)'; e.currentTarget.style.background='rgba(0,212,255,0.08)'; } }}
            onMouseLeave={(e) => { if (state !== 'listening') { e.currentTarget.style.borderColor='rgba(0,212,255,0.4)'; e.currentTarget.style.color='rgba(0,212,255,0.6)'; e.currentTarget.style.boxShadow='none'; e.currentTarget.style.background='rgba(0,212,255,0.04)'; } }}
            onMouseDown={(e) => { e.currentTarget.style.transform='scale(0.94)'; }}
            onMouseUp={(e)   => { e.currentTarget.style.transform='scale(1)'; }}
          >
            {state === 'listening' ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
          </button>
        )}

        <button
          onClick={onMuteToggle}
          aria-label={isMuted ? 'Unmute voice' : 'Mute voice'}
          aria-pressed={isMuted}
          style={{
            width:          '36px',
            height:         '36px',
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
          onMouseEnter={(e) => { e.currentTarget.style.borderColor='rgba(0,212,255,0.6)'; e.currentTarget.style.color='#00d4ff'; e.currentTarget.style.boxShadow='0 0 10px rgba(0,212,255,0.25)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor='rgba(0,212,255,0.3)'; e.currentTarget.style.color= isMuted ? 'rgba(0,212,255,0.3)' : 'rgba(0,212,255,0.55)'; e.currentTarget.style.boxShadow='none'; }}
          onMouseDown={(e) => { e.currentTarget.style.transform='scale(0.92)'; }}
          onMouseUp={(e)   => { e.currentTarget.style.transform='scale(1)'; }}
        >
          {isMuted ? <VolumeX size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

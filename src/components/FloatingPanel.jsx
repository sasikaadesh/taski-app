// FloatingPanel — reusable glassmorphism HUD panel with cyan accents and corner brackets.

import { useState } from 'react';

export default function FloatingPanel({
  title,
  icon,
  badge,
  statusDot,
  isActive,
  headerActions,
  children,
  className = '',
  style = {},
}) {
  return (
    <div
      className={`floating-panel ${className}`}
      style={{
        background:       'rgba(2, 15, 35, 0.82)',
        backdropFilter:   'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border:           '1px solid rgba(0, 212, 255, 0.22)',
        borderRadius:     '12px',
        boxShadow:
          '0 0 0 1px rgba(0,212,255,0.08), ' +
          '0 8px 32px rgba(0,0,0,0.65), ' +
          '0 0 60px rgba(0,100,200,0.06), ' +
          'inset 0 1px 0 rgba(0,212,255,0.1)',
        position:         'relative',
        overflow:         'hidden',
        ...style,
      }}
    >
      {/* Top glow border line */}
      <div
        aria-hidden="true"
        style={{
          position:   'absolute',
          top:        0,
          left:       '5%',
          width:      '90%',
          height:     '1px',
          background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.8) 30%, rgba(0,212,255,1) 50%, rgba(0,212,255,0.8) 70%, transparent)',
          zIndex:     1,
        }}
      />

      {/* Corner brackets */}
      <CornerBracket pos="tl" />
      <CornerBracket pos="tr" />
      <CornerBracket pos="bl" />
      <CornerBracket pos="br" />

      {/* Panel header */}
      <div
        style={{
          background:   'rgba(0, 212, 255, 0.04)',
          borderBottom: '1px solid rgba(0, 212, 255, 0.1)',
          padding:      '9px 14px',
          display:      'flex',
          alignItems:   'center',
          gap:          '8px',
          position:     'relative',
          zIndex:       1,
          flexShrink:   0,
        }}
      >
        {/* Status dot */}
        {statusDot !== undefined && (
          <div
            style={{
              width:     '6px',
              height:    '6px',
              borderRadius: '50%',
              background: isActive ? '#00ff88' : 'rgba(100,100,100,0.6)',
              boxShadow:  isActive ? '0 0 6px #00ff88' : 'none',
              flexShrink: 0,
            }}
          />
        )}

        {/* Icon */}
        {icon && (
          <span style={{ fontSize: '12px', lineHeight: 1, flexShrink: 0 }}>
            {icon}
          </span>
        )}

        {/* Title */}
        <span
          style={{
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '11px',
            fontWeight:    600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color:         '#00d4ff',
            flex:          1,
          }}
        >
          {title}
        </span>

        {/* Badge count */}
        {badge !== undefined && badge > 0 && (
          <span
            style={{
              background:    'rgba(0,212,255,0.12)',
              border:        '1px solid rgba(0,212,255,0.3)',
              borderRadius:  '100px',
              padding:       '1px 7px',
              fontFamily:    "'Rajdhani', sans-serif",
              fontSize:      '10px',
              fontWeight:    600,
              color:         '#00d4ff',
              letterSpacing: '0.05em',
              flexShrink:    0,
            }}
          >
            {badge}
          </span>
        )}

        {/* Header actions slot */}
        {headerActions && (
          <div style={{ flexShrink: 0 }}>
            {headerActions}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}

// ── Corner bracket decoration ──────────────────────────────────────────────────

function CornerBracket({ pos }) {
  const isTop    = pos === 'tl' || pos === 'tr';
  const isLeft   = pos === 'tl' || pos === 'bl';
  const SIZE     = 10;

  return (
    <div
      aria-hidden="true"
      style={{
        position:    'absolute',
        width:       `${SIZE}px`,
        height:      `${SIZE}px`,
        zIndex:      2,
        pointerEvents: 'none',

        ...(isTop  ? { top: '-1px' }    : { bottom: '-1px' }),
        ...(isLeft ? { left: '-1px' }   : { right: '-1px' }),

        borderTop:    isTop    ? '1px solid #00d4ff' : 'none',
        borderBottom: !isTop   ? '1px solid #00d4ff' : 'none',
        borderLeft:   isLeft   ? '1px solid #00d4ff' : 'none',
        borderRight:  !isLeft  ? '1px solid #00d4ff' : 'none',
      }}
    />
  );
}

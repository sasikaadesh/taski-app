// CollapsibleSidePanel — HUD left-side strip that expands/collapses smoothly.

export default function CollapsibleSidePanel({
  isExpanded,
  onToggle,
  title,
  icon,
  expandedWidth = 280,
  style = {},
  children,
}) {
  return (
    <div
      style={{
        width:              isExpanded ? `${expandedWidth}px` : '52px',
        transition:         'width 0.35s cubic-bezier(0.16,1,0.3,1)',
        overflow:           'hidden',
        height:             '100%',
        background:         'rgba(2,15,35,0.72)',
        backdropFilter:     'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRight:        '1px solid rgba(0,212,255,0.15)',
        display:            'flex',
        flexDirection:      'column',
        position:           'relative',
        flexShrink:         0,
        zIndex:             10,
        ...style,
      }}
    >
      {/* ── Collapsed icon strip ── */}
      {!isExpanded && (
        <div style={{
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          paddingTop:     '20px',
          gap:            '10px',
          width:          '52px',
          height:         '100%',
          position:       'relative',
        }}>
          <span style={{ fontSize: '18px', opacity: 0.6, lineHeight: 1 }}>{icon}</span>

          <span style={{
            fontSize:      '9px',
            color:         'rgba(0,212,255,0.35)',
            fontFamily:    "'Rajdhani', sans-serif",
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            transform:     'rotate(90deg)',
            whiteSpace:    'nowrap',
            marginTop:     '12px',
          }}>
            {title}
          </span>

          <button
            onClick={onToggle}
            aria-label={`Expand ${title}`}
            style={{
              position:       'absolute',
              bottom:         '20px',
              background:     'transparent',
              border:         '1px solid rgba(0,212,255,0.25)',
              borderRadius:   '50%',
              width:          '28px',
              height:         '28px',
              cursor:         'pointer',
              color:          '#00d4ff',
              fontSize:       '16px',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              transition:     'all 150ms ease',
              padding:        0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background  = 'rgba(0,212,255,0.12)';
              e.currentTarget.style.borderColor = 'rgba(0,212,255,0.6)';
              e.currentTarget.style.boxShadow   = '0 0 10px rgba(0,212,255,0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background  = 'transparent';
              e.currentTarget.style.borderColor = 'rgba(0,212,255,0.25)';
              e.currentTarget.style.boxShadow   = 'none';
            }}
          >
            +
          </button>
        </div>
      )}

      {/* ── Expanded panel content ── */}
      {isExpanded && (
        <div style={{
          width:          `${expandedWidth}px`,
          height:         '100%',
          overflow:       'hidden',
          display:        'flex',
          flexDirection:  'column',
        }}>
          {/* Panel header */}
          <div style={{
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'space-between',
            padding:         '8px 12px',
            borderBottom:    '1px solid rgba(0,212,255,0.1)',
            background:      'rgba(0,212,255,0.03)',
            flexShrink:      0,
          }}>
            <span style={{
              fontSize:      '10px',
              color:         '#00d4ff',
              fontFamily:    "'Rajdhani', sans-serif",
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              fontWeight:    600,
            }}>
              {icon} {title}
            </span>
            <button
              onClick={onToggle}
              aria-label={`Collapse ${title}`}
              style={{
                background: 'transparent',
                border:     'none',
                color:      'rgba(0,212,255,0.45)',
                cursor:     'pointer',
                fontSize:   '16px',
                lineHeight: 1,
                padding:    '2px 6px',
                transition: 'color 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#00d4ff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(0,212,255,0.45)'; }}
            >
              ×
            </button>
          </div>

          {/* Scrollable content */}
          <div style={{
            flex:      1,
            overflow:  'hidden',
            overflowY: 'auto',
          }}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

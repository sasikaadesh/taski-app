/* AccordionSection — collapsible panel section with Tron dark theme */

import { useState, useEffect } from 'react';

export default function AccordionSection({ title, icon, badge, defaultOpen = true, storageKey, children }) {
  const [isOpen, setIsOpen] = useState(() => {
    const initialized = localStorage.getItem('taski-accordion-initialized');
    if (!initialized) return defaultOpen;
    const saved = localStorage.getItem(`taski-accordion-${storageKey}`);
    return saved ? saved === 'open' : defaultOpen;
  });
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('taski-accordion-initialized')) {
      localStorage.setItem('taski-accordion-initialized', 'true');
    }
  }, []);

  function toggle() {
    const next = !isOpen;
    setIsOpen(next);
    localStorage.setItem(`taski-accordion-${storageKey}`, next ? 'open' : 'closed');
  }

  return (
    <div style={{ marginBottom: '4px' }}>
      {/* Header button */}
      <button
        onClick={toggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width:         '100%',
          display:       'flex',
          alignItems:    'center',
          background:    hovered ? 'var(--color-bg-overlay)' : 'var(--color-bg-raised)',
          border:        `1px solid ${hovered ? 'var(--color-neon-cyan-border)' : 'var(--color-border)'}`,
          borderRadius:  isOpen ? '4px 4px 0 0' : '4px',
          padding:       '10px 14px',
          cursor:        'pointer',
          transition:    'all 200ms ease',
          textAlign:     'left',
        }}
      >
        {/* Icon */}
        <span style={{
          color:      'var(--color-neon-cyan)',
          fontSize:   '14px',
          marginRight:'8px',
          flexShrink: 0,
          lineHeight: 1,
        }}>
          {icon}
        </span>

        {/* Title */}
        <span style={{
          fontFamily:    "'Rajdhani', sans-serif",
          fontSize:      '12px',
          fontWeight:    500,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color:         'var(--color-text-secondary)',
        }}>
          {title}
        </span>

        {/* Badge */}
        {badge > 0 && (
          <span style={{
            marginLeft:   'auto',
            marginRight:  '8px',
            background:   'rgba(0,212,255,0.1)',
            border:       '1px solid rgba(0,212,255,0.3)',
            color:        'var(--color-neon-cyan)',
            borderRadius: '100px',
            fontSize:     '10px',
            padding:      '1px 6px',
            fontFamily:   "'Rajdhani', sans-serif",
          }}>
            {badge}
          </span>
        )}

        {/* Chevron */}
        <span style={{
          color:       'var(--color-neon-cyan)',
          fontSize:    '10px',
          marginLeft:  badge > 0 ? '0' : 'auto',
          transform:   isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
          transition:  'transform 200ms ease',
          lineHeight:  1,
          flexShrink:  0,
        }}>
          ▼
        </span>
      </button>

      {/* Content panel */}
      <div
        style={{
          overflow:     'hidden',
          maxHeight:    isOpen ? '3000px' : '0',
          opacity:      isOpen ? 1 : 0,
          transition:   'max-height 250ms ease-in-out, opacity 200ms ease-in-out',
          borderLeft:   '1px solid var(--color-border)',
          borderRight:  '1px solid var(--color-border)',
          borderBottom: isOpen ? '1px solid var(--color-border)' : 'none',
          borderRadius: '0 0 4px 4px',
        }}
      >
        <div style={{ padding: '12px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

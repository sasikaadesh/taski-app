// HeroPicker — Tron-styled grid of curated 21st.dev library heroes with live sandboxed mini-previews.

import { useState, useRef, useEffect, useMemo } from 'react';
import { listHeroes, getHero } from '../lib/heroLibrary/index.js';
import { buildHeroPreviewHtml, pickNeutralPalette } from '../lib/heroPreviewHarness.js';

const PREVIEW_BASE_WIDTH  = 1200; // heroes render at desktop width inside the iframe...
const PREVIEW_BASE_HEIGHT = 750;  // ...and get scaled down to card size (16:10)

export default function HeroPicker({ selectedSlug, onSelect }) {
  const heroes = listHeroes();

  if (!heroes.length) {
    return (
      <div style={{
        padding:      '18px 12px',
        textAlign:    'center',
        background:   'rgba(2,15,35,0.88)',
        border:       '1px dashed rgba(0,212,255,0.25)',
        borderRadius: '8px',
        fontFamily:   "'Rajdhani', sans-serif",
        fontSize:     '11px',
        color:        'rgba(0,212,255,0.4)',
        lineHeight:   1.6,
      }}>
        NO HEROES IN THE LIBRARY YET<br />
        <span style={{ fontSize: '10px', color: 'rgba(0,212,255,0.25)' }}>
          Add entries to src/lib/heroLibrary/catalog.json
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
      {heroes.map((hero) => (
        <HeroCard
          key={hero.slug}
          hero={hero}
          selected={hero.slug === selectedSlug}
          onSelect={() => onSelect(hero.slug)}
        />
      ))}
    </div>
  );
}

function HeroCard({ hero, selected, onSelect }) {
  const previewRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [scale,  setScale]  = useState(0);

  // Lazy-render: only mount this card's sandboxed iframe once it scrolls into view,
  // so a long catalog doesn't spawn every preview iframe at once.
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setScale(el.clientWidth / PREVIEW_BASE_WIDTH);
        setInView(true);
        observer.disconnect();
      }
    }, { rootMargin: '120px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Memoized so re-renders (hover, selection) don't change srcDoc identity and reload the iframe
  const previewHtml = useMemo(() => {
    if (!inView) return null;
    const entry = getHero(hero.slug);
    if (!entry) return null;
    return buildHeroPreviewHtml(entry.source, hero.componentName, {
      palette: pickNeutralPalette(hero.styleTags),
    });
  }, [inView, hero.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <button
      onClick={onSelect}
      style={{
        display:       'flex',
        flexDirection: 'column',
        gap:           '6px',
        padding:       '8px',
        textAlign:     'left',
        background:    selected ? 'rgba(0,212,255,0.07)' : 'rgba(2,15,35,0.88)',
        border:        `1px solid ${selected ? '#00d4ff' : 'rgba(0,212,255,0.15)'}`,
        borderRadius:  '8px',
        boxShadow:     selected ? '0 0 14px rgba(0,212,255,0.35), inset 0 0 20px rgba(0,212,255,0.05)' : 'none',
        cursor:        'pointer',
        transition:    'all 0.15s',
        width:         '100%',
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.borderColor = 'rgba(0,212,255,0.45)';
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.borderColor = 'rgba(0,212,255,0.15)';
      }}
    >
      {/* Live mini-preview — real component source rendered in a sandboxed iframe, scaled down */}
      <div
        ref={previewRef}
        style={{
          position:     'relative',
          width:        '100%',
          aspectRatio:  '16 / 10',
          overflow:     'hidden',
          borderRadius: '6px',
          background:   '#0b1220',
          border:       '1px solid rgba(0,212,255,0.1)',
        }}
      >
        {previewHtml ? (
          <iframe
            title={`${hero.name} preview`}
            sandbox="allow-scripts"
            srcDoc={previewHtml}
            scrolling="no"
            style={{
              width:           `${PREVIEW_BASE_WIDTH}px`,
              height:          `${PREVIEW_BASE_HEIGHT}px`,
              transform:       `scale(${scale})`,
              transformOrigin: 'top left',
              border:          'none',
              display:         'block',
              pointerEvents:   'none', // clicks fall through to the card
            }}
          />
        ) : (
          <div style={{
            position:       'absolute',
            inset:          0,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            fontFamily:     "'Rajdhani', sans-serif",
            fontSize:       '10px',
            letterSpacing:  '0.15em',
            color:          'rgba(0,212,255,0.25)',
          }}>
            ◌ LOADING PREVIEW
          </div>
        )}
        <span style={{
          position:      'absolute',
          top:           '4px',
          right:         '4px',
          padding:       '1px 6px',
          borderRadius:  '3px',
          background:    'rgba(2,8,20,0.75)',
          border:        '1px solid rgba(0,212,255,0.25)',
          fontFamily:    "'Rajdhani', sans-serif",
          fontSize:      '8px',
          letterSpacing: '0.12em',
          color:         'rgba(0,212,255,0.6)',
        }}>
          LIVE
        </span>
      </div>

      {/* Name + selected state */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          flex:          1,
          fontFamily:    "'Orbitron', sans-serif",
          fontSize:      '10px',
          letterSpacing: '0.1em',
          color:         selected ? '#00d4ff' : '#e0f4ff',
          textShadow:    selected ? '0 0 8px rgba(0,212,255,0.6)' : 'none',
          textTransform: 'uppercase',
        }}>
          {hero.name}
        </span>
        {selected && (
          <span style={{
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '9px',
            fontWeight:    700,
            letterSpacing: '0.1em',
            color:         '#00d4ff',
            whiteSpace:    'nowrap',
          }}>
            ✓ SELECTED
          </span>
        )}
      </div>

      {/* Style tag pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
        {(hero.styleTags || []).map((tag) => (
          <span
            key={tag}
            style={{
              padding:       '1px 6px',
              borderRadius:  '10px',
              background:    'rgba(0,212,255,0.07)',
              border:        '1px solid rgba(0,212,255,0.25)',
              fontFamily:    "'Rajdhani', sans-serif",
              fontSize:      '8px',
              letterSpacing: '0.06em',
              color:         'rgba(0,212,255,0.7)',
            }}
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Short description */}
      <div style={{
        fontFamily:      "'Rajdhani', sans-serif",
        fontSize:        '10px',
        lineHeight:      1.45,
        color:           'rgba(224,244,255,0.55)',
        display:         '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow:        'hidden',
      }}>
        {hero.description}
      </div>
    </button>
  );
}

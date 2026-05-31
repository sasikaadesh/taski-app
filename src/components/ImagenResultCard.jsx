// ImagenResultCard — displays Imagen / Gemini generated images in the chat.

import { useState } from 'react';
import { generateWithImagen, IMAGEN_MODELS } from '../lib/imagenGenerator';

function ActionBtn({ onClick, disabled, label, success, active }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background:    active || hov ? 'rgba(0,212,255,0.1)' : 'transparent',
        border:        `1px solid ${success ? 'rgba(0,255,136,0.4)' : 'rgba(0,212,255,0.22)'}`,
        borderRadius:  '3px',
        padding:       '4px 10px',
        fontFamily:    "'Rajdhani', sans-serif",
        fontSize:      '10px',
        fontWeight:    600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color:         success ? '#00ff88' : '#00d4ff',
        cursor:        disabled ? 'not-allowed' : 'pointer',
        opacity:       disabled ? 0.4 : 1,
        transition:    'all 150ms',
      }}
    >
      {label}
    </button>
  );
}

export default function ImagenResultCard({
  loading        = false,
  images         = [],
  prompt         = '',
  enhancedPrompt = '',
  model          = IMAGEN_MODELS.NANO_BANANA.id,
  aspectRatio    = '1:1',
  fallbackUsed   = false,
  onRegenerate,
}) {
  const [showEnhanced, setShowEnhanced] = useState(false);
  const [editMode,     setEditMode]     = useState(false);
  const [editPrompt,   setEditPrompt]   = useState(enhancedPrompt || prompt);
  const [copied,       setCopied]       = useState(false);
  const [saved,        setSaved]        = useState(null);
  const [regenBusy,    setRegenBusy]    = useState(false);
  const [varImages,    setVarImages]    = useState([]);
  const [varBusy,      setVarBusy]      = useState(false);

  const isImagen4  = model === IMAGEN_MODELS.IMAGEN4.id;
  // Nano Banana → green (free/success). Imagen 4 → cyan.
  const modelLabel = isImagen4 ? 'IMAGEN 4 · PAID' : 'NANO BANANA · FREE';
  const accentClr  = isImagen4 ? '#00d4ff' : '#00ff88';
  const accentBg   = isImagen4 ? 'rgba(0,212,255,0.1)'  : 'rgba(0,255,136,0.08)';
  const accentBdr  = isImagen4 ? 'rgba(0,212,255,0.3)'  : 'rgba(0,255,136,0.3)';

  const allImages  = [...images, ...varImages];

  async function handleSave(base64, idx) {
    if (!window.taskiAPI?.saveImageBase64) return;
    const res = await window.taskiAPI.saveImageBase64(base64, `taski-imagen-${Date.now()}.png`);
    if (res?.success) {
      setSaved(idx);
      setTimeout(() => setSaved(null), 2000);
    }
  }

  async function handleVariation() {
    setVarBusy(true);
    try {
      const res = await generateWithImagen(enhancedPrompt || prompt, { model, aspectRatio });
      setVarImages((prev) => [...prev, ...res.images]);
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[Imagen variation]', err.message);
    } finally {
      setVarBusy(false);
    }
  }

  async function handleEditRegen() {
    if (!onRegenerate) return;
    setRegenBusy(true);
    await onRegenerate(editPrompt, model);
    setRegenBusy(false);
    setEditMode(false);
  }

  function copyPrompt() {
    navigator.clipboard.writeText(enhancedPrompt || prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        width:        '100%',
        background:   'var(--color-bg-raised)',
        border:       '1px solid rgba(0,212,255,0.2)',
        borderRadius: '4px',
        overflow:     'hidden',
      }}>
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '10px 13px 8px',
          borderBottom:   '1px solid rgba(0,212,255,0.1)',
        }}>
          <span style={{
            fontFamily:    "'Orbitron', sans-serif",
            fontSize:      '9px', fontWeight: 700, letterSpacing: '0.15em',
            color:         '#00d4ff', opacity: 0.7,
          }}>TASKI</span>
          <span style={{
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '9px', fontWeight: 600, letterSpacing: '0.18em',
            color:         accentClr, background: accentBg,
            border:        `1px solid ${accentBdr}`,
            borderRadius:  '3px', padding: '2px 7px', textTransform: 'uppercase',
          }}>{modelLabel}</span>
        </div>
        <div style={{
          position:       'relative',
          height:         '200px',
          background:     '#0a1628',
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            '14px',
          overflow:       'hidden',
        }}>
          <div style={{
            position:          'absolute', inset: 0,
            backgroundImage:   'linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)',
            backgroundSize:    '28px 28px',
          }} />
          <div style={{
            position:   'absolute', top: 0, left: 0, right: 0, height: '2px',
            background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.7), transparent)',
            animation:  'scanLine 2s linear infinite',
          }} />
          <span style={{
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '12px', fontWeight: 600, letterSpacing: '0.18em',
            color:         'rgba(0,212,255,0.75)', textTransform: 'uppercase',
            zIndex:        1,
          }}>GENERATING WITH {modelLabel}…</span>
          <div style={{
            width: '100px', height: '2px',
            background: 'rgba(0,212,255,0.15)',
            borderRadius: '1px', overflow: 'hidden', zIndex: 1,
          }}>
            <div style={{
              height: '100%', width: '40%',
              background:   '#00d4ff',
              borderRadius: '1px',
              animation:    'glowPulse 1.2s ease-in-out infinite',
            }} />
          </div>
        </div>
      </div>
    );
  }

  // ── Result card ───────────────────────────────────────────────────────────
  return (
    <div style={{
      width:        '100%',
      background:   'var(--color-bg-raised)',
      border:       '1px solid rgba(0,212,255,0.2)',
      borderRadius: '4px',
      overflow:     'hidden',
    }}>
      {/* Header */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '10px 13px 8px',
        borderBottom:   '1px solid rgba(0,212,255,0.1)',
      }}>
        <div>
          <span style={{
            fontFamily:    "'Orbitron', sans-serif",
            fontSize:      '9px', fontWeight: 700, letterSpacing: '0.15em',
            color:         '#00d4ff', opacity: 0.7, display: 'block',
          }}>TASKI</span>
          <span style={{
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '11px', fontWeight: 600, letterSpacing: '0.1em',
            color:         'var(--color-text-primary)', textTransform: 'uppercase',
          }}>IMAGE GENERATED</span>
        </div>
        <span style={{
          fontFamily:    "'Rajdhani', sans-serif",
          fontSize:      '9px', fontWeight: 600, letterSpacing: '0.18em',
          color:         accentClr, background: accentBg,
          border:        `1px solid ${accentBdr}`,
          borderRadius:  '3px', padding: '2px 8px', textTransform: 'uppercase',
          boxShadow:     `0 0 8px ${accentClr}35`,
        }}>{modelLabel}</span>
      </div>

      {/* Fallback notice — shown when Imagen 4 was requested but fell back to Nano Banana */}
      {fallbackUsed && (
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          '8px',
          padding:      '7px 13px',
          background:   'rgba(0,212,255,0.06)',
          borderBottom: '1px solid rgba(0,212,255,0.12)',
        }}>
          <span style={{ color: '#00d4ff', fontSize: '12px' }}>ℹ</span>
          <span style={{
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '12px',
            color:         'var(--color-text-secondary)',
            letterSpacing: '0.02em',
            lineHeight:    1.4,
          }}>
            Imagen 4 requires a paid Google AI plan. Using Nano Banana (free) instead — still produces great results!
          </span>
        </div>
      )}

      {/* Images */}
      <div style={{ padding: '12px' }}>
        <div style={{
          display:             'grid',
          gridTemplateColumns: allImages.length > 1 ? '1fr 1fr' : '1fr',
          gap:                 '8px',
        }}>
          {allImages.map((img, idx) => (
            <div key={idx} style={{ position: 'relative' }}>
              <img
                src={img.dataUrl}
                alt={prompt}
                style={{
                  width:       '100%',
                  maxHeight:   allImages.length > 1 ? '180px' : '360px',
                  objectFit:   'cover',
                  borderRadius:'3px',
                  border:      '1px solid rgba(0,212,255,0.25)',
                  display:     'block',
                  boxShadow:   '0 0 16px rgba(0,212,255,0.1)',
                }}
              />
              {window.taskiAPI?.saveImageBase64 && (
                <button
                  type="button"
                  onClick={() => handleSave(img.base64, idx)}
                  style={{
                    position:      'absolute', bottom: '6px', right: '6px',
                    background:    'rgba(5,10,14,0.88)',
                    border:        '1px solid rgba(0,212,255,0.35)',
                    borderRadius:  '3px', padding: '3px 8px',
                    fontFamily:    "'Rajdhani', sans-serif",
                    fontSize:      '10px', fontWeight: 600, letterSpacing: '0.1em',
                    color:         saved === idx ? '#00ff88' : '#00d4ff',
                    cursor:        'pointer', textTransform: 'uppercase',
                  }}
                >
                  {saved === idx ? 'SAVED ✓' : '⬇ SAVE'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(0,212,255,0.08)', margin: '0 12px' }} />

      {/* Prompt section */}
      <div style={{ padding: '10px 13px 6px' }}>
        <div style={{
          fontFamily:    "'Rajdhani', sans-serif",
          fontSize:      '10px', fontWeight: 600, letterSpacing: '0.14em',
          color:         'rgba(0,212,255,0.5)', textTransform: 'uppercase', marginBottom: '4px',
        }}>PROMPT</div>
        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize:   '13px', color: 'var(--color-text-primary)', lineHeight: 1.45,
        }}>
          "{prompt}"
        </div>

        {enhancedPrompt && enhancedPrompt !== prompt && (
          <>
            <button
              type="button"
              onClick={() => setShowEnhanced((v) => !v)}
              style={{
                background:    'none', border: 'none', cursor: 'pointer',
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '11px', color: 'rgba(0,212,255,0.45)',
                padding:       '4px 0', display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              <span style={{ fontSize: '8px' }}>{showEnhanced ? '▲' : '▼'}</span>
              {showEnhanced ? 'Hide' : 'Show'} enhanced prompt
            </button>
            {showEnhanced && (
              <div style={{
                fontFamily:  "'Rajdhani', sans-serif",
                fontSize:    '12px', color: 'var(--color-text-secondary)',
                lineHeight:  1.5, marginTop: '2px',
                padding:     '7px 10px',
                background:  'rgba(0,212,255,0.04)',
                border:      '1px solid rgba(0,212,255,0.1)',
                borderRadius:'3px',
              }}>
                {enhancedPrompt}
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit textarea */}
      {editMode && (
        <div style={{ padding: '0 13px 10px' }}>
          <textarea
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            rows={3}
            style={{
              width:         '100%',
              boxSizing:     'border-box',
              background:    'var(--color-bg-muted)',
              border:        '1px solid rgba(0,212,255,0.3)',
              borderRadius:  '3px',
              padding:       '8px 10px',
              fontFamily:    "'Rajdhani', sans-serif",
              fontSize:      '13px',
              color:         'var(--color-text-primary)',
              lineHeight:    1.5,
              resize:        'vertical',
              outline:       'none',
              caretColor:    '#00d4ff',
            }}
          />
          <button
            type="button"
            onClick={handleEditRegen}
            disabled={regenBusy}
            style={{
              marginTop:     '6px',
              background:    'rgba(0,212,255,0.1)',
              border:        '1px solid rgba(0,212,255,0.4)',
              borderRadius:  '3px',
              padding:       '5px 14px',
              fontFamily:    "'Rajdhani', sans-serif",
              fontSize:      '11px', fontWeight: 600, letterSpacing: '0.1em',
              color:         '#00d4ff',
              cursor:        regenBusy ? 'not-allowed' : 'pointer',
              textTransform: 'uppercase',
              opacity:       regenBusy ? 0.5 : 1,
            }}
          >
            {regenBusy ? 'GENERATING…' : '↻ REGENERATE WITH EDIT'}
          </button>
        </div>
      )}

      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(0,212,255,0.08)', margin: '0 12px 10px' }} />

      {/* Action buttons */}
      <div style={{
        padding:  '0 13px 13px',
        display:  'flex',
        flexWrap: 'wrap',
        gap:      '6px',
      }}>
        <ActionBtn
          onClick={() => onRegenerate?.(prompt, model)}
          disabled={regenBusy}
          label="↻ REGENERATE"
        />
        <ActionBtn
          onClick={() => setEditMode((v) => !v)}
          label="✏ EDIT"
          active={editMode}
        />
        <ActionBtn
          onClick={handleVariation}
          disabled={varBusy}
          label={varBusy ? 'LOADING…' : '+ VARIATION'}
        />
        <ActionBtn
          onClick={copyPrompt}
          label={copied ? 'COPIED ✓' : '📋 COPY PROMPT'}
          success={copied}
        />
      </div>
    </div>
  );
}

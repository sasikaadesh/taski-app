// WebsitePreview — full-screen overlay that renders static HTML directly in an iframe via srcdoc.

import { useState, useRef, useEffect } from 'react';

const VIEWPORTS = [
  { id: 'desktop', label: '💻 DESKTOP', width: '100%' },
  { id: 'tablet',  label: '📱 TABLET',  width: '768px' },
  { id: 'mobile',  label: '📱 MOBILE',  width: '390px' },
];

export default function WebsitePreview({ htmlContent, prompt, onClose, onRegenerate, isLoading }) {
  const [viewport,    setViewport]    = useState('desktop');
  const [codeOpen,    setCodeOpen]    = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [downloading, setDownloading] = useState(false);
  const iframeRef = useRef(null);

  const currentVp = VIEWPORTS.find((v) => v.id === viewport);

  // Inject HTML directly via srcdoc — avoids all module/CORS issues in Electron
  useEffect(() => {
    if (iframeRef.current && htmlContent) {
      iframeRef.current.srcdoc = htmlContent;
    }
  }, [htmlContent]);

  // ── Copy HTML to clipboard ────────────────────────────────────────────────
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(htmlContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* non-fatal */ }
  }

  // ── Download as single HTML file ──────────────────────────────────────────
  async function handleDownload() {
    if (!window.taskiAPI?.downloadWebsite) {
      // Browser fallback: trigger a file download
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = (prompt?.slice(0, 40).replace(/[^a-z0-9\s]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'taski-website') + '.html';
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    setDownloading(true);
    try {
      const projectName = prompt
        ? prompt.slice(0, 40).replace(/[^a-z0-9\s]/gi, '').trim().replace(/\s+/g, '-').toLowerCase()
        : 'taski-website';
      await window.taskiAPI.downloadWebsite({ html: htmlContent, projectName, singleFile: true });
    } catch { /* non-fatal */ }
    setDownloading(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Website Preview"
      tabIndex={-1}
      onKeyDown={(e) => e.key === 'Escape' && onClose?.()}
      style={{
        position:      'fixed',
        inset:         0,
        zIndex:        2000,
        display:       'flex',
        flexDirection: 'column',
        background:    '#050a0e',
        outline:       'none',
      }}
    >
      {/* ── Toolbar ── */}
      <div style={{
        height:       '52px',
        flexShrink:   0,
        display:      'flex',
        alignItems:   'center',
        gap:          '8px',
        padding:      '0 14px',
        background:   '#080f14',
        borderBottom: '1px solid rgba(0,212,255,0.2)',
      }}>
        {/* Back */}
        <ToolbarBtn onClick={onClose} title="Close preview (Esc)">← BACK</ToolbarBtn>

        {/* Title */}
        <div style={{
          fontFamily:    "'Orbitron', sans-serif",
          fontSize:      '11px',
          fontWeight:    700,
          letterSpacing: '0.16em',
          color:         '#00d4ff',
          textShadow:    '0 0 10px rgba(0,212,255,0.5)',
          marginRight:   'auto',
          marginLeft:    '4px',
          whiteSpace:    'nowrap',
        }}>
          TASKI WEBSITE GENERATOR
        </div>

        {/* Viewport toggles */}
        <div style={{
          display:      'flex',
          gap:          '4px',
          background:   '#0a1628',
          border:       '1px solid rgba(0,212,255,0.2)',
          borderRadius: '4px',
          padding:      '2px',
        }}>
          {VIEWPORTS.map((vp) => (
            <button
              key={vp.id}
              onClick={() => setViewport(vp.id)}
              title={vp.label}
              style={{
                padding:       '3px 10px',
                borderRadius:  '3px',
                border:        'none',
                background:    viewport === vp.id ? 'rgba(0,212,255,0.2)' : 'transparent',
                color:         viewport === vp.id ? '#00d4ff' : 'rgba(0,212,255,0.4)',
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '10px',
                fontWeight:    600,
                letterSpacing: '0.1em',
                cursor:        'pointer',
                transition:    'all 150ms',
                boxShadow:     viewport === vp.id ? '0 0 8px rgba(0,212,255,0.25)' : 'none',
              }}
            >
              {vp.label}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <ToolbarBtn onClick={() => setCodeOpen((v) => !v)} title="View raw HTML">
          {codeOpen ? '▼ HIDE CODE' : '▲ VIEW CODE'}
        </ToolbarBtn>

        <ToolbarBtn onClick={handleCopy} glow={copied} title="Copy HTML to clipboard">
          {copied ? '✓ COPIED' : '📋 COPY HTML'}
        </ToolbarBtn>

        <ToolbarBtn onClick={handleDownload} disabled={downloading} title="Save as HTML file">
          {downloading ? '⏳ SAVING…' : '⬇ SAVE HTML'}
        </ToolbarBtn>

        {onRegenerate && (
          <ToolbarBtn onClick={onRegenerate} title="Regenerate">↻ REGENERATE</ToolbarBtn>
        )}
      </div>

      {/* ── Preview area ── */}
      <div style={{
        flex:           1,
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        background:     viewport === 'desktop' ? 'white' : '#0a0a0a',
        overflow:       'hidden',
        position:       'relative',
      }}>
        {/* Loading overlay */}
        {isLoading && (
          <div style={{
            position:        'absolute',
            inset:           0,
            background:      '#050a0e',
            display:         'flex',
            flexDirection:   'column',
            alignItems:      'center',
            justifyContent:  'center',
            gap:             '20px',
            zIndex:          10,
          }}>
            {/* Animated rings */}
            <div style={{ position: 'relative', width: '80px', height: '80px' }}>
              <div style={{
                position:     'absolute',
                inset:        0,
                border:       '2px solid rgba(0,212,255,0.15)',
                borderTop:    '2px solid #00d4ff',
                borderRadius: '50%',
                animation:    'loadingArcSpin 1s linear infinite',
              }} />
              <div style={{
                position:     'absolute',
                inset:        '12px',
                border:       '1px solid rgba(0,212,255,0.1)',
                borderBottom: '1px solid #00d4ff',
                borderRadius: '50%',
                animation:    'loadingArcSpin 1.5s linear infinite reverse',
              }} />
            </div>
            <div style={{
              color:         '#00d4ff',
              fontFamily:    "'Rajdhani', sans-serif",
              fontSize:      '16px',
              fontWeight:    600,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}>
              GENERATING YOUR WEBSITE...
            </div>
            <div style={{
              color:         '#4a9bbe',
              fontFamily:    "'Rajdhani', sans-serif",
              fontSize:      '12px',
              letterSpacing: '0.06em',
              textAlign:     'center',
              maxWidth:      '320px',
            }}>
              Applying UI/UX Pro Max skill · Adding GSAP animations
              {prompt && ` · Building ${prompt.split(' ').slice(0, 4).join(' ')}...`}
            </div>
          </div>
        )}

        {/* iframe */}
        {!isLoading && (
          <div style={{
            width:      currentVp.width,
            height:     codeOpen ? '55%' : '100%',
            transition: 'all 300ms ease',
            border:     viewport !== 'desktop' ? '1px solid rgba(0,212,255,0.2)' : 'none',
            borderRadius: viewport !== 'desktop' ? '8px 8px 0 0' : 0,
            overflow:   'hidden',
            marginTop:  viewport !== 'desktop' ? '16px' : 0,
            flexShrink: 0,
          }}>
            <iframe
              ref={iframeRef}
              title="Website Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-top-navigation"
              style={{
                width:      '100%',
                height:     '100%',
                border:     'none',
                display:    'block',
                background: 'white',
              }}
            />
          </div>
        )}

        {/* Code panel */}
        {codeOpen && htmlContent && (
          <div style={{
            width:      '100%',
            height:     '45%',
            background: '#080f14',
            borderTop:  '1px solid rgba(0,212,255,0.2)',
            display:    'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}>
            <div style={{
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'space-between',
              padding:         '8px 16px',
              borderBottom:    '1px solid rgba(0,212,255,0.1)',
              background:      '#0a1628',
              position:        'sticky',
              top:             0,
              zIndex:          1,
            }}>
              <span style={{
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '10px',
                fontWeight:    600,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color:         'rgba(0,212,255,0.6)',
              }}>
                index.html — Generated Code
              </span>
              <span style={{
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '10px',
                color:         'rgba(0,212,255,0.3)',
                letterSpacing: '0.08em',
              }}>
                {htmlContent.split('\n').length} lines
              </span>
            </div>
            <pre style={{
              flex:       1,
              overflow:   'auto',
              padding:    '16px',
              fontFamily: "'Courier New', Courier, monospace",
              fontSize:   '12px',
              lineHeight: 1.6,
              color:      '#e0f4ff',
              margin:     0,
              whiteSpace: 'pre-wrap',
              wordBreak:  'break-all',
            }}>
              {htmlContent}
            </pre>
          </div>
        )}
      </div>

      {/* Prompt label bar */}
      {prompt && (
        <div style={{
          flexShrink:    0,
          padding:       '5px 16px',
          borderTop:     '1px solid rgba(0,212,255,0.08)',
          background:    '#080f14',
          fontFamily:    "'Rajdhani', sans-serif",
          fontSize:      '11px',
          letterSpacing: '0.04em',
          color:         'rgba(0,212,255,0.35)',
          whiteSpace:    'nowrap',
          overflow:      'hidden',
          textOverflow:  'ellipsis',
        }}>
          ▸ {prompt}
        </div>
      )}
    </div>
  );
}

// ── Toolbar button ────────────────────────────────────────────────────────────

function ToolbarBtn({ children, onClick, title, glow, disabled }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding:       '4px 10px',
        background:    hovered ? 'rgba(0,212,255,0.1)' : 'transparent',
        border:        `1px solid ${glow ? '#00d4ff' : 'rgba(0,212,255,0.25)'}`,
        borderRadius:  '3px',
        color:         glow ? '#00d4ff' : 'rgba(0,212,255,0.65)',
        fontFamily:    "'Rajdhani', sans-serif",
        fontSize:      '10px',
        fontWeight:    600,
        letterSpacing: '0.1em',
        cursor:        disabled ? 'not-allowed' : 'pointer',
        whiteSpace:    'nowrap',
        transition:    'all 150ms',
        opacity:       disabled ? 0.5 : 1,
        boxShadow:     glow ? '0 0 8px rgba(0,212,255,0.4)' : 'none',
      }}
    >
      {children}
    </button>
  );
}

// WebsiteGeneratorPanel — in-chat UI for the /website slash command.
// Shows template buttons, description input, live AI analysis card, and generate button.

import { useState, useEffect } from 'react';
import { generateWebsite, WEBSITE_TEMPLATES, saveWebsiteToHistory } from '../lib/websiteGenerator';
import { analyzePrompt } from '../lib/promptAnalyzer';

export default function WebsiteGeneratorPanel({ prefillPrompt = '', onGenerate }) {
  const [description,    setDescription]    = useState(prefillPrompt);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');
  const [phase,          setPhase]          = useState('idle'); // 'idle' | 'generating' | 'done'
  const [analysis,       setAnalysis]       = useState(null);

  // Override states
  const [overrideTheme,  setOverrideTheme]  = useState(false);
  const [themeChoice,    setThemeChoice]    = useState('dark');
  const [overrideColor,  setOverrideColor]  = useState(false);
  const [colorHex,       setColorHex]       = useState('#6366f1');

  // Debounced analysis — updates 500ms after user stops typing
  useEffect(() => {
    if (!description.trim()) { setAnalysis(null); return; }
    const t = setTimeout(() => {
      setAnalysis(analyzePrompt(description));
    }, 500);
    return () => clearTimeout(t);
  }, [description]);

  const loadingPhases = [
    'Applying UI/UX Pro Max skill…',
    'Designing layout and hierarchy…',
    'Adding GSAP animations…',
    `Optimizing for ${overrideTheme ? themeChoice : (analysis?.theme ?? 'dark')} theme…`,
    'Writing complete HTML file…',
  ];
  const [phaseIdx, setPhaseIdx] = useState(0);

  async function handleGenerate() {
    const prompt = description.trim();
    if (!prompt) return;

    setLoading(true);
    setError('');
    setPhase('generating');
    setPhaseIdx(0);

    const interval = setInterval(() => {
      setPhaseIdx((i) => (i + 1) % loadingPhases.length);
    }, 2500);

    try {
      // Build override options
      const options = {};
      if (overrideTheme) options.theme = themeChoice;
      if (overrideColor) {
        const hex = colorHex;
        options.colors = { accent1: hex, accent2: hex, gradient: `linear-gradient(135deg, ${hex}, ${hex}dd)` };
      }

      const result = await generateWebsite(prompt, options);
      clearInterval(interval);

      saveWebsiteToHistory({
        id:          result.id,
        prompt,
        theme:       result.analysis?.theme,
        generatedAt: result.timestamp,
        htmlLength:  result.html.length,
        downloaded:  false,
      });

      setPhase('done');
      onGenerate?.(result.html, prompt);
    } catch (err) {
      clearInterval(interval);
      setError(err.message || 'Generation failed. Please try again.');
      setPhase('idle');
    } finally {
      setLoading(false);
    }
  }

  // ── Done state ──────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={titleStyle}>✓ WEBSITE READY</span>
        </div>
        <p style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0, letterSpacing: '0.02em' }}>
          Your website is ready. Preview it live, switch between Desktop, Tablet and Mobile views, or download the single HTML file — open it in any browser, no setup needed.
        </p>
      </div>
    );
  }

  // ── Generating state ────────────────────────────────────────────────────────
  if (phase === 'generating') {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={titleStyle}>UI/UX PRO MAX</span>
          <span style={subtitleStyle}>WEBSITE GENERATOR</span>
        </div>
        <div style={{ position: 'relative', height: '2px', background: 'rgba(0,212,255,0.1)', borderRadius: '2px', overflow: 'hidden', margin: '4px 0 16px' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: '40%', background: 'linear-gradient(90deg, transparent, #00d4ff, transparent)', animation: 'scanLine 1.5s ease-in-out infinite' }} />
        </div>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em', color: '#00d4ff', marginBottom: '6px', textTransform: 'uppercase' }}>
          GENERATING YOUR WEBSITE…
        </div>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '12px', color: 'rgba(0,212,255,0.55)', letterSpacing: '0.04em', marginBottom: '12px', minHeight: '18px', transition: 'all 400ms' }}>
          {loadingPhases[phaseIdx]}
        </div>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', color: 'rgba(0,212,255,0.3)', letterSpacing: '0.08em' }}>
          This usually takes 15–30 seconds
        </div>
      </div>
    );
  }

  // ── Idle / input state ──────────────────────────────────────────────────────
  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={titleStyle}>UI/UX PRO MAX</span>
        <span style={subtitleStyle}>WEBSITE GENERATOR · GSAP · 21st.dev · Advanced CSS3</span>
      </div>

      <div style={{ height: '1px', background: 'rgba(0,212,255,0.1)', margin: '10px 0' }} />

      {/* Quick templates */}
      <div style={{ marginBottom: '12px' }}>
        <div style={sectionLabel}>QUICK TEMPLATES</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
          {WEBSITE_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.name}
              onClick={() => setDescription(tmpl.prompt)}
              title={tmpl.prompt}
              style={{
                padding: '4px 10px',
                background: description === tmpl.prompt ? 'rgba(0,212,255,0.15)' : 'rgba(0,212,255,0.05)',
                border: `1px solid ${description === tmpl.prompt ? 'rgba(0,212,255,0.5)' : 'rgba(0,212,255,0.2)'}`,
                borderRadius: '100px',
                color: description === tmpl.prompt ? '#00d4ff' : 'var(--color-text-secondary)',
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.06em',
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
              onMouseEnter={(e) => {
                if (description !== tmpl.prompt) {
                  e.currentTarget.style.background  = 'rgba(0,212,255,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(0,212,255,0.35)';
                  e.currentTarget.style.color       = '#00d4ff';
                }
              }}
              onMouseLeave={(e) => {
                if (description !== tmpl.prompt) {
                  e.currentTarget.style.background  = 'rgba(0,212,255,0.05)';
                  e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)';
                  e.currentTarget.style.color       = 'var(--color-text-secondary)';
                }
              }}
            >
              {tmpl.emoji} {tmpl.name}
            </button>
          ))}
        </div>
      </div>

      {/* Description textarea */}
      <div style={{ marginBottom: '10px' }}>
        <div style={sectionLabel}>OR DESCRIBE YOUR WEBSITE</div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={'Describe the website you want…\n\nExample: A dark blue fintech dashboard with charts and KPI cards'}
          rows={4}
          style={{
            width: '100%', marginTop: '6px',
            background: 'var(--color-bg-raised)',
            border: '1px solid rgba(0,212,255,0.2)',
            borderRadius: '4px',
            padding: '10px 12px',
            color: 'var(--color-text-primary)',
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '13px', letterSpacing: '0.02em', lineHeight: 1.55,
            resize: 'vertical', outline: 'none', caretColor: '#00d4ff',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => { e.target.style.borderColor = 'rgba(0,212,255,0.45)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,212,255,0.06)'; }}
          onBlur={(e)  => { e.target.style.borderColor = 'rgba(0,212,255,0.2)';  e.target.style.boxShadow = 'none'; }}
        />
      </div>

      {/* AI Analysis Card */}
      {analysis && (
        <div style={{
          marginBottom: '10px',
          padding: '10px 12px',
          background: 'rgba(0,212,255,0.04)',
          border: '1px solid rgba(0,212,255,0.18)',
          borderRadius: '4px',
        }}>
          <div style={{ ...sectionLabel, marginBottom: '6px', color: '#00d4ff' }}>AI ANALYSIS</div>
          <div style={{ height: '1px', background: 'rgba(0,212,255,0.12)', marginBottom: '8px' }} />
          {[
            { label: 'Layout',   value: analysis.layoutType.charAt(0).toUpperCase() + analysis.layoutType.slice(1) },
            { label: 'Theme',    value: analysis.theme.charAt(0).toUpperCase() + analysis.theme.slice(1) },
            { label: 'Style',    value: analysis.visualStyle.charAt(0).toUpperCase() + analysis.visualStyle.slice(1) },
            { label: 'Industry', value: analysis.industry.charAt(0).toUpperCase() + analysis.industry.slice(1) },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
              <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', color: 'var(--color-text-secondary)', letterSpacing: '0.06em', width: '56px', flexShrink: 0 }}>{label}:</span>
              <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '0.04em' }}>{value}</span>
            </div>
          ))}
          {/* Color row with dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', color: 'var(--color-text-secondary)', letterSpacing: '0.06em', width: '56px', flexShrink: 0 }}>Colors:</span>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: analysis.colors.accent1, flexShrink: 0, boxShadow: `0 0 6px ${analysis.colors.accent1}88` }} />
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '0.04em' }}>{analysis.colors.accent1}</span>
          </div>
          {/* Detected features */}
          {(analysis.features.wantsCharts || analysis.features.wantsParticles || analysis.features.wantsForm || analysis.brandName) && (
            <div style={{ marginTop: '5px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {analysis.features.wantsCharts    && <FeatureTag label="Charts" />}
              {analysis.features.wantsParticles && <FeatureTag label="Particles" />}
              {analysis.features.wantsForm      && <FeatureTag label="Form" />}
              {analysis.features.wantsPricing   && <FeatureTag label="Pricing" />}
              {analysis.brandName               && <FeatureTag label={`"${analysis.brandName}"`} />}
            </div>
          )}
        </div>
      )}

      {/* Override controls */}
      <div style={{ marginBottom: '12px' }}>
        <div style={sectionLabel}>OVERRIDES (optional)</div>
        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* Theme override */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={overrideTheme}
              onChange={(e) => setOverrideTheme(e.target.checked)}
              style={{ accentColor: '#00d4ff', width: '13px', height: '13px', cursor: 'pointer' }}
            />
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '12px', color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>Override theme:</span>
            {overrideTheme && (
              <div style={{ display: 'flex', gap: '4px' }}>
                {['dark', 'light'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setThemeChoice(t)}
                    style={{
                      padding: '2px 10px',
                      background: themeChoice === t ? 'rgba(0,212,255,0.15)' : 'transparent',
                      border: `1px solid ${themeChoice === t ? 'rgba(0,212,255,0.5)' : 'rgba(0,212,255,0.15)'}`,
                      borderRadius: '4px',
                      color: themeChoice === t ? '#00d4ff' : 'var(--color-text-secondary)',
                      fontFamily: "'Rajdhani', sans-serif",
                      fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em',
                      cursor: 'pointer',
                    }}
                  >
                    {t === 'dark' ? '🌙 Dark' : '☀️ Light'}
                  </button>
                ))}
              </div>
            )}
          </label>
          {/* Color override */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={overrideColor}
              onChange={(e) => setOverrideColor(e.target.checked)}
              style={{ accentColor: '#00d4ff', width: '13px', height: '13px', cursor: 'pointer' }}
            />
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '12px', color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>Override colors:</span>
            {overrideColor && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="color"
                  value={colorHex}
                  onChange={(e) => setColorHex(e.target.value)}
                  style={{ width: '28px', height: '22px', padding: '0', border: '1px solid rgba(0,212,255,0.3)', borderRadius: '3px', cursor: 'pointer', background: 'none' }}
                />
                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>{colorHex}</span>
              </div>
            )}
          </label>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          marginBottom: '10px', padding: '8px 12px',
          background: 'rgba(255,45,85,0.08)', border: '1px solid rgba(255,45,85,0.3)',
          borderRadius: '4px', fontFamily: "'Rajdhani', sans-serif",
          fontSize: '12px', color: 'var(--color-danger)', letterSpacing: '0.02em',
        }}>
          {error}
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={!description.trim() || loading}
        style={{
          width: '100%', padding: '10px',
          background: description.trim() ? 'rgba(0,212,255,0.1)' : 'rgba(0,212,255,0.03)',
          border: `1px solid ${description.trim() ? 'rgba(0,212,255,0.55)' : 'rgba(0,212,255,0.15)'}`,
          borderRadius: '4px',
          color: description.trim() ? '#00d4ff' : 'rgba(0,212,255,0.3)',
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '12px', fontWeight: 700, letterSpacing: '0.14em',
          cursor: description.trim() ? 'pointer' : 'not-allowed',
          transition: 'all 200ms',
          boxShadow: description.trim() ? '0 0 16px rgba(0,212,255,0.2)' : 'none',
        }}
        onMouseEnter={(e) => {
          if (description.trim()) {
            e.currentTarget.style.boxShadow = '0 0 24px rgba(0,212,255,0.35)';
            e.currentTarget.style.background = 'rgba(0,212,255,0.16)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = description.trim() ? '0 0 16px rgba(0,212,255,0.2)' : 'none';
          e.currentTarget.style.background = description.trim() ? 'rgba(0,212,255,0.1)' : 'rgba(0,212,255,0.03)';
        }}
      >
        ✨ GENERATE WEBSITE
      </button>
    </div>
  );
}

// ── Feature tag chip ──────────────────────────────────────────────────────────

function FeatureTag({ label }) {
  return (
    <span style={{
      fontFamily: "'Rajdhani', sans-serif",
      fontSize: '10px', fontWeight: 600,
      letterSpacing: '0.06em',
      padding: '1px 7px',
      background: 'rgba(0,212,255,0.08)',
      border: '1px solid rgba(0,212,255,0.2)',
      borderRadius: '100px',
      color: '#00d4ff',
    }}>
      {label}
    </span>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const panelStyle = {
  background: 'var(--color-bg-raised)',
  border: '1px solid rgba(0,212,255,0.2)',
  borderRadius: '6px',
  padding: '14px 16px',
  width: '100%',
  boxSizing: 'border-box',
  boxShadow: '0 0 24px rgba(0,212,255,0.06)',
};

const headerStyle = {
  display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '2px',
};

const titleStyle = {
  fontFamily: "'Orbitron', sans-serif",
  fontSize: '13px', fontWeight: 700, letterSpacing: '0.14em',
  color: '#00d4ff', textShadow: '0 0 12px rgba(0,212,255,0.6)',
};

const subtitleStyle = {
  fontFamily: "'Rajdhani', sans-serif",
  fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em',
  color: 'rgba(0,212,255,0.45)', textTransform: 'uppercase',
};

const sectionLabel = {
  fontFamily: "'Rajdhani', sans-serif",
  fontSize: '9px', fontWeight: 600, letterSpacing: '0.2em',
  textTransform: 'uppercase', color: 'rgba(0,212,255,0.45)',
};

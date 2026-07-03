// WebsiteGeneratorPanel — full-screen iterative website builder with live iframe preview.

import { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import html2canvas from 'html2canvas';
import { generateWebsite } from '../lib/websiteGenerator';
import { getSkill } from '../lib/skillLoader';
import { isTTSEnabled, setTTSEnabled } from '../lib/ttsManager';

function validateWebsiteCompleteness(html) {
  const checks = {
    hasNav:        /<nav[\s>]/i.test(html),
    hasHero:       /class="[^"]*hero[^"]*"/i.test(html),
    hasFooter:     /<footer[\s>]/i.test(html),
    hasClosingHtml: /<\/html>\s*$/i.test(html.trim()),
    hasImages:     /<img[\s>]/i.test(html),
    sectionCount:  (html.match(/<section/gi) || []).length,
  };

  const isComplete =
    checks.hasNav &&
    checks.hasFooter &&
    checks.hasClosingHtml &&
    checks.sectionCount >= 4;

  return { isComplete, checks };
}

const VIEWPORTS = {
  desktop: { width: '100%',   label: '🖥',  height: '100%' },
  tablet:  { width: '768px',  label: '⬜', height: '1024px' },
  mobile:  { width: '390px',  label: '📱', height: '844px'  },
};

const GENERATE_STEPS = [
  'Analyzing your brief...',
  'Planning design tokens...',
  'Choosing typography...',
  'Crafting color palette...',
  'Designing hero section...',
  'Writing compelling copy...',
  'Adding Unsplash images...',
  'Building all sections...',
  'Adding scroll animations...',
  'Finalizing code...',
];

const COLOR_THEMES = [
  {
    id: 'auto',
    label: 'Auto (Claude chooses)',
    colors: null,
    preview: null,
  },
  {
    id: 'midnight',
    label: 'Midnight Blue',
    colors: { primary: '#00d4ff', accent: '#6366f1', bg: '#050a15', surface: '#0a1628', text: '#e0f4ff' },
    preview: ['#00d4ff', '#6366f1', '#050a15'],
  },
  {
    id: 'obsidian',
    label: 'Obsidian Dark',
    colors: { primary: '#ff6b6b', accent: '#ffd93d', bg: '#0a0a0a', surface: '#1a1a1a', text: '#ffffff' },
    preview: ['#ff6b6b', '#ffd93d', '#0a0a0a'],
  },
  {
    id: 'forest',
    label: 'Forest Luxury',
    colors: { primary: '#2d9a6b', accent: '#c9a96e', bg: '#0a1a0f', surface: '#0f2318', text: '#e8f5ee' },
    preview: ['#2d9a6b', '#c9a96e', '#0a1a0f'],
  },
  {
    id: 'crimson',
    label: 'Crimson Power',
    colors: { primary: '#e63946', accent: '#f1a208', bg: '#0d0608', surface: '#1a0a0e', text: '#fff0f2' },
    preview: ['#e63946', '#f1a208', '#0d0608'],
  },
  {
    id: 'aurora',
    label: 'Aurora Light',
    colors: { primary: '#7c3aed', accent: '#db2777', bg: '#f8f9ff', surface: '#ffffff', text: '#1a1a2e' },
    preview: ['#7c3aed', '#db2777', '#f8f9ff'],
  },
  {
    id: 'solar',
    label: 'Solar Warm',
    colors: { primary: '#f59e0b', accent: '#ef4444', bg: '#0a0500', surface: '#1a0d00', text: '#fef3c7' },
    preview: ['#f59e0b', '#ef4444', '#0a0500'],
  },
  {
    id: 'ocean',
    label: 'Ocean Deep',
    colors: { primary: '#0ea5e9', accent: '#6366f1', bg: '#030d1a', surface: '#071a2e', text: '#e0f2fe' },
    preview: ['#0ea5e9', '#6366f1', '#030d1a'],
  },
];

// Detects prompts that only tweak styling — these can be applied without restructuring the page
function isCSSOnlyChange(text) {
  if (!text?.trim()) return false;
  const lower = text.toLowerCase();

  const cssKeywords = [
    'color', 'font', 'size', 'spacing', 'padding', 'margin', 'border', 'radius',
    'shadow', 'opacity', 'weight', 'dark', 'light', 'background', 'bg',
  ];
  const structuralKeywords = [
    'section', 'add', 'remove', 'create', 'new', 'delete', 'html', 'page', 'form',
  ];

  if (structuralKeywords.some(w => lower.includes(w))) return false;
  return cssKeywords.some(w => lower.includes(w));
}

// Injects base tag + click interceptor so links/forms do nothing in the preview
function prepareHtmlForPreview(html) {
  if (!html) return '';

  const baseTag = '<base href="about:blank" target="_blank">';

  // Intercept all clicks on <a> and form submits
  const interceptScript = `<script>
  (function() {
    document.addEventListener('click', function(e) {
      var a = e.target.closest('a');
      if (a) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    document.addEventListener('submit', function(e) {
      e.preventDefault(); e.stopPropagation();
    }, true);
  })();
<\/script>`;

  let safe = html;

  // Inject base tag right after <head>
  const headIdx = safe.toLowerCase().indexOf('<head>');
  if (headIdx >= 0) {
    safe = safe.substring(0, headIdx + 6) + '\n' + baseTag + '\n' + safe.substring(headIdx + 6);
  }

  // Inject interceptor before </body>
  const bodyCloseIdx = safe.toLowerCase().lastIndexOf('</body>');
  if (bodyCloseIdx >= 0) {
    safe = safe.substring(0, bodyCloseIdx) + '\n' + interceptScript + '\n' + safe.substring(bodyCloseIdx);
  } else {
    safe += '\n' + interceptScript;
  }

  return safe;
}

export default function WebsiteGeneratorPanel({ onClose, initialPrompt = '', prefillPrompt = '' }) {
  const startPrompt = initialPrompt || prefillPrompt || '';

  const [prompt,          setPrompt]          = useState(startPrompt);
  const [isGenerating,    setIsGenerating]    = useState(false);
  const [generatedHtml,   setGeneratedHtml]   = useState(null);
  const [error,           setError]           = useState(null);
  const [versions,        setVersions]        = useState([]);
  const [currentVersion,  setCurrentVersion]  = useState(-1);
  const [isIterating,     setIsIterating]     = useState(false);
  const [viewport,        setViewport]        = useState('desktop');
  const [copied,          setCopied]          = useState(false);
  const [showOptions,     setShowOptions]     = useState(false);
  const [options,         setOptions]         = useState({ style: '', industry: '', colors: '' });
  const [generatingStep,  setGeneratingStep]  = useState(0);
  const [iframeKey,       setIframeKey]       = useState(0);
  const [currentSiteId,   setCurrentSiteId]   = useState(null);
  const [activeTab,       setActiveTab]       = useState('generate');
  const [savedSites,      setSavedSites]      = useState([]);
  const [archiveLoading,  setArchiveLoading]  = useState(false);
  const [renamingId,      setRenamingId]      = useState(null);
  const [renameValue,     setRenameValue]     = useState('');
  const [isMuted,         setIsMuted]         = useState(() => !isTTSEnabled());
  const [heroType,        setHeroType]        = useState('normal');
  const [selectedTheme,   setSelectedTheme]   = useState('auto');
  const [customColor,     setCustomColor]     = useState('#6366f1');
  const [includeContact,  setIncludeContact]  = useState(false);
  const [contactDetails,  setContactDetails]  = useState({ email: '', phone: '', address: '', showForm: true });
  const [saveStatus,      setSaveStatus]      = useState('idle'); // 'idle' | 'saving' | 'saved'
  const [elapsedSeconds,  setElapsedSeconds]  = useState(0);
  const [isFullscreen,    setIsFullscreen]    = useState(false);
  const [showExportMenu,  setShowExportMenu]  = useState(false);
  const [isExporting,     setIsExporting]     = useState(false);

  const autoGenRef = useRef(false);
  const timerRef    = useRef(null);
  const iframeRef   = useRef(null);

  // Stay in sync with the shared TTS state — any panel (chat, this one) can toggle it
  useEffect(() => {
    function onTTSChange(e) { setIsMuted(!e.detail.enabled); }
    window.addEventListener('taski-tts-changed', onTTSChange);
    return () => window.removeEventListener('taski-tts-changed', onTTSChange);
  }, []);

  // Watchdog: keep re-canceling any speech that manages to start while muted
  useEffect(() => {
    if (!isMuted) return;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    const watchdog = setInterval(() => {
      if (window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
    }, 500);
    return () => clearInterval(watchdog);
  }, [isMuted]);

  // Cleanup elapsed-time timer on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const themeConfig = selectedTheme === 'custom'
    ? { id: 'custom', customColor }
    : (COLOR_THEMES.find(t => t.id === selectedTheme) || COLOR_THEMES[0]);

  // Pause audio on mount, restore on unmount
  useEffect(() => {
    console.log('[WebGen] Pausing audio...');
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    window.dispatchEvent(new CustomEvent('taski-audio-pause', { detail: { reason: 'website-generator' } }));
    return () => {
      console.log('[WebGen] Resuming audio...');
      window.dispatchEvent(new CustomEvent('taski-audio-resume', { detail: { reason: 'website-generator' } }));
    };
  }, []);

  // Load archive on mount so the badge/list is ready before the user opens the tab
  useEffect(() => {
    loadArchive();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load archive when tab switches to archive
  useEffect(() => {
    if (activeTab === 'archive') loadArchive();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape key exits fullscreen preview
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  // Auto-generate when opened with a pre-filled prompt
  useEffect(() => {
    if (startPrompt && !autoGenRef.current) {
      autoGenRef.current = true;
      runGenerate(startPrompt, false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadArchive() {
    if (!window.taskiAPI?.websitesList) return;
    setArchiveLoading(true);
    const result = await window.taskiAPI.websitesList();
    if (result.success) setSavedSites(result.sites);
    setArchiveLoading(false);
  }

  async function handleLoadSite(id) {
    if (!window.taskiAPI?.websitesLoad) return;
    const result = await window.taskiAPI.websitesLoad(id);
    if (result.success) {
      setGeneratedHtml(result.html);
      setCurrentSiteId(id);
      setPrompt(result.entry.prompt || '');
      setIframeKey(prev => prev + 1);
      setActiveTab('generate');
    }
  }

  async function handleDeleteSite(id, e) {
    e.stopPropagation();
    if (!window.taskiAPI?.websitesDelete) return;
    if (!confirm('Delete this website? This cannot be undone.')) return;
    await window.taskiAPI.websitesDelete(id);
    setSavedSites(prev => prev.filter(s => s.id !== id));
  }

  async function handleRename(id) {
    if (!window.taskiAPI?.websitesRename) return;
    if (!renameValue.trim()) { setRenamingId(null); return; }
    await window.taskiAPI.websitesRename({ id, name: renameValue.trim() });
    setSavedSites(prev => prev.map(s => s.id === id ? { ...s, name: renameValue.trim() } : s));
    setRenamingId(null);
  }

  // Force iframe remount on new HTML
  useEffect(() => {
    if (generatedHtml) setIframeKey(k => k + 1);
  }, [generatedHtml]);

  // Cycle through progress steps while generating
  useEffect(() => {
    if (!isGenerating && !isIterating) {
      setGeneratingStep(0);
      return;
    }
    let i = 0;
    const interval = setInterval(() => {
      i = Math.min(i + 1, GENERATE_STEPS.length - 1);
      setGeneratingStep(i);
    }, 2500);
    return () => clearInterval(interval);
  }, [isGenerating, isIterating]);

  function startElapsedTimer() {
    setElapsedSeconds(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedSeconds(prev => prev + 1), 1000);
  }

  function stopElapsedTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  async function runGenerate(p, isIterate = false) {
    if (!p.trim()) return;
    const setter = isIterate ? setIsIterating : setIsGenerating;
    setter(true);
    setError(null);
    setGeneratingStep(0);
    startElapsedTimer();

    let lastError = null;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) console.log('[WebGen] Retry attempt', attempt);

        const html = await generateWebsite(
          p,
          { ...options, heroType, theme: themeConfig, contact: includeContact ? contactDetails : null },
          isIterate ? generatedHtml : null
        );

        const { isComplete, checks } = validateWebsiteCompleteness(html);
        console.log('[WebGen] Completeness check:', checks);

        const newVersion = { html, prompt: p, timestamp: new Date().toISOString() };
        setVersions(prev => [newVersion, ...prev].slice(0, 5));
        setCurrentVersion(0);
        setGeneratedHtml(html);

        // Auto-save to archive
        if (window.taskiAPI?.websitesSave) {
          try {
            if (isIterate && currentSiteId && window.taskiAPI?.websitesUpdate) {
              await window.taskiAPI.websitesUpdate({ id: currentSiteId, html, prompt: p });
            } else {
              const saveResult = await window.taskiAPI.websitesSave({ html, prompt: p, heroType, name: null });
              if (saveResult.success) {
                setCurrentSiteId(saveResult.id);
                console.log('[WebGen] Auto-saved as', saveResult.id);
              }
            }
          } catch (saveErr) {
            console.warn('[WebGen] Auto-save failed:', saveErr.message);
          }
        }

        if (!isComplete) {
          const missing = [
            !checks.hasNav        && 'navigation',
            !checks.hasFooter     && 'footer',
            !checks.hasClosingHtml && 'proper closing',
            checks.sectionCount < 4 && 'enough sections (' + checks.sectionCount + ' found)',
          ].filter(Boolean).join(', ');
          setError(
            'Generation was incomplete (missing: ' + missing +
            '). Click Regenerate to try again — this sometimes happens with complex briefs.'
          );
        } else {
          setError(null);
        }

        stopElapsedTimer();
        setter(false);
        return;

      } catch (err) {
        lastError = err;
        console.error('[WebGen] Attempt', attempt, 'failed:', err.message);
        if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1200));
      }
    }

    setError(lastError?.message || 'Generation failed. Please try again.');
    stopElapsedTimer();
    setter(false);
  }

  function handleGenerate(overridePrompt) {
    const p = (overridePrompt ?? prompt).trim();
    if (!p || isWorking) return;
    runGenerate(p, false);
  }

  function handleUpdate() {
    if (!prompt.trim() || !generatedHtml || isWorking) return;
    runGenerate(prompt, true);
  }

  function handleNewWebsite() {
    setGeneratedHtml(null);
    setCurrentSiteId(null);
    setVersions([]);
    setCurrentVersion(-1);
    setError(null);
  }

  function handleVersionSelect(index) {
    setCurrentVersion(index);
    setGeneratedHtml(versions[index].html);
  }

  function splitHtmlFiles(html) {
    const styleMatches = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
    const cssContent = styleMatches
      .map(s => s.replace(/<\/?style[^>]*>/gi, ''))
      .join('\n\n');

    const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
    const jsContent = scriptMatches
      .filter(s => !s.includes('src='))
      .map(s => s.replace(/<\/?script[^>]*>/gi, ''))
      .join('\n\n');

    let indexHtml = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace('</head>', '  <link rel="stylesheet" href="style.css">\n</head>')
      .replace('</body>', '  <script src="script.js"><\/script>\n</body>');

    return { html: indexHtml, css: cssContent, js: jsContent };
  }

  function getSiteFileName() {
    return (prompt.trim()
      .split(' ')
      .slice(0, 4)
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '') || 'website') + '-' + new Date().toISOString().split('T')[0];
  }

  async function handleExportZip() {
    if (!generatedHtml) return;
    setIsExporting(true);
    try {
      const { html, css, js } = splitHtmlFiles(generatedHtml);
      const siteName = getSiteFileName();

      const zip = new JSZip();
      zip.file('index.html', html);
      zip.file('style.css', css);
      zip.file('script.js', js);
      zip.file('README.txt',
        `Website generated by Taski AI\n` +
        `Generated: ${new Date().toLocaleString()}\n` +
        `Prompt: ${prompt.trim()}\n\n` +
        `Files:\n` +
        `- index.html: Main HTML file\n` +
        `- style.css: All styles\n` +
        `- script.js: All JavaScript\n\n` +
        `To view: Open index.html in any browser.\n` +
        `Make sure style.css and script.js are\n` +
        `in the same folder as index.html.`
      );

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = siteName + '.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Export ZIP]', err);
      alert('ZIP export failed: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleExportPng() {
    if (!generatedHtml || !iframeRef.current) return;
    setIsExporting(true);
    try {
      const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
      if (!iframeDoc?.body) throw new Error('Preview not fully loaded yet');

      const canvas = await html2canvas(iframeDoc.body, {
        allowTaint:  true,
        useCORS:     true,
        scale:       1.5,
        width:       iframeDoc.body.scrollWidth,
        height:      iframeDoc.body.scrollHeight,
        windowWidth: iframeDoc.body.scrollWidth,
        windowHeight: iframeDoc.body.scrollHeight,
        backgroundColor: '#ffffff',
        logging:     false,
        foreignObjectRendering: false,
      });

      const siteName = getSiteFileName();
      await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('Failed to encode PNG')); return; }
          const url = URL.createObjectURL(blob);
          const a   = document.createElement('a');
          a.href     = url;
          a.download = siteName + '.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          resolve();
        }, 'image/png');
      });
    } catch (err) {
      console.error('[Export PNG]', err);
      alert('PNG export failed: ' + err.message + '\n\nTip: open the site in a browser and use Print → Save as PDF instead.');
    } finally {
      setIsExporting(false);
    }
  }

  async function handleCopyHtml() {
    if (!generatedHtml) return;
    await navigator.clipboard.writeText(generatedHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSaveToArchive() {
    if (!generatedHtml || !window.taskiAPI?.websitesSave) return;

    setSaveStatus('saving');

    try {
      if (currentSiteId && window.taskiAPI?.websitesUpdate) {
        const result = await window.taskiAPI.websitesUpdate({
          id:     currentSiteId,
          html:   generatedHtml,
          prompt: prompt.trim(),
        });
        if (result.success) setSaveStatus('saved');
      } else {
        const result = await window.taskiAPI.websitesSave({
          html:     generatedHtml,
          prompt:   prompt.trim(),
          heroType: heroType,
          name:     null,
        });
        if (result.success) {
          setCurrentSiteId(result.id);
          setSaveStatus('saved');
        }
      }

      setTimeout(() => setSaveStatus('idle'), 3000);

      if (activeTab === 'archive') loadArchive();

    } catch (err) {
      console.error('[Save]', err);
      setSaveStatus('idle');
    }
  }

  async function handleOpenInBrowser() {
    if (!generatedHtml) return;
    if (window.taskiAPI?.saveAndOpenHtml) {
      await window.taskiAPI.saveAndOpenHtml(generatedHtml, 'taski-website.html');
      return;
    }
    // Fallback: blob URL in new tab
    const blob = new Blob([generatedHtml], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  const textareaStyle = {
    width:        '100%',
    background:   'rgba(0,212,255,0.05)',
    border:       '1px solid rgba(0,212,255,0.2)',
    borderRadius: '8px',
    padding:      '10px',
    color:        '#e0f4ff',
    fontFamily:   "'Rajdhani', sans-serif",
    fontSize:     '12px',
    resize:       'vertical',
    outline:      'none',
    lineHeight:   1.5,
    boxSizing:    'border-box',
  };

  const btnBase = {
    padding:        '10px',
    borderRadius:   '8px',
    fontFamily:     "'Rajdhani', sans-serif",
    fontSize:       '12px',
    fontWeight:     600,
    letterSpacing:  '0.12em',
    textTransform:  'uppercase',
    width:          '100%',
    transition:     'all 0.2s',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            '6px',
    cursor:         'pointer',
  };

  const isWorking = isGenerating || isIterating;

  const vp = VIEWPORTS[viewport];

  return (
    <div style={{
      position:   'fixed',
      inset:      0,
      background: '#030814',
      zIndex:     2000,
      display:    'flex',
      flexDirection: 'column',
      overflow:   'hidden',
    }}>
      <style>{`
        @keyframes webgen-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes webgen-pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.4; }
        }
      `}</style>

      {/* ── TOP BAR ── */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        padding:      '10px 16px',
        borderBottom: '1px solid rgba(0,212,255,0.15)',
        gap:          '8px',
        flexShrink:   0,
        background:   'rgba(2,8,20,0.95)',
      }}>
        <span style={{
          fontSize:      '11px',
          fontFamily:    "'Orbitron', sans-serif",
          color:         '#00d4ff',
          letterSpacing: '0.12em',
          textShadow:    '0 0 10px rgba(0,212,255,0.5)',
          whiteSpace:    'nowrap',
        }}>
          ✦ WEBSITE GENERATOR
        </span>

        {/* Viewport toggles */}
        <div style={{ display: 'flex', gap: '3px', marginLeft: '8px' }}>
          {Object.entries(VIEWPORTS).map(([key, val]) => (
            <button
              key={key}
              onClick={() => setViewport(key)}
              title={key}
              style={{
                background:     viewport === key ? 'rgba(0,212,255,0.15)' : 'transparent',
                border:         `1px solid ${viewport === key ? 'rgba(0,212,255,0.5)' : 'rgba(0,212,255,0.2)'}`,
                borderRadius:   '4px',
                color:          viewport === key ? '#00d4ff' : 'rgba(0,212,255,0.4)',
                width:          '26px',
                height:         '26px',
                cursor:         'pointer',
                fontSize:       '13px',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
              }}
            >
              {val.label}
            </button>
          ))}
        </div>

        {/* Sound toggle */}
        <button
          onClick={() => {
            const newEnabled = !isTTSEnabled();
            setTTSEnabled(newEnabled);
            setIsMuted(!newEnabled);

            if (!newEnabled) {
              window.speechSynthesis?.cancel();
              window.dispatchEvent(new CustomEvent('taski-audio-pause', { detail: { reason: 'manual-mute' } }));
            } else {
              window.dispatchEvent(new CustomEvent('taski-audio-resume', { detail: { reason: 'manual-unmute' } }));
            }
          }}
          title={isMuted ? 'Sound is OFF — click to enable' : 'Sound is ON — click to mute'}
          style={{
            background:     isMuted ? 'rgba(255,68,68,0.08)' : 'rgba(0,212,255,0.06)',
            border:         `1px solid ${isMuted ? 'rgba(255,68,68,0.3)' : 'rgba(0,212,255,0.2)'}`,
            borderRadius:   '6px',
            width:          '34px',
            height:         '34px',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            cursor:         'pointer',
            fontSize:       '16px',
            color:          isMuted ? 'rgba(255,68,68,0.6)' : 'rgba(0,212,255,0.5)',
            transition:     'all 0.2s',
            flexShrink:     0,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = isMuted ? 'rgba(255,68,68,0.6)' : 'rgba(0,212,255,0.5)';
            e.currentTarget.style.background  = isMuted ? 'rgba(255,68,68,0.15)' : 'rgba(0,212,255,0.12)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = isMuted ? 'rgba(255,68,68,0.3)' : 'rgba(0,212,255,0.2)';
            e.currentTarget.style.background  = isMuted ? 'rgba(255,68,68,0.08)' : 'rgba(0,212,255,0.06)';
          }}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>

        <div style={{ flex: 1 }} />

        {/* Action buttons — only when HTML ready */}
        {generatedHtml && !isWorking && (
          <>
            <button
              onClick={handleCopyHtml}
              style={{
                background:    copied ? 'rgba(0,255,136,0.1)' : 'transparent',
                border:        `1px solid ${copied ? 'rgba(0,255,136,0.4)' : 'rgba(0,212,255,0.25)'}`,
                borderRadius:  '6px',
                color:         copied ? '#00ff88' : 'rgba(0,212,255,0.6)',
                padding:       '4px 10px',
                cursor:        'pointer',
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '10px',
                letterSpacing: '0.08em',
                transition:    'all 0.15s',
                whiteSpace:    'nowrap',
              }}
            >
              {copied ? '✓ COPIED' : '⎘ COPY HTML'}
            </button>

            <button
              onClick={handleSaveToArchive}
              disabled={saveStatus === 'saving'}
              style={{
                background:    saveStatus === 'saved' ? 'rgba(0,255,136,0.1)' : 'rgba(0,212,255,0.06)',
                border:        `1px solid ${saveStatus === 'saved' ? 'rgba(0,255,136,0.4)' : 'rgba(0,212,255,0.25)'}`,
                borderRadius:  '6px',
                color:         saveStatus === 'saved' ? '#00ff88' : 'rgba(0,212,255,0.7)',
                padding:       '5px 10px',
                cursor:        saveStatus === 'saving' ? 'not-allowed' : 'pointer',
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '10px',
                letterSpacing: '0.08em',
                display:       'flex',
                alignItems:    'center',
                gap:           '4px',
                transition:    'all 0.2s',
                whiteSpace:    'nowrap',
              }}
            >
              {saveStatus === 'saving' ? '⟳ SAVING...' : saveStatus === 'saved' ? '✓ SAVED' : '💾 SAVE'}
            </button>

            <button
              onClick={handleOpenInBrowser}
              style={{
                background:    'transparent',
                border:        '1px solid rgba(0,212,255,0.25)',
                borderRadius:  '6px',
                color:         'rgba(0,212,255,0.6)',
                padding:       '4px 10px',
                cursor:        'pointer',
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '10px',
                letterSpacing: '0.08em',
                transition:    'all 0.15s',
                whiteSpace:    'nowrap',
              }}
            >
              ↗ OPEN
            </button>

            <button
              onClick={() => setIsFullscreen((p) => !p)}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen preview'}
              style={{
                background:     isFullscreen ? 'rgba(0,212,255,0.12)' : 'transparent',
                border:         `1px solid ${isFullscreen ? 'rgba(0,212,255,0.5)' : 'rgba(0,212,255,0.25)'}`,
                borderRadius:   '6px',
                width:          '30px',
                height:         '30px',
                cursor:         'pointer',
                color:          isFullscreen ? '#00d4ff' : 'rgba(0,212,255,0.5)',
                fontSize:       '13px',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                flexShrink:     0,
                transition:     'all 0.15s',
              }}
            >
              {isFullscreen ? '⊡' : '⛶'}
            </button>

            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowExportMenu((p) => !p)}
                style={{
                  background:    'rgba(0,212,255,0.08)',
                  border:        '1px solid rgba(0,212,255,0.3)',
                  borderRadius:  '6px',
                  color:         '#00d4ff',
                  padding:       '5px 10px',
                  cursor:        'pointer',
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '10px',
                  letterSpacing: '0.08em',
                  transition:    'all 0.15s',
                  whiteSpace:    'nowrap',
                  display:       'flex',
                  alignItems:    'center',
                  gap:           '4px',
                }}
              >
                ⬇ EXPORT <span style={{ fontSize: '8px' }}>▾</span>
              </button>

              {showExportMenu && (
                <div
                  onMouseLeave={() => setShowExportMenu(false)}
                  style={{
                    position:      'absolute',
                    top:           '100%',
                    right:         0,
                    marginTop:     '4px',
                    background:    'rgba(2,10,25,0.98)',
                    border:        '1px solid rgba(0,212,255,0.2)',
                    borderRadius:  '8px',
                    overflow:      'hidden',
                    zIndex:        100,
                    minWidth:      '170px',
                    boxShadow:     '0 8px 24px rgba(0,0,0,0.5)',
                  }}
                >
                  <button
                    onClick={() => { setShowExportMenu(false); handleExportZip(); }}
                    style={{
                      width: '100%', padding: '8px 12px', background: 'transparent', border: 'none',
                      color: '#e0f4ff', fontFamily: "'Rajdhani', sans-serif", fontSize: '11px',
                      cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    📦 Export as ZIP
                    <span style={{ fontSize: '9px', color: 'rgba(0,212,255,0.3)', marginLeft: 'auto' }}>html+css+js</span>
                  </button>
                  <button
                    onClick={() => { setShowExportMenu(false); handleExportPng(); }}
                    style={{
                      width: '100%', padding: '8px 12px', background: 'transparent',
                      border: 'none', borderTop: '1px solid rgba(0,212,255,0.08)',
                      color: '#e0f4ff', fontFamily: "'Rajdhani', sans-serif", fontSize: '11px',
                      cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    🖼 Export as PNG
                    <span style={{ fontSize: '9px', color: 'rgba(0,212,255,0.3)', marginLeft: 'auto' }}>full page</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            background:     'transparent',
            border:         '1px solid rgba(255,68,68,0.3)',
            borderRadius:   '6px',
            color:          'rgba(255,68,68,0.6)',
            width:          '26px',
            height:         '26px',
            cursor:         'pointer',
            fontSize:       '18px',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            transition:     'all 0.15s',
            flexShrink:     0,
            lineHeight:     1,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,68,68,0.12)';
            e.currentTarget.style.color      = '#ff4444';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color      = 'rgba(255,68,68,0.6)';
          }}
        >
          ×
        </button>
      </div>

      {currentSiteId && (
        <div style={{
          padding:       '2px 16px',
          fontSize:      '9px',
          fontFamily:    "'Rajdhani', sans-serif",
          color:         'rgba(0,255,136,0.4)',
          letterSpacing: '0.08em',
          borderBottom:  '1px solid rgba(0,212,255,0.06)',
          background:    'rgba(0,255,136,0.02)',
          flexShrink:    0,
        }}>
          ● AUTO-SAVED TO ARCHIVE
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* ── LEFT PANEL — controls ── */}
        <div style={{
          width:         '300px',
          flexShrink:    0,
          display:       'flex',
          flexDirection: 'column',
          borderRight:   '1px solid rgba(0,212,255,0.1)',
          overflow:      'hidden',
          background:    'rgba(2,8,20,0.6)',
        }}>

          {/* Tab switcher */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,212,255,0.1)', flexShrink: 0 }}>
            {[
              { id: 'generate', label: '✦ GENERATE' },
              { id: 'archive',  label: '📁 ARCHIVE'  },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex:          1,
                  padding:       '10px 6px',
                  background:    activeTab === tab.id ? 'rgba(0,212,255,0.08)' : 'transparent',
                  border:        'none',
                  borderBottom:  activeTab === tab.id ? '2px solid #00d4ff' : '2px solid transparent',
                  color:         activeTab === tab.id ? '#00d4ff' : 'rgba(0,212,255,0.35)',
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '10px',
                  fontWeight:    600,
                  letterSpacing: '0.1em',
                  cursor:        'pointer',
                  transition:    'all 0.15s',
                }}
              >
                {tab.label}
                {tab.id === 'archive' && savedSites.length > 0 && (
                  <span style={{
                    marginLeft:   '5px',
                    background:   'rgba(0,212,255,0.15)',
                    border:       '1px solid rgba(0,212,255,0.3)',
                    borderRadius: '10px',
                    padding:      '0 5px',
                    fontSize:     '9px',
                    color:        '#00d4ff',
                  }}>
                    {savedSites.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── ARCHIVE TAB ── */}
          {activeTab === 'archive' && (
            <div style={{
              flex:           1,
              overflowY:      'auto',
              display:        'flex',
              flexDirection:  'column',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(0,212,255,0.2) transparent',
            }}>
              {/* Top bar */}
              <div style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'space-between',
                padding:        '8px 12px',
                borderBottom:   '1px solid rgba(0,212,255,0.08)',
                flexShrink:     0,
              }}>
                <span style={{ fontSize: '10px', color: 'rgba(0,212,255,0.4)', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.1em' }}>
                  SAVED WEBSITES
                </span>
                <button
                  onClick={() => window.taskiAPI?.websitesOpenFolder?.()}
                  title="Open websites folder"
                  style={{
                    background:    'transparent',
                    border:        '1px solid rgba(0,212,255,0.2)',
                    borderRadius:  '4px',
                    color:         'rgba(0,212,255,0.5)',
                    padding:       '3px 8px',
                    cursor:        'pointer',
                    fontFamily:    "'Rajdhani', sans-serif",
                    fontSize:      '9px',
                    letterSpacing: '0.08em',
                  }}
                >
                  📂 OPEN FOLDER
                </button>
              </div>

              {/* Loading state */}
              {archiveLoading && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'rgba(0,212,255,0.3)', fontFamily: "'Rajdhani', sans-serif", fontSize: '11px' }}>
                  Loading archive...
                </div>
              )}

              {/* Empty state */}
              {!archiveLoading && savedSites.length === 0 && (
                <div style={{ padding: '32px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <div style={{ fontSize: '28px' }}>📁</div>
                  <div style={{ fontSize: '12px', color: 'rgba(0,212,255,0.3)', fontFamily: "'Rajdhani', sans-serif", lineHeight: 1.5 }}>
                    No saved websites yet<br/>
                    Generate a website to save it here
                  </div>
                </div>
              )}

              {/* Site list */}
              {!archiveLoading && savedSites.map((site) => (
                <div
                  key={site.id}
                  onClick={() => handleLoadSite(site.id)}
                  style={{
                    padding:       '10px 12px',
                    borderBottom:  '1px solid rgba(0,212,255,0.06)',
                    cursor:        'pointer',
                    transition:    'background 0.15s',
                    display:       'flex',
                    flexDirection: 'column',
                    gap:           '4px',
                    position:      'relative',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {/* Name row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {site.id === currentSiteId && (
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 4px #00ff88', flexShrink: 0 }} />
                    )}

                    {renamingId === site.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter')  handleRename(site.id);
                          if (e.key === 'Escape') setRenamingId(null);
                          e.stopPropagation();
                        }}
                        onBlur={() => handleRename(site.id)}
                        onClick={e => e.stopPropagation()}
                        style={{
                          flex:         1,
                          background:   'rgba(0,212,255,0.08)',
                          border:       '1px solid rgba(0,212,255,0.4)',
                          borderRadius: '4px',
                          padding:      '2px 6px',
                          color:        '#e0f4ff',
                          fontFamily:   "'Rajdhani', sans-serif",
                          fontSize:     '12px',
                          outline:      'none',
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          flex:         1,
                          fontSize:     '12px',
                          fontFamily:   "'Rajdhani', sans-serif",
                          fontWeight:   500,
                          color:        '#e0f4ff',
                          overflow:     'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace:   'nowrap',
                        }}
                        onDoubleClick={e => {
                          e.stopPropagation();
                          setRenamingId(site.id);
                          setRenameValue(site.name);
                        }}
                        title="Double-click to rename"
                      >
                        {site.name}
                      </span>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const result = await window.taskiAPI?.websitesLoad(site.id);
                          if (result?.success && window.taskiAPI?.saveAndOpenHtml) {
                            window.taskiAPI.saveAndOpenHtml(result.html, site.name.replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.html');
                          }
                        }}
                        title="Open in browser"
                        style={{ background: 'transparent', border: 'none', color: 'rgba(0,212,255,0.4)', cursor: 'pointer', fontSize: '13px', padding: '2px 3px', lineHeight: 1 }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#00d4ff'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(0,212,255,0.4)'; }}
                      >
                        ↗
                      </button>
                      <button
                        onClick={(e) => handleDeleteSite(site.id, e)}
                        title="Delete website"
                        style={{ background: 'transparent', border: 'none', color: 'rgba(255,68,68,0.3)', cursor: 'pointer', fontSize: '14px', padding: '2px 3px', lineHeight: 1 }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#ff4444'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,68,68,0.3)'; }}
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {/* Date + size row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', fontFamily: "'Rajdhani', sans-serif", color: 'rgba(0,212,255,0.3)' }}>
                    <span>{new Date(site.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span>·</span>
                    <span>{(site.size / 1024).toFixed(1)}KB</span>
                    {site.id === currentSiteId && (
                      <><span>·</span><span style={{ color: '#00ff88' }}>current</span></>
                    )}
                  </div>

                  {/* Prompt preview */}
                  {/* Hero type badge */}
                  {site.heroType && site.heroType !== 'normal' && (
                    <span style={{
                      fontSize:      '9px',
                      fontFamily:    "'Rajdhani', sans-serif",
                      background:    site.heroType === '3d' ? 'rgba(99,102,241,0.15)' : 'rgba(0,212,255,0.1)',
                      border:        `1px solid ${site.heroType === '3d' ? 'rgba(99,102,241,0.4)' : 'rgba(0,212,255,0.3)'}`,
                      borderRadius:  '4px',
                      padding:       '1px 5px',
                      color:         site.heroType === '3d' ? '#818cf8' : '#00d4ff',
                      letterSpacing: '0.06em',
                      alignSelf:     'flex-start',
                    }}>
                      {site.heroType === 'carousel' ? '🎠 CAROUSEL' : '✦ 3D'}
                    </span>
                  )}

                  {site.prompt && (
                    <div style={{ fontSize: '10px', fontFamily: "'Rajdhani', sans-serif", color: 'rgba(0,212,255,0.2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {site.prompt.substring(0, 50)}{site.prompt.length > 50 ? '...' : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── GENERATE TAB ── */}
          {activeTab === 'generate' && (
          <div style={{
            flex:           1,
            overflowY:      'auto',
            padding:        '14px',
            display:        'flex',
            flexDirection:  'column',
            gap:            '10px',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(0,212,255,0.2) transparent',
          }}>

            {/* Prompt input */}
            <div>
              <label style={{
                fontSize:      '9px',
                color:         'rgba(0,212,255,0.4)',
                fontFamily:    "'Rajdhani', sans-serif",
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                display:       'block',
                marginBottom:  '5px',
              }}>
                {generatedHtml ? 'ORIGINAL PROMPT' : 'DESCRIBE YOUR WEBSITE'}
              </label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={'Describe the website you want to build...\n\nExample: A luxury coffee brand landing page with dark roast aesthetics, steam animation, and elegant typography'}
                rows={5}
                style={textareaStyle}
                onFocus={e  => { e.target.style.borderColor = 'rgba(0,212,255,0.5)'; }}
                onBlur={e   => { e.target.style.borderColor = 'rgba(0,212,255,0.2)'; }}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (generatedHtml ? handleUpdate() : handleGenerate()); }}
              />
              <div style={{
                fontSize:   '9px',
                color:      'rgba(0,212,255,0.2)',
                fontFamily: "'Rajdhani', sans-serif",
                marginTop:  '3px',
              }}>
                {generatedHtml
                  ? 'Edit prompt above and click UPDATE to iterate — or clear prompt for a new site'
                  : 'Cmd+Enter to generate'}
              </div>
            </div>

            {/* Quick-start pills — only before first generation */}
            {!generatedHtml && (() => {
              const skill = getSkill('/website');
              const subs  = skill?.subcategories || [];
              if (!subs.length) return null;
              return (
                <div>
                  <label style={{
                    fontSize:      '9px',
                    color:         'rgba(0,212,255,0.25)',
                    fontFamily:    "'Rajdhani', sans-serif",
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    display:       'block',
                    marginBottom:  '5px',
                  }}>
                    QUICK START
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {subs.map(sc => (
                      <button
                        key={sc.value}
                        onClick={() => setPrompt(sc.starter)}
                        style={{
                          background:    'rgba(0,212,255,0.04)',
                          border:        '1px solid rgba(0,212,255,0.15)',
                          borderRadius:  '20px',
                          padding:       '3px 9px',
                          fontSize:      '10px',
                          fontFamily:    "'Rajdhani', sans-serif",
                          color:         'rgba(0,212,255,0.5)',
                          cursor:        'pointer',
                          transition:    'all 0.15s',
                          letterSpacing: '0.02em',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background  = 'rgba(0,212,255,0.12)';
                          e.currentTarget.style.color       = '#00d4ff';
                          e.currentTarget.style.borderColor = 'rgba(0,212,255,0.4)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background  = 'rgba(0,212,255,0.04)';
                          e.currentTarget.style.color       = 'rgba(0,212,255,0.5)';
                          e.currentTarget.style.borderColor = 'rgba(0,212,255,0.15)';
                        }}
                      >
                        {sc.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Hero type selector — dropdown */}
            <div>
              <label style={{
                fontSize:      '9px',
                color:         'rgba(0,212,255,0.4)',
                fontFamily:    "'Rajdhani', sans-serif",
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                display:       'block',
                marginBottom:  '5px',
              }}>
                HERO STYLE
              </label>
              <select
                value={heroType}
                onChange={e => setHeroType(e.target.value)}
                style={{
                  width:            '100%',
                  background:       'rgba(0,212,255,0.06)',
                  border:           '1px solid rgba(0,212,255,0.25)',
                  borderRadius:     '6px',
                  padding:          '7px 10px',
                  color:            '#e0f4ff',
                  fontFamily:       "'Rajdhani', sans-serif",
                  fontSize:         '12px',
                  outline:          'none',
                  cursor:           'pointer',
                  colorScheme:      'dark',
                  appearance:       'none',
                  backgroundImage:  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2300d4ff' opacity='0.5'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                  paddingRight:     '28px',
                }}
                onFocus={e => {
                  e.target.style.borderColor = 'rgba(0,212,255,0.6)';
                  e.target.style.boxShadow   = '0 0 0 2px rgba(0,212,255,0.08)';
                }}
                onBlur={e => {
                  e.target.style.borderColor = 'rgba(0,212,255,0.25)';
                  e.target.style.boxShadow   = 'none';
                }}
              >
                <option value="normal">🖼 Static Hero — Unsplash background</option>
                <option value="carousel">🎠 Carousel Hero — Sliding images</option>
                <option value="3d">✦ 3D Motion Hero — Particle animation</option>
              </select>
            </div>

            {/* Color theme picker */}
            <div>
              <label style={{
                fontSize:      '9px',
                color:         'rgba(0,212,255,0.4)',
                fontFamily:    "'Rajdhani', sans-serif",
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                display:       'block',
                marginBottom:  '5px',
              }}>
                COLOR THEME
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px', marginBottom: '6px' }}>
                {COLOR_THEMES.map(theme => (
                  <button
                    key={theme.id}
                    onClick={() => setSelectedTheme(theme.id)}
                    title={theme.label}
                    style={{
                      background:    'transparent',
                      border:        `2px solid ${selectedTheme === theme.id ? '#00d4ff' : 'rgba(0,212,255,0.1)'}`,
                      borderRadius:  '6px',
                      padding:       '4px',
                      cursor:        'pointer',
                      display:       'flex',
                      flexDirection: 'column',
                      gap:           '2px',
                      transition:    'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '2px', height: '20px' }}>
                      {theme.preview ? (
                        theme.preview.map((color, i) => (
                          <div key={i} style={{ flex: 1, background: color, borderRadius: '3px' }} />
                        ))
                      ) : (
                        <div style={{
                          flex:            1,
                          background:      'linear-gradient(135deg,#6366f1,#8b5cf6,#ec4899)',
                          borderRadius:    '3px',
                          fontSize:        '9px',
                          display:         'flex',
                          alignItems:      'center',
                          justifyContent:  'center',
                          color:           'white',
                        }}>
                          AUTO
                        </div>
                      )}
                    </div>
                    <div style={{
                      fontSize:      '8px',
                      fontFamily:    "'Rajdhani', sans-serif",
                      color:         selectedTheme === theme.id ? '#00d4ff' : 'rgba(0,212,255,0.35)',
                      textAlign:     'center',
                      letterSpacing: '0.04em',
                      overflow:      'hidden',
                      textOverflow:  'ellipsis',
                      whiteSpace:    'nowrap',
                      width:         '100%',
                    }}>
                      {theme.label.split(' ')[0]}
                    </div>
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="color"
                  value={customColor}
                  onChange={e => { setCustomColor(e.target.value); setSelectedTheme('custom'); }}
                  style={{
                    width:        '28px',
                    height:       '28px',
                    border:       '1px solid rgba(0,212,255,0.25)',
                    borderRadius: '4px',
                    cursor:       'pointer',
                    padding:      '2px',
                    background:   'transparent',
                  }}
                />
                <span style={{ fontSize: '10px', fontFamily: "'Rajdhani', sans-serif", color: 'rgba(0,212,255,0.4)' }}>
                  Custom accent color
                </span>
                {selectedTheme === 'custom' && (
                  <span style={{ fontSize: '10px', color: '#00d4ff', fontFamily: "'Rajdhani', sans-serif" }}>✓</span>
                )}
              </div>
            </div>

            {/* Contact section toggle */}
            <div style={{ border: '1px solid rgba(0,212,255,0.12)', borderRadius: '8px', overflow: 'hidden' }}>
              <button
                onClick={() => {
                  setIncludeContact(p => !p);
                }}
                style={{
                  width:          '100%',
                  background:     includeContact ? 'rgba(0,212,255,0.06)' : 'transparent',
                  border:         'none',
                  padding:        '8px 10px',
                  display:        'flex',
                  alignItems:     'center',
                  gap:            '8px',
                  cursor:         'pointer',
                  color:          includeContact ? '#00d4ff' : 'rgba(0,212,255,0.5)',
                  fontFamily:     "'Rajdhani', sans-serif",
                  fontSize:       '10px',
                  fontWeight:     600,
                  letterSpacing:  '0.1em',
                  textTransform:  'uppercase',
                  transition:     'all 0.15s',
                }}
              >
                <div style={{
                  width:           '16px',
                  height:          '16px',
                  borderRadius:    '3px',
                  border:          `1.5px solid ${includeContact ? '#00d4ff' : 'rgba(0,212,255,0.3)'}`,
                  background:      includeContact ? '#00d4ff' : 'transparent',
                  display:         'flex',
                  alignItems:      'center',
                  justifyContent:  'center',
                  flexShrink:      0,
                  transition:      'all 0.15s',
                  fontSize:        '10px',
                  color:           '#000',
                }}>
                  {includeContact ? '✓' : ''}
                </div>
                📬 INCLUDE CONTACT SECTION
              </button>

              {includeContact && (
                <div style={{
                  padding:       '8px 10px',
                  borderTop:     '1px solid rgba(0,212,255,0.1)',
                  display:       'flex',
                  flexDirection: 'column',
                  gap:           '6px',
                }}>
                  <label style={{
                    display:    'flex',
                    alignItems: 'center',
                    gap:        '6px',
                    cursor:     'pointer',
                    fontSize:   '11px',
                    fontFamily: "'Rajdhani', sans-serif",
                    color:      'rgba(0,212,255,0.6)',
                  }}>
                    <input
                      type="checkbox"
                      checked={contactDetails.showForm}
                      onChange={e => setContactDetails(prev => ({ ...prev, showForm: e.target.checked }))}
                      style={{ accentColor: '#00d4ff' }}
                    />
                    Include contact form
                  </label>

                  {[
                    { key: 'email',   label: 'Email',   placeholder: 'hello@company.com' },
                    { key: 'phone',   label: 'Phone',   placeholder: '+1 (555) 000-0000' },
                    { key: 'address', label: 'Address', placeholder: '123 Main St, City' },
                  ].map(field => (
                    <input
                      key={field.key}
                      type="text"
                      placeholder={field.placeholder}
                      value={contactDetails[field.key]}
                      onChange={e => setContactDetails(prev => ({ ...prev, [field.key]: e.target.value }))}
                      style={{
                        background:   'rgba(0,212,255,0.05)',
                        border:       '1px solid rgba(0,212,255,0.15)',
                        borderRadius: '4px',
                        padding:      '5px 8px',
                        color:        '#e0f4ff',
                        fontFamily:   "'Rajdhani', sans-serif",
                        fontSize:     '11px',
                        outline:      'none',
                        width:        '100%',
                        boxSizing:    'border-box',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Style options toggle */}
            <button
              onClick={() => setShowOptions(p => !p)}
              style={{
                background:    'transparent',
                border:        '1px solid rgba(0,212,255,0.12)',
                borderRadius:  '6px',
                color:         'rgba(0,212,255,0.35)',
                padding:       '4px 10px',
                cursor:        'pointer',
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '10px',
                letterSpacing: '0.08em',
                textAlign:     'left',
                display:       'flex',
                alignItems:    'center',
                gap:           '6px',
              }}
            >
              <span>{showOptions ? '▼' : '›'}</span>
              STYLE OPTIONS
            </button>

            {showOptions && (
              <div style={{
                display:       'flex',
                flexDirection: 'column',
                gap:           '8px',
                padding:       '10px',
                background:    'rgba(0,212,255,0.02)',
                border:        '1px solid rgba(0,212,255,0.08)',
                borderRadius:  '6px',
              }}>
                {[
                  { key: 'style',    label: 'STYLE',    placeholder: 'Bold, Minimal, Elegant...' },
                  { key: 'industry', label: 'INDUSTRY', placeholder: 'Tech, Fashion, Food...' },
                  { key: 'colors',   label: 'COLORS',   placeholder: '#FF6B35 orange accent...' },
                ].map(field => (
                  <div key={field.key}>
                    <label style={{
                      fontSize:      '9px',
                      color:         'rgba(0,212,255,0.3)',
                      fontFamily:    "'Rajdhani', sans-serif",
                      letterSpacing: '0.12em',
                      display:       'block',
                      marginBottom:  '3px',
                    }}>
                      {field.label}
                    </label>
                    <input
                      type="text"
                      value={options[field.key]}
                      onChange={e => setOptions(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      style={{
                        width:        '100%',
                        background:   'rgba(0,212,255,0.04)',
                        border:       '1px solid rgba(0,212,255,0.12)',
                        borderRadius: '4px',
                        padding:      '5px 8px',
                        color:        '#e0f4ff',
                        fontFamily:   "'Rajdhani', sans-serif",
                        fontSize:     '11px',
                        outline:      'none',
                        boxSizing:    'border-box',
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Style-only change hint — shown when iterating with a CSS-focused prompt */}
            {generatedHtml && isCSSOnlyChange(prompt) && (
              <div style={{
                fontSize:   '10px',
                color:      'rgba(0,255,136,0.5)',
                fontFamily: "'Rajdhani', sans-serif",
                padding:    '3px 0',
              }}>
                ⚡ Style-only change detected — faster update
              </div>
            )}

            {/* Generate / Update button — behavior changes once a site exists */}
            <button
              onClick={generatedHtml ? handleUpdate : () => handleGenerate()}
              disabled={isWorking || !prompt.trim()}
              style={{
                ...btnBase,
                background: isWorking ? 'rgba(0,212,255,0.04)' : prompt.trim() ? 'rgba(0,212,255,0.1)' : 'rgba(0,212,255,0.02)',
                border:     `1px solid ${isWorking ? 'rgba(0,212,255,0.2)' : prompt.trim() ? 'rgba(0,212,255,0.45)' : 'rgba(0,212,255,0.08)'}`,
                color:      isWorking ? 'rgba(0,212,255,0.35)' : prompt.trim() ? '#00d4ff' : 'rgba(0,212,255,0.15)',
                cursor:     isWorking || !prompt.trim() ? 'not-allowed' : 'pointer',
                boxShadow:  prompt.trim() && !isWorking ? '0 0 14px rgba(0,212,255,0.12)' : 'none',
              }}
            >
              {isWorking ? (
                <>
                  <span style={{ animation: 'webgen-spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                  {generatedHtml ? 'UPDATING...' : 'GENERATING...'}
                </>
              ) : generatedHtml ? '↺ UPDATE WEBSITE' : '✦ GENERATE WEBSITE'}
            </button>

            {/* New website — resets state for a fresh generation */}
            {generatedHtml && (
              <button
                onClick={handleNewWebsite}
                style={{
                  background:    'transparent',
                  border:        '1px solid rgba(0,212,255,0.15)',
                  borderRadius:  '6px',
                  color:         'rgba(0,212,255,0.4)',
                  padding:       '5px',
                  cursor:        'pointer',
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '10px',
                  letterSpacing: '0.08em',
                  width:         '100%',
                  transition:    'all 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color       = '#00d4ff';
                  e.currentTarget.style.borderColor = 'rgba(0,212,255,0.4)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color       = 'rgba(0,212,255,0.4)';
                  e.currentTarget.style.borderColor = 'rgba(0,212,255,0.15)';
                }}
              >
                + NEW WEBSITE
              </button>
            )}

            {generatedHtml && (
              <>
                {/* Version history */}
                {versions.length > 1 && (
                  <div>
                    <label style={{
                      fontSize:      '9px',
                      color:         'rgba(0,212,255,0.25)',
                      fontFamily:    "'Rajdhani', sans-serif",
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      display:       'block',
                      marginBottom:  '5px',
                    }}>
                      VERSION HISTORY
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {versions.map((v, i) => (
                        <button
                          key={i}
                          onClick={() => handleVersionSelect(i)}
                          style={{
                            background:   currentVersion === i ? 'rgba(0,212,255,0.08)' : 'transparent',
                            border:       `1px solid ${currentVersion === i ? 'rgba(0,212,255,0.25)' : 'rgba(0,212,255,0.08)'}`,
                            borderRadius: '4px',
                            padding:      '5px 8px',
                            color:        currentVersion === i ? '#00d4ff' : 'rgba(0,212,255,0.35)',
                            fontFamily:   "'Rajdhani', sans-serif",
                            fontSize:     '10px',
                            cursor:       'pointer',
                            textAlign:    'left',
                            overflow:     'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace:   'nowrap',
                            width:        '100%',
                            transition:   'all 0.15s',
                          }}
                        >
                          v{versions.length - i} · {v.prompt.substring(0, 28)}{v.prompt.length > 28 ? '…' : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Error display */}
            {error && (
              <div style={{
                padding:      '10px 12px',
                background:   'rgba(255,68,68,0.06)',
                border:       '1px solid rgba(255,68,68,0.25)',
                borderRadius: '6px',
                fontSize:     '11px',
                color:        '#ff8888',
                fontFamily:   "'Rajdhani', sans-serif",
                lineHeight:   1.5,
              }}>
                ⚠ {error}
                {!generatedHtml && (
                  <button
                    onClick={() => handleGenerate()}
                    style={{
                      display:       'block',
                      marginTop:     '6px',
                      background:    'rgba(255,68,68,0.1)',
                      border:        '1px solid rgba(255,68,68,0.3)',
                      borderRadius:  '4px',
                      color:         '#ff8888',
                      padding:       '3px 8px',
                      cursor:        'pointer',
                      fontFamily:    "'Rajdhani', sans-serif",
                      fontSize:      '10px',
                      letterSpacing: '0.08em',
                    }}
                  >
                    RETRY
                  </button>
                )}
              </div>
            )}

            {/* Regenerate button — shown when generation was incomplete but partial HTML exists */}
            {error && generatedHtml && (
              <button
                onClick={() => handleGenerate()}
                disabled={isWorking}
                style={{
                  background:    'rgba(255,170,0,0.1)',
                  border:        '1px solid rgba(255,170,0,0.4)',
                  borderRadius:  '6px',
                  color:         '#ffaa00',
                  padding:       '6px 12px',
                  cursor:        isWorking ? 'not-allowed' : 'pointer',
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '11px',
                  letterSpacing: '0.08em',
                  marginTop:     '2px',
                  width:         '100%',
                  display:       'flex',
                  alignItems:    'center',
                  justifyContent:'center',
                  gap:           '6px',
                }}
              >
                ↻ REGENERATE (try again for complete page)
              </button>
            )}

          </div>
          )}

        </div>

        {/* ── RIGHT PANEL — preview ── */}
        <div style={{
          flex:          1,
          display:       'flex',
          flexDirection: 'column',
          overflow:      'hidden',
          background:    '#050a14',
        }}>

          {/* Empty state */}
          {!generatedHtml && !isWorking && (
            <div style={{
              flex:           1,
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            '14px',
            }}>
              <div style={{ fontSize: '44px', opacity: 0.12 }}>✦</div>
              <div style={{
                fontSize:      '13px',
                fontFamily:    "'Rajdhani', sans-serif",
                color:         'rgba(0,212,255,0.2)',
                letterSpacing: '0.1em',
                textAlign:     'center',
              }}>
                DESCRIBE YOUR WEBSITE AND CLICK GENERATE
              </div>
              <div style={{
                fontSize:   '11px',
                fontFamily: "'Rajdhani', sans-serif",
                color:      'rgba(0,212,255,0.1)',
                textAlign:  'center',
                maxWidth:   '260px',
                lineHeight: 1.6,
              }}>
                World-class design with Unsplash images,<br/>
                Google Fonts, and scroll animations
              </div>
            </div>
          )}

          {/* Generating / updating progress */}
          {isWorking && (
            <div style={{
              flex:           1,
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            '20px',
              background:     '#050a14',
            }}>
              {/* Spinner ring */}
              <div style={{
                width:        '56px',
                height:       '56px',
                border:       '2px solid rgba(0,212,255,0.1)',
                borderTop:    '2px solid #00d4ff',
                borderRight:  '2px solid rgba(0,212,255,0.4)',
                borderRadius: '50%',
                animation:    'webgen-spin 1s linear infinite',
              }} />

              {/* Current step */}
              <div style={{
                fontSize:      '12px',
                fontFamily:    "'Orbitron', sans-serif",
                color:         '#00d4ff',
                letterSpacing: '0.08em',
                textAlign:     'center',
              }}>
                {GENERATE_STEPS[generatingStep]}
              </div>

              <div style={{
                fontSize:   '11px',
                color:      'rgba(0,212,255,0.3)',
                fontFamily: "'Rajdhani', sans-serif",
              }}>
                {elapsedSeconds}s elapsed
              </div>

              {/* Progress dots */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {GENERATE_STEPS.map((_, i) => (
                  <div key={i} style={{
                    width:        '6px',
                    height:       '6px',
                    borderRadius: '50%',
                    background:   i <= generatingStep ? '#00d4ff' : 'rgba(0,212,255,0.12)',
                    transition:   'background 0.3s',
                    boxShadow:    i <= generatingStep ? '0 0 5px #00d4ff' : 'none',
                  }} />
                ))}
              </div>

              <div style={{
                fontSize:   '10px',
                fontFamily: "'Rajdhani', sans-serif",
                color:      'rgba(0,212,255,0.2)',
                textAlign:  'center',
                lineHeight: 1.7,
              }}>
                Generating a complete website with<br/>
                Anthropic Frontend Design guidelines<br/>
                <span style={{ color: 'rgba(0,212,255,0.12)' }}>This takes 15–30 seconds</span>
              </div>
            </div>
          )}

          {/* Live preview iframe */}
          {generatedHtml && !isWorking && (
            <div style={{
              flex:          1,
              display:       'flex',
              flexDirection: 'column',
              overflow:      'hidden',
              background:    '#0a0a0a',
            }}>
              {/* Preview bar */}
              <div style={{
                padding:      '3px 12px',
                background:   'rgba(0,0,0,0.6)',
                borderBottom: '1px solid rgba(0,212,255,0.08)',
                fontSize:     '9px',
                fontFamily:   "'Rajdhani', sans-serif",
                color:        'rgba(0,212,255,0.25)',
                letterSpacing:'0.1em',
                flexShrink:   0,
              }}>
                LIVE PREVIEW — LINKS DISABLED
              </div>

              {/* Viewport wrapper */}
              <div style={{
                flex:           1,
                overflow:       'auto',
                display:        'flex',
                justifyContent: 'center',
                padding:        viewport !== 'desktop' ? '16px' : '0',
                background:     viewport !== 'desktop' ? '#111' : 'transparent',
              }}>
                <div style={{
                  width:        vp.width,
                  height:       viewport !== 'desktop' ? vp.height : '100%',
                  minHeight:    '500px',
                  flexShrink:   0,
                  background:   '#fff',
                  boxShadow:    viewport !== 'desktop' ? '0 20px 60px rgba(0,0,0,0.6)' : 'none',
                  borderRadius: viewport !== 'desktop' ? '10px' : '0',
                  overflow:     'hidden',
                  position:     'relative',
                }}>
                  <iframe
                    ref={iframeRef}
                    key={iframeKey}
                    srcDoc={prepareHtmlForPreview(generatedHtml)}
                    style={{
                      width:   '100%',
                      height:  '100%',
                      border:  'none',
                      display: 'block',
                    }}
                    sandbox="allow-scripts allow-same-origin"
                    title="Generated Website Preview"
                    loading="eager"
                    onLoad={() => console.log('[Preview] iframe loaded')}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── FULLSCREEN PREVIEW OVERLAY ── */}
      {isFullscreen && generatedHtml && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: '#fff', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            height: '36px', background: 'rgba(2,10,25,0.95)', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', flexShrink: 0,
          }}>
            <span style={{ fontSize: '10px', color: 'rgba(0,212,255,0.4)', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.1em' }}>
              FULL PREVIEW — LINKS DISABLED
            </span>
            <button
              onClick={() => setIsFullscreen(false)}
              style={{
                background: 'transparent', border: '1px solid rgba(255,68,68,0.3)', borderRadius: '4px',
                color: 'rgba(255,68,68,0.6)', padding: '3px 10px', cursor: 'pointer',
                fontFamily: "'Rajdhani', sans-serif", fontSize: '10px', letterSpacing: '0.08em',
              }}
            >
              ✕ EXIT FULLSCREEN
            </button>
          </div>
          <iframe
            key={iframeKey + '-fullscreen'}
            srcDoc={prepareHtmlForPreview(generatedHtml)}
            style={{ flex: 1, border: 'none', background: '#fff' }}
            sandbox="allow-scripts allow-same-origin"
            title="Full Preview"
          />
        </div>
      )}

      {/* ── EXPORTING OVERLAY ── */}
      {isExporting && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(2,10,25,0.8)', display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10000, gap: '12px',
        }}>
          <div style={{
            width: '40px', height: '40px', border: '2px solid rgba(0,212,255,0.2)',
            borderTop: '2px solid #00d4ff', borderRadius: '50%', animation: 'webgen-spin 1s linear infinite',
          }} />
          <div style={{ color: '#00d4ff', fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', letterSpacing: '0.1em' }}>
            EXPORTING...
          </div>
        </div>
      )}
    </div>
  );
}

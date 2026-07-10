// WebsiteGeneratorPanel — full-screen iterative Next.js site builder (file tree view;
// live in-browser preview lands in a later phase).

import { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { generateWebsite, validateProjectCompleteness } from '../lib/websiteGenerator';
import { getSkill } from '../lib/skillLoader';
import { isTTSEnabled, setTTSEnabled } from '../lib/ttsManager';
import HeroPicker from './HeroPicker';

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

export default function WebsiteGeneratorPanel({ onClose, initialPrompt = '', prefillPrompt = '' }) {
  const startPrompt = initialPrompt || prefillPrompt || '';

  const [prompt,          setPrompt]          = useState(startPrompt);
  const [isGenerating,    setIsGenerating]    = useState(false);
  const [project,         setProject]         = useState(null); // { files: {path: content}, meta: {brief, sectionTypes, heroType} }
  const [error,           setError]           = useState(null);
  const [versions,        setVersions]        = useState([]);
  const [currentVersion,  setCurrentVersion]  = useState(-1);
  const [isIterating,     setIsIterating]     = useState(false);
  const [showOptions,     setShowOptions]     = useState(false);
  const [options,         setOptions]         = useState({ style: '', industry: '', colors: '' });
  const [generatingStep,  setGeneratingStep]  = useState(0);
  const [currentSiteId,   setCurrentSiteId]   = useState(null);
  const [activeTab,       setActiveTab]       = useState('generate');
  const [savedSites,      setSavedSites]      = useState([]);
  const [archiveLoading,  setArchiveLoading]  = useState(false);
  const [renamingId,      setRenamingId]      = useState(null);
  const [renameValue,     setRenameValue]     = useState('');
  const [isMuted,         setIsMuted]         = useState(() => !isTTSEnabled());
  const [heroType,        setHeroType]        = useState('auto'); // 'auto' | 'normal' | 'carousel' | '3d' | 'library'
  const [librarySlug,     setLibrarySlug]     = useState(null);   // selected 21st.dev hero when heroType === 'library'
  const [selectedTheme,   setSelectedTheme]   = useState('auto');
  const [customColor,     setCustomColor]     = useState('#6366f1');
  const [includeContact,  setIncludeContact]  = useState(false);
  const [contactDetails,  setContactDetails]  = useState({ email: '', phone: '', address: '', showForm: true });
  const [saveStatus,      setSaveStatus]      = useState('idle'); // 'idle' | 'saving' | 'saved'
  const [elapsedSeconds,  setElapsedSeconds]  = useState(0);
  const [isExporting,     setIsExporting]     = useState(false);

  const autoGenRef = useRef(false);
  const timerRef    = useRef(null);

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
      setProject({ files: result.files, meta: result.entry.meta || null });
      setCurrentSiteId(id);
      setPrompt(result.entry.prompt || '');
      setActiveTab('generate');
      // Sync hero selection with the loaded site so UPDATE doesn't see a phantom hero change
      try {
        const hero = JSON.parse(result.files['content/hero.json']);
        setHeroType(hero.type === 'static' ? 'normal' : (hero.type || 'auto'));
        setLibrarySlug(hero.type === 'library' ? (hero.librarySlug || null) : null);
      } catch { /* legacy single-file site without content/hero.json — leave selection as-is */ }
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

        // Hero swap during iterate: if the panel's hero selection differs from the
        // project's current hero.json, request a deterministic swap ('auto' = keep as-is).
        let heroChange = null;
        if (isIterate && project && heroType !== 'auto') {
          const desiredType = heroType === 'normal' ? 'static' : heroType;
          try {
            const currentHero = JSON.parse(project.files['content/hero.json']);
            if (desiredType === 'library') {
              if (librarySlug && (currentHero.type !== 'library' || currentHero.librarySlug !== librarySlug)) {
                heroChange = { type: 'library', librarySlug };
              }
            } else if (currentHero.type !== desiredType) {
              heroChange = { type: desiredType };
            }
          } catch { /* legacy project without parsable hero.json — no hero swap */ }
        }

        const newProject = await generateWebsite(
          p,
          { ...options, heroType, librarySlug, heroChange, theme: themeConfig, contact: includeContact ? contactDetails : null },
          isIterate ? project : null
        );

        const { isComplete, missing } = validateProjectCompleteness(newProject.files);
        console.log('[WebGen] Completeness check:', { isComplete, missing });

        const newVersion = { project: newProject, prompt: p, timestamp: new Date().toISOString() };
        setVersions(prev => [newVersion, ...prev].slice(0, 5));
        setCurrentVersion(0);
        setProject(newProject);

        // Auto-save to archive
        if (window.taskiAPI?.websitesSave) {
          try {
            if (isIterate && currentSiteId && window.taskiAPI?.websitesUpdate) {
              await window.taskiAPI.websitesUpdate({ id: currentSiteId, files: newProject.files, prompt: p, meta: newProject.meta });
            } else {
              const saveResult = await window.taskiAPI.websitesSave({ files: newProject.files, prompt: p, heroType, meta: newProject.meta, name: null });
              if (saveResult.success) {
                setCurrentSiteId(saveResult.id);
                console.log('[WebGen] Auto-saved as', saveResult.id);
              }
            }
          } catch (saveErr) {
            console.warn('[WebGen] Auto-save failed:', saveErr.message);
          }
        }

        const heroIssues = (newProject.warnings || []).filter(w => /hero/i.test(w));
        if (!isComplete) {
          setError(
            'Generation was incomplete (missing: ' + missing.join(', ') +
            '). Click Regenerate to try again — this sometimes happens with complex briefs.'
          );
        } else if (heroIssues.length) {
          setError('Hero self-check failed: ' + heroIssues.join(' · ') + '. Try regenerating or pick a different hero.');
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
    if (heroType === 'library' && !librarySlug) {
      setError('Pick a hero from the 21st.dev library grid below the hero style dropdown first.');
      return;
    }
    runGenerate(p, false);
  }

  function handleUpdate() {
    if (!prompt.trim() || !project || isWorking) return;
    if (heroType === 'library' && !librarySlug) {
      setError('Pick a hero from the 21st.dev library grid below the hero style dropdown first.');
      return;
    }
    runGenerate(prompt, true);
  }

  function handleNewWebsite() {
    setProject(null);
    setCurrentSiteId(null);
    setVersions([]);
    setCurrentVersion(-1);
    setError(null);
  }

  function handleVersionSelect(index) {
    setCurrentVersion(index);
    setProject(versions[index].project);
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
    if (!project) return;
    setIsExporting(true);
    try {
      const siteName = getSiteFileName();
      const zip = new JSZip();
      for (const [path, content] of Object.entries(project.files)) {
        zip.file(path, content);
      }

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

  async function handleSaveToArchive() {
    if (!project || !window.taskiAPI?.websitesSave) return;

    setSaveStatus('saving');

    try {
      if (currentSiteId && window.taskiAPI?.websitesUpdate) {
        const result = await window.taskiAPI.websitesUpdate({
          id:     currentSiteId,
          files:  project.files,
          prompt: prompt.trim(),
          meta:   project.meta,
        });
        if (result.success) setSaveStatus('saved');
      } else {
        const result = await window.taskiAPI.websitesSave({
          files:    project.files,
          prompt:   prompt.trim(),
          heroType: heroType,
          meta:     project.meta,
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

        {/* Action buttons — only when a project is ready */}
        {project && !isWorking && (
          <>
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
              onClick={handleExportZip}
              disabled={isExporting}
              style={{
                background:    'rgba(0,212,255,0.08)',
                border:        '1px solid rgba(0,212,255,0.3)',
                borderRadius:  '6px',
                color:         '#00d4ff',
                padding:       '5px 10px',
                cursor:        isExporting ? 'not-allowed' : 'pointer',
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
              ⬇ EXPORT ZIP <span style={{ fontSize: '9px', color: 'rgba(0,212,255,0.3)' }}>full project</span>
            </button>
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
                      {site.heroType === 'carousel' ? '🎠 CAROUSEL'
                        : site.heroType === '3d' ? '✦ 3D'
                        : site.heroType === 'library' ? '✨ 21ST.DEV'
                        : '⚡ AUTO'}
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
                {project ? 'ORIGINAL PROMPT' : 'DESCRIBE YOUR WEBSITE'}
              </label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={'Describe the website you want to build...\n\nExample: A luxury coffee brand landing page with dark roast aesthetics, steam animation, and elegant typography'}
                rows={5}
                style={textareaStyle}
                onFocus={e  => { e.target.style.borderColor = 'rgba(0,212,255,0.5)'; }}
                onBlur={e   => { e.target.style.borderColor = 'rgba(0,212,255,0.2)'; }}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (project ? handleUpdate() : handleGenerate()); }}
              />
              <div style={{
                fontSize:   '9px',
                color:      'rgba(0,212,255,0.2)',
                fontFamily: "'Rajdhani', sans-serif",
                marginTop:  '3px',
              }}>
                {project
                  ? 'Edit prompt above and click UPDATE to iterate — or clear prompt for a new site'
                  : 'Cmd+Enter to generate'}
              </div>
            </div>

            {/* Quick-start pills — only before first generation */}
            {!project && (() => {
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
                <option value="auto">⚡ Auto — Best match from your brief</option>
                <option value="normal">🖼 Static Hero — Unsplash background</option>
                <option value="carousel">🎠 Carousel Hero — Sliding images</option>
                <option value="3d">✦ 3D Motion Hero — Particle animation</option>
                <option value="library">✨ 21st.dev Hero — Curated library</option>
              </select>

              {heroType === 'auto' && (
                <div style={{
                  fontSize:   '9px',
                  color:      'rgba(0,212,255,0.25)',
                  fontFamily: "'Rajdhani', sans-serif",
                  marginTop:  '3px',
                }}>
                  Best-fitting library hero is picked from your brief — falls back to static
                </div>
              )}

              {/* 21st.dev hero picker — live mini-previews of every catalog hero */}
              {heroType === 'library' && (
                <div style={{ marginTop: '8px' }}>
                  <HeroPicker selectedSlug={librarySlug} onSelect={setLibrarySlug} />
                </div>
              )}
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
            {project && isCSSOnlyChange(prompt) && (
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
              onClick={project ? handleUpdate : () => handleGenerate()}
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
                  {project ? 'UPDATING...' : 'GENERATING...'}
                </>
              ) : project ? '↺ UPDATE WEBSITE' : '✦ GENERATE WEBSITE'}
            </button>

            {/* New website — resets state for a fresh generation */}
            {project && (
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

            {project && (
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
                {!project && (
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
            {error && project && (
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
          {!project && !isWorking && (
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

          {/* Project file tree — live in-browser preview lands in the next phase */}
          {project && !isWorking && (
            <div style={{
              flex:          1,
              display:       'flex',
              flexDirection: 'column',
              overflow:      'hidden',
              background:    '#0a0a0a',
            }}>
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
                PROJECT FILES — LIVE PREVIEW COMING NEXT PHASE
              </div>

              <div style={{
                padding:      '10px 16px',
                fontSize:     '11px',
                fontFamily:   "'Rajdhani', sans-serif",
                color:        'rgba(0,212,255,0.4)',
                lineHeight:   1.6,
                borderBottom: '1px solid rgba(0,212,255,0.08)',
                flexShrink:   0,
              }}>
                Export as ZIP, then run <code style={{ color: '#00d4ff' }}>npm install &amp;&amp; npm run dev</code> to preview locally,
                or <code style={{ color: '#00d4ff' }}>npm run build</code> for the static export (outputs to <code style={{ color: '#00d4ff' }}>out/</code>).
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
                {Object.keys(project.files).sort().map((path) => (
                  <div key={path} style={{
                    fontSize:   '11px',
                    fontFamily: 'monospace',
                    color:      'rgba(224,244,255,0.6)',
                    padding:    '3px 0',
                    borderBottom: '1px solid rgba(0,212,255,0.04)',
                  }}>
                    {path}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

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

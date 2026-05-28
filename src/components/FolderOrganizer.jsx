// FolderOrganizer — AI-powered file organizer panel in the left zone (Electron only).

import { useState, useEffect, useRef } from 'react';
import { analyzeAndPlanOrganization, groupByFolder } from '../lib/folderOrganizer';

// ── Icon map ──────────────────────────────────────────────────────────────────

const FOLDER_ICONS = {
  Images: '🖼', Videos: '🎬', Documents: '📄', Audio: '🎵',
  Archives: '📦', Installers: '⚙', Code: '💻', Design: '🎨',
  Spreadsheets: '📊', Presentations: '📑', Fonts: '🅰', Ebooks: '📚',
  Others: '📁',
  Screenshots: '📸', Photos: '📷', Invoices: '🧾', Reports: '📋',
};

const QUICK = [
  { key: 'downloads', label: '⬇ DOWNLOADS' },
  { key: 'documents', label: '📄 DOCUMENTS' },
  { key: 'desktop',   label: '🖥 DESKTOP'   },
  { key: 'pictures',  label: '🖼 PICTURES'  },
];

// ── Style helpers ─────────────────────────────────────────────────────────────

const BASE  = "'Rajdhani', sans-serif";
const ORBIT = "'Orbitron', sans-serif";
const CYAN  = '#00d4ff';
const GREEN = '#00ff88';
const AMBER = '#ff6b00';

function btn(color, extra = {}) {
  return {
    background:    'transparent',
    border:        `1px solid ${color}`,
    borderRadius:  '4px',
    padding:       '6px 12px',
    color,
    fontFamily:    BASE,
    fontSize:      '11px',
    fontWeight:    600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor:        'pointer',
    display:       'flex',
    alignItems:    'center',
    justifyContent:'center',
    gap:           '5px',
    transition:    'all 150ms ease',
    flexShrink:    0,
    ...extra,
  };
}

function dot(color, pulse = true) {
  return {
    width:        '7px',
    height:       '7px',
    borderRadius: '50%',
    background:   color,
    animation:    pulse ? 'glowPulse 0.8s ease-in-out infinite' : 'none',
    flexShrink:   0,
  };
}

// ── ProgressBar ───────────────────────────────────────────────────────────────

function ProgressBar({ value }) {
  return (
    <div style={{
      height: '4px', borderRadius: '2px',
      background: 'rgba(0,212,255,0.1)',
      overflow: 'hidden',
    }}>
      <div style={{
        height: '100%',
        width: `${Math.min(100, value)}%`,
        background: `linear-gradient(90deg, rgba(0,212,255,0.6), ${CYAN})`,
        borderRadius: '2px',
        transition: 'width 200ms ease',
        boxShadow: `0 0 8px rgba(0,212,255,0.5)`,
      }} />
    </div>
  );
}

// ── FolderOrganizer ───────────────────────────────────────────────────────────

export default function FolderOrganizer() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [isExpanded,     setIsExpanded]     = useState(false);
  const [step,           setStep]           = useState('idle');
  const [folderPath,     setFolderPath]     = useState('');
  const [specialFolders, setSpecialFolders] = useState(null);
  const [scannedItems,   setScannedItems]   = useState([]);
  const [organizeData,   setOrganizeData]   = useState(null);   // { plan, summary }
  const [grouped,        setGrouped]        = useState({});
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [progress,       setProgress]       = useState(0);
  const [statusLine,     setStatusLine]     = useState('');
  const [liveLog,        setLiveLog]        = useState([]);
  const [organizeResult, setOrganizeResult] = useState(null);
  const [moveLog,        setMoveLog]        = useState([]);
  const [elapsedMs,      setElapsedMs]      = useState(0);
  const [error,          setError]          = useState('');

  const progressTimer = useRef(null);
  const startTime     = useRef(null);
  const logRef        = useRef(null);

  // Fetch special folder paths once on mount
  useEffect(() => {
    if (!window.taskiAPI?.isElectron) return;
    window.taskiAPI.getSpecialFolders()
      .then(setSpecialFolders)
      .catch(() => {});
  }, []);

  // Auto-scroll live log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [liveLog]);

  // Only render in Electron
  if (!window.taskiAPI?.isElectron) return null;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function startProgressSim(durationMs) {
    setProgress(0);
    let elapsed = 0;
    progressTimer.current = setInterval(() => {
      elapsed += 120;
      // Approaches 90% logarithmically, never reaches 100 until done
      setProgress(Math.min(88, Math.round(90 * (1 - Math.exp(-elapsed / durationMs)))));
    }, 120);
  }

  function stopProgressSim(finalValue = 100) {
    clearInterval(progressTimer.current);
    setProgress(finalValue);
  }

  function fileCount() {
    return scannedItems.filter((f) => f.type === 'file').length;
  }

  function isBlockedPath(p) {
    const lower = p.toLowerCase();
    return ['windows\\system32', '/system', '/usr/bin', '/bin', '/sbin'].some(
      (frag) => lower.includes(frag),
    );
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleBrowse() {
    const selected = await window.taskiAPI.selectFolder();
    if (selected) setFolderPath(selected);
  }

  function handleQuickFolder(key) {
    if (specialFolders?.[key]) setFolderPath(specialFolders[key]);
  }

  async function handleScanAndOrganize() {
    if (!folderPath) return;
    if (isBlockedPath(folderPath)) {
      setError('Access to system folders is not permitted.');
      return;
    }

    setError('');
    setStep('scanning');
    setStatusLine('Reading directory...');
    startProgressSim(800);

    try {
      const items = await window.taskiAPI.scanFolder(folderPath);
      stopProgressSim(100);

      const files = items.filter((i) => i.type === 'file');

      if (files.length === 0) {
        setError('No files found in this folder.');
        setStep('idle');
        return;
      }

      setScannedItems(items);
      setStatusLine(`Found ${files.length} file${files.length !== 1 ? 's' : ''}`);

      if (files.length > 1000) {
        setStep('warn_large');
        return;
      }

      await runAIPlanning(items, files.length);
    } catch (err) {
      stopProgressSim(0);
      setError(err.message);
      setStep('idle');
    }
  }

  async function runAIPlanning(items, count) {
    setStep('planning');
    setProgress(0);
    startProgressSim(3000);

    try {
      const { plan, summary } = await analyzeAndPlanOrganization(items, folderPath);
      stopProgressSim(100);

      if (plan.length === 0) {
        setError('No files could be categorized. Try a different folder.');
        setStep('idle');
        return;
      }

      const g = groupByFolder(plan);
      setOrganizeData({ plan, summary });
      setGrouped(g);
      setExpandedGroups(new Set());
      setStep('preview');
    } catch (err) {
      stopProgressSim(0);
      setError(err.message);
      setStep('idle');
    }
  }

  async function handleOrganize() {
    if (!organizeData?.plan) return;

    setStep('organizing');
    setLiveLog([]);
    setProgress(0);
    startTime.current = Date.now();

    try {
      const result = await window.taskiAPI.organizeFolder(organizeData.plan);
      stopProgressSim(100);

      setElapsedMs(Date.now() - startTime.current);
      setOrganizeResult(result);
      setMoveLog(result.moveLog || []);

      // Animate log entries appearing
      const entries = [
        ...(result.moveLog || []).map((m) => ({
          type: 'ok',
          text: `✓ ${lastName(m.from)} → ${folderSegment(m.to, folderPath)}/`,
        })),
        ...(result.errors || []).map((e) => ({ type: 'err', text: `✗ ${e}` })),
      ];

      for (let i = 0; i < entries.length; i++) {
        await delay(40);
        setLiveLog((prev) => [...prev, entries[i]]);
        setProgress(Math.round(((i + 1) / entries.length) * 100));
      }

      setStep('complete');
      window.taskiAPI.showNotification(
        'Taski',
        `Organized ${result.moved} files into ${Object.keys(grouped).length} folders`,
      ).catch(() => {});
    } catch (err) {
      stopProgressSim(0);
      setError(err.message);
      setStep('preview');
    }
  }

  async function handleUndo() {
    if (moveLog.length === 0) return;
    setStep('scanning');
    setStatusLine('Restoring files...');
    startProgressSim(1000);

    try {
      const res = await window.taskiAPI.undoOrganize(moveLog);
      stopProgressSim(100);
      setError('');
      setStatusLine(`Restored ${res.restored} file${res.restored !== 1 ? 's' : ''} to original locations.`);
      handleReset(true);
    } catch (err) {
      stopProgressSim(0);
      setError(`Undo failed: ${err.message}`);
      setStep('complete');
    }
  }

  function handleReset(keepMsg = false) {
    setStep('idle');
    setScannedItems([]);
    setOrganizeData(null);
    setGrouped({});
    setExpandedGroups(new Set());
    setOrganizeResult(null);
    setMoveLog([]);
    setLiveLog([]);
    setProgress(0);
    if (!keepMsg) { setError(''); setStatusLine(''); }
  }

  function toggleGroup(name) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function lastName(fullPath) {
    return fullPath.replace(/\\/g, '/').split('/').pop() || fullPath;
  }

  function folderSegment(filePath, basePath) {
    const rel = filePath.replace(/\\/g, '/').replace(basePath.replace(/\\/g, '/'), '');
    const parts = rel.split('/').filter(Boolean);
    return parts.slice(0, -1).join('/') || 'root';
  }

  const totalFolders  = Object.keys(grouped).length;
  const planFileCount = organizeData?.plan?.length ?? 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ borderTop: '1px solid rgba(0,212,255,0.1)', paddingTop: '16px', marginTop: '4px' }}>

      {/* ── Header toggle ── */}
      <button
        onClick={() => setIsExpanded((v) => !v)}
        style={{
          width: '100%', background: isExpanded ? 'rgba(0,212,255,0.04)' : 'transparent',
          border: '1px solid rgba(0,212,255,0.18)', borderRadius: '4px',
          padding: '8px 12px', display: 'flex', alignItems: 'center',
          gap: '8px', cursor: 'pointer', transition: 'background 150ms ease',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path d="M1 3a1 1 0 011-1h2.5l1 1.2H11a1 1 0 011 1V10a1 1 0 01-1 1H2a1 1 0 01-1-1V3z"
                stroke={CYAN} strokeWidth="1" fill="none" opacity="0.8"/>
        </svg>
        <span style={{ fontFamily: ORBIT, fontSize: '10px', fontWeight: 700,
          letterSpacing: '0.12em', color: CYAN, flex: 1, textAlign: 'left',
          textShadow: '0 0 10px rgba(0,212,255,0.4)' }}>
          FILE ORGANIZER
        </span>
        {(step !== 'idle' && step !== 'warn_large') && (
          <span style={{ fontFamily: BASE, fontSize: '9px', letterSpacing: '0.1em',
            color: step === 'complete' ? GREEN : CYAN,
            background: step === 'complete' ? 'rgba(0,255,136,0.1)' : 'rgba(0,212,255,0.08)',
            border: `1px solid ${step === 'complete' ? 'rgba(0,255,136,0.3)' : 'rgba(0,212,255,0.25)'}`,
            padding: '1px 7px', borderRadius: '100px', textTransform: 'uppercase' }}>
            {step === 'scanning' ? 'SCANNING' : step === 'planning' ? 'ANALYZING' :
             step === 'preview' ? 'READY' : step === 'organizing' ? 'WORKING' : 'DONE'}
          </span>
        )}
        <span style={{ fontFamily: BASE, fontSize: '11px', color: 'rgba(0,212,255,0.4)',
          display: 'inline-block', transform: isExpanded ? 'rotate(180deg)' : 'none',
          transition: 'transform 200ms ease' }}>▼</span>
      </button>

      {/* ── Expanded body ── */}
      {isExpanded && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

          {/* Error message */}
          {error && (
            <div style={{ fontFamily: BASE, fontSize: '11px', color: AMBER,
              background: 'rgba(255,107,0,0.06)', border: '1px solid rgba(255,107,0,0.3)',
              borderRadius: '4px', padding: '7px 10px', letterSpacing: '0.03em', lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          {/* ═══════════════════════════════ IDLE STATE ═══════════════════════ */}
          {step === 'idle' && (
            <>
              <div style={{ fontFamily: BASE, fontSize: '9px', letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'rgba(0,212,255,0.4)', marginBottom: '2px' }}>
                QUICK ACCESS
              </div>

              {/* Quick folder buttons — 2×2 grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                {QUICK.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => handleQuickFolder(key)}
                    disabled={!specialFolders}
                    style={btn(
                      folderPath === specialFolders?.[key] ? CYAN : 'rgba(0,212,255,0.4)',
                      { fontSize: '10px', padding: '6px 8px',
                        boxShadow: folderPath === specialFolders?.[key]
                          ? '0 0 10px rgba(0,212,255,0.2)' : 'none' },
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div style={{ fontFamily: BASE, fontSize: '9px', letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'rgba(0,212,255,0.4)', marginTop: '4px' }}>
                OR CUSTOM FOLDER
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="Path to folder..."
                  style={{ flex: 1, background: 'var(--color-bg-raised)',
                    border: '1px solid rgba(0,212,255,0.2)', borderRadius: '4px',
                    padding: '6px 10px', color: 'var(--color-text-primary)',
                    fontFamily: BASE, fontSize: '12px', outline: 'none',
                    caretColor: CYAN, letterSpacing: '0.02em', minWidth: 0 }}
                />
                <button onClick={handleBrowse}
                  style={btn('rgba(0,212,255,0.5)', { padding: '6px 10px', fontSize: '14px' })}
                  title="Browse">📁</button>
              </div>

              <button
                onClick={handleScanAndOrganize}
                disabled={!folderPath}
                style={btn(folderPath ? CYAN : 'rgba(0,212,255,0.25)', {
                  width: '100%', padding: '9px', fontSize: '12px',
                  boxShadow: folderPath ? '0 0 16px rgba(0,212,255,0.22)' : 'none',
                  cursor: folderPath ? 'pointer' : 'not-allowed',
                })}
              >
                SCAN &amp; ORGANIZE
              </button>
            </>
          )}

          {/* ══════════════════════════ LARGE FOLDER WARN ════════════════════ */}
          {step === 'warn_large' && (
            <div style={{ background: 'rgba(255,107,0,0.06)',
              border: '1px solid rgba(255,107,0,0.35)', borderRadius: '4px',
              padding: '12px', fontFamily: BASE, fontSize: '12px',
              color: AMBER, letterSpacing: '0.03em', lineHeight: 1.6 }}>
              This folder has {fileCount()}+ files. Large folders may take a moment to analyze.
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button onClick={() => runAIPlanning(scannedItems, fileCount())}
                  style={btn(AMBER, { flex: 1 })}>CONTINUE</button>
                <button onClick={() => handleReset()}
                  style={btn('rgba(0,212,255,0.4)', { flex: 1 })}>CANCEL</button>
              </div>
            </div>
          )}

          {/* ══════════════════════════ SCANNING STATE ═══════════════════════ */}
          {step === 'scanning' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px',
              padding: '12px', background: 'rgba(0,212,255,0.03)',
              border: '1px solid rgba(0,212,255,0.15)', borderRadius: '4px',
              animation: 'glowPulse 2s ease-in-out infinite' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <div style={dot(CYAN)} />
                <span style={{ fontFamily: BASE, fontSize: '12px', letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: CYAN }}>
                  {statusLine || 'SCANNING FOLDER...'}
                </span>
              </div>
              <ProgressBar value={progress} />
            </div>
          )}

          {/* ══════════════════════════ PLANNING STATE ═══════════════════════ */}
          {step === 'planning' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px',
              padding: '12px', background: 'rgba(0,212,255,0.03)',
              border: '1px solid rgba(0,212,255,0.15)', borderRadius: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                {/* Spinning TASKI ring */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
                  style={{ animation: 'rotateRingCW 1s linear infinite', flexShrink: 0 }}>
                  <circle cx="8" cy="8" r="6" stroke="rgba(0,212,255,0.3)" strokeWidth="1.5"/>
                  <path d="M8 2 A6 6 0 0 1 14 8" stroke={CYAN} strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <div>
                  <div style={{ fontFamily: BASE, fontSize: '12px', letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: CYAN }}>ANALYZING WITH AI...</div>
                  <div style={{ fontFamily: BASE, fontSize: '10px', color: 'rgba(0,212,255,0.5)',
                    marginTop: '2px' }}>
                    Determining best structure for {fileCount()} files
                  </div>
                </div>
              </div>
              <ProgressBar value={progress} />
            </div>
          )}

          {/* ══════════════════════════ PREVIEW STATE ════════════════════════ */}
          {step === 'preview' && organizeData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontFamily: ORBIT, fontSize: '10px', letterSpacing: '0.12em',
                  color: CYAN, textShadow: '0 0 8px rgba(0,212,255,0.4)' }}>
                  ORGANIZATION PLAN
                </span>
                <span style={{ fontFamily: BASE, fontSize: '10px', color: 'rgba(0,212,255,0.5)',
                  letterSpacing: '0.05em' }}>
                  {planFileCount} files → {totalFolders} folders
                </span>
              </div>

              {organizeData.summary && (
                <div style={{ fontFamily: BASE, fontSize: '11px', color: 'rgba(0,212,255,0.55)',
                  letterSpacing: '0.02em', lineHeight: 1.5, paddingLeft: '2px',
                  fontStyle: 'italic' }}>
                  {organizeData.summary}
                </div>
              )}

              {/* Folder tree */}
              <div style={{ background: 'rgba(0,212,255,0.025)',
                border: '1px solid rgba(0,212,255,0.12)', borderRadius: '4px',
                padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px',
                maxHeight: '220px', overflowY: 'auto' }}>
                {Object.entries(grouped).map(([folder, data]) => (
                  <div key={folder}>
                    {/* Top-level folder row */}
                    <button
                      onClick={() => toggleGroup(folder)}
                      style={{ width: '100%', background: 'transparent', border: 'none',
                        cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', padding: '3px 0', gap: '6px' }}
                    >
                      <span style={{ fontFamily: BASE, fontSize: '13px',
                        color: 'var(--color-text-primary)', display: 'flex',
                        alignItems: 'center', gap: '6px', letterSpacing: '0.02em' }}>
                        <span>{FOLDER_ICONS[folder] || '📁'}</span>
                        <span>{folder}</span>
                        {Object.keys(data.subfolders).length > 0 && (
                          <span style={{ fontSize: '9px', color: CYAN, opacity: 0.6 }}>
                            {expandedGroups.has(folder) ? '▲' : '▼'}
                          </span>
                        )}
                      </span>
                      <span style={{ fontFamily: BASE, fontSize: '10px',
                        color: 'rgba(0,212,255,0.55)', background: 'rgba(0,212,255,0.08)',
                        padding: '1px 8px', borderRadius: '100px', flexShrink: 0,
                        letterSpacing: '0.04em' }}>
                        {data.count} file{data.count !== 1 ? 's' : ''}
                      </span>
                    </button>

                    {/* Files directly in this folder */}
                    {expandedGroups.has(folder) && data.files.length > 0 && (
                      <div style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column',
                        gap: '1px' }}>
                        {data.files.map((f) => (
                          <div key={f} style={{ fontFamily: BASE, fontSize: '11px',
                            color: 'rgba(0,212,255,0.45)', letterSpacing: '0.02em',
                            padding: '1px 0' }}>
                            {f}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Subfolders */}
                    {expandedGroups.has(folder) && Object.entries(data.subfolders).map(([sub, files]) => (
                      <div key={sub} style={{ paddingLeft: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px',
                          padding: '2px 0' }}>
                          <span style={{ fontFamily: BASE, fontSize: '12px',
                            color: 'rgba(0,212,255,0.7)', letterSpacing: '0.02em' }}>
                            {FOLDER_ICONS[sub] || '📂'} {sub}
                          </span>
                          <span style={{ fontFamily: BASE, fontSize: '10px',
                            color: 'rgba(0,212,255,0.4)' }}>
                            ({files.length})
                          </span>
                        </div>
                        <div style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                          {files.map((f) => (
                            <div key={f} style={{ fontFamily: BASE, fontSize: '11px',
                              color: 'rgba(0,212,255,0.4)', letterSpacing: '0.02em' }}>
                              {f}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => handleReset()}
                  style={btn('rgba(0,212,255,0.4)', { flex: 1 })}>CANCEL</button>
                <button onClick={handleOrganize}
                  style={btn(CYAN, { flex: 2, boxShadow: '0 0 16px rgba(0,212,255,0.28)' })}>
                  ORGANIZE NOW
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════ ORGANIZING STATE ═════════════════════ */}
          {step === 'organizing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px',
                padding: '10px 12px', background: 'rgba(0,255,136,0.04)',
                border: '1px solid rgba(0,255,136,0.18)', borderRadius: '4px' }}>
                <div style={dot(GREEN, true)} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontFamily: BASE, fontSize: '12px', letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: GREEN }}>
                    ORGANIZING FILES...
                  </span>
                  <div style={{ marginTop: '6px' }}>
                    <ProgressBar value={progress} />
                  </div>
                </div>
              </div>

              {/* Live log */}
              {liveLog.length > 0 && (
                <div ref={logRef} style={{ background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(0,212,255,0.1)', borderRadius: '4px',
                  padding: '8px 10px', maxHeight: '140px', overflowY: 'auto',
                  display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {liveLog.map((entry, i) => (
                    <div key={i} style={{ fontFamily: BASE, fontSize: '11px',
                      letterSpacing: '0.02em',
                      color: entry.type === 'ok' ? 'rgba(0,255,136,0.7)' : AMBER,
                      animation: 'startupFadeIn 200ms ease-out' }}>
                      {entry.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════ COMPLETE STATE ═══════════════════════ */}
          {step === 'complete' && organizeResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ background: 'rgba(0,255,136,0.04)',
                border: '1px solid rgba(0,255,136,0.25)', borderRadius: '4px',
                padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontFamily: ORBIT, fontSize: '11px', letterSpacing: '0.12em',
                  color: GREEN, textShadow: '0 0 10px rgba(0,255,136,0.4)' }}>
                  ✓ ORGANIZATION COMPLETE
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
                  gap: '4px', marginTop: '4px' }}>
                  {[
                    ['Files organized', organizeResult.moved],
                    ['Folders created', totalFolders],
                    ['Errors',          organizeResult.errors?.length ?? 0],
                    ['Time taken',      `${(elapsedMs / 1000).toFixed(1)}s`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{ fontFamily: BASE, fontSize: '9px', letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: 'rgba(0,212,255,0.4)' }}>{label}</div>
                      <div style={{ fontFamily: BASE, fontSize: '14px', fontWeight: 600,
                        color: label === 'Errors' && value > 0 ? AMBER : 'var(--color-text-primary)',
                        letterSpacing: '0.02em' }}>{value}</div>
                    </div>
                  ))}
                </div>

                {organizeResult.errors?.length > 0 && (
                  <div style={{ fontFamily: BASE, fontSize: '11px', color: AMBER,
                    borderTop: '1px solid rgba(255,107,0,0.2)', paddingTop: '6px',
                    marginTop: '2px' }}>
                    {organizeResult.errors.join('\n')}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={handleUndo}
                  style={btn('rgba(0,212,255,0.5)', { flex: 1, fontSize: '10px' })}>
                  ↩ UNDO
                </button>
                <button onClick={() => handleReset()}
                  style={btn(CYAN, { flex: 2, fontSize: '10px' })}>
                  ORGANIZE ANOTHER
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

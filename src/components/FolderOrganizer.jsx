// FolderOrganizer — file organizer widget in the left zone (Electron only, hidden in browser).

import { useState } from 'react';
import { callClaude } from '../lib/claude';

const ORGANIZER_SYSTEM = `You are a file organization expert. Given a list of file names, return a JSON array assigning each file to the best folder category. Categories: Images, Videos, Documents, Audio, Archives, Installers, Code, Design, Others. Return ONLY a valid JSON array — no markdown, no explanation, nothing else. Example: [{"file":"photo.jpg","folder":"Images"},{"file":"report.pdf","folder":"Documents"}]`;

const FOLDER_ICONS = {
  Images: '🖼', Videos: '🎬', Documents: '📄', Audio: '🎵',
  Archives: '📦', Installers: '⚙', Code: '💻', Design: '🎨', Others: '📁',
};

function btnStyle(color, padding = '6px 12px') {
  return {
    background:    'transparent',
    border:        `1px solid ${color}`,
    borderRadius:  '4px',
    padding,
    color,
    fontFamily:    "'Rajdhani', sans-serif",
    fontSize:      '11px',
    fontWeight:    600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor:        'pointer',
    display:       'flex',
    alignItems:    'center',
    gap:           '5px',
    transition:    'all 150ms ease',
    flexShrink:    0,
  };
}

export default function FolderOrganizer() {
  const [isExpanded,     setIsExpanded]     = useState(false);
  const [folderPath,     setFolderPath]     = useState('');
  const [scanState,      setScanState]      = useState('idle'); // idle|scanning|plan|organizing|done
  const [files,          setFiles]          = useState([]);
  const [plan,           setPlan]           = useState([]);
  const [planSummary,    setPlanSummary]    = useState({});
  const [result,         setResult]         = useState(null);
  const [statusMsg,      setStatusMsg]      = useState('');
  const [showBigWarning, setShowBigWarning] = useState(false);

  // Only render inside Electron
  if (!window.taskiAPI) return null;

  async function handleSelectFolder() {
    const selected = await window.taskiAPI.selectFolder();
    if (selected) setFolderPath(selected);
  }

  async function handleDownloads() {
    const dl = await window.taskiAPI.getDownloadsPath();
    setFolderPath(dl);
  }

  async function handleScanAndOrganize() {
    if (!folderPath) return;
    setScanState('scanning');
    setStatusMsg('Scanning folder...');
    setShowBigWarning(false);

    try {
      const scannedFiles = await window.taskiAPI.scanFolder(folderPath);

      if (scannedFiles.length === 0) {
        setStatusMsg('No files found in this folder.');
        setScanState('idle');
        return;
      }

      setFiles(scannedFiles);

      if (scannedFiles.length > 500) {
        setShowBigWarning(true);
        setScanState('idle');
        return;
      }

      await generatePlan(scannedFiles);
    } catch (err) {
      setStatusMsg(`Error: ${err.message}`);
      setScanState('idle');
    }
  }

  async function generatePlan(scannedFiles) {
    setScanState('scanning');
    setStatusMsg(`Analyzing ${scannedFiles.length} files with AI...`);

    try {
      const fileList = scannedFiles.map((f) => f.name).join('\n');
      const raw = await callClaude(
        [{ role: 'user', content: `Organize these files:\n${fileList}` }],
        { system: ORGANIZER_SYSTEM },
      );

      const stripped  = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      const jsonMatch = stripped.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('Could not parse AI response');

      const parsed  = JSON.parse(jsonMatch[0]);
      const fileMap = {};
      for (const f of scannedFiles) fileMap[f.name] = f.path;

      const enriched = parsed
        .filter((item) => fileMap[item.file])
        .map((item) => ({ ...item, sourcePath: fileMap[item.file] }));

      const summary = {};
      for (const item of enriched) {
        summary[item.folder] = (summary[item.folder] || 0) + 1;
      }

      setPlan(enriched);
      setPlanSummary(summary);
      setScanState('plan');
      setStatusMsg('');
    } catch (err) {
      setStatusMsg(`Error: ${err.message}`);
      setScanState('idle');
    }
  }

  async function handleOrganize() {
    setScanState('organizing');
    setStatusMsg('Moving files...');

    try {
      const res = await window.taskiAPI.organizeFolder(plan);
      setResult(res);
      setScanState('done');
      window.taskiAPI.showNotification('Taski', `Organized ${res.moved} files successfully`).catch(() => {});
    } catch (err) {
      setStatusMsg(`Error: ${err.message}`);
      setScanState('plan');
    }
  }

  function handleReset() {
    setScanState('idle');
    setFiles([]);
    setPlan([]);
    setPlanSummary({});
    setResult(null);
    setStatusMsg('');
    setShowBigWarning(false);
  }

  return (
    <div
      style={{
        borderTop:  '1px solid rgba(0,212,255,0.1)',
        paddingTop: '16px',
        marginTop:  '4px',
      }}
    >
      {/* ── Collapse toggle ── */}
      <button
        onClick={() => setIsExpanded((v) => !v)}
        style={{
          width:          '100%',
          background:     isExpanded ? 'rgba(0,212,255,0.04)' : 'transparent',
          border:         '1px solid rgba(0,212,255,0.18)',
          borderRadius:   '4px',
          padding:        '8px 12px',
          display:        'flex',
          alignItems:     'center',
          gap:            '8px',
          cursor:         'pointer',
          transition:     'background 150ms ease',
        }}
      >
        {/* Folder SVG */}
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path d="M1 3a1 1 0 011-1h2.5l1 1.2H11a1 1 0 011 1V10a1 1 0 01-1 1H2a1 1 0 01-1-1V3z"
                stroke="#00d4ff" strokeWidth="1" fill="none" opacity="0.8"/>
        </svg>

        <span
          style={{
            fontFamily:    "'Orbitron', sans-serif",
            fontSize:      '10px',
            fontWeight:    700,
            letterSpacing: '0.12em',
            color:         '#00d4ff',
            flex:          1,
            textAlign:     'left',
            textShadow:    '0 0 10px rgba(0,212,255,0.4)',
          }}
        >
          FILE ORGANIZER
        </span>

        <span
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize:   '11px',
            color:      'rgba(0,212,255,0.4)',
            display:    'inline-block',
            transform:  isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms ease',
          }}
        >
          ▼
        </span>
      </button>

      {/* ── Expanded body ── */}
      {isExpanded && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

          {/* Large folder warning */}
          {showBigWarning && (
            <div
              style={{
                background:   'rgba(255,107,0,0.06)',
                border:       '1px solid rgba(255,107,0,0.35)',
                borderRadius: '4px',
                padding:      '10px 12px',
                fontFamily:   "'Rajdhani', sans-serif",
                fontSize:     '12px',
                color:        '#ff6b00',
                letterSpacing:'0.03em',
                lineHeight:   1.5,
              }}
            >
              This folder has {files.length}+ files. This may take a moment. Continue?
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  onClick={() => { setShowBigWarning(false); generatePlan(files); }}
                  style={btnStyle('#ff6b00')}
                >
                  CONTINUE
                </button>
                <button
                  onClick={() => { setShowBigWarning(false); setScanState('idle'); }}
                  style={btnStyle('rgba(0,212,255,0.4)')}
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}

          {/* Idle state: folder picker + scan button */}
          {scanState === 'idle' && !showBigWarning && (
            <>
              {/* Path input + browse button */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="Folder path..."
                  style={{
                    flex:          1,
                    background:    'var(--color-bg-raised)',
                    border:        '1px solid rgba(0,212,255,0.2)',
                    borderRadius:  '4px',
                    padding:       '6px 10px',
                    color:         'var(--color-text-primary)',
                    fontFamily:    "'Rajdhani', sans-serif",
                    fontSize:      '12px',
                    outline:       'none',
                    caretColor:    '#00d4ff',
                    letterSpacing: '0.02em',
                    minWidth:      0,
                  }}
                />
                <button
                  onClick={handleSelectFolder}
                  title="Browse for folder"
                  style={{ ...btnStyle('rgba(0,212,255,0.5)', '6px 10px'), fontSize: '14px' }}
                >
                  📁
                </button>
              </div>

              {/* Quick: Downloads */}
              <button
                onClick={handleDownloads}
                style={{
                  ...btnStyle('rgba(0,212,255,0.55)'),
                  width:          '100%',
                  justifyContent: 'center',
                  padding:        '7px',
                }}
              >
                ⚡ DOWNLOADS FOLDER
              </button>

              {/* Scan & Organize */}
              <button
                onClick={handleScanAndOrganize}
                disabled={!folderPath}
                style={{
                  ...btnStyle(folderPath ? '#00d4ff' : 'rgba(0,212,255,0.25)'),
                  width:          '100%',
                  justifyContent: 'center',
                  padding:        '9px',
                  boxShadow:      folderPath ? '0 0 14px rgba(0,212,255,0.22)' : 'none',
                  cursor:         folderPath ? 'pointer' : 'not-allowed',
                  fontSize:       '12px',
                }}
              >
                SCAN &amp; ORGANIZE
              </button>

              {statusMsg && (
                <div style={{
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '11px',
                  color:         'rgba(255,107,0,0.85)',
                  paddingLeft:   '4px',
                  letterSpacing: '0.03em',
                }}>
                  {statusMsg}
                </div>
              )}
            </>
          )}

          {/* Scanning state */}
          {scanState === 'scanning' && (
            <div
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          '9px',
                padding:      '10px 12px',
                background:   'rgba(0,212,255,0.04)',
                border:       '1px solid rgba(0,212,255,0.15)',
                borderRadius: '4px',
              }}
            >
              <div
                style={{
                  width:        '8px',
                  height:       '8px',
                  borderRadius: '50%',
                  background:   '#00d4ff',
                  animation:    'glowPulse 0.8s ease-in-out infinite',
                  flexShrink:   0,
                }}
              />
              <span
                style={{
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '12px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color:         '#00d4ff',
                }}
              >
                {statusMsg || 'SCANNING...'}
              </span>
            </div>
          )}

          {/* Plan preview */}
          {scanState === 'plan' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                style={{
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '10px',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color:         'rgba(0,212,255,0.55)',
                }}
              >
                PLAN — {files.length} FILES
              </div>

              <div
                style={{
                  background:   'rgba(0,212,255,0.025)',
                  border:       '1px solid rgba(0,212,255,0.12)',
                  borderRadius: '4px',
                  padding:      '10px 12px',
                  display:      'flex',
                  flexDirection:'column',
                  gap:          '6px',
                }}
              >
                {Object.entries(planSummary).map(([folder, count]) => (
                  <div
                    key={folder}
                    style={{
                      display:        'flex',
                      justifyContent: 'space-between',
                      alignItems:     'center',
                    }}
                  >
                    <span
                      style={{
                        fontFamily:    "'Rajdhani', sans-serif",
                        fontSize:      '13px',
                        color:         'var(--color-text-primary)',
                        display:       'flex',
                        alignItems:    'center',
                        gap:           '6px',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {FOLDER_ICONS[folder] || '📁'} {folder}
                    </span>
                    <span
                      style={{
                        fontFamily:    "'Rajdhani', sans-serif",
                        fontSize:      '11px',
                        color:         'rgba(0,212,255,0.6)',
                        background:    'rgba(0,212,255,0.08)',
                        padding:       '1px 8px',
                        borderRadius:  '100px',
                        letterSpacing: '0.04em',
                        flexShrink:    0,
                      }}
                    >
                      {count} file{count !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={handleReset}
                  style={{ ...btnStyle('rgba(0,212,255,0.4)'), flex: 1, justifyContent: 'center' }}
                >
                  CANCEL
                </button>
                <button
                  onClick={handleOrganize}
                  style={{
                    ...btnStyle('#00d4ff'),
                    flex:      2,
                    justifyContent: 'center',
                    boxShadow: '0 0 14px rgba(0,212,255,0.28)',
                  }}
                >
                  ORGANIZE NOW
                </button>
              </div>
            </div>
          )}

          {/* Organizing in progress */}
          {scanState === 'organizing' && (
            <div
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          '9px',
                padding:      '10px 12px',
                background:   'rgba(0,255,136,0.04)',
                border:       '1px solid rgba(0,255,136,0.18)',
                borderRadius: '4px',
              }}
            >
              <div
                style={{
                  width:        '8px',
                  height:       '8px',
                  borderRadius: '50%',
                  background:   '#00ff88',
                  animation:    'glowPulse 0.5s ease-in-out infinite',
                  flexShrink:   0,
                }}
              />
              <span
                style={{
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '12px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color:         '#00ff88',
                }}
              >
                ORGANIZING FILES...
              </span>
            </div>
          )}

          {/* Done */}
          {scanState === 'done' && result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                style={{
                  background:    'rgba(0,255,136,0.04)',
                  border:        '1px solid rgba(0,255,136,0.25)',
                  borderRadius:  '4px',
                  padding:       '12px',
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '13px',
                  color:         '#00ff88',
                  letterSpacing: '0.04em',
                  lineHeight:    1.6,
                }}
              >
                ✓ ORGANIZED {result.moved} FILES INTO {Object.keys(planSummary).length} FOLDERS
                {result.errors.length > 0 && (
                  <div
                    style={{
                      color:      '#ff6b00',
                      fontSize:   '11px',
                      marginTop:  '4px',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {result.errors.length} file{result.errors.length !== 1 ? 's' : ''} could not be moved.
                  </div>
                )}
              </div>

              <button
                onClick={handleReset}
                style={{
                  ...btnStyle('rgba(0,212,255,0.5)'),
                  width:          '100%',
                  justifyContent: 'center',
                }}
              >
                ORGANIZE ANOTHER FOLDER
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

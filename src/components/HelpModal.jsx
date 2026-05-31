// HelpModal — full-screen animated modal showing all app features.

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const SECTIONS = [
  {
    title: 'TASK MANAGEMENT',
    items: [
      'Create tasks with title, date, start and end time — all saved locally',
      'Tasks automatically added to your Google Calendar when created',
      'Smart conflict detection — TASKI checks your existing calendar before scheduling and warns you of overlaps',
      'Mark tasks complete or delete them anytime',
      'Tasks persist between sessions using local storage',
    ],
  },
  {
    title: 'AI ASSISTANT (TASKI)',
    items: [
      'Intelligent Jarvis-style AI chatbot powered by Claude claude-sonnet-4-20250514',
      'Ask anything about your schedule, emails, tasks or files in natural language',
      'TASKI remembers the last 10 messages for context-aware conversations',
      'Responses spoken aloud using text-to-speech with a sophisticated AI voice',
    ],
  },
  {
    title: 'GOOGLE CALENDAR',
    items: [
      'Read your real calendar events — ask "What\'s on my calendar tomorrow?"',
      'Check availability for any date and time',
      'Detect scheduling conflicts automatically before creating new tasks',
      'All calendar access is read-only except when creating tasks',
    ],
  },
  {
    title: 'GMAIL INTEGRATION',
    items: [
      'Search emails by sender name, email address, keyword or date range',
      'Ask "Any emails from James today?" and TASKI finds them instantly',
      'Compose and send emails by describing what you want to say',
      'Always shows a confirmation card before sending — never sends without your approval',
    ],
  },
  {
    title: 'VOICE CONTROL',
    items: [
      'Click the microphone or press Ctrl+Shift+V to speak your commands',
      'Live speech-to-text appears as you speak',
      'Works with all features — calendar, Gmail, file organizer, and general questions',
      'Music automatically reduces volume while you speak and restores when done',
    ],
  },
  {
    title: 'FILE ORGANIZER',
    items: [
      'Organize any folder on your computer intelligently using AI',
      'Quick access to Downloads, Documents, Desktop, Pictures, Music and Videos',
      'TASKI analyzes your files and creates a logical folder structure automatically',
      'Always shows a preview plan before moving anything — you stay in control',
      'Full UNDO support — restore files to their original locations anytime',
      'Voice command: "Organize my downloads folder"',
    ],
  },
  {
    title: 'JARVIS VISUALIZER',
    items: [
      'Animated circular AI visualizer reacts to listening, processing and speaking states',
      'Live clock with your local timezone',
      'Location display with city and coordinates',
      'Ambient futuristic background music with volume control and voice ducking',
    ],
  },
  {
    title: 'IMAGE GENERATION',
    items: [
      'Type /imagen followed by your description to generate images — FREE on Google AI free tier',
      'Default model: Nano Banana (gemini-2.5-flash-image) — free, up to 500 images per day',
      'Nano Banana is the default and works on any Google AI free account',
      'Imagen 4 (paid) — highest quality: /imagen quality a detailed portrait — requires Google AI Pro',
      'If Imagen 4 billing is not enabled, TASKI automatically falls back to Nano Banana',
      'TASKI enhances your prompt with Claude AI for richer, more detailed results',
      'Aspect ratio is auto-detected from your words: landscape, portrait, square, or photo',
      'Click Regenerate to get a new variation, Edit to refine the prompt, or + Variation for more',
      'Save images directly to your computer with the per-image save button',
      'Natural language also works: "Generate an image of a sunset over the ocean"',
      'Voice: "Draw me a futuristic city" or "Create a picture of a mountain lake"',
      'Example: /imagen a Sri Lankan tea plantation at golden hour, landscape, golden tones',
      'Example: /imagen portrait a professional headshot background, studio lighting',
    ],
  },
  {
    title: 'SLASH COMMAND SKILLS',
    items: [
      'Type / in the chat to see all available skills and filter by name',
      '/youtube   — YouTube titles, descriptions, SEO strategy',
      '/linkedin  — Professional posts, profiles, networking',
      '/email     — Business email writing and subject lines',
      '/essay     — Academic writing, arguments, citations',
      '/learn     — Step by step learning on any topic',
      '/school    — Homework help, exam prep, study plans',
      '/code      — Code review, debugging, architecture',
      '/health    — Wellness, fitness, and nutrition guidance',
      '/finance   — Personal finance and budgeting basics',
      '/whatsapp  — WhatsApp message crafting',
      '/clear     — Return to standard TASKI mode',
    ],
  },
  {
    title: 'KEYBOARD SHORTCUTS',
    items: [
      'Ctrl+Shift+V    Toggle voice input',
      'Escape          Close modals and panels',
      'Enter           Send chat message',
      'Arrow keys      Navigate skill autocomplete menu',
      'Tab             Select highlighted skill',
    ],
  },
  {
    title: 'PRIVACY AND SECURITY',
    items: [
      'Google OAuth — you sign in securely, TASKI never stores your password',
      'Gmail access is read-only except for sending emails you explicitly approve',
      'File organizer never deletes files — only moves them with your confirmation',
      'All AI processing uses the Anthropic Claude API with your own API key',
    ],
  },
];

export default function HelpModal({ isOpen, onClose }) {
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);

  // Mount → trigger entry animation
  useEffect(() => {
    if (isOpen) {
      setClosing(false);
      setVisible(true);
    }
  }, [isOpen]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') handleClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setVisible(false);
      onClose();
    }, 200);
  }

  if (!visible) return null;

  return (
    <div
      onClick={handleClose}
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         1000,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:     'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(4px)',
        animation:      closing ? 'backdropOut 0.2s ease forwards' : 'backdropIn 0.2s ease forwards',
      }}
    >
      {/* Modal card */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background:    'var(--color-bg-muted)',
          border:        '1px solid var(--color-neon-cyan-border)',
          borderRadius:  '6px',
          boxShadow:     '0 0 40px rgba(0,212,255,0.2), 0 0 80px rgba(0,212,255,0.1)',
          width:         '680px',
          maxWidth:      '90vw',
          maxHeight:     '80vh',
          overflowY:     'auto',
          padding:       '32px',
          animation:     closing ? 'modalFlashOut 0.2s ease-in forwards' : 'modalFlashIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* T icon */}
            <div
              style={{
                width:          '28px',
                height:         '28px',
                border:         '1px solid #00d4ff',
                borderRadius:   '3px',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                boxShadow:      '0 0 12px rgba(0,212,255,0.35), inset 0 0 8px rgba(0,212,255,0.05)',
                flexShrink:     0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="1" y="2" width="14" height="2" fill="#00d4ff"/>
                <rect x="6.5" y="4" width="3" height="10" fill="#00d4ff"/>
              </svg>
            </div>
            <div>
              <div
                style={{
                  fontFamily:    "'Orbitron', sans-serif",
                  fontSize:      '20px',
                  fontWeight:    700,
                  letterSpacing: '0.1em',
                  color:         'var(--color-neon-cyan)',
                  textShadow:    '0 0 20px rgba(0,212,255,0.8)',
                  lineHeight:    1,
                }}
              >
                TASKI
              </div>
              <div
                style={{
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '12px',
                  letterSpacing: '0.12em',
                  color:         'var(--color-text-secondary)',
                  textTransform: 'uppercase',
                  marginTop:     '3px',
                }}
              >
                Agentic AI Assistant
              </div>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={handleClose}
            aria-label="Close help"
            style={{
              background:  'none',
              border:      'none',
              cursor:      'pointer',
              color:       'var(--color-text-secondary)',
              padding:     '4px',
              display:     'flex',
              alignItems:  'center',
              transition:  'color 150ms, text-shadow 150ms',
              flexShrink:  0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color      = 'var(--color-danger)';
              e.currentTarget.style.textShadow = '0 0 8px rgba(255,45,85,0.8)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color      = 'var(--color-text-secondary)';
              e.currentTarget.style.textShadow = 'none';
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Version line */}
        <div
          style={{
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '11px',
            letterSpacing: '0.08em',
            color:         'var(--color-text-dim)',
            marginBottom:  '16px',
          }}
        >
          Version 1.0 · Desktop Edition
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--color-border)', marginBottom: '20px' }} />

        {/* Feature sections */}
        {SECTIONS.map((section) => (
          <div key={section.title} style={{ marginTop: '24px' }}>
            {/* Section header */}
            <div
              style={{
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '13px',
                fontWeight:    500,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color:         'var(--color-neon-cyan)',
                borderLeft:    '2px solid var(--color-neon-cyan)',
                paddingLeft:   '10px',
                marginBottom:  '10px',
              }}
            >
              {section.title}
            </div>

            {/* Feature items */}
            {section.items.map((item, idx) => (
              <FeatureItem key={idx} text={item} />
            ))}
          </div>
        ))}

        {/* Footer */}
        <div
          style={{
            borderTop:     '1px solid var(--color-border)',
            marginTop:     '28px',
            paddingTop:    '16px',
            textAlign:     'center',
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '11px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color:         'var(--color-text-dim)',
            lineHeight:    1.8,
          }}
        >
          Built with Claude AI · Anthropic API<br />
          Google Calendar · Gmail · Electron
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ text }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:      'flex',
        alignItems:   'flex-start',
        gap:          '8px',
        paddingLeft:  '16px',
        paddingTop:   '4px',
        paddingBottom:'4px',
        borderRadius: '4px',
        background:   hovered ? 'rgba(0,212,255,0.04)' : 'transparent',
        transition:   'background 150ms',
      }}
    >
      <span
        style={{
          color:      'var(--color-neon-cyan)',
          flexShrink: 0,
          marginTop:  '2px',
          fontSize:   '14px',
          lineHeight: 1,
        }}
      >
        ▸
      </span>
      <span
        style={{
          fontFamily:    "'Rajdhani', sans-serif",
          fontSize:      '14px',
          color:         'var(--color-text-primary)',
          lineHeight:    1.8,
        }}
      >
        {text}
      </span>
    </div>
  );
}

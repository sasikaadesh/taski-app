// HelpModal — full-screen animated modal showing all app features.

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const SECTIONS = [
  {
    title: 'GETTING STARTED',
    items: [
      'Taski is your personal AI assistant that connects to your Google Calendar, Gmail, and local computer files',
      'Sign in with Google the first time you add a task — this connects your Calendar and Gmail automatically',
      'The left panel has all your tools. Click any section header to open or close it to save space',
      'Talk to TASKI in the chat on the right, or click the microphone to speak',
    ],
  },
  {
    title: 'ADD A TASK (Left Panel)',
    items: [
      'Creates a task AND adds it to your Google Calendar at the same time',
      'Fill in the task name, pick a date, start time and end time, then click Add Task',
      'TASKI automatically checks if you already have something at that time and warns you before adding',
      'The task appears in both the Calendar Tasks list and your Google Calendar app',
    ],
  },
  {
    title: 'CALENDAR TASKS (Left Panel)',
    items: [
      'Shows all tasks you have added through Taski that are coming up',
      'Tick the circle to mark a task done',
      'Tasks here are linked to your Google Calendar',
    ],
  },
  {
    title: 'TO DO LIST (Left Panel)',
    items: [
      'A simple personal task list that is NOT connected to Google Calendar',
      'Great for quick reminders for tomorrow or this week',
      'Add a task name, pick Tomorrow or This Week, set an optional time, choose priority and click Add Todo',
      'High priority shows red dot · Medium priority shows yellow dot · Low priority shows green dot',
      'Tick the circle when done — done tasks show with a strikethrough',
      'Your todos are saved to a file on your computer: Documents → Taski → quicktodos.json',
    ],
  },
  {
    title: 'FILE ORGANIZER (Left Panel)',
    items: [
      'Sorts and organizes files in any folder on your computer using AI',
      'Click the Downloads, Documents or Desktop button for quick access, or browse to any folder',
      'TASKI scans the folder, asks Claude AI to plan the best folder structure, then shows you the plan before touching anything',
      'Click Organize Now to move the files, or Cancel to stop',
      'You can Undo at any time to put everything back where it was',
      'Say "organize my downloads" in the chat to start from there',
    ],
  },
  {
    title: 'TASKI CHAT (Right Panel)',
    items: [
      'Ask TASKI anything in plain English',
      'TASKI can check your calendar: "What\'s on my schedule tomorrow?" or "Am I free on Friday at 3pm?"',
      'TASKI can search your emails: "Any emails from James this week?" or "Find emails about the invoice"',
      'TASKI can send emails for you — always shows you the email before sending, nothing goes without your approval',
      'TASKI can organize your files: "Organize my downloads folder"',
      'TASKI can generate images: "/imagen a sunset over Sri Lanka" or "Generate an image of a mountain"',
    ],
  },
  {
    title: 'SLASH COMMANDS',
    items: [
      'Type / in the chat to see special modes',
      '/youtube   — Get help with YouTube content, video titles, descriptions, SEO',
      '/linkedin  — Write professional LinkedIn posts and messages',
      '/email     — Get help writing professional emails with subject lines',
      '/essay     — Academic writing help with structure and arguments',
      '/learn     — Step by step explanations of any topic you want to learn',
      '/school    — Homework help for all subjects',
      '/code      — Code review, debugging help, and development advice',
      '/health    — Wellness tips and fitness guidance',
      '/finance   — Personal budgeting and basic investment information',
      '/imagen    — Generate images using Google Nano Banana AI for free',
      '/clear     — Go back to normal TASKI mode',
    ],
  },
  {
    title: 'VOICE CONTROL',
    items: [
      'Click the microphone button or press Ctrl+Shift+V to start speaking',
      'Speak your request naturally — TASKI listens and responds by speaking back',
      'The circular visualizer in the middle shows what TASKI is doing: Spinning fast = listening · Orange = thinking · Pulsing = speaking · Slow spin = ready',
      'Background music automatically goes quiet while you speak and comes back when you are done',
    ],
  },
  {
    title: 'CHAT HISTORY',
    items: [
      'Every conversation with TASKI is automatically saved',
      'Click the clock icon in the chat header to see past conversations',
      'Search through old chats to find something TASKI told you before',
      'Export any chat as a text file to save or share it',
      'Your chats are saved to: Documents → Taski → chats.json',
    ],
  },
  {
    title: 'CONTACTS AND MESSAGING',
    items: [
      'Save your important contacts with their phone number and Telegram username',
      'Click W next to a contact to open WhatsApp with a message ready to send',
      'Click T to send a Telegram message directly from Taski',
      'Say "WhatsApp James about the meeting" and TASKI drafts the message for you',
      'You always see the message before it is sent — nothing goes without your approval',
    ],
  },
  {
    title: 'IMAGE GENERATION',
    items: [
      'Type /imagen followed by what you want to see to generate an image',
      'TASKI improves your description automatically for better results',
      'Click Regenerate to get a different version · Click Save to download the image',
      'Example: /imagen a futuristic city at night',
      'Example: /imagen a professional office background',
      'Example: /imagen a cartoon cat using a laptop',
    ],
  },
  {
    title: 'PRIVACY AND SECURITY',
    items: [
      'Your Google password is never stored in Taski — Google handles the login',
      'TASKI never sends emails or moves files without showing you first and getting your approval',
      'Your API keys are stored only in the .env file on your computer and are never shared',
      'All your data stays on your computer — tasks, todos, and chats are saved as simple files you can read anytime',
    ],
  },
  {
    title: 'KEYBOARD SHORTCUTS',
    items: [
      'Ctrl+Shift+V    Start or stop voice input',
      'Enter           Send a chat message',
      'Escape          Close any open panel',
      '/               Type slash to see skills',
    ],
  },
  {
    title: 'FILE LOCATIONS',
    items: [
      'To Do List:         Documents → Taski → quicktodos.json',
      'Chat History:       Documents → Taski → chats.json',
      'File Organizer Log: Inside your organized folder as taski_organize_log.json',
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
          Taski · Powered by Claude AI (Anthropic)<br />
          Google Calendar · Gmail · Google Imagen<br />
          Built with Electron + React
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

// ChatBot — full-height JARVIS assistant panel (right sidebar).
// Retains all existing functionality: calendar queries, Gmail read/send,
// email confirmation cards, voice input, multi-turn chat history.
// NEW: TTS for Claude responses, visualizer state callbacks, slash command skills.

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Mic } from 'lucide-react';
import { callClaude, CHATBOT_SYSTEM, EMAIL_DRAFT_SYSTEM } from '../lib/claude';
import { getAllSkills, getSkill } from '../lib/skillLoader';
import { generateWithImagen, enhanceImagePrompt, detectAspectRatio, IMAGEN_MODELS } from '../lib/imagenGenerator';
import ImagenResultCard from './ImagenResultCard';
import { analyzeAndPlanOrganization, groupByFolder } from '../lib/folderOrganizer';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import {
  getCalendarEventsForRange,
  buildCalendarContext,
  clearToken,
  getGoogleAccessToken,
} from '../lib/googleCalendar';
import { searchEmails, formatEmailsForPrompt, sendEmail } from '../lib/gmail';
import EmailConfirmationCard from './EmailConfirmationCard';

const MAX_MESSAGES = 10;

// ── Calendar-intent detection ─────────────────────────────────────────────────

const MONTH_NAMES = [
  'january','february','march','april','may','june',
  'july','august','september','october','november','december',
];

const CALENDAR_KEYWORDS = [
  'calendar', 'schedule', 'scheduled', 'scheduling',
  'today', 'tomorrow', 'yesterday', 'this week', 'next week',
  'busy', 'free', 'available', 'availability',
  'meeting', 'meetings', 'event', 'events',
  'appointment', 'appointments',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  ...MONTH_NAMES,
];

function hasCalendarIntent(text) {
  const lower = text.toLowerCase();
  if (/\b\d{1,2}(?:st|nd|rd|th)\b/.test(lower)) return true;
  return CALENDAR_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Email SEND intent detection ───────────────────────────────────────────────

const EMAIL_SEND_PATTERNS = [
  /\bsend\s+(?:an?\s+)?(?:email|e-mail|mail|message)\b/i,
  /\bwrite\s+(?:an?\s+)?(?:email|e-mail|mail|message)\b/i,
  /\bcompose\s+(?:an?\s+)?(?:email|e-mail|mail|message)\b/i,
  /\bdraft\s+(?:an?\s+)?(?:email|e-mail|mail|message)\b/i,
  /\bshoot\s+(?:an?\s+)?(?:email|e-mail|mail|message)\b/i,
  /\bforward\s+(?:this|that|it|the\s+email|the\s+message)?\s*to\s+\w/i,
  /\breply\s+to\s+[A-Za-z0-9@]/i,
  /\bemail\s+[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/i,
  /\bemail\s+\w+\s+(?:about|that|saying|regarding|to\s+(?:tell|let|say|inform|ask))\b/i,
];

function hasEmailSendIntent(text) {
  return EMAIL_SEND_PATTERNS.some((re) => re.test(text));
}

// ── Email READ intent detection ───────────────────────────────────────────────

const EMAIL_READ_KEYWORDS = [
  'email', 'emails', 'gmail', 'inbox', 'mail', 'mails',
  'message', 'messages', 'sent', 'received', 'unread',
  'subject', 'attachment',
];
const FROM_CONTEXT_RE = /\bfrom\s+(?!(?:today|yesterday|tomorrow|this|next|my\s+calendar|the\s+app))/i;

function hasEmailReadIntent(text) {
  const lower = text.toLowerCase();
  if (EMAIL_READ_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  if (FROM_CONTEXT_RE.test(text)) return true;
  return false;
}

// ── Date range helpers ────────────────────────────────────────────────────────

function parseSpecificDate(text) {
  const lower = text.toLowerCase();

  let m = lower.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (!isNaN(d)) { d.setHours(0,0,0,0); return d; }
  }
  m = lower.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m) {
    const dmY = new Date(+m[3], +m[2] - 1, +m[1]);
    if (!isNaN(dmY) && +m[2] <= 12 && +m[1] <= 31) { dmY.setHours(0,0,0,0); return dmY; }
    const mdY = new Date(+m[3], +m[1] - 1, +m[2]);
    if (!isNaN(mdY)) { mdY.setHours(0,0,0,0); return mdY; }
  }

  m = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/);
  if (m) {
    const year = m[3] ? +m[3] : new Date().getFullYear();
    const d = new Date(year, MONTH_NAMES.indexOf(m[2]), +m[1]);
    if (!isNaN(d)) { d.setHours(0,0,0,0); return d; }
  }

  m = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?\b/);
  if (m) {
    const year = m[3] ? +m[3] : new Date().getFullYear();
    const d = new Date(year, MONTH_NAMES.indexOf(m[1]), +m[2]);
    if (!isNaN(d)) { d.setHours(0,0,0,0); return d; }
  }

  return null;
}

function detectDateRange(text) {
  const lower  = text.toLowerCase();
  const today  = new Date();
  today.setHours(0, 0, 0, 0);

  if (lower.includes('next week')) {
    const nextMon = new Date(today);
    const day = today.getDay();
    nextMon.setDate(today.getDate() + (8 - day) % 7 || 7);
    const nextSun = new Date(nextMon);
    nextSun.setDate(nextMon.getDate() + 6);
    return { start: nextMon, end: nextSun };
  }
  if (lower.includes('this week') || lower.includes('week')) {
    const end = new Date(today);
    end.setDate(today.getDate() + 6);
    return { start: today, end };
  }
  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return { start: tomorrow, end: tomorrow };
  }
  if (lower.includes('yesterday')) {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return { start: yesterday, end: yesterday };
  }

  const specific = parseSpecificDate(lower);
  if (specific) return { start: specific, end: specific };

  const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  for (let i = 0; i < DAY_NAMES.length; i++) {
    if (lower.includes(DAY_NAMES[i])) {
      const todayDow = today.getDay();
      let diff = i - todayDow;
      if (diff < 0) diff += 7;
      if (diff === 0) break;
      const target = new Date(today);
      target.setDate(today.getDate() + diff);
      return { start: target, end: target };
    }
  }

  return { start: today, end: today };
}

// ── Folder organizer intent detection ────────────────────────────────────────

const FOLDER_KEYWORDS = [
  'organize my', 'organise my', 'sort my', 'clean up my', 'tidy up my',
  'organize the', 'organise the', 'sort the', 'clean up the',
  'organize files', 'organise files', 'sort files',
  'file organizer', 'messy folder', 'messy downloads',
  'tidy up', 'clean up folder', 'clean up downloads',
  'arrange my files', 'arrange files',
];

// Named special folders the chatbot can resolve via getSpecialFolders()
const NAMED_FOLDERS = {
  downloads:  /\b(downloads?|download\s+folder)\b/i,
  documents:  /\b(documents?|docs?)\b/i,
  desktop:    /\bdesktop\b/i,
  pictures:   /\b(pictures?|photos?|images?)\b/i,
  music:      /\bmusic\b/i,
  videos:     /\bvideos?\b/i,
};

function hasFolderIntent(text) {
  if (!window.taskiAPI?.isElectron) return false;
  const lower = text.toLowerCase();
  return FOLDER_KEYWORDS.some((kw) => lower.includes(kw));
}

function extractNamedFolder(text) {
  for (const [key, re] of Object.entries(NAMED_FOLDERS)) {
    if (re.test(text)) return key;
  }
  return null;
}

function isOrgConfirmation(text) {
  const t = text.trim().toUpperCase();
  if (t === 'CONFIRM' || t === 'YES' || t === 'GO') return true;
  return /^(yes|yeah|yep|sure|proceed|go ahead|do it|ok|okay|execute|absolutely|affirmative|please do)\b/i.test(text.trim());
}

function isOrgDenial(text) {
  const t = text.trim().toUpperCase();
  if (t === 'CANCEL' || t === 'NO' || t === 'STOP') return true;
  return /^(no|nope|cancel|stop|abort|don't|do not|never mind|nevermind|negative|not now)\b/i.test(text.trim());
}

function buildPlanMessage(grouped, totalFiles) {
  const lines = Object.entries(grouped)
    .map(([folder, data]) => {
      const count = typeof data === 'number' ? data : data.count;
      return `📁 ${folder}: ${count} file${count !== 1 ? 's' : ''}`;
    })
    .join('\n');
  const folderCount = Object.keys(grouped).length;
  return (
    `Here is my plan:\n${lines}\n\n` +
    `${totalFiles} files will be organized into ${folderCount} folder${folderCount !== 1 ? 's' : ''}.\n` +
    `Type CONFIRM to proceed or CANCEL to abort.`
  );
}

// ── Gmail query builder ───────────────────────────────────────────────────────

function buildGmailQuery(text) {
  const lower = text.toLowerCase();
  const parts = [];

  const emailAddrMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailAddrMatch) {
    parts.push(`from:${emailAddrMatch[0]}`);
  } else {
    const FROM_EXCLUDE = /^(today|yesterday|tomorrow|this|next|my|the|your|their|our|what|where|when|how|any|an|a)\b/i;
    const fromMatch = lower.match(/\bfrom\s+([\w.''\-]+(?:\s+[\w.''\-]+)?)/);
    if (fromMatch) {
      const candidate = fromMatch[1].trim();
      if (!FROM_EXCLUDE.test(candidate) && !['inbox','gmail','email','mail','me','us'].includes(candidate)) {
        parts.push(`from:${candidate}`);
      }
    }
  }

  const aboutMatch   = lower.match(/\babout\s+(?:the\s+)?([a-z][a-z\s]{2,30}?)(?=\s+(?:from|on|today|yesterday|tomorrow|at\s+\d)|$)/);
  const subjectMatch = lower.match(/\bsubject[:\s]+([a-z][a-z\s]{2,30}?)(?=\s+(?:from|on|at\s+\d)|$)/);
  const topicWords   = (aboutMatch?.[1] || subjectMatch?.[1] || '').trim();
  if (topicWords) parts.push(topicWords);

  if (lower.includes('unread')) parts.push('is:unread');

  const DATE_HINTS = ['today','yesterday','tomorrow','this week','next week'];
  const hasDateHint =
    DATE_HINTS.some((d) => lower.includes(d)) ||
    /\b\d{1,2}(?:st|nd|rd|th)\b/.test(lower) ||
    parseSpecificDate(lower) !== null ||
    MONTH_NAMES.some((mn) => lower.includes(mn));

  if (hasDateHint) {
    const { start, end } = detectDateRange(text);
    const fmt = (d) =>
      `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    parts.push(`after:${fmt(start)}`);
    const dayAfter = new Date(end);
    dayAfter.setDate(dayAfter.getDate() + 1);
    parts.push(`before:${fmt(dayAfter)}`);
  }

  if (parts.length === 0) {
    const stopWords = new Set([
      'can','you','check','if','any','do','i','have','is','are','the','a',
      'an','in','my','please','look','find','show','me','see','get','all',
      'some','their','from','about','at','on','for','of','to','and','or',
      'emails','email','gmail','inbox','messages','message','mail',
    ]);
    const keywords = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w)).slice(0, 4).join(' ');
    parts.push(keywords || 'in:inbox');
  }

  return parts.join(' ');
}

// ── Email send helpers ────────────────────────────────────────────────────────

function extractEmailAddress(text) {
  const m = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

function extractRecipientName(text) {
  const SKIP = new Set(['him','her','them','it','me','us','an','a','the','everyone','all']);
  const patterns = [
    /\bsend\s+([A-Z]\w+(?:\s+[A-Z]\w+)?)\s+an?\s+(?:email|message)\b/i,
    /\bsend\s+an?\s+(?:email|message)\s+to\s+([A-Z]\w+(?:\s+[A-Z]\w+)?)\b/i,
    /\bwrite\s+an?\s+(?:email|message)\s+to\s+([A-Z]\w+(?:\s+[A-Z]\w+)?)\b/i,
    /\bcompose\s+an?\s+(?:email|message)\s+to\s+([A-Z]\w+(?:\s+[A-Z]\w+)?)\b/i,
    /\bdraft\s+an?\s+(?:email|message)\s+to\s+([A-Z]\w+(?:\s+[A-Z]\w+)?)\b/i,
    /\bemail\s+([A-Z]\w+(?:\s+[A-Z]\w+)?)\s+(?:about|that|saying|regarding|to)\b/i,
    /\breply\s+to\s+([A-Z]\w+(?:\s+[A-Z]\w+)?)\b/i,
    /\bforward\s+(?:this\s+)?to\s+([A-Z]\w+(?:\s+[A-Z]\w+)?)\b/i,
    /\bshoot\s+([A-Z]\w+(?:\s+[A-Z]\w+)?)\s+an?\s+(?:email|message)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const name = m[1].trim();
      if (!SKIP.has(name.toLowerCase())) return name;
    }
  }
  return null;
}

async function findEmailForName(name) {
  try {
    const emails = await searchEmails(`from:${name}`);
    if (emails.length === 0) return null;
    const fromHeader = emails[0].from;
    const angleMatch = fromHeader.match(/<([^>]+@[^>]+)>/);
    const bareMatch  = fromHeader.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    return angleMatch?.[1] ?? bareMatch?.[0] ?? null;
  } catch { return null; }
}

async function draftEmailWithClaude(userIntent, recipientEmail, calendarContext = '') {
  const systemPrompt = [
    EMAIL_DRAFT_SYSTEM,
    recipientEmail  ? `\nThe recipient email address is: ${recipientEmail}` : '',
    calendarContext ? `\nRelevant calendar context (use to make the email accurate):\n${calendarContext}` : '',
  ].join('');

  const raw = await callClaude(
    [{ role: 'user', content: userIntent }],
    { system: systemPrompt },
  );

  const stripped  = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('DRAFT_PARSE_FAILED');

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.subject || !parsed.body) throw new Error('DRAFT_INCOMPLETE');

  return { subject: parsed.subject, body: parsed.body };
}

// ── TTS helper ────────────────────────────────────────────────────────────────

/**
 * Attempt to find the best English male voice.
 * Must be called after voices are loaded (fine after user interaction).
 */
function getBestVoice() {
  if (!window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.name === 'Google UK English Male') ||
    voices.find((v) => v.lang === 'en-GB' && v.name.toLowerCase().includes('male')) ||
    voices.find((v) => v.lang.startsWith('en') && v.name.toLowerCase().includes('male')) ||
    voices.find((v) => v.lang.startsWith('en')) ||
    null
  );
}

// ── Skill voice command detection ─────────────────────────────────────────────

const VOICE_ACTIVATE_RE = /\b(switch\s+to|use\s+the?|activate|enable|start\s+(?:the\s+)?)\b/i;
const VOICE_CLEAR_RE    = /\b(go\s+back\s+to\s+normal|clear\s+skill|normal\s+mode|standard\s+mode|reset\s+(?:skill|mode)|deactivate\s+skill|no\s+skill)\b/i;

const VOICE_SKILL_KEYWORDS = [
  { patterns: [/youtube/i],                         trigger: '/youtube'   },
  { patterns: [/linkedin/i],                        trigger: '/linkedin'  },
  { patterns: [/\bemail\s+(?:skill|mode|expert)/i], trigger: '/email'     },
  { patterns: [/essay/i],                           trigger: '/essay'     },
  { patterns: [/\blearn(?:ing)?\s+(?:skill|mode|tutor)/i, /socratic/i], trigger: '/learn' },
  { patterns: [/school/i, /homework/i],             trigger: '/school'    },
  { patterns: [/\bcode\s+(?:skill|mode|review)/i, /developer\s+mode/i], trigger: '/code' },
  { patterns: [/health/i, /wellness/i, /fitness/i], trigger: '/health'   },
  { patterns: [/finance/i, /budget(?:ing)?\s+mode/i], trigger: '/finance' },
  { patterns: [/whatsapp/i],                        trigger: '/whatsapp'  },
];

function detectVoiceSkill(text) {
  if (VOICE_CLEAR_RE.test(text)) return '/clear';
  if (!VOICE_ACTIVATE_RE.test(text)) return null;
  for (const { patterns, trigger } of VOICE_SKILL_KEYWORDS) {
    if (patterns.some((re) => re.test(text))) return trigger;
  }
  return null;
}

// ── Image generation detection ────────────────────────────────────────────────

const IMAGE_SLASH_TRIGGERS = new Set(['/imagen', '/image', '/draw', '/generate', '/img']);

const IMAGE_NL_PATTERNS = [
  /^generate\s+(?:an?\s+)?image\s+of\b/i,
  /^create\s+(?:an?\s+)?(?:picture|image|photo)\s+of\b/i,
  /^draw\s+me\s+\S/i,
  /^draw\s+(?!me\b)\S/i,
  /^make\s+(?:an?\s+)?(?:image|picture|photo)\s+of\b/i,
  /^show\s+me\s+(?:an?\s+)?(?:picture|image|photo)\s+of\b/i,
  /^imagine\s+\S/i,
  /^visualize\s+\S/i,
  /^use\s+imagen\s+(?:to\s+)?\S/i,
];

const MODEL_NANO_WORDS  = new Set(['nano', 'fast', 'banana', 'quick']);
const MODEL_HD_WORDS    = new Set(['quality', 'best', 'hd', 'high', 'imagen4']);

// Returns { prompt, model } or null. activeSkillTrigger lets imagen-mode pass through.
function detectImageRequest(text, activeSkillTrigger) {
  const trimmed = text.trim();
  const lower   = trimmed.toLowerCase();
  const words   = lower.split(/\s+/);
  const first   = words[0];

  // Natural language (always checked, regardless of active skill)
  for (const re of IMAGE_NL_PATTERNS) {
    if (re.test(trimmed)) return { prompt: trimmed, model: IMAGEN_MODELS.NANO_BANANA.id };
  }

  // Slash triggers with inline prompt text
  if (IMAGE_SLASH_TRIGGERS.has(first)) {
    const rest = words.slice(1);
    if (!rest.length) {
      // bare /imagen → only treat as image if already in imagen skill mode
      return activeSkillTrigger === '/imagen'
        ? null  // no prompt given yet; let skill handle it
        : null; // activate skill (handled by branch -1)
    }
    let model      = IMAGEN_MODELS.NANO_BANANA.id;   // default: free tier
    let promptSkip = 0;
    if (MODEL_NANO_WORDS.has(rest[0])) { model = IMAGEN_MODELS.NANO_BANANA.id; promptSkip = 1; }
    else if (MODEL_HD_WORDS.has(rest[0]))  { model = IMAGEN_MODELS.IMAGEN4.id;    promptSkip = 1; }

    // Recover original-case prompt from the trimmed text
    const afterTrigger  = trimmed.slice(first.length).trimStart();
    const promptRaw     = promptSkip
      ? afterTrigger.slice(rest[0].length).trimStart()
      : afterTrigger;
    if (!promptRaw) return null;
    return { prompt: promptRaw, model };
  }

  // Imagen skill mode — any non-slash message generates an image
  if (activeSkillTrigger === '/imagen' && !trimmed.startsWith('/')) {
    return { prompt: trimmed, model: IMAGEN_MODELS.NANO_BANANA.id };
  }

  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Props:
 *   onVisualizerState(state)  — set the visualizer to 'idle'|'listening'|'processing'|'speaking'
 *   registerMicToggle(fn)     — register mic toggle fn so the visualizer can call it
 *   registerMicSupport(bool)  — inform App whether speech API is supported
 *   isMuted                   — when true, skip TTS
 */
export default function ChatBot({
  onVisualizerState,
  registerMicToggle,
  registerMicSupport,
  isMuted,
}) {
  const [messages,           setMessages]           = useState([]);
  const [input,              setInput]              = useState('');
  const [loading,            setLoading]            = useState(false);
  const [error,              setError]              = useState('');
  const [emailDrafts,        setEmailDrafts]        = useState({});
  const [pendingEmailContext, setPendingEmailContext] = useState(null);
  const [pendingFolderPlan,   setPendingFolderPlan]  = useState(null);

  // ── Skill state ───────────────────────────────────────────────────────────
  const [activeSkill,    setActiveSkill]    = useState(null);   // skill object or null
  const [showSkillMenu,  setShowSkillMenu]  = useState(false);  // autocomplete popup
  const [skillFilter,    setSkillFilter]    = useState('');     // text after /
  const [skillMenuIndex, setSkillMenuIndex] = useState(0);      // keyboard nav
  const ALL_SKILLS = getAllSkills();

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const isMutedRef = useRef(isMuted); // keep ref in sync for use inside callbacks
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // ── Voice input ───────────────────────────────────────────────────────────
  const speech = useSpeechRecognition();

  // Inform App of mic support on mount
  useEffect(() => {
    registerMicSupport?.(speech.isSupported);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mic toggle — always-fresh via ref ─────────────────────────────────────
  const micToggleRef = useRef(null);
  micToggleRef.current = useCallback(() => {
    if (speech.isListening) {
      speech.stopListening();
    } else {
      setInput('');
      speech.resetTranscript();
      speech.startListening();
    }
  }, [speech]);

  // Register mic toggle with App (so visualizer button can call it)
  useEffect(() => {
    registerMicToggle?.(() => micToggleRef.current?.());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync visualizer state with listening state
  useEffect(() => {
    if (speech.isListening) {
      onVisualizerState?.('listening');
    } else if (!loading) {
      onVisualizerState?.('idle');
    }
  }, [speech.isListening]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync live transcript → input
  useEffect(() => {
    if (speech.transcript) setInput(speech.transcript);
  }, [speech.transcript]);

  // Translate speech errors → friendly messages
  useEffect(() => {
    if (!speech.error) return;
    const MAP = {
      PERMISSION_DENIED: "Microphone access was denied. Please allow it in your browser settings.",
      NO_SPEECH:         "I did not catch that — please try again.",
      NETWORK:           "Voice input requires an internet connection.",
      UNKNOWN:           "Voice input encountered an error. Please try again.",
    };
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: MAP[speech.error] ?? MAP.UNKNOWN },
    ].slice(-MAX_MESSAGES));
    setInput('');
    speech.clearError();
  }, [speech.error]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcut: Ctrl+Shift+V
  useEffect(() => {
    if (!speech.isSupported) return;
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        micToggleRef.current?.();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [speech.isSupported]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Close skill menu on outside click
  useEffect(() => {
    if (!showSkillMenu) return;
    function onClickOutside() { setShowSkillMenu(false); }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showSkillMenu]);

  // ── TTS ───────────────────────────────────────────────────────────────────

  /**
   * Speak `text` via Web Speech API.
   * Sets visualizer to 'speaking' on start, 'idle' on end.
   * No-op if isMuted is true.
   */
  const speakText = useCallback((text) => {
    if (isMutedRef.current || !window.speechSynthesis) {
      onVisualizerState?.('idle');
      return;
    }
    window.speechSynthesis.cancel(); // stop any in-progress speech

    const utterance     = new SpeechSynthesisUtterance(text);
    utterance.rate      = 0.9;
    utterance.pitch     = 0.85;
    utterance.volume    = 1.0;
    utterance.voice     = getBestVoice();

    utterance.onstart = () => onVisualizerState?.('speaking');
    utterance.onend   = () => onVisualizerState?.('idle');
    utterance.onerror = () => onVisualizerState?.('idle');

    window.speechSynthesis.speak(utterance);
  }, [onVisualizerState]);

  // ── Skill helpers ─────────────────────────────────────────────────────────

  function activateSkill(skill) {
    setActiveSkill(skill);
    setShowSkillMenu(false);
    setInput('');
    const msg = `TASKI: ${skill.name} mode activated. What would you like help with?`;
    setMessages((prev) => [...prev, { role: 'assistant', content: msg }].slice(-MAX_MESSAGES));
    speakText(msg);
  }

  function clearSkill() {
    setActiveSkill(null);
    setShowSkillMenu(false);
    setInput('');
    const msg = 'TASKI: Returning to standard mode.';
    setMessages((prev) => [...prev, { role: 'assistant', content: msg }].slice(-MAX_MESSAGES));
    speakText(msg);
  }

  function handleInputChange(e) {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith('/')) {
      const filter = val.slice(1).toLowerCase();
      setSkillFilter(filter);
      setShowSkillMenu(true);
      setSkillMenuIndex(0);
    } else {
      setShowSkillMenu(false);
    }
  }

  const filteredSkills = ALL_SKILLS.filter((s) =>
    s.trigger.slice(1).startsWith(skillFilter) ||
    s.description.toLowerCase().includes(skillFilter)
  );

  // ── Image generation handlers ─────────────────────────────────────────────

  async function handleImageGeneration(prompt, modelId) {
    const requestId = `img-${Date.now()}`;
    setMessages((prev) => [...prev, {
      role:    'assistant',
      content: `Generating with ${modelId === IMAGEN_MODELS.NANO_BANANA.id ? 'Nano Banana' : 'Imagen 4'}…`,
      meta:    { type: 'imagen-loading', requestId, model: modelId },
    }].slice(-MAX_MESSAGES));

    try {
      const enhancedPrompt = await enhanceImagePrompt(prompt).catch(() => prompt);
      const ratio          = detectAspectRatio(prompt);
      const result         = await generateWithImagen(enhancedPrompt, { model: modelId, aspectRatio: ratio });

      setMessages((prev) => prev.map((m) =>
        m.meta?.requestId === requestId
          ? {
              role:    'assistant',
              content: '[imagen-result]',
              meta:    {
                type: 'imagen-result', requestId,
                images: result.images, prompt, enhancedPrompt,
                model: result.model, aspectRatio: ratio,
                fallbackUsed: result.fallbackUsed ?? false,
              },
            }
          : m
      ));
      speakText('Your image is ready.');
    } catch (err) {
      setMessages((prev) => prev.map((m) =>
        m.meta?.requestId === requestId
          ? { role: 'assistant', content: `Image generation failed: ${err.message}`, meta: {} }
          : m
      ));
      speakText('I was unable to generate that image.');
    }

    onVisualizerState?.('idle');
  }

  async function handleImageRegeneration(requestId, prompt, modelId) {
    setMessages((prev) => prev.map((m) =>
      m.meta?.requestId === requestId
        ? { ...m, meta: { ...m.meta, type: 'imagen-loading', model: modelId } }
        : m
    ));

    try {
      const enhancedPrompt = await enhanceImagePrompt(prompt).catch(() => prompt);
      const ratio          = detectAspectRatio(prompt);
      const result         = await generateWithImagen(enhancedPrompt, { model: modelId, aspectRatio: ratio });

      setMessages((prev) => prev.map((m) =>
        m.meta?.requestId === requestId
          ? {
              role:    'assistant',
              content: '[imagen-result]',
              meta:    {
                type: 'imagen-result', requestId,
                images: result.images, prompt, enhancedPrompt,
                model: result.model, aspectRatio: ratio,
                fallbackUsed: result.fallbackUsed ?? false,
              },
            }
          : m
      ));
      speakText('Your image is ready.');
    } catch (err) {
      setMessages((prev) => prev.map((m) =>
        m.meta?.requestId === requestId
          ? { ...m, content: `Regeneration failed: ${err.message}`, meta: { ...m.meta, type: 'imagen-error' } }
          : m
      ));
    }
  }

  // ── Email draft state handlers ────────────────────────────────────────────

  function handleEmailDraftChange(draftId, field, value) {
    setEmailDrafts((prev) => ({
      ...prev,
      [draftId]: { ...prev[draftId], [field]: value },
    }));
  }

  async function handleEmailSend(draftId) {
    const draft = emailDrafts[draftId];
    await sendEmail({ to: draft.to, subject: draft.subject, body: draft.body, cc: draft.cc ?? '' });

    const sentTime = new Date().toLocaleTimeString('en-US', { timeStyle: 'short' });
    setMessages((prev) =>
      prev.map((m) =>
        m.meta?.draftId === draftId
          ? {
              role:    'assistant',
              content: `EMAIL SENT\nTo: ${draft.to}\nSubject: ${draft.subject}\nSent at: ${sentTime}`,
              meta:    { type: 'email-sent', emailData: draft },
            }
          : m
      )
    );
    setEmailDrafts((prev) => { const n = { ...prev }; delete n[draftId]; return n; });
  }

  function handleEmailCancel(draftId) {
    setMessages((prev) =>
      prev.map((m) =>
        m.meta?.draftId === draftId
          ? { role: 'assistant', content: "Understood. Email has been cancelled.", meta: {} }
          : m
      )
    );
    setEmailDrafts((prev) => { const n = { ...prev }; delete n[draftId]; return n; });
  }

  function addEmailDraftToChat(recipientEmail, subject, body) {
    const draftId = Date.now().toString();
    setEmailDrafts((prev) => ({
      ...prev,
      [draftId]: { to: recipientEmail, subject, body, cc: '' },
    }));
    setMessages((prev) => [
      ...prev,
      {
        role:    'assistant',
        content: `[Email draft to ${recipientEmail} — awaiting your confirmation]`,
        meta:    { type: 'email-confirm', draftId },
      },
    ].slice(-MAX_MESSAGES));
    return draftId;
  }

  // ── Reconnect Google ──────────────────────────────────────────────────────

  async function handleReconnectGoogle() {
    clearToken();
    try {
      await getGoogleAccessToken();
      setMessages((prev) => [...prev, {
        role:    'assistant',
        content: "Google account reconnected. You may now ask about your calendar, emails, or send messages.",
        meta:    { checked: null },
      }].slice(-MAX_MESSAGES));
    } catch {
      // User cancelled — nothing to do
    }
  }

  // ── Main send handler ─────────────────────────────────────────────────────

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    const next    = [...messages, userMsg].slice(-MAX_MESSAGES);
    setMessages(next);
    setInput('');
    setError('');
    setLoading(true);
    onVisualizerState?.('processing');

    // Cancel any ongoing TTS
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    // ════════════════════════════════════════════════════════════════════════
    // BRANCH -1 — Slash command / voice skill activation
    // ════════════════════════════════════════════════════════════════════════
    {
      const trimmed = text.trim().toLowerCase();

      // Direct /trigger command (exact or just the trigger word)
      if (trimmed === '/clear') {
        clearSkill();
        setLoading(false);
        onVisualizerState?.('idle');
        return;
      }

      const exactSkill = getSkill(trimmed);
      if (exactSkill) {
        activateSkill(exactSkill);
        setLoading(false);
        onVisualizerState?.('idle');
        return;
      }

      // Voice command detection
      const voiceTrigger = detectVoiceSkill(text);
      if (voiceTrigger) {
        if (voiceTrigger === '/clear') {
          clearSkill();
        } else {
          const skill = getSkill(voiceTrigger);
          if (skill) activateSkill(skill);
        }
        setLoading(false);
        onVisualizerState?.('idle');
        return;
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // BRANCH -0.5 — Image generation (/imagen, /draw, natural language)
    // ════════════════════════════════════════════════════════════════════════
    {
      const imgReq = detectImageRequest(text, activeSkill?.trigger);
      if (imgReq) {
        setLoading(false); // ImagenResultCard shows its own loading state
        onVisualizerState?.('processing');
        await handleImageGeneration(imgReq.prompt, imgReq.model);
        return;
      }
    }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now      = new Date();
    const todayStr = now.toLocaleDateString('en-US', {
      timeZone: timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('en-US', { timeZone: timezone, timeStyle: 'short' });
    const dateContext =
      `Today is ${todayStr}. Current time is ${timeStr}. ` +
      `User's timezone is ${timezone}.\n` +
      `Always use this date when the user says "today", "yesterday", "this week", or "this month". ` +
      `Never ask the user what today's date is.`;

    // ════════════════════════════════════════════════════════════════════════
    // BRANCH 0 — Pending folder organization (two-phase confirmation)
    // ════════════════════════════════════════════════════════════════════════
    if (pendingFolderPlan) {
      const { phase, files, plan, grouped, folderPath: fp, folderName } = pendingFolderPlan;

      if (isOrgDenial(text)) {
        const msg = "Understood. The folder organization has been cancelled.";
        setMessages((prev) => [...prev, { role: 'assistant', content: msg }].slice(-MAX_MESSAGES));
        speakText(msg);
        setPendingFolderPlan(null);
        setLoading(false);
        return;
      }

      if (isOrgConfirmation(text)) {
        // Phase 1: user confirmed scan → run AI planning
        if (phase === 'awaiting_analysis') {
          const thinkingMsg = `Analyzing your ${folderName} folder with AI. Please wait...`;
          setMessages((prev) => [...prev, { role: 'assistant', content: thinkingMsg }].slice(-MAX_MESSAGES));
          speakText(thinkingMsg);

          try {
            const { plan: aiPlan, summary } = await analyzeAndPlanOrganization(files, fp);
            const g = groupByFolder(aiPlan);
            const totalFiles = files.filter((f) => f.type === 'file').length;
            const planMsg = buildPlanMessage(g, totalFiles);

            setMessages((prev) => [...prev, { role: 'assistant', content: planMsg }].slice(-MAX_MESSAGES));
            speakText(
              `I have prepared a plan. I will organize ${totalFiles} files into ` +
              `${Object.keys(g).length} folders. Say CONFIRM to proceed.`,
            );
            setPendingFolderPlan({ ...pendingFolderPlan, phase: 'awaiting_execute', plan: aiPlan, grouped: g });
          } catch (err) {
            const msg = `I had trouble analyzing the folder: ${err.message}`;
            setMessages((prev) => [...prev, { role: 'assistant', content: msg }].slice(-MAX_MESSAGES));
            speakText(msg);
            setPendingFolderPlan(null);
          }
          setLoading(false);
          return;
        }

        // Phase 2: user confirmed plan → execute
        if (phase === 'awaiting_execute') {
          try {
            const execMsg = "Organizing now. Please wait...";
            setMessages((prev) => [...prev, { role: 'assistant', content: execMsg }].slice(-MAX_MESSAGES));
            speakText(execMsg);

            const res     = await window.taskiAPI.organizeFolder(plan);
            const folders = Object.keys(grouped).length;
            const doneMsg =
              `Done. ${res.moved} file${res.moved !== 1 ? 's' : ''} organized into ` +
              `${folders} folder${folders !== 1 ? 's' : ''}.` +
              (res.errors?.length ? ` ${res.errors.length} file(s) could not be moved.` : '');
            setMessages((prev) => [...prev, { role: 'assistant', content: doneMsg }].slice(-MAX_MESSAGES));
            speakText(doneMsg);
            window.taskiAPI.showNotification('Taski', doneMsg).catch(() => {});
          } catch (err) {
            const msg = `There was an issue organizing the files: ${err.message}`;
            setMessages((prev) => [...prev, { role: 'assistant', content: msg }].slice(-MAX_MESSAGES));
            speakText(msg);
          }
          setPendingFolderPlan(null);
          setLoading(false);
          return;
        }
      }

      // User said something unrelated — clear pending and fall through
      setPendingFolderPlan(null);
    }

    // ════════════════════════════════════════════════════════════════════════
    // BRANCH 1 — Waiting for the user to supply an email address
    // ════════════════════════════════════════════════════════════════════════
    if (pendingEmailContext) {
      const emailAddr = extractEmailAddress(text) || text.trim();
      const VALID_EMAIL = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

      if (VALID_EMAIL.test(emailAddr)) {
        const { originalIntent } = pendingEmailContext;
        setPendingEmailContext(null);
        try {
          const draft = await draftEmailWithClaude(originalIntent, emailAddr);
          addEmailDraftToChat(emailAddr, draft.subject, draft.body);
        } catch {
          const msg = "I had trouble drafting that email. Could you try again with more details?";
          setMessages((prev) => [...prev, { role: 'assistant', content: msg }].slice(-MAX_MESSAGES));
          speakText(msg);
        }
        setLoading(false);
        onVisualizerState?.('idle');
        return;
      } else if (!text.includes(' ')) {
        const msg = "That does not appear to be a valid email address. Could you double-check it?";
        setMessages((prev) => [...prev, { role: 'assistant', content: msg }].slice(-MAX_MESSAGES));
        setLoading(false);
        onVisualizerState?.('idle');
        speakText(msg);
        return;
      } else {
        setPendingEmailContext(null);
        // Fall through to normal intent detection
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // BRANCH 2 — Email SEND intent
    // ════════════════════════════════════════════════════════════════════════
    if (hasEmailSendIntent(text)) {
      try {
        let recipientEmail = extractEmailAddress(text);

        if (!recipientEmail) {
          const name = extractRecipientName(text);
          if (name) {
            recipientEmail = await findEmailForName(name);
            if (!recipientEmail) {
              const msg = `What is ${name}'s email address?`;
              setMessages((prev) => [...prev, {
                role: 'assistant', content: msg, meta: { waitingForEmail: true },
              }].slice(-MAX_MESSAGES));
              setPendingEmailContext({ recipientName: name, originalIntent: text });
              setLoading(false);
              onVisualizerState?.('idle');
              speakText(msg);
              return;
            }
          } else {
            const msg = "Who would you like to send this to? Please provide their email address.";
            setMessages((prev) => [...prev, {
              role: 'assistant', content: msg, meta: { waitingForEmail: true },
            }].slice(-MAX_MESSAGES));
            setPendingEmailContext({ recipientName: null, originalIntent: text });
            setLoading(false);
            onVisualizerState?.('idle');
            speakText(msg);
            return;
          }
        }

        let calendarContext = '';
        if (hasCalendarIntent(text)) {
          try {
            const { start, end } = detectDateRange(text);
            const events          = await getCalendarEventsForRange(start, end);
            calendarContext       = buildCalendarContext(events, start, end);
          } catch { /* optional */ }
        }

        const draft = await draftEmailWithClaude(text, recipientEmail, calendarContext);

        if (calendarContext) {
          const calSystem =
            `${CHATBOT_SYSTEM}\n\n${dateContext}\n\n` +
            `Here are the user's actual Google Calendar events:\n${calendarContext}\n\n` +
            `Briefly answer the calendar/scheduling question embedded in the user's message. ` +
            `Be concise (1-3 sentences). Do NOT mention the email — that will be shown separately.`;
          const calReply = await callClaude(
            next.map(({ role, content }) => ({ role, content })),
            { system: calSystem },
          );
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: calReply, meta: { checked: 'calendar' } },
          ].slice(-MAX_MESSAGES));
          speakText(calReply);
        }

        addEmailDraftToChat(recipientEmail, draft.subject, draft.body);

        // If calendarContext triggered TTS already that's fine; if not, still need
        // to announce the draft is ready and reset the visualizer.
        if (!calendarContext) {
          const draftMsg = "I have prepared an email draft for your review.";
          speakText(draftMsg); // handles visualizer: 'speaking' → 'idle'
        }

      } catch (err) {
        if (import.meta.env.DEV) console.warn('[Taski Email Draft]', err);
        const msg = "I had trouble drafting that email. Please try again with more details about what you would like to say.";
        setMessages((prev) => [...prev, { role: 'assistant', content: msg }].slice(-MAX_MESSAGES));
        speakText(msg);
      }

      setLoading(false);
      return;
    }

    // ════════════════════════════════════════════════════════════════════════
    // BRANCH 2.5 — Folder organize intent (Electron only)
    // ════════════════════════════════════════════════════════════════════════
    if (hasFolderIntent(text)) {
      const namedFolder = extractNamedFolder(text);

      if (!namedFolder) {
        const msg =
          "Of course. Which folder would you like me to organize? " +
          "You can say 'downloads', 'documents', 'desktop', 'pictures', 'music', or 'videos'.";
        setMessages((prev) => [...prev, { role: 'assistant', content: msg }].slice(-MAX_MESSAGES));
        speakText(msg);
        setLoading(false);
        return;
      }

      try {
        const displayName = namedFolder.charAt(0).toUpperCase() + namedFolder.slice(1);
        const scanMsg = `Accessing your ${displayName} folder now...`;
        setMessages((prev) => [...prev, { role: 'assistant', content: scanMsg }].slice(-MAX_MESSAGES));
        speakText(scanMsg);

        const specialFolders = await window.taskiAPI.getSpecialFolders();
        const targetPath     = specialFolders[namedFolder];

        if (!targetPath) throw new Error(`Could not locate your ${displayName} folder.`);

        const items = await window.taskiAPI.scanFolder(targetPath);
        const fileItems = items.filter((f) => f.type === 'file');

        if (fileItems.length === 0) {
          const msg = `Your ${displayName} folder has no files to organize.`;
          setMessages((prev) => [...prev, { role: 'assistant', content: msg }].slice(-MAX_MESSAGES));
          speakText(msg);
          setLoading(false);
          return;
        }

        const foundMsg =
          `I found ${fileItems.length} file${fileItems.length !== 1 ? 's' : ''} in your ` +
          `${displayName} folder. Shall I analyze and organize them? I will group them ` +
          `into Images, Documents, Videos and other logical categories.\n` +
          `Type CONFIRM to proceed or CANCEL to abort.`;
        setMessages((prev) => [...prev, { role: 'assistant', content: foundMsg }].slice(-MAX_MESSAGES));
        speakText(
          `I found ${fileItems.length} files in your ${displayName} folder. ` +
          `Shall I analyze and organize them?`,
        );

        setPendingFolderPlan({
          phase:      'awaiting_analysis',
          files:      items,
          plan:       null,
          grouped:    null,
          folderPath: targetPath,
          folderName: displayName,
        });

      } catch (err) {
        const msg = `I encountered an issue: ${err.message}`;
        setMessages((prev) => [...prev, { role: 'assistant', content: msg }].slice(-MAX_MESSAGES));
        speakText(msg);
      }

      setLoading(false);
      return;
    }

    // ════════════════════════════════════════════════════════════════════════
    // BRANCH 3 — Calendar / Gmail READ / General
    // ════════════════════════════════════════════════════════════════════════
    try {
      let system     = `${CHATBOT_SYSTEM}\n\n${dateContext}`;
      if (activeSkill) {
        system += `\n\n── ACTIVE SKILL: ${activeSkill.name} ──\n${activeSkill.prompt}`;
      }
      let checkedTag = null;

      const wantsCalendar = hasCalendarIntent(text);
      const wantsEmail    = hasEmailReadIntent(text);

      if (wantsCalendar || wantsEmail) {
        const calendarPromise = wantsCalendar
          ? (async () => {
              const { start, end } = detectDateRange(text);
              const events          = await getCalendarEventsForRange(start, end);
              return buildCalendarContext(events, start, end);
            })()
          : Promise.resolve(null);

        const emailPromise = wantsEmail
          ? (async () => {
              const query  = buildGmailQuery(text);
              const emails = await searchEmails(query);
              return { block: formatEmailsForPrompt(emails, query), query };
            })()
          : Promise.resolve(null);

        const [calendarResult, emailResult] = await Promise.allSettled([
          calendarPromise,
          emailPromise,
        ]);

        let calendarBlock = null;
        let emailBlock    = null;

        if (wantsCalendar) {
          if (calendarResult.status === 'fulfilled') {
            calendarBlock = calendarResult.value;
          } else {
            const msg = calendarResult.reason?.message ?? 'Unknown error';
            const reply = msg.toLowerCase().includes('cancel')
              ? "I need access to your Google Calendar to answer that. Please try again and complete the sign-in when prompted."
              : `I was unable to load your calendar just now (${msg}). Please try again in a moment.`;
            setMessages((prev) => [...prev, { role: 'assistant', content: reply, meta: { checked: null } }].slice(-MAX_MESSAGES));
            speakText(reply);
            setLoading(false);
            return;
          }
        }

        if (wantsEmail) {
          if (emailResult.status === 'fulfilled') {
            emailBlock = emailResult.value?.block ?? null;
          } else {
            const errMsg = emailResult.reason?.message ?? '';
            let reply = null;
            if (errMsg === 'GMAIL_AUTH_CANCELLED') {
              reply = "To search your Gmail I need Google account access. Please try again and complete the sign-in when prompted.";
              setMessages((prev) => [...prev, { role: 'assistant', content: reply, meta: { reconnectGmail: true } }].slice(-MAX_MESSAGES));
            } else if (errMsg === 'GMAIL_SCOPE_MISSING') {
              reply = "Gmail access is not yet enabled for this session.";
              setMessages((prev) => [...prev, { role: 'assistant', content: reply, meta: { reconnectGmail: true } }].slice(-MAX_MESSAGES));
            } else if (errMsg === 'GMAIL_RATE_LIMIT') {
              reply = "Gmail is receiving too many requests — please try again in a moment.";
              setMessages((prev) => [...prev, { role: 'assistant', content: reply }].slice(-MAX_MESSAGES));
            } else {
              if (import.meta.env.DEV) console.warn('[Taski Gmail]', errMsg);
            }
            if (reply) {
              speakText(reply);
              if (!wantsCalendar) { setLoading(false); return; }
            }
          }
        }

        const hasCalData   = calendarBlock !== null;
        const hasEmailData = emailBlock    !== null;

        if (hasCalData && hasEmailData) {
          checkedTag = 'both';
          system +=
            `\n\nGOOGLE CALENDAR EVENTS:\n${calendarBlock}\n\n` +
            `GMAIL RESULTS:\n${emailBlock}\n\n` +
            `Use both data sources above to answer the user's question naturally. ` +
            `All email times are already in the user's local timezone (${timezone}). ` +
            `Be concise and conversational. Never make up events or emails not in the data.`;
        } else if (hasCalData) {
          checkedTag = 'calendar';
          system +=
            `\n\nHere are the user's actual Google Calendar events:\n${calendarBlock}\n\n` +
            `Use this real calendar data to answer their scheduling question accurately. Be concise and conversational.`;
        } else if (hasEmailData) {
          checkedTag = 'gmail';
          system +=
            `\n\nThe user asked about their emails. Here are the matching emails found in their Gmail:\n\n` +
            `${emailBlock}\n\n` +
            `Each email shows: sender, subject, date (already in user's local timezone ${timezone}), and a preview. ` +
            `Answer naturally based on these results. If no emails were found, say so clearly. ` +
            `Never make up emails that are not in the results.`;
        }
      }

      const apiMessages = next.map(({ role, content }) => ({ role, content }));
      const reply       = await callClaude(apiMessages, { system });

      setMessages((prev) => [...prev, {
        role:    'assistant',
        content: reply,
        meta:    { checked: checkedTag },
      }].slice(-MAX_MESSAGES));

      speakText(reply);

    } catch (err) {
      setError(err.message);
      onVisualizerState?.('idle');
    } finally {
      setLoading(false);
      // Note: visualizer goes to 'speaking' via TTS onstart, or 'idle' via TTS onend.
      // If muted, speakText() calls onVisualizerState('idle') directly.
    }
  }

  // ── Source-tag badge ──────────────────────────────────────────────────────
  function SourceTag({ checked }) {
    if (!checked) return null;
    const label =
      checked === 'both'     ? 'CALENDAR + GMAIL' :
      checked === 'calendar' ? 'CALENDAR'           :
      checked === 'gmail'    ? 'GMAIL'              : null;
    if (!label) return null;
    return (
      <span
        style={{
          display:       'inline-block',
          fontFamily:    "'Rajdhani', sans-serif",
          fontSize:      '9px',
          fontWeight:    600,
          letterSpacing: '0.14em',
          padding:       '2px 7px',
          borderRadius:  '100px',
          marginBottom:  '4px',
          background:    'rgba(0,212,255,0.08)',
          border:        '1px solid rgba(0,212,255,0.25)',
          color:         '#00d4ff',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display:        'flex',
        flexDirection:  'column',
        height:         '100%',
        background:     'var(--color-bg-muted)',
        overflow:       'hidden',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding:      '18px 20px 14px',
          borderBottom: '1px solid rgba(0,212,255,0.12)',
          background:   'rgba(0,212,255,0.02)',
          flexShrink:   0,
        }}
      >
        <div
          style={{
            fontFamily:    "'Orbitron', sans-serif",
            fontSize:      '16px',
            fontWeight:    700,
            letterSpacing: '0.12em',
            color:         '#00d4ff',
            textShadow:    '0 0 16px rgba(0,212,255,0.7)',
            lineHeight:    1,
          }}
        >
          TASKI
        </div>

        {/* Skill badge / status line */}
        {activeSkill ? (
          <div
            style={{
              display:    'flex',
              alignItems: 'center',
              gap:        '6px',
              marginTop:  '4px',
            }}
          >
            <div
              style={{
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '10px',
                fontWeight:    600,
                letterSpacing: '0.18em',
                color:         '#00d4ff',
                textTransform: 'uppercase',
                background:    'rgba(0,212,255,0.1)',
                border:        '1px solid rgba(0,212,255,0.3)',
                borderRadius:  '3px',
                padding:       '2px 8px',
              }}
            >
              {activeSkill.trigger} — {activeSkill.name.toUpperCase()}
            </div>
            <button
              onClick={clearSkill}
              aria-label="Clear active skill"
              style={{
                background:  'none',
                border:      'none',
                cursor:      'pointer',
                color:       'rgba(0,212,255,0.4)',
                fontSize:    '12px',
                lineHeight:  1,
                padding:     '0 2px',
                transition:  'color 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ff2d55'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(0,212,255,0.4)'; }}
            >
              ×
            </button>
          </div>
        ) : (
          <div
            style={{
              fontFamily:    "'Rajdhani', sans-serif",
              fontSize:      '10px',
              letterSpacing: '0.2em',
              color:         'rgba(0,212,255,0.4)',
              textTransform: 'uppercase',
              marginTop:     '4px',
            }}
          >
            AI ASSISTANT ONLINE
          </div>
        )}
      </div>

      {/* ── Messages area ── */}
      <div
        style={{
          flex:          1,
          minHeight:     0,
          overflowY:     'auto',
          padding:       '16px',
          display:       'flex',
          flexDirection: 'column',
          gap:           '12px',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              justifyContent: 'center',
              height:         '100%',
              gap:            '12px',
              opacity:        0.5,
              paddingBottom:  '40px',
            }}
          >
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <circle cx="20" cy="20" r="18" stroke="#00d4ff" strokeWidth="1" opacity="0.4"/>
              <circle cx="20" cy="20" r="12" stroke="#00d4ff" strokeWidth="1" opacity="0.3" strokeDasharray="6 4"/>
              <circle cx="20" cy="20" r="5"  fill="#00d4ff" opacity="0.25"/>
            </svg>
            <p
              style={{
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '12px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color:         'rgba(0,212,255,0.5)',
                textAlign:     'center',
                lineHeight:    1.6,
                margin:        0,
              }}
            >
              Good day.<br />
              Ask me about your schedule,<br />
              emails, or tasks.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display:        'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            {msg.role === 'user' ? (
              /* ── User bubble ── */
              <div
                style={{
                  maxWidth:      '84%',
                  padding:       '9px 13px',
                  borderRadius:  '4px',
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '14px',
                  letterSpacing: '0.02em',
                  lineHeight:    1.5,
                  background:    'rgba(0,212,255,0.07)',
                  border:        '1px solid rgba(0,212,255,0.28)',
                  color:         'var(--color-text-primary)',
                }}
              >
                {msg.content}
              </div>

            ) : msg.meta?.type === 'email-confirm' && emailDrafts[msg.meta.draftId] ? (
              /* ── Email confirmation card ── */
              <div style={{ width: '100%' }}>
                <EmailConfirmationCard
                  draft={emailDrafts[msg.meta.draftId]}
                  onChange={(field, value) => handleEmailDraftChange(msg.meta.draftId, field, value)}
                  onSend={() => handleEmailSend(msg.meta.draftId)}
                  onCancel={() => handleEmailCancel(msg.meta.draftId)}
                />
              </div>

            ) : msg.meta?.type === 'email-sent' ? (
              /* ── Email sent confirmation ── */
              <div
                style={{
                  maxWidth:      '90%',
                  padding:       '10px 13px',
                  borderRadius:  '4px',
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '13px',
                  letterSpacing: '0.02em',
                  lineHeight:    1.6,
                  whiteSpace:    'pre-line',
                  background:    'rgba(0,255,136,0.05)',
                  border:        '1px solid rgba(0,255,136,0.28)',
                  color:         'var(--color-success)',
                  boxShadow:     '0 0 14px rgba(0,255,136,0.1)',
                }}
              >
                {msg.content}
              </div>

            ) : msg.meta?.type === 'imagen-loading' ? (
              /* ── Imagen loading skeleton ── */
              <div style={{ width: '100%' }}>
                <ImagenResultCard loading model={msg.meta.model} />
              </div>

            ) : msg.meta?.type === 'imagen-result' ? (
              /* ── Imagen result card ── */
              <div style={{ width: '100%' }}>
                <ImagenResultCard
                  images={msg.meta.images}
                  prompt={msg.meta.prompt}
                  enhancedPrompt={msg.meta.enhancedPrompt}
                  model={msg.meta.model}
                  aspectRatio={msg.meta.aspectRatio}
                  fallbackUsed={msg.meta.fallbackUsed ?? false}
                  onRegenerate={(p, m) => handleImageRegeneration(msg.meta.requestId, p, m)}
                />
              </div>

            ) : (
              /* ── Normal JARVIS bubble ── */
              <div
                style={{
                  maxWidth:       '84%',
                  display:        'flex',
                  flexDirection:  'column',
                  alignItems:     'flex-start',
                  gap:            '3px',
                }}
              >
                <SourceTag checked={msg.meta?.checked} />
                <div
                  style={{
                    padding:       '9px 13px',
                    borderRadius:  '4px',
                    fontFamily:    "'Rajdhani', sans-serif",
                    fontSize:      '14px',
                    letterSpacing: '0.02em',
                    lineHeight:    1.55,
                    background:    'var(--color-bg-raised)',
                    border:        '1px solid rgba(0,212,255,0.15)',
                    color:         'var(--color-text-primary)',
                    whiteSpace:    'pre-line',
                    width:         '100%',
                  }}
                >
                  {/* "TASKI:" prefix */}
                  <span
                    style={{
                      fontFamily:    "'Orbitron', sans-serif",
                      fontSize:      '9px',
                      fontWeight:    700,
                      letterSpacing: '0.15em',
                      color:         '#00d4ff',
                      display:       'block',
                      marginBottom:  '4px',
                      opacity:       0.7,
                    }}
                  >
                    TASKI
                  </span>
                  {msg.content}

                  {/* Reconnect Google link */}
                  {msg.meta?.reconnectGmail && (
                    <button
                      onClick={handleReconnectGoogle}
                      style={{
                        display:             'block',
                        marginTop:           '8px',
                        fontFamily:          "'Rajdhani', sans-serif",
                        fontSize:            '12px',
                        letterSpacing:       '0.04em',
                        color:               '#00d4ff',
                        background:          'none',
                        border:              'none',
                        cursor:              'pointer',
                        padding:             0,
                        textDecoration:      'underline',
                        textUnderlineOffset: '3px',
                      }}
                    >
                      Reconnect Google →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* ── Thinking indicator ── */}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                padding:      '9px 13px',
                borderRadius: '4px',
                background:   'var(--color-bg-raised)',
                border:       '1px solid rgba(0,212,255,0.15)',
                display:      'flex',
                alignItems:   'center',
                gap:          '8px',
              }}
            >
              <Loader2 size={13} className="animate-spin" style={{ color: '#00d4ff' }} aria-hidden="true" />
              <span
                style={{
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '11px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color:         'rgba(0,212,255,0.6)',
                }}
              >
                Processing…
              </span>
            </div>
          </div>
        )}

        {error && (
          <p
            style={{
              fontFamily:    "'Rajdhani', sans-serif",
              fontSize:      '12px',
              color:         'var(--color-danger)',
              textAlign:     'center',
              padding:       '0 8px',
              margin:        0,
            }}
          >
            {error}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ── */}
      <form
        onSubmit={handleSend}
        style={{
          padding:       '12px 14px 16px',
          borderTop:     '1px solid rgba(0,212,255,0.12)',
          flexShrink:    0,
          minHeight:     '60px',
          background:    'rgba(0,0,0,0.2)',
          position:      'relative',
        }}
      >
        {/* ── Skill autocomplete popup ── */}
        {showSkillMenu && filteredSkills.length > 0 && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position:     'absolute',
              bottom:       '100%',
              left:         '14px',
              right:        '14px',
              marginBottom: '4px',
              background:   'var(--color-bg-raised)',
              border:       '1px solid rgba(0,212,255,0.3)',
              borderRadius: '4px',
              overflow:     'hidden',
              boxShadow:    '0 0 20px rgba(0,212,255,0.15)',
              zIndex:       50,
            }}
          >
            <div
              style={{
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '9px',
                fontWeight:    600,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color:         'rgba(0,212,255,0.5)',
                padding:       '6px 12px 4px',
                borderBottom:  '1px solid rgba(0,212,255,0.1)',
              }}
            >
              SKILLS
            </div>
            {filteredSkills.map((skill, idx) => (
              <button
                key={skill.trigger}
                type="button"
                onClick={() => activateSkill(skill)}
                style={{
                  display:       'flex',
                  alignItems:    'center',
                  gap:           '10px',
                  width:         '100%',
                  padding:       '7px 12px',
                  background:    idx === skillMenuIndex ? 'rgba(0,212,255,0.1)' : 'transparent',
                  border:        'none',
                  borderBottom:  idx < filteredSkills.length - 1 ? '1px solid rgba(0,212,255,0.06)' : 'none',
                  cursor:        'pointer',
                  textAlign:     'left',
                }}
                onMouseEnter={() => setSkillMenuIndex(idx)}
              >
                <span
                  style={{
                    fontFamily:    "'Rajdhani', sans-serif",
                    fontSize:      '13px',
                    fontWeight:    600,
                    letterSpacing: '0.04em',
                    color:         '#00d4ff',
                    minWidth:      '80px',
                  }}
                >
                  {skill.trigger}
                </span>
                <span
                  style={{
                    fontFamily:  "'Rajdhani', sans-serif",
                    fontSize:    '12px',
                    color:       'var(--color-text-secondary)',
                    letterSpacing: '0.02em',
                  }}
                >
                  {skill.description}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Listening indicator */}
        {speech.isListening && (
          <div
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          '5px',
              marginBottom: '8px',
              paddingLeft:  '2px',
            }}
          >
            <span
              style={{
                color:     'var(--color-danger)',
                fontSize:  '9px',
                animation: 'recordPulse 1s ease-in-out infinite',
                lineHeight: 1,
              }}
              aria-hidden="true"
            >
              ●
            </span>
            <span
              style={{
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '10px',
                fontWeight:    600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color:         'var(--color-danger)',
              }}
            >
              Listening…
            </span>
            <span
              style={{
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '9px',
                letterSpacing: '0.06em',
                color:         'rgba(0,212,255,0.35)',
                marginLeft:    '6px',
              }}
            >
              Ctrl+Shift+V to stop
            </span>
          </div>
        )}

        {/* Row: [Mic] [input] [Send] */}
        <div style={{ display: 'flex', gap: '8px' }}>

          {/* Mic button */}
          {speech.isSupported && (
            <button
              type="button"
              onClick={() => micToggleRef.current?.()}
              aria-label={speech.isListening ? 'Stop voice input' : 'Start voice input'}
              aria-pressed={speech.isListening}
              style={{
                background:     'transparent',
                border:         speech.isListening
                  ? '1px solid #00d4ff'
                  : '1px solid rgba(0,212,255,0.2)',
                borderRadius:   '4px',
                padding:        '0 10px',
                color:          speech.isListening ? '#00d4ff' : 'rgba(0,212,255,0.45)',
                cursor:         'pointer',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                minWidth:       '40px',
                height:         '40px',
                animation:      speech.isListening ? 'glowPulse 1.5s ease-in-out infinite' : 'none',
                boxShadow:      speech.isListening ? '0 0 10px rgba(0,212,255,0.35)' : 'none',
                transition:     'all 200ms ease',
                flexShrink:     0,
              }}
              onMouseEnter={(e) => {
                if (!speech.isListening) {
                  e.currentTarget.style.color       = '#00d4ff';
                  e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)';
                }
              }}
              onMouseLeave={(e) => {
                if (!speech.isListening) {
                  e.currentTarget.style.color       = 'rgba(0,212,255,0.45)';
                  e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)';
                }
              }}
            >
              <Mic size={15} aria-hidden="true" />
            </button>
          )}

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            placeholder={
              speech.isListening  ? 'Listening — speak now…'    :
              pendingEmailContext  ? 'Enter email address…'       :
                                    'Ask TASKI anything… (type / for skills)'
            }
            value={input}
            onChange={handleInputChange}
            disabled={loading}
            onKeyDown={(e) => {
              if (!showSkillMenu || filteredSkills.length === 0) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSkillMenuIndex((i) => Math.min(i + 1, filteredSkills.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSkillMenuIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                activateSkill(filteredSkills[skillMenuIndex]);
              } else if (e.key === 'Escape') {
                setShowSkillMenu(false);
              }
            }}
            style={{
              flex:          1,
              background:    'var(--color-bg-raised)',
              border:        speech.isListening
                ? '1px solid rgba(0,212,255,0.4)'
                : '1px solid rgba(0,212,255,0.15)',
              borderRadius:  '4px',
              padding:       '0 12px',
              height:        '40px',
              color:         'var(--color-text-primary)',
              fontFamily:    "'Rajdhani', sans-serif",
              fontSize:      '14px',
              letterSpacing: '0.02em',
              outline:       'none',
              caretColor:    '#00d4ff',
              transition:    'border-color 200ms, box-shadow 200ms',
              opacity:       loading ? 0.5 : 1,
              boxShadow:     speech.isListening
                ? '0 0 0 3px rgba(0,212,255,0.1)'
                : 'none',
            }}
            onFocus={(e) => {
              if (!speech.isListening) {
                e.target.style.borderColor = 'rgba(0,212,255,0.4)';
                e.target.style.boxShadow   = '0 0 0 3px rgba(0,212,255,0.08)';
              }
            }}
            onBlur={(e) => {
              if (!speech.isListening) {
                e.target.style.borderColor = 'rgba(0,212,255,0.15)';
                e.target.style.boxShadow   = 'none';
              }
            }}
          />

          {/* Send button */}
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send message"
            style={{
              background:     'transparent',
              border:         '1px solid rgba(0,212,255,0.5)',
              borderRadius:   '4px',
              padding:        '0 14px',
              height:         '40px',
              color:          '#00d4ff',
              cursor:         loading || !input.trim() ? 'not-allowed' : 'pointer',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              minWidth:       '44px',
              opacity:        loading || !input.trim() ? 0.3 : 1,
              transition:     'all 200ms ease',
              flexShrink:     0,
              fontFamily:     "'Rajdhani', sans-serif",
              fontSize:       '11px',
              fontWeight:     600,
              letterSpacing:  '0.12em',
              gap:            '6px',
            }}
            onMouseEnter={(e) => {
              if (!loading && input.trim()) {
                e.currentTarget.style.boxShadow = '0 0 12px rgba(0,212,255,0.4)';
                e.currentTarget.style.background = 'rgba(0,212,255,0.08)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <Send size={14} aria-hidden="true" />
            <span style={{ display: 'none' }} className="send-label">SEND</span>
          </button>
        </div>
      </form>
    </div>
  );
}

// ChatBot — full-height JARVIS assistant panel (right sidebar).
// Retains all existing functionality: calendar queries, Gmail read/send,
// email confirmation cards, voice input, multi-turn chat history.
// NEW: TTS for Claude responses, visualizer state callbacks, slash command skills.

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Mic, Clock, VolumeX, SquarePen } from 'lucide-react';
import { callClaude, CHATBOT_SYSTEM, EMAIL_DRAFT_SYSTEM } from '../lib/claude';
import ChatMessage from './ChatMessage';
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
  createCalendarEvent,
  getTodayEvents,
  getTomorrowEvents,
  getThisWeekEvents,
} from '../lib/googleCalendar';
import { isAuthenticated } from '../lib/googleAuth';
import { searchEmails, formatEmailsForPrompt, sendEmail, buildQuery } from '../lib/gmail';
import EmailConfirmationCard from './EmailConfirmationCard';
import useChatHistory from '../hooks/useChatHistory';
import ChatHistoryPanel from './ChatHistoryPanel';
import { speakText as ttsSpeak, stopSpeaking as ttsStop, isTTSEnabled, setTTSEnabled } from '../lib/ttsManager';

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

// ── Calendar ADD intent detection ────────────────────────────────────────────

const CALENDAR_ADD_PATTERNS = [
  /\b(add|create|schedule|put|set\s+up|book|plan)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:event|meeting|appointment|reminder|call|session|lunch|dinner|breakfast|standup|sync)\b/i,
  /\bschedule\s+(?:a\s+|an\s+)?\S/i,
  /\bput\s+(?:it\s+)?(?:on|in)\s+(?:my\s+)?(?:calendar|schedule)\b/i,
  /\badd\s+(?:it\s+)?(?:to|on)\s+(?:my\s+)?calendar\b/i,
  /\bcreate\s+(?:a\s+)?(?:new\s+)?(?:event|meeting|appointment)\b/i,
  /\bremind\s+me\s+(?:to|about|on)\s+\w/i,
];

function hasCalendarAddIntent(text) {
  if (hasEmailSendIntent(text)) return false; // avoid conflicts with send-email patterns
  return CALENDAR_ADD_PATTERNS.some((re) => re.test(text));
}

// ── Precise 5-route detection for BRANCH 3 ───────────────────────────────────

const EMAIL_EXPLICIT_KEYWORDS = ['email', 'emails', 'gmail', 'inbox', 'unread', 'attachment', 'subject'];
const CALENDAR_ROUTE_KEYWORDS = [
  'calendar', 'schedule', 'scheduled', 'event', 'events',
  'appointment', 'appointments', 'meeting', 'meetings',
  'busy', 'free', 'available', 'availability',
];
const ROUTE_FROM_RE = /\bfrom\s+(?!(?:today|yesterday|tomorrow|this|next|the\s+calendar|my\s+calendar))/i;
const ROUTE_TIME_RE = /\b(today|tomorrow|yesterday|this\s+week|next\s+week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

function isEmailQuery(text) {
  const lower = text.toLowerCase();
  if (EMAIL_EXPLICIT_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  if (ROUTE_FROM_RE.test(text)) return true;
  return false;
}

function isCalendarQuery(text) {
  const lower = text.toLowerCase();
  if (CALENDAR_ROUTE_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  if (ROUTE_TIME_RE.test(lower)) return true;
  if (MONTH_NAMES.some((m) => lower.includes(m))) return true;
  if (/\b\d{1,2}(?:st|nd|rd|th)\b/.test(lower)) return true;
  return false;
}

function isAmbiguousQuery(text) {
  // Explicit email keywords (email/emails/gmail/inbox) always resolve to email, not ambiguous
  if (EMAIL_EXPLICIT_KEYWORDS.some((kw) => text.toLowerCase().includes(kw))) return false;
  return isEmailQuery(text) && isCalendarQuery(text);
}

async function extractEventWithClaude(userMessage, todayStr) {
  const system =
    `You are a calendar assistant. Today is ${todayStr}.\n` +
    `Extract event details from the user's message and return ONLY a JSON object in this exact shape:\n` +
    `{"title":"...","date":"YYYY-MM-DD","time":"HH:MM" or null,"endTime":"HH:MM" or null}\n` +
    `Rules: resolve relative dates (today, tomorrow, next Monday) to YYYY-MM-DD.\n` +
    `If no time is mentioned set time to null (all-day event). If no end time, set endTime to null.\n` +
    `Return ONLY the JSON — no markdown, no extra text.`;

  const raw        = await callClaude([{ role: 'user', content: userMessage }], { system, maxTokens: 120 });
  const jsonMatch  = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('PARSE_FAILED');
  return JSON.parse(jsonMatch[0]);
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
    const FROM_EXCLUDE = /^(today|yesterday|tomorrow|this|next|my|the|your|their|our|what|where|when|how|any|an|a|new|old|recent|latest|unread|all|some|show|check|find|get|any)\b/i;
    const SENDER_EXCLUDE = new Set(['inbox','gmail','email','mail','me','us','messages','message','emails','mails']);

    // Explicit "from <name>" pattern
    const fromMatch = lower.match(/\bfrom\s+([\w.''\-]+(?:\s+[\w.''\-]+)?)/);
    if (fromMatch) {
      const candidate = fromMatch[1].trim();
      if (!FROM_EXCLUDE.test(candidate) && !SENDER_EXCLUDE.has(candidate)) {
        parts.push(`from:${candidate}`);
      }
    }

    // "<Name> emails/messages" pattern — catches "Quora emails", "LinkedIn messages"
    if (!parts.some(p => p.startsWith('from:'))) {
      const nameBeforeEmail = text.match(/\b([A-Za-z][a-zA-Z0-9.''\-]+(?:\s+[A-Za-z][a-zA-Z0-9.''\-]+)?)\s+(?:emails?|messages?|mails?)\b/i);
      if (nameBeforeEmail) {
        const candidate = nameBeforeEmail[1].trim().toLowerCase();
        if (!FROM_EXCLUDE.test(candidate) && !SENDER_EXCLUDE.has(candidate)) {
          parts.push(`from:${candidate}`);
        }
      }
    }

    // "emails/messages from <name>" without explicit "from" word already caught above
    // Also handle: "any <Name> email", "check <Name> inbox"
    if (!parts.some(p => p.startsWith('from:'))) {
      const nameAfterCheck = text.match(/\b(?:any|check|show|find|get|search)\s+(?:me\s+)?([A-Za-z][a-zA-Z0-9.''\-]+(?:\s+[A-Za-z][a-zA-Z0-9.''\-]+)?)\s+(?:emails?|messages?|mails?|inbox)\b/i);
      if (nameAfterCheck) {
        const candidate = nameAfterCheck[1].trim().toLowerCase();
        if (!FROM_EXCLUDE.test(candidate) && !SENDER_EXCLUDE.has(candidate)) {
          parts.push(`from:${candidate}`);
        }
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

// ── Website command detection ─────────────────────────────────────────────────

const WEBSITE_NL_PATTERNS = [
  /^(create|generate|build|make|design)\s+(a\s+|an\s+)?(website|landing\s+page|webpage|dashboard|admin\s+panel|portfolio|site)\b/i,
];

function detectWebsiteRequest(text) {
  const trimmed = text.trim();
  const lower   = trimmed.toLowerCase();
  if (lower.startsWith('/website')) {
    return trimmed.slice('/website'.length).trim();
  }
  for (const re of WEBSITE_NL_PATTERNS) {
    if (re.test(trimmed)) return trimmed;
  }
  return null;
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

// ── Morning briefing phrase detection ────────────────────────────────────────

const BRIEFING_PHRASES = [
  'morning briefing', 'good morning', 'start my day', 'daily briefing',
  'daily summary', "what's today", 'whats today', 'brief me',
  'morning summary', "today's overview", 'run briefing', 'morning report',
];

const BRIEFING_SYSTEM = 'You are TASKI, a friendly AI assistant giving a morning briefing. Be warm, concise, and helpful.';

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Props:
 *   onVisualizerState(state)  — set the visualizer to 'idle'|'listening'|'processing'|'speaking'
 *   registerMicToggle(fn)     — register mic toggle fn so the visualizer can call it
 *   registerMicSupport(bool)  — inform App whether speech API is supported
 *   isMuted                   — when true, skip TTS
 */
// ── Panel auto-expand keywords ────────────────────────────────────────────────

const CALENDAR_EXPAND_WORDS = [
  'calendar', 'schedule', 'meeting', 'events', 'my day', 'appointments',
  'show calendar', 'open calendar', 'what do i have', 'am i free',
  'add event', 'create meeting',
];

const TODO_EXPAND_WORDS = [
  'todo', 'to do', 'tasks', 'my tasks', 'pending', 'show todos', 'open todos',
  'add todo', 'add task', 'my list', 'what should i do', 'remind me',
];

export default function ChatBot({
  onVisualizerState,
  registerMicToggle,
  registerMicSupport,
  isMuted,
  onWebsiteGenerated,
  registerChatInsert,
  isCollapsed = false,
  onExpand,
  openWebsiteGenerator,
}) {
  const [messages,           setMessages]           = useState([]);
  const [input,              setInput]              = useState('');
  const [loading,            setLoading]            = useState(false);
  const [error,              setError]              = useState('');
  const [isSpeaking,         setIsSpeaking]         = useState(false);
  const [emailDrafts,        setEmailDrafts]        = useState({});
  const [pendingEmailContext, setPendingEmailContext] = useState(null);
  const [pendingFolderPlan,   setPendingFolderPlan]  = useState(null);
  const [uploadedFiles,       setUploadedFiles]       = useState([]);
  const [uploadingFile,       setUploadingFile]       = useState(null);
  const [isDragging,          setIsDragging]          = useState(false);
  const [webSearchMode,       setWebSearchMode]       = useState(false);
  const [isSearching,         setIsSearching]         = useState(false);
  const [audioPausedBySystem, setAudioPausedBySystem] = useState(false);

  // ── Chat history ──────────────────────────────────────────────────────────
  const chatHistory    = useChatHistory();
  const sessionIdRef   = useRef(null);
  const prevLoadingRef = useRef(false);
  const [historyOpen,  setHistoryOpen]  = useState(false);
  const [viewingPast,  setViewingPast]  = useState(null);

  // ── Skill state ───────────────────────────────────────────────────────────
  const [activeSkill,       setActiveSkill]       = useState(null);   // skill object or null
  const [activeSubcategory, setActiveSubcategory] = useState(null);   // subcategory object or null
  const [showSkillMenu,     setShowSkillMenu]     = useState(false);  // autocomplete popup
  const [skillFilter,       setSkillFilter]       = useState('');     // text after /
  const [skillMenuIndex,    setSkillMenuIndex]    = useState(0);      // keyboard nav
  const ALL_SKILLS = getAllSkills();

  const bottomRef         = useRef(null);
  const inputRef          = useRef(null);
  const fileInputRef      = useRef(null);
  const triggerBriefingRef = useRef(null);
  const isMutedRef = useRef(isMuted); // keep ref in sync for use inside callbacks
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // Listen for audio pause/resume events from other panels (e.g. website generator)
  useEffect(() => {
    function handleAudioPause(e) {
      console.log('[TTS] Pausing due to:', e.detail.reason);
      ttsStop();
      setIsSpeaking(false);
      setAudioPausedBySystem(true);
    }
    function handleAudioResume(e) {
      console.log('[TTS] Resume signal from:', e.detail.reason);
      setAudioPausedBySystem(false);
    }
    window.addEventListener('taski-audio-pause',  handleAudioPause);
    window.addEventListener('taski-audio-resume', handleAudioResume);
    return () => {
      window.removeEventListener('taski-audio-pause',  handleAudioPause);
      window.removeEventListener('taski-audio-resume', handleAudioResume);
    };
  }, []);

  // ── External chat insert (for footer buttons) ──────────────────────────────
  const insertTextFnRef = useRef(null);
  insertTextFnRef.current = (text) => {
    setInput(text);
    setTimeout(() => inputRef.current?.focus(), 0);
    if (text.startsWith('/')) {
      setSkillFilter(text.slice(1).toLowerCase());
      setShowSkillMenu(true);
      setSkillMenuIndex(0);
    } else {
      setShowSkillMenu(false);
    }
  };
  useEffect(() => {
    registerChatInsert?.((text) => insertTextFnRef.current?.(text));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Voice input ───────────────────────────────────────────────────────────
  const speech = useSpeechRecognition();

  // Inform App of mic support on mount
  useEffect(() => {
    registerMicSupport?.(speech.isSupported);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mic toggle — always-fresh via ref ─────────────────────────────────────
  const voiceAutoSubmitTimerRef = useRef(null);
  const handleSendRef           = useRef(null); // always-fresh submit fn for voice auto-submit

  const micToggleRef = useRef(null);
  micToggleRef.current = useCallback(() => {
    if (speech.isProcessing) return;
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

  // Sync visualizer state with listening / processing state
  useEffect(() => {
    if (speech.isListening) {
      onVisualizerState?.('listening');
    } else if (speech.isProcessing) {
      onVisualizerState?.('processing');
    } else if (!loading) {
      onVisualizerState?.('idle');
    }
  }, [speech.isListening, speech.isProcessing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show interim text live (both during recording and while transcribing)
  useEffect(() => {
    if (speech.interimTranscript) {
      setInput(speech.interimTranscript);
    }
  }, [speech.interimTranscript]); // eslint-disable-line react-hooks/exhaustive-deps

  // When recording and processing are both done, commit the transcript to the input
  // and schedule an auto-submit after 3 s of inactivity
  useEffect(() => {
    if (!speech.isListening && !speech.isProcessing && speech.transcript) {
      setInput(speech.transcript);
      speech.resetTranscript();

      if (voiceAutoSubmitTimerRef.current) clearTimeout(voiceAutoSubmitTimerRef.current);
      voiceAutoSubmitTimerRef.current = setTimeout(() => {
        voiceAutoSubmitTimerRef.current = null;
        handleSendRef.current?.({ preventDefault: () => {} });
      }, 3000);
    }
  }, [speech.transcript, speech.isListening, speech.isProcessing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show speech errors as assistant messages
  useEffect(() => {
    if (!speech.error) return;
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: speech.error },
    ].slice(-MAX_MESSAGES));
    setInput('');
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

  // Debug: log available taskiAPI methods on mount
  useEffect(() => {
    console.log('[Taski] taskiAPI available:', !!window.taskiAPI);
    console.log('[Taski] taskiAPI methods:', window.taskiAPI ? Object.keys(window.taskiAPI) : 'NOT FOUND');
    console.log('[Taski] ragOpenFiles:', !!window.taskiAPI?.ragOpenFiles);
    console.log('[Taski] ragIngest:', !!window.taskiAPI?.ragIngest);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Start a new chat session on mount
  useEffect(() => {
    sessionIdRef.current = chatHistory.startNewSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for taski-briefing event (triggered by header button or auto-briefing)
  useEffect(() => {
    function handleBriefingEvent() {
      triggerBriefingRef.current?.();
    }
    window.addEventListener('taski-briefing', handleBriefingEvent);
    return () => window.removeEventListener('taski-briefing', handleBriefingEvent);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show a subtle notification when a Telegram message is processed
  useEffect(() => {
    function handleTelegramMessage(e) {
      const { from, type } = e.detail;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `📱 Telegram ${type} from **${from}** — replied via bot.` },
      ].slice(-50));
    }
    window.addEventListener('taski-telegram-message', handleTelegramMessage);
    return () => window.removeEventListener('taski-telegram-message', handleTelegramMessage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save after each assistant response (when loading transitions true→false)
  useEffect(() => {
    if (prevLoadingRef.current && !loading && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last?.role === 'assistant' && sessionIdRef.current) {
        chatHistory.saveMessage(sessionIdRef.current, last, messages);
      }
    }
    prevLoadingRef.current = loading;
  }, [loading, messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── TTS ───────────────────────────────────────────────────────────────────

  /**
   * Speak `text` via the shared ttsManager (the single source of truth for TTS state).
   * Sets visualizer to 'speaking' on start, 'idle' on end.
   * No-op if isMuted is true or audio is paused by another panel.
   */
  const speakText = useCallback((text) => {
    console.log('[ChatBot speakText] called:', {
      isMuted: isMutedRef.current,
      audioPausedBySystem,
      ttsEnabled: localStorage.getItem('taski_tts_enabled'),
      textLength: text?.length,
    });
    if (isMutedRef.current) {
      console.log('[ChatBot speakText] BLOCKED: muted');
      onVisualizerState?.('idle');
      return;
    }
    if (audioPausedBySystem) {
      console.log('[ChatBot speakText] BLOCKED: paused by system');
      return;
    }
    ttsSpeak(text);
  }, [onVisualizerState, audioPausedBySystem]);

  // Reflect ttsManager's actual speaking state onto the visualizer + isSpeaking flag
  useEffect(() => {
    function onSpeakingChange(e) {
      if (e.detail.speaking) { onVisualizerState?.('speaking'); setIsSpeaking(true); }
      else                   { onVisualizerState?.('idle');     setIsSpeaking(false); }
    }
    window.addEventListener('taski-tts-speaking', onSpeakingChange);
    return () => window.removeEventListener('taski-tts-speaking', onSpeakingChange);
  }, [onVisualizerState]);

  // ── Skill helpers ─────────────────────────────────────────────────────────

  function activateSkill(skill) {
    // /website opens the full-screen generator instead of adding an inline panel
    if (skill.trigger === '/website') {
      setShowSkillMenu(false);
      setInput('');
      openWebsiteGenerator?.('');
      return;
    }
    setActiveSkill(skill);
    setActiveSubcategory(null);
    setShowSkillMenu(false);
    setInput('');
    const msg = `TASKI: ${skill.name} mode activated. What would you like help with?`;
    setMessages((prev) => [...prev, { role: 'assistant', content: msg }].slice(-MAX_MESSAGES));
    speakText(msg);
  }

  function clearSkill() {
    setActiveSkill(null);
    setActiveSubcategory(null);
    setShowSkillMenu(false);
    setInput('');
    setWebSearchMode(false);
    const msg = 'TASKI: Returning to standard mode.';
    setMessages((prev) => [...prev, { role: 'assistant', content: msg }].slice(-MAX_MESSAGES));
    speakText(msg);
  }

  function toggleMute() {
    const newEnabled = !isTTSEnabled();
    setTTSEnabled(newEnabled);
    if (!newEnabled) ttsStop();
  }

  function startNewChat() {
    ttsStop();
    setMessages([]);
    setInput('');
    setError('');
    setViewingPast(null);
    setActiveSkill(null);
    setActiveSubcategory(null);
    setShowSkillMenu(false);
    setPendingEmailContext(null);
    setPendingFolderPlan(null);
    setUploadedFiles([]);
    setUploadingFile(null);
    setWebSearchMode(false);
    setIsSearching(false);
    sessionIdRef.current = chatHistory.startNewSession();
  }

  function handleSubcategoryClick(subcategory) {
    setActiveSubcategory(subcategory);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleInputChange(e) {
    const val = e.target.value;
    if (voiceAutoSubmitTimerRef.current) {
      clearTimeout(voiceAutoSubmitTimerRef.current);
      voiceAutoSubmitTimerRef.current = null;
    }
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

  // ── Forced route for disambiguation choice buttons ────────────────────────

  async function processMessageForced(originalQuery, forceRoute) {
    if (loading) return;
    setLoading(true);
    onVisualizerState?.('processing');
    ttsStop();

    const timezone2 = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now2      = new Date();
    const todayStr2 = now2.toLocaleDateString('en-US', {
      timeZone: timezone2, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const timeStr2 = now2.toLocaleTimeString('en-US', { timeZone: timezone2, timeStyle: 'short' });
    const dateCtx2 =
      `Today is ${todayStr2}. Current time is ${timeStr2}. ` +
      `User's timezone is ${timezone2}.\n` +
      `Always use this date when the user says "today", "yesterday", "this week", or "this month". ` +
      `Never ask the user what today's date is.`;

    let system2 = `${CHATBOT_SYSTEM}\n\n${dateCtx2}`;
    if (activeSkill) {
      system2 += `\n\n── ACTIVE SKILL: ${activeSkill.name} ──\n${activeSkill.prompt}`;
      if (activeSubcategory) {
        system2 += `\n\nActive mode: ${activeSubcategory.label}\nFocus specifically on ${activeSubcategory.label} for this conversation.`;
      }
    }
    const filesWithContent2 = uploadedFiles.filter((f) => f.content);
    if (filesWithContent2.length > 0) {
      const fileCtx2 = filesWithContent2.map((f) => `=== FILE: ${f.name} ===\n${f.content}`).join('\n\n');
      system2 += `\n\nThe user has uploaded the following documents. Use them to answer their questions accurately:\n\n${fileCtx2}`;
    }

    // Build API messages, skipping the disambiguation assistant message
    const apiMessages2 = messages
      .filter((m) => !m.meta?.isAmbiguous)
      .map(({ role, content }) => ({ role, content }));

    try {
      if (forceRoute === 'email') {
        if (!isAuthenticated()) {
          const reply = "To search your Gmail, please click the **GMAIL** button in the footer to connect your Google account first.";
          setMessages((prev) => [...prev, { role: 'assistant', content: reply }].slice(-MAX_MESSAGES));
          speakText(reply);
          return;
        }
        const query     = buildQuery(originalQuery);
        const emails    = await searchEmails(query);
        const emailBlk  = formatEmailsForPrompt(emails, query);
        system2 +=
          `\n\nThe user asked about their emails. Here are the matching emails found in their Gmail:\n\n` +
          `${emailBlk}\n\nEach email shows: sender, subject, date (already in user's local timezone ${timezone2}), ` +
          `and a preview. Answer naturally based on these results. If no emails were found, say so clearly. Never make up emails.`;
        const rawReply2 = await callClaude(apiMessages2, { system: system2 });
        const reply     = typeof rawReply2 === 'object' ? rawReply2.text : rawReply2;
        setMessages((prev) => [...prev, { role: 'assistant', content: reply, meta: { checked: 'gmail' } }].slice(-MAX_MESSAGES));
        speakText(reply);

      } else if (forceRoute === 'calendar') {
        if (!isAuthenticated()) {
          const reply = "To check your Google Calendar, please click the **CAL** button in the footer to connect your Google account first.";
          setMessages((prev) => [...prev, { role: 'assistant', content: reply }].slice(-MAX_MESSAGES));
          speakText(reply);
          return;
        }
        const tl2 = originalQuery.toLowerCase();
        let events2      = [];
        let periodLabel2 = 'today';
        if (tl2.includes('tomorrow') || tl2.includes('tmr') || tl2.includes('tmrw')) {
          events2      = await getTomorrowEvents();
          periodLabel2 = 'tomorrow';
        } else if (tl2.includes('next week')) {
          const nextMon2 = new Date(); nextMon2.setDate(nextMon2.getDate() + 7); nextMon2.setHours(0,0,0,0);
          const nextSun2 = new Date(nextMon2); nextSun2.setDate(nextMon2.getDate() + 6); nextSun2.setHours(23,59,59,999);
          events2      = await getCalendarEventsForRange(nextMon2, nextSun2);
          periodLabel2 = 'next week';
        } else if (tl2.includes('this week') || tl2.includes('week')) {
          events2      = await getThisWeekEvents();
          periodLabel2 = 'this week';
        } else if (tl2.includes('yesterday')) {
          const { start: s2, end: e2 } = detectDateRange(originalQuery);
          events2      = await getCalendarEventsForRange(s2, e2);
          periodLabel2 = 'yesterday';
        } else {
          events2      = await getTodayEvents();
          periodLabel2 = 'today';
        }
        const tz2 = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (events2.length > 0) {
          const lines2 = events2.map((e) => {
            if (e.allDay) return `• ${e.summary} — All day`;
            const s = new Date(e.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: tz2 });
            const en = e.end ? new Date(e.end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: tz2 }) : '';
            return `• ${e.summary}: ${s}${en ? ' to ' + en : ''}`;
          }).join('\n');
          system2 += `\n\n[CALENDAR DATA — ${periodLabel2.toUpperCase()}]\n${events2.length} event(s) fetched live:\n${lines2}\n[END CALENDAR DATA]\n\nMANDATORY: Report these events accurately. Do NOT say calendar access is unavailable.`;
        } else {
          system2 += `\n\n[CALENDAR DATA — ${periodLabel2.toUpperCase()}]\n0 events found for ${periodLabel2}.\n[END CALENDAR DATA]\n\nMANDATORY: Tell user there are no events for ${periodLabel2}. Do NOT say calendar is unavailable.`;
        }
        const rawReply2 = await callClaude(apiMessages2, { system: system2 });
        const reply     = typeof rawReply2 === 'object' ? rawReply2.text : rawReply2;
        setMessages((prev) => [...prev, { role: 'assistant', content: reply, meta: { checked: 'calendar' } }].slice(-MAX_MESSAGES));
        speakText(reply);

      } else {
        // forceRoute === 'chat' — plain Claude, no Google data
        const rawReply2 = await callClaude(apiMessages2, { system: system2 });
        const reply     = typeof rawReply2 === 'object' ? rawReply2.text : rawReply2;
        setMessages((prev) => [...prev, { role: 'assistant', content: reply }].slice(-MAX_MESSAGES));
        speakText(reply);
      }
    } catch (err) {
      setError(err.message);
      onVisualizerState?.('idle');
    } finally {
      setLoading(false);
    }
  }

  // ── Main send handler ─────────────────────────────────────────────────────

  async function handleSend(e) {
    e.preventDefault();
    if (voiceAutoSubmitTimerRef.current) {
      clearTimeout(voiceAutoSubmitTimerRef.current);
      voiceAutoSubmitTimerRef.current = null;
    }
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
    ttsStop();

    // ── Auto-expand panels based on message content ──────────────────────────
    const msgLower = text.toLowerCase();
    window.dispatchEvent(new CustomEvent('taski-expand-panel', { detail: { panel: 'chat' } }));
    if (isCalendarQuery(text) || CALENDAR_EXPAND_WORDS.some((w) => msgLower.includes(w))) {
      window.dispatchEvent(new CustomEvent('taski-expand-panel', { detail: { panel: 'calendar' } }));
    }
    if (TODO_EXPAND_WORDS.some((w) => msgLower.includes(w))) {
      window.dispatchEvent(new CustomEvent('taski-expand-panel', { detail: { panel: 'todo' } }));
    }

    // ════════════════════════════════════════════════════════════════════════
    // BRANCH BRIEFING — Morning briefing (before all other checks)
    // ════════════════════════════════════════════════════════════════════════
    {
      const isBriefingRequest = BRIEFING_PHRASES.some((p) => text.toLowerCase().includes(p));
      if (isBriefingRequest) {
        console.log('[TASKI] Route: MORNING BRIEFING');
        addMessage({
          role:    'assistant',
          content: '🌅 Preparing your morning briefing...\n\nFetching weather, calendar, tasks and emails...',
        });
        try {
          const { getMorningBriefing } = await import('../lib/morningBriefing.js');
          const briefingData = await getMorningBriefing({ city: 'Maharagama, Sri Lanka' });

          const briefingText = await callClaude(
            [{ role: 'user', content: briefingData.context }],
            { system: BRIEFING_SYSTEM, maxTokens: 800 }
          );

          removeLastMessage();
          addMessage({ role: 'assistant', content: briefingText || 'Could not generate briefing.', isBriefing: true });

          const short = briefingText.replace(/[#*`]/g, '').replace(/\n\n+/g, '. ').substring(0, 600);
          speakText(short);
        } catch (err) {
          console.error('[TASKI] Briefing error:', err);
          removeLastMessage();
          addMessage({
            role:    'assistant',
            content: `Could not complete morning briefing.\n\nError: ${err.message}\n\nMake sure Google Calendar and Gmail are connected in the footer.`,
          });
        } finally {
          setLoading(false);
        }
        return;
      }
    }

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

      // /website command — open the full-screen generator
      const websiteInlinePrompt = detectWebsiteRequest(text.trim());
      if (websiteInlinePrompt !== null) {
        openWebsiteGenerator?.(websiteInlinePrompt);
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
        // Merge active subcategory style into the prompt (e.g. Cartoon, Cinematic)
        if (activeSkill?.trigger === '/imagen' && activeSubcategory) {
          const stylePrefix = activeSubcategory.starter
            || `Generate a ${activeSubcategory.label.toLowerCase()} style image of: `;
          imgReq.prompt = stylePrefix + imgReq.prompt;
        }
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

    if (import.meta.env.DEV) console.log('TASKI Route Debug:', {
      message: text,
      isEmailQuery:     isEmailQuery(text),
      isCalendarQuery:  isCalendarQuery(text),
      isAmbiguousQuery: isAmbiguousQuery(text),
      webSearchMode,
    });

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
    // BRANCH 2.3 — Calendar ADD intent (create a new event)
    // ════════════════════════════════════════════════════════════════════════
    if (hasCalendarAddIntent(text)) {
      if (!isAuthenticated()) {
        const reply = "To add events to Google Calendar, please click the **CAL** button in the footer to connect your Google account first.";
        setMessages((prev) => [...prev, { role: 'assistant', content: reply }].slice(-MAX_MESSAGES));
        speakText(reply);
        setLoading(false);
        onVisualizerState?.('idle');
        return;
      }

      try {
        const details = await extractEventWithClaude(text, todayStr);
        if (!details?.title || !details?.date) throw new Error('PARSE_FAILED');

        await createCalendarEvent({
          title:   details.title,
          date:    details.date,
          time:    details.time    ?? null,
          endTime: details.endTime ?? null,
        });

        const displayDate = new Date(`${details.date}T12:00:00`).toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric',
        });
        const displayTime = details.time
          ? ` at ${new Date(`${details.date}T${details.time}:00`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : '';
        const reply = `Done. "${details.title}" has been added to your Google Calendar for ${displayDate}${displayTime}.`;
        setMessages((prev) => [...prev, { role: 'assistant', content: reply, meta: { checked: 'calendar' } }].slice(-MAX_MESSAGES));
        speakText(reply);
      } catch (err) {
        const msg = err.message === 'PARSE_FAILED'
          ? 'I could not understand the event details. Try something like: "Schedule a team meeting tomorrow at 2pm".'
          : `I could not create the event: ${err.message}`;
        setMessages((prev) => [...prev, { role: 'assistant', content: msg }].slice(-MAX_MESSAGES));
        speakText(msg);
      }

      setLoading(false);
      onVisualizerState?.('idle');
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
    // BRANCH 3 — 5-route: web search / email / calendar / ambiguous / chat
    // ════════════════════════════════════════════════════════════════════════
    try {
      let system = `${CHATBOT_SYSTEM}\n\n${dateContext}`;
      if (activeSkill) {
        system += `\n\n── ACTIVE SKILL: ${activeSkill.name} ──\n${activeSkill.prompt}`;
        if (activeSubcategory) {
          system += `\n\nActive mode: ${activeSubcategory.label}\nFocus specifically on ${activeSubcategory.label} for this conversation.`;
        }
      }
      const filesWithContent = uploadedFiles.filter((f) => f.content);
      if (filesWithContent.length > 0) {
        const fileContext = filesWithContent
          .map((f) => `=== FILE: ${f.name} ===\n${f.content}`)
          .join('\n\n');
        system += `\n\nThe user has uploaded the following documents. Use them to answer their questions accurately:\n\n${fileContext}`;
      }
      const apiMessages = next.map(({ role, content }) => ({ role, content }));

      // ── Route 1: Web search ──────────────────────────────────────────────
      if (webSearchMode) {
        setIsSearching(true);
        const rawReply = await callClaude(apiMessages, { system, useWebSearch: true, maxSearches: 5, maxTokens: 1500 });
        setIsSearching(false);
        const reply   = typeof rawReply === 'object' ? rawReply.text : rawReply;
        const sources = (typeof rawReply === 'object' && rawReply.sources) ? rawReply.sources : [];
        setMessages((prev) => [...prev, { role: 'assistant', content: reply, meta: { sources } }].slice(-MAX_MESSAGES));
        speakText(reply);
        return;
      }

      // ── Route 2: Email read ──────────────────────────────────────────────
      if (isEmailQuery(text) && !isAmbiguousQuery(text)) {
        if (!isAuthenticated()) {
          const reply = "To search your Gmail, please click the **GMAIL** button in the footer to connect your Google account first.";
          setMessages((prev) => [...prev, { role: 'assistant', content: reply }].slice(-MAX_MESSAGES));
          speakText(reply);
          onVisualizerState?.('idle');
          return;
        }
        let emailFailed = false;
        try {
          const query      = buildQuery(text);
          const emails     = await searchEmails(query);
          const emailBlock = formatEmailsForPrompt(emails, query);
          system +=
            `\n\nThe user asked about their emails. Here are the matching emails found in their Gmail:\n\n` +
            `${emailBlock}\n\nEach email shows: sender, subject, date (already in user's local timezone ${timezone}), ` +
            `and a preview. Answer naturally based on these results. If no emails were found, say so clearly. Never make up emails.`;
        } catch (emailErr) {
          emailFailed = true;
          const errMsg = emailErr.message ?? '';
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
            emailFailed = false; // fall through to Claude without email data
          }
          if (reply) { speakText(reply); return; }
        }
        if (!emailFailed) {
          const rawReply = await callClaude(apiMessages, { system });
          const reply    = typeof rawReply === 'object' ? rawReply.text : rawReply;
          setMessages((prev) => [...prev, { role: 'assistant', content: reply, meta: { checked: 'gmail' } }].slice(-MAX_MESSAGES));
          speakText(reply);
        }
        return;
      }

      // ── Route 3: Calendar read ───────────────────────────────────────────
      if (isCalendarQuery(text) && !isAmbiguousQuery(text)) {
        if (!isAuthenticated()) {
          const reply = "To check your Google Calendar, please click the **CAL** button in the footer to connect your Google account first.";
          setMessages((prev) => [...prev, { role: 'assistant', content: reply }].slice(-MAX_MESSAGES));
          speakText(reply);
          onVisualizerState?.('idle');
          return;
        }
        try {
          const tl = text.toLowerCase();

          // Determine the requested time period and use the correct specific helper.
          let events       = [];
          let periodLabel  = 'today';

          if (tl.includes('tomorrow') || tl.includes('tmr') || tl.includes('tmrw') || tl.includes('next day')) {
            console.log('[TASKI Calendar] Fetching TOMORROW events');
            events      = await getTomorrowEvents();
            periodLabel = 'tomorrow';
          } else if (tl.includes('next week')) {
            console.log('[TASKI Calendar] Fetching NEXT WEEK events');
            const nextMon = new Date(); nextMon.setDate(nextMon.getDate() + 7); nextMon.setHours(0,0,0,0);
            const nextSun = new Date(nextMon); nextSun.setDate(nextMon.getDate() + 6); nextSun.setHours(23,59,59,999);
            events      = await getCalendarEventsForRange(nextMon, nextSun);
            periodLabel = 'next week';
          } else if (tl.includes('this week') || tl.includes('week') || tl.includes('next 7 days') || tl.includes('coming days')) {
            console.log('[TASKI Calendar] Fetching THIS WEEK events');
            events      = await getThisWeekEvents();
            periodLabel = 'this week';
          } else if (tl.includes('yesterday')) {
            console.log('[TASKI Calendar] Fetching YESTERDAY events');
            const { start, end } = detectDateRange(text);
            events      = await getCalendarEventsForRange(start, end);
            periodLabel = 'yesterday';
          } else if (tl.includes('today') || tl.includes("today's") || tl.includes('this morning') || tl.includes('tonight') || tl.includes('schedule')) {
            console.log('[TASKI Calendar] Fetching TODAY events');
            events      = await getTodayEvents();
            periodLabel = 'today';
          } else {
            // Generic calendar question (e.g. "do I have any meetings?") — fetch today + tomorrow
            console.log('[TASKI Calendar] Fetching TODAY + TOMORROW events (default)');
            const [todayEvts, tomorrowEvts] = await Promise.all([getTodayEvents(), getTomorrowEvents()]);
            events      = [...todayEvts, ...tomorrowEvts];
            periodLabel = 'today and tomorrow';
          }

          console.log(`[TASKI Calendar] Got ${events.length} event(s) for "${periodLabel}"`);
          if (import.meta.env.DEV) {
            events.forEach((e) => console.log('  -', e.summary, e.start ?? e.allDay ? '(all day)' : ''));
          }

          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

          if (events.length > 0) {
            const eventLines = events.map((e) => {
              if (e.allDay) {
                const d = new Date(`${e.start}T00:00:00`);
                return `• ${e.summary} — All day on ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz })}`;
              }
              const startDt = new Date(e.start);
              const endDt   = e.end ? new Date(e.end) : null;
              const dayStr  = startDt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz });
              const startT  = startDt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: tz });
              const endT    = endDt ? endDt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: tz }) : '';
              return `• ${e.summary} — ${dayStr}, ${startT}${endT ? ' to ' + endT : ''}`;
            }).join('\n');

            system +=
              `\n\n[CALENDAR DATA — ${periodLabel.toUpperCase()}]\n` +
              `The following ${events.length} event(s) were just fetched LIVE from the user's Google Calendar:\n` +
              `${eventLines}\n` +
              `[END CALENDAR DATA]\n\n` +
              `MANDATORY INSTRUCTIONS:\n` +
              `- Report these ${events.length} event(s) to the user accurately\n` +
              `- Include the day and time for each event\n` +
              `- Do NOT say you cannot access calendar data — you have it above\n` +
              `- Do NOT say live sync is needed — calendar IS connected and data IS live`;
          } else {
            system +=
              `\n\n[CALENDAR DATA — ${periodLabel.toUpperCase()}]\n` +
              `Google Calendar was queried successfully and returned 0 events for ${periodLabel}.\n` +
              `[END CALENDAR DATA]\n\n` +
              `MANDATORY INSTRUCTIONS:\n` +
              `- Tell the user: no events scheduled for ${periodLabel}\n` +
              `- Do NOT say you cannot access the calendar — it IS connected and returned 0 results\n` +
              `- Do NOT say live sync is needed\n` +
              `- You may offer to check a different time period`;
          }
        } catch (calErr) {
          console.error('[TASKI Calendar] Error:', calErr);
          const msg   = calErr.message ?? 'Unknown error';
          const reply = msg.toLowerCase().includes('cancel')
            ? "I need access to your Google Calendar to answer that. Please try again and complete the sign-in when prompted."
            : `I was unable to load your calendar just now (${msg}). Please try again in a moment.`;
          setMessages((prev) => [...prev, { role: 'assistant', content: reply }].slice(-MAX_MESSAGES));
          speakText(reply);
          return;
        }
        const rawReply = await callClaude(apiMessages, { system });
        const reply    = typeof rawReply === 'object' ? rawReply.text : rawReply;
        setMessages((prev) => [...prev, { role: 'assistant', content: reply, meta: { checked: 'calendar' } }].slice(-MAX_MESSAGES));
        speakText(reply);
        return;
      }

      // ── Route 4: Ambiguous — ask user to choose ──────────────────────────
      if (isAmbiguousQuery(text)) {
        const reply = "This could be about your **email** or your **calendar**. Which would you like me to check?";
        setMessages((prev) => [...prev, {
          role:    'assistant',
          content: reply,
          meta:    { isAmbiguous: true, originalQuery: text },
        }].slice(-MAX_MESSAGES));
        speakText("This could be about your email or your calendar. Which would you like me to check?");
        onVisualizerState?.('idle');
        return;
      }

      // ── Route 5: Normal Claude ───────────────────────────────────────────
      const rawReply = await callClaude(apiMessages, { system });
      const reply    = typeof rawReply === 'object' ? rawReply.text : rawReply;
      const sources  = (typeof rawReply === 'object' && rawReply.sources) ? rawReply.sources : [];
      setMessages((prev) => [...prev, { role: 'assistant', content: reply, meta: { sources } }].slice(-MAX_MESSAGES));
      speakText(reply);

    } catch (err) {
      setIsSearching(false);
      setError(err.message);
      onVisualizerState?.('idle');
    } finally {
      setLoading(false);
      // visualizer goes to 'speaking' via TTS onstart, or 'idle' via TTS onend.
      // if muted, speakText() calls onVisualizerState('idle') directly.
    }
  }

  // Keep ref current so the voice auto-submit timer always calls the latest version
  handleSendRef.current = handleSend;

  // ── triggerBriefing — called by header button or auto-briefing event ──────

  async function triggerBriefing() {
    if (loading) return;
    ttsStop();
    setLoading(true);
    onVisualizerState?.('processing');
    setMessages((prev) => [
      ...prev,
      { role: 'user',      content: 'morning briefing' },
      { role: 'assistant', content: '🌅 Preparing your morning briefing...\n\nFetching weather, calendar, tasks and emails...' },
    ].slice(-MAX_MESSAGES));
    try {
      const { getMorningBriefing } = await import('../lib/morningBriefing.js');
      const briefingData = await getMorningBriefing({ city: 'Maharagama, Sri Lanka' });

      const briefingText = await callClaude(
        [{ role: 'user', content: briefingData.context }],
        { system: BRIEFING_SYSTEM, maxTokens: 800 }
      );

      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: briefingText || 'Could not generate briefing.', isBriefing: true },
      ]);

      const short = briefingText.replace(/[#*`]/g, '').replace(/\n\n+/g, '. ').substring(0, 600);
      speakText(short);
    } catch (err) {
      console.error('[TASKI] Briefing error:', err);
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role:    'assistant',
          content: `Could not complete morning briefing.\n\nError: ${err.message}\n\nMake sure Google Calendar and Gmail are connected in the footer.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  triggerBriefingRef.current = triggerBriefing;

  // ── RAG file upload ───────────────────────────────────────────────────────

  function addMessage(msg) {
    setMessages((prev) => [...prev, msg].slice(-MAX_MESSAGES));
  }

  function removeLastMessage() {
    setMessages((prev) => prev.slice(0, -1));
  }

  // Read a browser File object as text (txt / md). Returns null for unsupported types.
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      if (!file.name.match(/\.(txt|md)$/i)) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload  = (e) => resolve(e.target.result);
      reader.onerror = ()  => reject(new Error('Could not read file'));
      reader.readAsText(file);
    });
  }

  // Process a single browser File object — used when Electron RAG is not available.
  async function processFileObject(file) {
    const fileName = file.name;
    setUploadingFile(fileName);
    addMessage({ role: 'user', content: `📎 Uploading: ${fileName}` });

    try {
      if (file.name.match(/\.pdf$/i)) {
        setUploadingFile(null);
        addMessage({
          role:    'assistant',
          content: `PDF files require the Taski desktop app with Python RAG.\nTXT and Markdown files work directly — try converting ${fileName} to .txt first.`,
        });
        return;
      }

      const content = await readFileAsText(file);
      setUploadingFile(null);

      if (content === null) {
        addMessage({ role: 'assistant', content: `Unsupported file type: ${fileName}. Use TXT or Markdown files.` });
        return;
      }

      const preview = content.length > 200 ? content.slice(0, 200) + '…' : content;
      setUploadedFiles((prev) => [...prev, { name: fileName, content }]);
      addMessage({
        role:    'assistant',
        content: `✓ **${fileName}** loaded (${content.length.toLocaleString()} characters).\n\n> ${preview}\n\nYou can now ask me questions about this document!`,
      });
    } catch (e) {
      setUploadingFile(null);
      addMessage({ role: 'assistant', content: `Upload failed: ${e.message}` });
    }
  }

  async function handleFileUpload() {
    // Electron path: use native OS file picker + Python RAG ingestion
    if (window.taskiAPI?.ragOpenFiles) {
      const result = await window.taskiAPI.ragOpenFiles();
      if (result.canceled || !result.filePaths?.length) return;

      for (const filePath of result.filePaths) {
        const fileName = filePath.split(/[/\\]/).pop();
        setUploadingFile(fileName);
        addMessage({ role: 'user', content: `📎 Uploading: ${fileName}` });

        try {
          const ingestResult = await window.taskiAPI.ragIngest([filePath]);
          setUploadingFile(null);
          if (ingestResult.error) {
            addMessage({ role: 'assistant', content: `Could not process ${fileName}: ${ingestResult.error}` });
          } else {
            setUploadedFiles((prev) => [...prev, { name: fileName, path: filePath }]);
            addMessage({
              role:    'assistant',
              content: `✓ **${fileName}** added to knowledge base. ${ingestResult.chunks_added || ''} chunks indexed.\n\nYou can now ask me questions about this document!`,
            });
          }
        } catch (e) {
          setUploadingFile(null);
          addMessage({ role: 'assistant', content: `Upload failed: ${e.message}` });
        }
      }
      return;
    }

    // Browser fallback: open native file picker, read content via FileReader
    fileInputRef.current?.click();
  }

  async function handleNativeFileChange(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of files) {
      await processFileObject(file);
    }
  }

  function removeUploadedFile(index) {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleFileDrop(e) {
    e.preventDefault();
    setIsDragging(false);

    const files     = Array.from(e.dataTransfer.files);
    const supported = files.filter((f) => f.name.match(/\.(pdf|txt|md)$/i));

    if (supported.length === 0) {
      addMessage({ role: 'assistant', content: 'Only PDF, TXT, and MD files are supported.' });
      return;
    }

    // Electron path: use file paths + Python RAG
    if (window.taskiAPI?.ragIngest) {
      const paths = supported.map((f) => f.path).filter(Boolean);
      for (const filePath of paths) {
        const fileName = filePath.split(/[/\\]/).pop();
        setUploadingFile(fileName);
        addMessage({ role: 'user', content: `📎 Dropped: ${fileName}` });

        try {
          const result = await window.taskiAPI.ragIngest([filePath]);
          setUploadingFile(null);
          if (!result.error) {
            setUploadedFiles((prev) => [...prev, { name: fileName, path: filePath }]);
            addMessage({ role: 'assistant', content: `✓ **${fileName}** ready! Ask me anything about it.` });
          } else {
            addMessage({ role: 'assistant', content: `Could not process ${fileName}: ${result.error}` });
          }
        } catch (e) {
          setUploadingFile(null);
          addMessage({ role: 'assistant', content: `Upload failed: ${e.message}` });
        }
      }
      return;
    }

    // Browser fallback: read file content directly
    for (const file of supported) {
      await processFileObject(file);
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
        position:       'relative',
      }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false); }}
      onDrop={handleFileDrop}
    >
      {/* ── Drag-and-drop overlay ── */}
      {isDragging && (
        <div style={{
          position:       'absolute',
          inset:          0,
          background:     'rgba(0,212,255,0.06)',
          border:         '2px dashed rgba(0,212,255,0.5)',
          borderRadius:   '8px',
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          zIndex:         50,
          pointerEvents:  'none',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
          <div style={{ color: '#00d4ff', fontFamily: 'Rajdhani', fontSize: '14px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            DROP TO ADD TO KNOWLEDGE BASE
          </div>
          <div style={{ color: 'rgba(0,212,255,0.4)', fontFamily: 'Rajdhani', fontSize: '11px', marginTop: '4px' }}>
            PDF · TXT · Markdown
          </div>
        </div>
      )}

      {/* ── History panel (absolutely positioned overlay) ── */}
      {historyOpen && (
        <ChatHistoryPanel
          sessions={chatHistory.sessions}
          onClose={() => setHistoryOpen(false)}
          onView={(session) => {
            setMessages(session.messages);
            setViewingPast(session);
            setHistoryOpen(false);
          }}
          onExport={(sessionId) => chatHistory.exportSession(sessionId)}
          onDelete={(sessionId) => chatHistory.deleteSession(sessionId)}
        />
      )}

      {/* ── Collapsed compact header ── */}
      {isCollapsed && (
        <div style={{
          height:          '32px',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'space-between',
          padding:         '0 10px',
          borderBottom:    '1px solid rgba(0,212,255,0.1)',
          flexShrink:      0,
          background:      'rgba(0,212,255,0.02)',
        }}>
          <span style={{
            fontFamily:    "'Orbitron', sans-serif",
            fontSize:      '10px',
            color:         '#00d4ff',
            letterSpacing: '0.1em',
          }}>TASKI</span>
          <button
            onClick={onExpand}
            aria-label="Expand chat"
            style={{
              background: 'transparent',
              border:     '1px solid rgba(0,212,255,0.25)',
              borderRadius: '50%',
              width:      '22px',
              height:     '22px',
              cursor:     'pointer',
              color:      '#00d4ff',
              fontSize:   '12px',
              display:    'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding:    0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,212,255,0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            ↑
          </button>
        </div>
      )}

      {/* ── Last message preview when collapsed ── */}
      {isCollapsed && messages.length > 0 && (
        <div style={{
          flex:          1,
          padding:       '6px 10px',
          fontSize:      '10px',
          color:         'rgba(0,212,255,0.3)',
          fontFamily:    "'Rajdhani', sans-serif",
          overflow:      'hidden',
          textOverflow:  'ellipsis',
          whiteSpace:    'nowrap',
          display:       'flex',
          alignItems:    'center',
          cursor:        'pointer',
          minHeight:     0,
        }}
        onClick={onExpand}
        >
          {(messages[messages.length - 1]?.content ?? '').substring(0, 60)}
          {(messages[messages.length - 1]?.content?.length ?? 0) > 60 ? '…' : ''}
        </div>
      )}

      {/* ── Full header (when expanded) ── */}
      {!isCollapsed && (
      <div
        style={{
          padding:      '18px 20px 14px',
          borderBottom: '1px solid rgba(0,212,255,0.12)',
          background:   'rgba(0,212,255,0.02)',
          flexShrink:   0,
        }}
      >
        {viewingPast ? (
          /* ── Past-session header ── */
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <button
              onClick={() => { setMessages([]); setViewingPast(null); sessionIdRef.current = chatHistory.startNewSession(); }}
              style={{
                display:       'flex',
                alignItems:    'center',
                gap:           '4px',
                padding:       '4px 10px',
                border:        '1px solid rgba(0,212,255,0.3)',
                borderRadius:  '4px',
                color:         '#00d4ff',
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '11px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor:        'pointer',
                background:    'transparent',
                transition:    'all 0.2s',
                flexShrink:    0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,212,255,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              ← BACK
            </button>
            <div style={{
              flex:          1,
              fontFamily:    "'Rajdhani', sans-serif",
              fontSize:      '11px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color:         'rgba(0,212,255,0.5)',
              textAlign:     'center',
            }}>
              PAST CHAT · {new Date(viewingPast.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
            <button
              onClick={() => setHistoryOpen(true)}
              aria-label="View chat history"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: '4px', display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'color 200ms' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-neon-cyan)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
            >
              <Clock size={16} aria-hidden="true" />
            </button>
          </div>
        ) : (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
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

        {/* Dynamic header badges: CLAUDE AI · skill · WEB SEARCH */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px', flexWrap: 'wrap' }}>
          {/* Always-on CLAUDE AI badge */}
          <div
            style={{
              fontFamily:    "'Rajdhani', sans-serif",
              fontSize:      '10px',
              fontWeight:    600,
              letterSpacing: '0.15em',
              color:         'rgba(0,212,255,0.35)',
              textTransform: 'uppercase',
              background:    'rgba(0,212,255,0.04)',
              border:        '1px solid rgba(0,212,255,0.12)',
              borderRadius:  '3px',
              padding:       '2px 6px',
            }}
          >
            CLAUDE AI
          </div>

          {/* Active skill badge */}
          {activeSkill && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <div
                style={{
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '10px',
                  fontWeight:    600,
                  letterSpacing: '0.12em',
                  color:         '#00d4ff',
                  textTransform: 'uppercase',
                  background:    'rgba(0,212,255,0.1)',
                  border:        '1px solid rgba(0,212,255,0.35)',
                  borderRadius:  '3px',
                  padding:       '2px 7px',
                }}
              >
                {activeSkill.icon} {activeSkill.trigger.slice(1).toUpperCase()}
              </div>
              <button
                onClick={clearSkill}
                aria-label="Clear active skill"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(0,212,255,0.4)', fontSize: '12px', lineHeight: 1,
                  padding: '0 2px', transition: 'color 150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ff2d55'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(0,212,255,0.4)'; }}
              >×</button>
            </div>
          )}

          {/* Web search badge */}
          {webSearchMode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <div
                style={{
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '10px',
                  fontWeight:    600,
                  letterSpacing: '0.12em',
                  color:         '#00d4ff',
                  textTransform: 'uppercase',
                  background:    'rgba(0,212,255,0.12)',
                  border:        '1px solid #00d4ff',
                  borderRadius:  '3px',
                  padding:       '2px 7px',
                  boxShadow:     '0 0 8px rgba(0,212,255,0.15)',
                }}
              >
                🌐 WEB
              </div>
              <button
                onClick={() => setWebSearchMode(false)}
                aria-label="Disable web search"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(0,212,255,0.4)', fontSize: '12px', lineHeight: 1,
                  padding: '0 2px', transition: 'color 150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ff2d55'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(0,212,255,0.4)'; }}
              >×</button>
            </div>
          )}
        </div>
          </div>

          {/* Header icon buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <button
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute voice' : 'Mute voice'}
              title={isMuted ? 'Voice is OFF — click to enable' : 'Voice is ON — click to mute'}
              style={{
                background:   isMuted ? 'rgba(255,68,68,0.08)' : 'transparent',
                border:       `1px solid ${isMuted ? 'rgba(255,68,68,0.35)' : 'rgba(0,212,255,0.25)'}`,
                borderRadius: '4px',
                color:        isMuted ? 'rgba(255,68,68,0.75)' : 'rgba(0,212,255,0.75)',
                width:        '26px',
                height:       '26px',
                cursor:       'pointer',
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'center',
                fontSize:     '13px',
                flexShrink:   0,
                transition:   'all 0.15s',
              }}
            >
              {isMuted ? '🔇' : '🔊'}
            </button>
            <button
              onClick={startNewChat}
              aria-label="New chat"
              title="New chat"
              style={{
                background:  'none',
                border:      'none',
                cursor:      'pointer',
                color:       'var(--color-text-secondary)',
                padding:     '4px',
                display:     'flex',
                alignItems:  'center',
                transition:  'color 200ms, text-shadow 200ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color      = 'var(--color-neon-cyan)';
                e.currentTarget.style.textShadow = '0 0 8px rgba(0,212,255,0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color      = 'var(--color-text-secondary)';
                e.currentTarget.style.textShadow = 'none';
              }}
            >
              <SquarePen size={16} aria-hidden="true" />
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              aria-label="View chat history"
              style={{
                background:  'none',
                border:      'none',
                cursor:      'pointer',
                color:       'var(--color-text-secondary)',
                padding:     '4px',
                display:     'flex',
                alignItems:  'center',
                transition:  'color 200ms, text-shadow 200ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color      = 'var(--color-neon-cyan)';
                e.currentTarget.style.textShadow = '0 0 8px rgba(0,212,255,0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color      = 'var(--color-text-secondary)';
                e.currentTarget.style.textShadow = 'none';
              }}
            >
              <Clock size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        )}
      </div>
      )}{/* end !isCollapsed header */}

      {/* ── Messages area (hidden when collapsed) ── */}
      {!isCollapsed && (
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
        {/* Viewing past chat banner */}
        {viewingPast && (
          <div style={{
            padding:      '8px 12px',
            background:   'var(--color-neon-orange-glow)',
            border:       '1px solid var(--color-neon-orange)',
            borderRadius: '4px',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'space-between',
            gap:          '8px',
            flexShrink:   0,
          }}>
            <div style={{
              fontFamily:    "'Rajdhani', sans-serif",
              fontSize:      '11px',
              fontWeight:    600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color:         'var(--color-neon-orange)',
            }}>
              VIEWING PAST CHAT —{' '}
              {new Date(viewingPast.startedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
            <button
              onClick={() => {
                setMessages([]);
                setViewingPast(null);
                sessionIdRef.current = chatHistory.startNewSession();
              }}
              style={{
                background:    'rgba(255,107,0,0.15)',
                border:        '1px solid var(--color-neon-orange)',
                borderRadius:  '3px',
                padding:       '3px 8px',
                cursor:        'pointer',
                color:         'var(--color-neon-orange)',
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '10px',
                fontWeight:    600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                whiteSpace:    'nowrap',
                flexShrink:    0,
              }}
            >
              START NEW CHAT
            </button>
          </div>
        )}

        {/* ── Skill + web search tip banner ── */}
        {activeSkill && webSearchMode && (
          <div
            style={{
              padding:      '5px 12px',
              background:   'rgba(0,212,255,0.04)',
              border:       '1px solid rgba(0,212,255,0.12)',
              borderRadius: '4px',
              fontSize:     '11px',
              fontFamily:   "'Rajdhani', sans-serif",
              letterSpacing:'0.05em',
              color:        'rgba(0,212,255,0.45)',
              flexShrink:   0,
              display:      'flex',
              alignItems:   'center',
              gap:          '6px',
            }}
          >
            <span style={{ color: '#00d4ff', fontSize: '12px', flexShrink: 0 }}>💡</span>
            {activeSkill.name} skill + web search active — Claude will search the web using {activeSkill.name.toLowerCase()} context
          </div>
        )}

        {/* ── Skill header bar ── */}
        {activeSkill && (
          <div
            style={{
              background:   'rgba(0,212,255,0.05)',
              border:       '1px solid rgba(0,212,255,0.2)',
              borderRadius: '8px',
              padding:      '10px 14px',
              marginBottom: '4px',
              flexShrink:   0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px', lineHeight: 1 }}>{activeSkill.icon || '⚡'}</span>
                <span
                  style={{
                    fontFamily:    "'Orbitron', sans-serif",
                    fontSize:      '11px',
                    fontWeight:    700,
                    letterSpacing: '0.1em',
                    color:         '#00d4ff',
                    textTransform: 'uppercase',
                  }}
                >
                  {activeSkill.name}
                </span>
              </div>
              <button
                type="button"
                onClick={clearSkill}
                aria-label="Deactivate skill"
                style={{
                  background:  'none',
                  border:      'none',
                  cursor:      'pointer',
                  color:       'rgba(0,212,255,0.4)',
                  fontSize:    '18px',
                  lineHeight:  1,
                  padding:     '0 4px',
                  transition:  'color 150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ff2d55'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(0,212,255,0.4)'; }}
              >
                ×
              </button>
            </div>
            <div
              style={{
                fontFamily:  "'Rajdhani', sans-serif",
                fontSize:    '11px',
                color:       'rgba(0,212,255,0.5)',
                marginTop:   '3px',
              }}
            >
              {activeSkill.description}
            </div>
            {/* Subcategory pills */}
            {activeSkill.subcategories?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {activeSkill.subcategories.map((sc) => {
                  const isActive = activeSubcategory?.value === sc.value;
                  return (
                    <button
                      key={sc.value}
                      type="button"
                      onClick={() => handleSubcategoryClick(sc)}
                      style={{
                        background:   isActive ? 'rgba(0,212,255,0.2)'  : 'rgba(0,212,255,0.06)',
                        border:       isActive ? '1px solid #00d4ff'    : '1px solid rgba(0,212,255,0.2)',
                        borderRadius: '20px',
                        padding:      '4px 12px',
                        fontSize:     '11px',
                        fontFamily:   "'Rajdhani', sans-serif",
                        color:        isActive ? '#00d4ff'               : 'rgba(0,212,255,0.7)',
                        cursor:       'pointer',
                        transition:   'all 0.15s',
                        letterSpacing:'0.05em',
                        boxShadow:    isActive ? '0 0 8px rgba(0,212,255,0.2)' : 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background   = 'rgba(0,212,255,0.15)';
                          e.currentTarget.style.borderColor  = 'rgba(0,212,255,0.6)';
                          e.currentTarget.style.color        = '#00d4ff';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background   = 'rgba(0,212,255,0.06)';
                          e.currentTarget.style.borderColor  = 'rgba(0,212,255,0.2)';
                          e.currentTarget.style.color        = 'rgba(0,212,255,0.7)';
                        }
                      }}
                    >
                      {sc.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {messages.length === 0 && !viewingPast && (
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
                  maxWidth:      '84%',
                  display:       'flex',
                  flexDirection: 'column',
                  alignItems:    'flex-start',
                  gap:           '3px',
                }}
              >
                <SourceTag checked={msg.meta?.checked} />
                <ChatMessage
                  message={msg.content}
                  role="assistant"
                  sources={msg.meta?.sources}
                  reconnectGmail={msg.meta?.reconnectGmail}
                  onReconnectGoogle={handleReconnectGoogle}
                  meta={msg.meta}
                  onAmbiguousChoice={processMessageForced}
                />
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
              }}
            >
              <span
                style={{
                  fontFamily:    "'Orbitron', sans-serif",
                  fontSize:      '9px',
                  fontWeight:    700,
                  letterSpacing: '0.15em',
                  color:         '#00d4ff',
                  display:       'block',
                  marginBottom:  '6px',
                  opacity:       0.7,
                }}
              >
                TASKI
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width:        '6px',
                      height:       '6px',
                      borderRadius: '50%',
                      background:   '#00d4ff',
                      display:      'inline-block',
                      animation:    `typingDot 1.2s ${i * 0.2}s ease-in-out infinite`,
                    }}
                  />
                ))}
              </div>
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
      )}{/* end !isCollapsed messages */}

      {/* ── Input area (always visible) ── */}
      <form
        onSubmit={handleSend}
        style={{
          padding:       isCollapsed ? '6px 8px' : '12px 14px 16px',
          borderTop:     '1px solid rgba(0,212,255,0.12)',
          flexShrink:    0,
          minHeight:     isCollapsed ? 'unset' : '60px',
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
              background:   'rgba(2,15,35,0.97)',
              border:       '1px solid rgba(0,212,255,0.25)',
              borderRadius: '8px',
              maxHeight:    '320px',
              overflowY:    'auto',
              zIndex:       1000,
              boxShadow:    '0 -8px 32px rgba(0,0,0,0.6)',
              padding:      '4px',
            }}
          >
            {filteredSkills.map((skill, idx) => (
              <button
                key={skill.trigger}
                type="button"
                onClick={() => activateSkill(skill)}
                style={{
                  display:     'flex',
                  alignItems:  'center',
                  gap:         '10px',
                  width:       '100%',
                  padding:     '8px 12px',
                  background:  idx === skillMenuIndex ? 'rgba(0,212,255,0.08)' : 'transparent',
                  border:      'none',
                  borderLeft:  idx === skillMenuIndex ? '2px solid #00d4ff' : '2px solid transparent',
                  borderRadius:'6px',
                  cursor:      'pointer',
                  textAlign:   'left',
                  transition:  'background 0.15s',
                }}
                onMouseEnter={() => setSkillMenuIndex(idx)}
              >
                <span
                  style={{
                    fontSize:   '16px',
                    width:      '24px',
                    textAlign:  'center',
                    flexShrink: 0,
                    lineHeight: 1,
                  }}
                >
                  {skill.icon || '⚡'}
                </span>
                <span
                  style={{
                    fontFamily:    "'Rajdhani', sans-serif",
                    fontSize:      '13px',
                    fontWeight:    500,
                    letterSpacing: '0.04em',
                    color:         '#00d4ff',
                    minWidth:      '90px',
                    flexShrink:    0,
                  }}
                >
                  {skill.trigger}
                </span>
                <span
                  style={{
                    fontFamily:  "'Rajdhani', sans-serif",
                    fontSize:    '12px',
                    color:       'rgba(255,255,255,0.8)',
                    flex:        1,
                    letterSpacing: '0.01em',
                  }}
                >
                  {skill.name}
                </span>
                <span
                  style={{
                    fontFamily:   "'Rajdhani', sans-serif",
                    fontSize:     '11px',
                    color:        'rgba(0,212,255,0.4)',
                    flexShrink:   0,
                    maxWidth:     '110px',
                    overflow:     'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace:   'nowrap',
                    marginLeft:   'auto',
                  }}
                >
                  {skill.description}
                </span>
              </button>
            ))}
            {/* Count indicator */}
            <div
              style={{
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '10px',
                color:         'rgba(0,212,255,0.3)',
                textAlign:     'center',
                padding:       '4px 8px',
                letterSpacing: '0.04em',
                borderTop:     '1px solid rgba(0,212,255,0.08)',
                marginTop:     '2px',
              }}
            >
              {skillFilter
                ? `${filteredSkills.length} of ${ALL_SKILLS.length} skills`
                : `Showing all ${ALL_SKILLS.length} skills`}
            </div>
          </div>
        )}

        {/* Active subcategory style badge */}
        {activeSubcategory && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', paddingLeft: '2px' }}>
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(0,212,255,0.5)' }}>
              Style:
            </span>
            <span style={{
              fontFamily:    "'Rajdhani', sans-serif",
              fontSize:      '10px',
              fontWeight:    600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color:         '#00d4ff',
              background:    'rgba(0,212,255,0.12)',
              border:        '1px solid rgba(0,212,255,0.35)',
              borderRadius:  '20px',
              padding:       '2px 10px',
            }}>
              {activeSubcategory.label}
            </span>
            <button
              type="button"
              onClick={() => setActiveSubcategory(null)}
              aria-label="Clear style"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,212,255,0.35)', fontSize: '13px', lineHeight: 1, padding: '0 2px', transition: 'color 150ms' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ff2d55'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(0,212,255,0.35)'; }}
            >
              ×
            </button>
          </div>
        )}

        {/* Recording indicator */}
        {speech.isListening && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px', paddingLeft: '2px' }}>
            <span style={{ color: 'var(--color-danger)', fontSize: '9px', animation: 'recordPulse 0.8s ease-in-out infinite', lineHeight: 1 }} aria-hidden="true">●</span>
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-danger)' }}>
              RECORDING... click ⏹ to stop
            </span>
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '9px', letterSpacing: '0.06em', color: 'rgba(0,212,255,0.35)', marginLeft: '6px' }}>
              auto-stops at 15s
            </span>
          </div>
        )}

        {/* Transcribing indicator */}
        {speech.isProcessing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px', paddingLeft: '2px' }}>
            <span style={{ color: '#ffaa00', fontSize: '9px', animation: 'recordPulse 0.5s ease-in-out infinite', lineHeight: 1 }} aria-hidden="true">●</span>
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#ffaa00' }}>
              ⏳ TRANSCRIBING WITH CLAUDE AI...
            </span>
          </div>
        )}

        {/* Speaking indicator */}
        {isSpeaking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px', paddingLeft: '2px' }}>
            <span style={{ color: '#00d4ff', fontSize: '9px', animation: 'glowPulse 1s ease-in-out infinite', lineHeight: 1 }} aria-hidden="true">●</span>
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#00d4ff' }}>
              TASKI SPEAKING…
            </span>
          </div>
        )}

        {/* Web search active banner */}
        {webSearchMode && (
          <div style={{
            padding:        '4px 12px',
            background:     'rgba(0,212,255,0.05)',
            borderTop:      '1px solid rgba(0,212,255,0.15)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            fontSize:       '10px',
            fontFamily:     "'Rajdhani', sans-serif",
            letterSpacing:  '0.08em',
            marginBottom:   '6px',
          }}>
            <span style={{ color: '#00d4ff', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{
                width:      '5px',
                height:     '5px',
                borderRadius: '50%',
                background:   '#00d4ff',
                boxShadow:    '0 0 6px #00d4ff',
                display:      'inline-block',
                flexShrink:   0,
              }} />
              WEB SEARCH ACTIVE
            </span>
            <span
              style={{ color: 'rgba(0,212,255,0.4)', cursor: 'pointer', fontSize: '11px' }}
              onClick={() => setWebSearchMode(false)}
            >
              TURN OFF
            </span>
          </div>
        )}

        {/* Searching indicator */}
        {isSearching && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', paddingLeft: '2px' }}>
            <span style={{ display: 'flex', gap: '2px' }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{
                  width:        '4px',
                  height:       '4px',
                  borderRadius: '50%',
                  background:   '#00d4ff',
                  display:      'inline-block',
                  animation:    `glowPulse 1s ${i * 0.2}s ease-in-out infinite`,
                }} />
              ))}
            </span>
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#00d4ff' }}>
              SEARCHING THE WEB...
            </span>
          </div>
        )}

        {/* Uploading status bar */}
        {uploadingFile && (
          <div style={{
            padding:     '5px 10px',
            background:  'rgba(0,212,255,0.05)',
            borderTop:   '1px solid rgba(0,212,255,0.1)',
            display:     'flex',
            alignItems:  'center',
            gap:         '8px',
            fontSize:    '11px',
            color:       '#00d4ff',
            fontFamily:  'Rajdhani',
            letterSpacing: '0.08em',
            marginBottom: '6px',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00d4ff', animation: 'glowPulse 0.8s infinite', flexShrink: 0, display: 'inline-block' }} />
            PROCESSING {uploadingFile}...
          </div>
        )}

        {/* Uploaded file chips */}
        {uploadedFiles.length > 0 && !uploadingFile && (
          <div style={{ padding: '5px 0', borderTop: '1px solid rgba(0,212,255,0.1)', display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
            {uploadedFiles.map((file, i) => (
              <div key={i} style={{
                background:   'rgba(0,212,255,0.08)',
                border:       '1px solid rgba(0,212,255,0.25)',
                borderRadius: '12px',
                padding:      '2px 8px',
                fontSize:     '10px',
                color:        'rgba(0,212,255,0.7)',
                fontFamily:   'Rajdhani',
                display:      'flex',
                alignItems:   'center',
                gap:          '4px',
              }}>
                📄 {file.name}
                <span
                  onClick={() => removeUploadedFile(i)}
                  style={{ cursor: 'pointer', opacity: 0.5, marginLeft: '2px', fontSize: '12px' }}
                  onMouseEnter={(e) => { e.target.style.opacity = '1'; }}
                  onMouseLeave={(e) => { e.target.style.opacity = '0.5'; }}
                >
                  ×
                </span>
              </div>
            ))}
            <div style={{ fontSize: '10px', color: 'rgba(0,212,255,0.3)', fontFamily: 'Rajdhani', display: 'flex', alignItems: 'center' }}>
              Ask me anything about these files
            </div>
          </div>
        )}

        {/* Row: [Upload] [Mic] [Stop] [input] [Send] */}
        <div style={{ display: 'flex', gap: isCollapsed ? '4px' : '8px' }}>

          {/* Upload button — hidden when collapsed */}
          {!isCollapsed && <button
            type="button"
            onClick={handleFileUpload}
            title="Upload document to knowledge base"
            disabled={!!uploadingFile}
            style={{
              background:     'transparent',
              border:         '1px solid rgba(0,212,255,0.25)',
              borderRadius:   '6px',
              width:          '36px',
              height:         '36px',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              cursor:         uploadingFile ? 'wait' : 'pointer',
              color:          uploadingFile ? '#00d4ff' : 'rgba(0,212,255,0.5)',
              fontSize:       '16px',
              flexShrink:     0,
              transition:     'all 0.2s',
              opacity:        uploadingFile ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!uploadingFile) {
                e.currentTarget.style.borderColor = 'rgba(0,212,255,0.7)';
                e.currentTarget.style.color       = '#00d4ff';
                e.currentTarget.style.background  = 'rgba(0,212,255,0.08)';
              }
            }}
            onMouseLeave={(e) => {
              if (!uploadingFile) {
                e.currentTarget.style.borderColor = 'rgba(0,212,255,0.25)';
                e.currentTarget.style.color       = 'rgba(0,212,255,0.5)';
                e.currentTarget.style.background  = 'transparent';
              }
            }}
          >
            📎
          </button>}

          {/* Web search toggle button — hidden when collapsed */}
          {!isCollapsed &&
          <button
            type="button"
            onClick={() => setWebSearchMode((prev) => !prev)}
            title={webSearchMode ? 'Web search ON — click to disable' : 'Enable web search'}
            style={{
              background:     webSearchMode ? 'rgba(0,212,255,0.12)' : 'transparent',
              border:         webSearchMode ? '1px solid #00d4ff'    : '1px solid rgba(0,212,255,0.25)',
              borderRadius:   '6px',
              width:          '36px',
              height:         '36px',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              cursor:         'pointer',
              color:          webSearchMode ? '#00d4ff' : 'rgba(0,212,255,0.5)',
              fontSize:       '16px',
              flexShrink:     0,
              transition:     'all 0.2s',
              boxShadow:      webSearchMode ? '0 0 12px rgba(0,212,255,0.3)' : 'none',
            }}
            onMouseEnter={(e) => {
              if (!webSearchMode) {
                e.currentTarget.style.borderColor = 'rgba(0,212,255,0.7)';
                e.currentTarget.style.color       = '#00d4ff';
                e.currentTarget.style.background  = 'rgba(0,212,255,0.08)';
              }
            }}
            onMouseLeave={(e) => {
              if (!webSearchMode) {
                e.currentTarget.style.borderColor = 'rgba(0,212,255,0.25)';
                e.currentTarget.style.color       = 'rgba(0,212,255,0.5)';
                e.currentTarget.style.background  = 'transparent';
              }
            }}
          >
            🌐
          </button>}

          {/* Mic button — 3 states: idle / recording (cyan) / transcribing (amber) */}
          {speech.isSupported && (
            <button
              type="button"
              onClick={() => micToggleRef.current?.()}
              disabled={speech.isProcessing}
              aria-label={speech.isProcessing ? 'Transcribing…' : speech.isListening ? 'Stop recording' : 'Start voice input'}
              aria-pressed={speech.isListening}
              title={speech.isProcessing ? 'Transcribing…' : speech.isListening ? 'Click to stop recording' : 'Click to speak (Ctrl+Shift+V)'}
              style={{
                background:     speech.isProcessing
                  ? 'rgba(255,170,0,0.1)'
                  : speech.isListening
                    ? 'rgba(0,212,255,0.1)'
                    : 'transparent',
                border:         speech.isProcessing
                  ? '1px solid #ffaa00'
                  : speech.isListening
                    ? '1px solid #00d4ff'
                    : '1px solid rgba(0,212,255,0.2)',
                borderRadius:   '4px',
                padding:        '0 10px',
                color:          speech.isProcessing
                  ? '#ffaa00'
                  : speech.isListening
                    ? '#00d4ff'
                    : 'rgba(0,212,255,0.45)',
                cursor:         speech.isProcessing ? 'wait' : 'pointer',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                minWidth:       '40px',
                height:         '40px',
                fontSize:       '15px',
                animation:      speech.isProcessing
                  ? 'glowPulse 0.5s ease-in-out infinite'
                  : speech.isListening
                    ? 'glowPulse 1.5s ease-in-out infinite'
                    : 'none',
                boxShadow:      speech.isProcessing
                  ? '0 0 10px rgba(255,170,0,0.3)'
                  : speech.isListening
                    ? '0 0 10px rgba(0,212,255,0.35)'
                    : 'none',
                transition:     'all 200ms ease',
                flexShrink:     0,
              }}
              onMouseEnter={(e) => {
                if (!speech.isListening && !speech.isProcessing) {
                  e.currentTarget.style.color       = '#00d4ff';
                  e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)';
                }
              }}
              onMouseLeave={(e) => {
                if (!speech.isListening && !speech.isProcessing) {
                  e.currentTarget.style.color       = 'rgba(0,212,255,0.45)';
                  e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)';
                }
              }}
            >
              {speech.isProcessing
                ? '⏳'
                : speech.isListening
                  ? '⏹'
                  : <Mic size={15} aria-hidden="true" />}
            </button>
          )}

          {/* Stop voice button — only visible while TTS is playing */}
          {isSpeaking && (
            <button
              type="button"
              onClick={ttsStop}
              aria-label="Stop voice reply"
              title="Stop voice reply"
              style={{
                background:     'rgba(255,45,85,0.12)',
                border:         '1px solid rgba(255,45,85,0.5)',
                borderRadius:   '4px',
                padding:        '0 10px',
                color:          '#ff2d55',
                cursor:         'pointer',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                minWidth:       '40px',
                height:         '40px',
                flexShrink:     0,
                transition:     'all 200ms ease',
                animation:      'glowPulse 1s ease-in-out infinite',
                boxShadow:      '0 0 10px rgba(255,45,85,0.25)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,45,85,0.22)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,45,85,0.12)'; }}
            >
              <VolumeX size={15} aria-hidden="true" />
            </button>
          )}

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            placeholder={
              speech.isProcessing  ? 'Transcribing…'                                                      :
              speech.isListening   ? 'Recording…'                                                         :
              pendingEmailContext  ? 'Enter email address…'                                               :
              isCollapsed          ? 'Ask TASKI…'                                                         :
              activeSubcategory   ? `Describe your image — ${activeSubcategory.label} style will be applied…` :
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
              border:        speech.isProcessing
                ? '1px solid rgba(255,170,0,0.4)'
                : speech.isListening
                  ? '1px solid rgba(0,212,255,0.4)'
                  : '1px solid rgba(0,212,255,0.15)',
              borderRadius:  '4px',
              padding:       isCollapsed ? '0 8px' : '0 12px',
              height:        isCollapsed ? '32px' : '40px',
              color:         'var(--color-text-primary)',
              fontFamily:    "'Rajdhani', sans-serif",
              fontSize:      isCollapsed ? '11px' : '14px',
              letterSpacing: '0.02em',
              outline:       'none',
              caretColor:    '#00d4ff',
              transition:    'border-color 200ms, box-shadow 200ms',
              opacity:       loading ? 0.5 : 1,
              boxShadow:     speech.isProcessing
                ? '0 0 0 3px rgba(255,170,0,0.1)'
                : speech.isListening
                  ? '0 0 0 3px rgba(0,212,255,0.1)'
                  : 'none',
            }}
            onFocus={(e) => {
              if (isCollapsed) { onExpand?.(); }
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
              height:         isCollapsed ? '32px' : '40px',
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

        {/* Hidden native file input — used when Electron RAG is not available */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.pdf"
          multiple
          style={{ display: 'none' }}
          onChange={handleNativeFileChange}
        />
      </form>
    </div>
  );
}

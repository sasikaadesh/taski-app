// ChatBot — floating chat bubble that expands into a conversational panel powered by Claude.
// Supports: calendar queries, Gmail reading, and composing / sending emails with user confirmation.

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Loader2, Mic } from 'lucide-react';
import { callClaude, CHATBOT_SYSTEM, EMAIL_DRAFT_SYSTEM } from '../lib/claude';
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
// These patterns specifically detect "compose/send/forward" intent vs. reading.

const EMAIL_SEND_PATTERNS = [
  /\bsend\s+(?:an?\s+)?(?:email|e-mail|mail|message)\b/i,
  /\bwrite\s+(?:an?\s+)?(?:email|e-mail|mail|message)\b/i,
  /\bcompose\s+(?:an?\s+)?(?:email|e-mail|mail|message)\b/i,
  /\bdraft\s+(?:an?\s+)?(?:email|e-mail|mail|message)\b/i,
  /\bshoot\s+(?:an?\s+)?(?:email|e-mail|mail|message)\b/i,
  // "forward this/it/the email to..."
  /\bforward\s+(?:this|that|it|the\s+email|the\s+message)?\s*to\s+\w/i,
  // "reply to James" / "reply to james@..."
  /\breply\s+to\s+[A-Za-z0-9@]/i,
  // "email john@company.com that..." — email used as a verb with address
  /\bemail\s+[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/i,
  // "email James about..." / "email him about..." — email as verb with recipient + intent
  /\bemail\s+\w+\s+(?:about|that|saying|regarding|to\s+(?:tell|let|say|inform|ask))\b/i,
];

function hasEmailSendIntent(text) {
  return EMAIL_SEND_PATTERNS.some((re) => re.test(text));
}

// ── Email READ intent detection ───────────────────────────────────────────────
// Only used when send intent is NOT detected first.

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

/** Extract a bare email address from free text, or null. */
function extractEmailAddress(text) {
  const m = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

/** Extract a human name (likely recipient) from common send-intent phrases. */
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

/**
 * Search Gmail for recent emails from `name` and return the sender's email address.
 * Returns null if not found or if Gmail search fails.
 */
async function findEmailForName(name) {
  try {
    const emails = await searchEmails(`from:${name}`);
    if (emails.length === 0) return null;
    const fromHeader = emails[0].from;
    // "James Smith <james@example.com>" or plain "james@example.com"
    const angleMatch = fromHeader.match(/<([^>]+@[^>]+)>/);
    const bareMatch  = fromHeader.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    return angleMatch?.[1] ?? bareMatch?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Ask Claude to draft an email and return { subject, body }.
 * Throws if Claude's response can't be parsed as JSON.
 */
async function draftEmailWithClaude(userIntent, recipientEmail, calendarContext = '') {
  const systemPrompt = [
    EMAIL_DRAFT_SYSTEM,
    recipientEmail     ? `\nThe recipient email address is: ${recipientEmail}` : '',
    calendarContext    ? `\nRelevant calendar context (use to make the email accurate):\n${calendarContext}` : '',
  ].join('');

  const raw = await callClaude(
    [{ role: 'user', content: userIntent }],
    { system: systemPrompt },
  );

  // Claude may wrap JSON in ```json ... ``` — strip that first
  const stripped    = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const jsonMatch   = stripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('DRAFT_PARSE_FAILED');

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.subject || !parsed.body) throw new Error('DRAFT_INCOMPLETE');

  return { subject: parsed.subject, body: parsed.body };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatBot() {
  const [open, setOpen]       = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // emailDrafts: { [draftId]: { to, subject, body, cc } }
  // Keyed separately from messages so edits don't require message-array mutation.
  const [emailDrafts, setEmailDrafts] = useState({});

  // pendingEmailContext: set when we're waiting for the user to supply an email address.
  // { recipientName: string|null, originalIntent: string }
  const [pendingEmailContext, setPendingEmailContext] = useState(null);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // ── Voice input ───────────────────────────────────────────────────────────
  const speech = useSpeechRecognition();

  // Mic toggle — extracted to a ref so the keyboard-shortcut effect never
  // captures a stale closure (the ref is updated every render).
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

  // Sync live transcript → input while (and just after) listening.
  // Only updates when there's actual speech content so typed text is unaffected.
  useEffect(() => {
    if (speech.transcript) setInput(speech.transcript);
  }, [speech.transcript]);

  // Stop listening when the chat panel is closed.
  useEffect(() => {
    if (!open && speech.isListening) speech.stopListening();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Translate speech errors → friendly assistant messages.
  useEffect(() => {
    if (!speech.error) return;
    const MAP = {
      PERMISSION_DENIED: "🎤 Microphone access was denied. Please allow microphone access in your browser settings and try again.",
      NO_SPEECH:         "Didn't catch that — please try again.",
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

  // Keyboard shortcut: Ctrl+Shift+V (Win/Linux) or Cmd+Shift+V (Mac)
  useEffect(() => {
    if (!open || !speech.isSupported) return;
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        micToggleRef.current?.();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, speech.isSupported]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  // ── Email draft state handlers ────────────────────────────────────────────

  function handleEmailDraftChange(draftId, field, value) {
    setEmailDrafts((prev) => ({
      ...prev,
      [draftId]: { ...prev[draftId], [field]: value },
    }));
  }

  async function handleEmailSend(draftId) {
    const draft = emailDrafts[draftId];
    // Email is never sent without explicit user confirmation via the Send button.
    // This function is only called when the user clicks Send in EmailConfirmationCard.
    await sendEmail({ to: draft.to, subject: draft.subject, body: draft.body, cc: draft.cc ?? '' });

    // ── Success: replace the confirmation card with a sent-confirmation message ──
    const sentTime = new Date().toLocaleTimeString('en-US', { timeStyle: 'short' });
    setMessages((prev) =>
      prev.map((m) =>
        m.meta?.draftId === draftId
          ? {
              role:    'assistant',
              content: `✅ EMAIL SENT\nTo: ${draft.to}\nSubject: ${draft.subject}\nSent at: ${sentTime}`,
              meta:    { type: 'email-sent', emailData: draft },
            }
          : m
      )
    );
    // Clean up draft data
    setEmailDrafts((prev) => {
      const next = { ...prev };
      delete next[draftId];
      return next;
    });
  }

  function handleEmailCancel(draftId) {
    setMessages((prev) =>
      prev.map((m) =>
        m.meta?.draftId === draftId
          ? { role: 'assistant', content: "No problem! Email cancelled.", meta: {} }
          : m
      )
    );
    setEmailDrafts((prev) => {
      const next = { ...prev };
      delete next[draftId];
      return next;
    });
  }

  // ── Internal helper: build draft message & add to chat ───────────────────

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

    // ── Shared date/timezone context ─────────────────────────────────────────
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
    // BRANCH 1 — Waiting for user to supply an email address
    // ════════════════════════════════════════════════════════════════════════
    if (pendingEmailContext) {
      const emailAddr = extractEmailAddress(text) || text.trim();
      const VALID_EMAIL = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

      if (VALID_EMAIL.test(emailAddr)) {
        // Got a valid address — draft the email
        const { originalIntent } = pendingEmailContext;
        setPendingEmailContext(null);
        try {
          const draft = await draftEmailWithClaude(originalIntent, emailAddr);
          addEmailDraftToChat(emailAddr, draft.subject, draft.body);
        } catch {
          setMessages((prev) => [...prev, {
            role:    'assistant',
            content: "I had trouble drafting that email. Could you try again with more details?",
          }].slice(-MAX_MESSAGES));
        }
        setLoading(false);
        return;

      } else if (!text.includes(' ')) {
        // Single token — looks like they tried to give an address but it's malformed
        setMessages((prev) => [...prev, {
          role:    'assistant',
          content: "That doesn't look like a valid email address. Can you double check it?",
        }].slice(-MAX_MESSAGES));
        setLoading(false);
        return;

      } else {
        // Multi-word sentence — user has moved on to a different query; clear context
        setPendingEmailContext(null);
        // Fall through to normal intent detection below
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // BRANCH 2 — Email SEND intent
    // ════════════════════════════════════════════════════════════════════════
    if (hasEmailSendIntent(text)) {
      try {
        let recipientEmail = extractEmailAddress(text);

        // If no email address, try to find it by name via Gmail
        if (!recipientEmail) {
          const name = extractRecipientName(text);
          if (name) {
            recipientEmail = await findEmailForName(name);
            if (!recipientEmail) {
              // Name found but no email — ask the user
              setMessages((prev) => [...prev, {
                role:    'assistant',
                content: `What is ${name}'s email address?`,
                meta:    { waitingForEmail: true },
              }].slice(-MAX_MESSAGES));
              setPendingEmailContext({ recipientName: name, originalIntent: text });
              setLoading(false);
              return;
            }
          } else {
            // No recipient at all — ask
            setMessages((prev) => [...prev, {
              role:    'assistant',
              content: "Who would you like to send this to? Please provide their email address.",
              meta:    { waitingForEmail: true },
            }].slice(-MAX_MESSAGES));
            setPendingEmailContext({ recipientName: null, originalIntent: text });
            setLoading(false);
            return;
          }
        }

        // Optionally fetch calendar context if the message also involves scheduling
        let calendarContext = '';
        if (hasCalendarIntent(text)) {
          try {
            const { start, end } = detectDateRange(text);
            const events          = await getCalendarEventsForRange(start, end);
            calendarContext       = buildCalendarContext(events, start, end);
          } catch {
            // Calendar context is optional — ignore errors
          }
        }

        // Draft the email with Claude
        const draft = await draftEmailWithClaude(text, recipientEmail, calendarContext);

        // If calendar context was fetched, also answer the calendar question in a text message
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
        }

        addEmailDraftToChat(recipientEmail, draft.subject, draft.body);

      } catch (err) {
        if (import.meta.env.DEV) console.warn('[Taski Email Draft]', err);
        setMessages((prev) => [...prev, {
          role:    'assistant',
          content: "I had trouble drafting that email. Please try again with more details about what you'd like to say.",
        }].slice(-MAX_MESSAGES));
      }

      setLoading(false);
      return;
    }

    // ════════════════════════════════════════════════════════════════════════
    // BRANCH 3 — Calendar / Gmail READ / General (existing logic)
    // ════════════════════════════════════════════════════════════════════════
    try {
      let system     = `${CHATBOT_SYSTEM}\n\n${dateContext}`;
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

        // ── Calendar result ───────────────────────────────────────────────
        if (wantsCalendar) {
          if (calendarResult.status === 'fulfilled') {
            calendarBlock = calendarResult.value;
          } else {
            const msg = calendarResult.reason?.message ?? 'Unknown error';
            setMessages((prev) => [...prev, {
              role:    'assistant',
              content: msg.toLowerCase().includes('cancel')
                ? "I need access to your Google Calendar to answer that. Please try again and complete the sign-in when prompted."
                : `I couldn't load your calendar right now (${msg}). Please try again in a moment.`,
              meta: { checked: null },
            }].slice(-MAX_MESSAGES));
            setLoading(false);
            return;
          }
        }

        // ── Email result ──────────────────────────────────────────────────
        if (wantsEmail) {
          if (emailResult.status === 'fulfilled') {
            emailBlock = emailResult.value?.block ?? null;
          } else {
            const errMsg = emailResult.reason?.message ?? '';
            if (errMsg === 'GMAIL_AUTH_CANCELLED') {
              setMessages((prev) => [...prev, {
                role:    'assistant',
                content: "To search your Gmail I need Google account access. Please try again and complete the sign-in when prompted.",
                meta:    { reconnectGmail: true },
              }].slice(-MAX_MESSAGES));
              if (!wantsCalendar) { setLoading(false); return; }
            } else if (errMsg === 'GMAIL_SCOPE_MISSING') {
              setMessages((prev) => [...prev, {
                role:    'assistant',
                content: "Gmail access isn't enabled for this session yet.",
                meta:    { reconnectGmail: true },
              }].slice(-MAX_MESSAGES));
              if (!wantsCalendar) { setLoading(false); return; }
            } else if (errMsg === 'GMAIL_RATE_LIMIT') {
              setMessages((prev) => [...prev, {
                role:    'assistant',
                content: "Gmail is receiving too many requests right now — please try again in a moment.",
              }].slice(-MAX_MESSAGES));
              if (!wantsCalendar) { setLoading(false); return; }
            } else {
              if (import.meta.env.DEV) console.warn('[Taski Gmail]', errMsg);
            }
          }
        }

        // ── Build combined system prompt ──────────────────────────────────
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

      const apiMessages  = next.map(({ role, content }) => ({ role, content }));
      const reply        = await callClaude(apiMessages, { system });
      setMessages((prev) => [...prev, {
        role:    'assistant',
        content: reply,
        meta:    { checked: checkedTag },
      }].slice(-MAX_MESSAGES));

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Reconnect Google handler ──────────────────────────────────────────────
  async function handleReconnectGoogle() {
    clearToken();
    try {
      await getGoogleAccessToken();
      setMessages((prev) => [...prev, {
        role:    'assistant',
        content: "Google account reconnected! You can now ask about emails, calendar, or send emails.",
        meta:    { checked: null },
      }].slice(-MAX_MESSAGES));
    } catch {
      // User cancelled — nothing to do
    }
  }

  // ── Source-tag badge ──────────────────────────────────────────────────────
  function SourceTag({ checked }) {
    if (!checked) return null;
    const label =
      checked === 'both'     ? '📅✉️  CALENDAR + GMAIL' :
      checked === 'calendar' ? '📅  CALENDAR'            :
      checked === 'gmail'    ? '✉️  GMAIL'               : null;
    if (!label) return null;
    return (
      <span
        style={{
          display:       'inline-block',
          fontFamily:    "'Rajdhani', sans-serif",
          fontSize:      '10px',
          fontWeight:    500,
          letterSpacing: '0.08em',
          padding:       '2px 8px',
          borderRadius:  '100px',
          marginBottom:  '4px',
          background:    'var(--color-neon-cyan-glow)',
          border:        '1px solid var(--color-neon-cyan-border)',
          color:         'var(--color-neon-cyan)',
        }}
      >
        {label}
      </span>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Chat panel ── */}
      {open && (
        <div
          className="fixed bottom-24 right-6 flex flex-col overflow-hidden z-50"
          style={{
            width:        '340px',
            height:       '500px',
            background:   'var(--color-bg-muted)',
            border:       '1px solid var(--color-border)',
            borderRadius: '6px',
            boxShadow:    '0 0 40px rgba(0,0,0,0.8), 0 0 20px rgba(0,212,255,0.1)',
          }}
        >
          {/* ── Header ── */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{
              background:   'var(--color-bg-raised)',
              borderBottom: '1px solid var(--color-border)',
              boxShadow:    '0 1px 15px var(--color-neon-cyan-glow)',
            }}
          >
            <div className="flex items-center gap-2">
              <MessageCircle size={16} style={{ color: 'var(--color-neon-cyan)' }} aria-hidden="true" />
              <span
                style={{
                  fontFamily:    "'Orbitron', sans-serif",
                  fontSize:      '13px',
                  fontWeight:    700,
                  letterSpacing: '0.08em',
                  color:         'var(--color-neon-cyan)',
                  textShadow:    '0 0 12px rgba(0,212,255,0.6)',
                }}
              >
                TASKI AI
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              style={{ color: 'var(--color-text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', transition: 'color 150ms' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-neon-cyan)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-dim)'; }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          {/* ── Messages ── */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
            {messages.length === 0 && (
              <p
                style={{
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '13px',
                  letterSpacing: '0.04em',
                  color:         'var(--color-text-secondary)',
                  textAlign:     'center',
                  marginTop:     '32px',
                  lineHeight:    1.6,
                }}
              >
                Hi! I'm Taski AI.<br />
                Ask me about tasks, schedule, emails,<br />
                or ask me to send an email for you.
              </p>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'user' ? (
                  /* ── User bubble ── */
                  <div
                    style={{
                      maxWidth:      '82%',
                      padding:       '8px 12px',
                      borderRadius:  '4px',
                      fontFamily:    "'Rajdhani', sans-serif",
                      fontSize:      '14px',
                      letterSpacing: '0.02em',
                      lineHeight:    1.5,
                      background:    'rgba(0,212,255,0.08)',
                      border:        '1px solid var(--color-neon-cyan-border)',
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
                      background:    'rgba(0,255,136,0.06)',
                      border:        '1px solid rgba(0,255,136,0.3)',
                      color:         'var(--color-success)',
                      boxShadow:     '0 0 16px rgba(0,255,136,0.12)',
                    }}
                  >
                    {msg.content}
                  </div>

                ) : (
                  /* ── Normal assistant bubble ── */
                  <div style={{ maxWidth: '82%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3px' }}>
                    <SourceTag checked={msg.meta?.checked} />
                    <div
                      style={{
                        padding:       '8px 12px',
                        borderRadius:  '4px',
                        fontFamily:    "'Rajdhani', sans-serif",
                        fontSize:      '14px',
                        letterSpacing: '0.02em',
                        lineHeight:    1.5,
                        background:    'var(--color-bg-raised)',
                        border:        '1px solid var(--color-border)',
                        color:         'var(--color-text-primary)',
                        whiteSpace:    'pre-line',
                        width:         '100%',
                      }}
                    >
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
                            color:               'var(--color-neon-cyan)',
                            background:          'none',
                            border:              'none',
                            cursor:              'pointer',
                            padding:             0,
                            textDecoration:      'underline',
                            textUnderlineOffset: '3px',
                            transition:          'opacity 150ms',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
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
              <div className="flex justify-start">
                <div
                  style={{
                    padding:     '8px 12px',
                    borderRadius: '4px',
                    background:  'var(--color-bg-raised)',
                    border:      '1px solid var(--color-border)',
                    display:     'flex',
                    alignItems:  'center',
                    gap:         '8px',
                  }}
                >
                  <Loader2 size={13} className="animate-spin" style={{ color: 'var(--color-neon-cyan)' }} aria-hidden="true" />
                  <span
                    style={{
                      fontFamily:    "'Rajdhani', sans-serif",
                      fontSize:      '12px',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color:         'var(--color-text-secondary)',
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
                  letterSpacing: '0.04em',
                  color:         'var(--color-danger)',
                  textAlign:     'center',
                  padding:       '0 8px',
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
            className="flex-shrink-0 p-3"
            style={{ borderTop: '1px solid var(--color-border)' }}
          >
            {/* ── Listening indicator (shown only while mic is active) ── */}
            {speech.isListening && (
              <div
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  gap:            '5px',
                  marginBottom:   '6px',
                  paddingLeft:    '2px',
                }}
              >
                <span
                  style={{
                    color:     'var(--color-danger)',
                    fontSize:  '10px',
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
                    fontSize:      '10px',
                    letterSpacing: '0.06em',
                    color:         'var(--color-text-dim)',
                    marginLeft:    '4px',
                  }}
                >
                  Ctrl+Shift+V to stop
                </span>
              </div>
            )}

            {/* ── Row: [🎤] [input] [➤] ── */}
            <div className="flex gap-2">

              {/* ── Mic button — hidden when Web Speech API is not supported ── */}
              {speech.isSupported && (
                <button
                  type="button"
                  onClick={() => micToggleRef.current?.()}
                  aria-label={speech.isListening ? 'Stop voice input' : 'Start voice input'}
                  aria-pressed={speech.isListening}
                  style={{
                    background:     'transparent',
                    border:         speech.isListening
                      ? '1px solid var(--color-neon-cyan)'
                      : '1px solid var(--color-border)',
                    borderRadius:   '4px',
                    padding:        '8px 10px',
                    color:          speech.isListening
                      ? 'var(--color-neon-cyan)'
                      : 'var(--color-text-secondary)',
                    cursor:         'pointer',
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    minWidth:       '40px',
                    minHeight:      '40px',
                    animation:      speech.isListening
                      ? 'glowPulse 2s ease-in-out infinite'
                      : 'none',
                    boxShadow:      speech.isListening
                      ? '0 0 12px rgba(0,212,255,0.4)'
                      : 'none',
                    transition:     'border-color 200ms, color 200ms, box-shadow 200ms',
                    flexShrink:     0,
                  }}
                  onMouseEnter={(e) => {
                    if (!speech.isListening) {
                      e.currentTarget.style.color       = 'var(--color-neon-cyan)';
                      e.currentTarget.style.borderColor = 'var(--color-neon-cyan-border)';
                      e.currentTarget.style.boxShadow   = '0 0 8px rgba(0,212,255,0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!speech.isListening) {
                      e.currentTarget.style.color       = 'var(--color-text-secondary)';
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.boxShadow   = 'none';
                    }
                  }}
                  onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; }}
                  onMouseUp={(e)   => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  <Mic size={15} aria-hidden="true" />
                </button>
              )}

              {/* ── Text input ── */}
              <input
                ref={inputRef}
                type="text"
                placeholder={
                  speech.isListening    ? "Listening — speak now…"  :
                  pendingEmailContext   ? "Enter email address…"     :
                                         "Ask about tasks, schedule, emails…"
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
                style={{
                  flex:          1,
                  background:    'var(--color-bg-raised)',
                  border:        speech.isListening
                    ? '1px solid var(--color-border-bright)'
                    : '1px solid var(--color-border)',
                  borderRadius:  '4px',
                  padding:       '8px 12px',
                  color:         speech.isListening
                    ? 'var(--color-text-secondary)'
                    : 'var(--color-text-primary)',
                  fontFamily:    "'Rajdhani', sans-serif",
                  fontSize:      '14px',
                  letterSpacing: '0.02em',
                  outline:       'none',
                  caretColor:    'var(--color-neon-cyan)',
                  transition:    'border-color 200ms, box-shadow 200ms, color 200ms',
                  opacity:       loading ? 0.5 : 1,
                  boxShadow:     speech.isListening
                    ? '0 0 0 3px var(--color-neon-cyan-glow), 0 0 12px rgba(0,212,255,0.25)'
                    : 'none',
                }}
                onFocus={(e) => {
                  if (!speech.isListening) {
                    e.target.style.borderColor = 'var(--color-border-bright)';
                    e.target.style.boxShadow   = '0 0 0 3px var(--color-neon-cyan-glow)';
                  }
                }}
                onBlur={(e) => {
                  if (!speech.isListening) {
                    e.target.style.borderColor = 'var(--color-border)';
                    e.target.style.boxShadow   = 'none';
                  }
                }}
              />

              {/* ── Send button ── */}
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send message"
                style={{
                  background:     'transparent',
                  border:         '1px solid var(--color-neon-cyan)',
                  borderRadius:   '4px',
                  padding:        '8px 12px',
                  color:          'var(--color-neon-cyan)',
                  cursor:         loading || !input.trim() ? 'not-allowed' : 'pointer',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  minWidth:       '44px',
                  minHeight:      '40px',
                  opacity:        loading || !input.trim() ? 0.35 : 1,
                  transition:     'box-shadow 250ms, background 250ms, transform 150ms',
                  flexShrink:     0,
                }}
                onMouseEnter={(e) => {
                  if (!loading && input.trim()) {
                    e.currentTarget.style.boxShadow = '0 0 10px rgba(0,212,255,0.5)';
                    e.currentTarget.style.background = 'var(--color-neon-cyan-glow)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.background = 'transparent';
                }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                onMouseUp={(e)   => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                <Send size={15} aria-hidden="true" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Floating bubble ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close Taski Assistant' : 'Open Taski Assistant'}
        style={{
          position:       'fixed',
          bottom:         '24px',
          right:          '24px',
          zIndex:         50,
          background:     'transparent',
          borderRadius:   '9999px',
          width:          '52px',
          height:         '52px',
          border:         '2px solid var(--color-neon-cyan)',
          cursor:         'pointer',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          color:          'var(--color-neon-cyan)',
          animation:      open ? 'none' : 'glowPulse 2s ease-in-out infinite',
          transition:     'box-shadow 250ms cubic-bezier(0.16,1,0.3,1), transform 150ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 0 30px rgba(0,212,255,0.8), inset 0 0 20px rgba(0,212,255,0.1)';
          e.currentTarget.style.animation = 'none';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '';
          if (!open) e.currentTarget.style.animation = 'glowPulse 2s ease-in-out infinite';
        }}
        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; }}
        onMouseUp={(e)   => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {open ? <X size={20} aria-hidden="true" /> : <MessageCircle size={20} aria-hidden="true" />}
      </button>
    </>
  );
}

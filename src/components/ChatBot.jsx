// ChatBot — floating chat bubble that expands into a conversational panel powered by Claude.

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { callClaude, CHATBOT_SYSTEM } from '../lib/claude';
import {
  getCalendarEventsForRange,
  buildCalendarContext,
  clearToken,
  getGoogleAccessToken,
} from '../lib/googleCalendar';
import { searchEmails, formatEmailsForPrompt } from '../lib/gmail';

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

// ── Email-intent detection ────────────────────────────────────────────────────

const EMAIL_KEYWORDS = [
  'email', 'emails', 'gmail', 'inbox', 'mail', 'mails',
  'message', 'messages', 'sent', 'received', 'unread',
  'subject', 'attachment',
];

// "from" is only an email signal when it follows an email-like phrase
const FROM_CONTEXT_RE = /\bfrom\s+(?!(?:today|yesterday|tomorrow|this|next|my\s+calendar|the\s+app))/i;

function hasEmailIntent(text) {
  const lower = text.toLowerCase();
  if (EMAIL_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  if (FROM_CONTEXT_RE.test(text)) return true;
  return false;
}

// ── Date range helpers (shared by both calendar and email query building) ─────

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

/**
 * Build a smart Gmail search query from the user's natural-language message.
 *
 * Examples:
 *   "emails from James"              → "from:James"
 *   "emails from james@gmail.com"    → "from:james@gmail.com"
 *   "emails about the project meeting" → "subject:project meeting"
 *   "emails on May 25th"             → "after:2026/05/25 before:2026/05/26"
 *   "unread emails from my boss"     → "from:boss is:unread"
 *   "emails from James on May 25th"  → "from:James after:2026/05/25 before:2026/05/26"
 */
function buildGmailQuery(text) {
  const lower = text.toLowerCase();
  const parts = [];

  // 1. Email address → from:addr
  const emailAddrMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailAddrMatch) {
    parts.push(`from:${emailAddrMatch[0]}`);
  } else {
    // Name after "from" — exclude time/pronoun words to avoid "from today", "from my calendar"
    const FROM_EXCLUDE = /^(today|yesterday|tomorrow|this|next|my|the|your|their|our|what|where|when|how|any|an|a)\b/i;
    const fromMatch = lower.match(/\bfrom\s+([\w.''\-]+(?:\s+[\w.''\-]+)?)/);
    if (fromMatch) {
      const candidate = fromMatch[1].trim();
      if (
        !FROM_EXCLUDE.test(candidate) &&
        !['inbox', 'gmail', 'email', 'mail', 'me', 'us'].includes(candidate)
      ) {
        parts.push(`from:${candidate}`);
      }
    }
  }

  // 2. Subject — text after "about" or "subject:" (skip if already have a from)
  const aboutMatch = lower.match(/\babout\s+(?:the\s+)?([a-z][a-z\s]{2,30}?)(?=\s+(?:from|on|today|yesterday|tomorrow|at\s+\d)|$)/);
  const subjectMatch = lower.match(/\bsubject[:\s]+([a-z][a-z\s]{2,30}?)(?=\s+(?:from|on|at\s+\d)|$)/);
  const topicWords = (aboutMatch?.[1] || subjectMatch?.[1] || '').trim();
  if (topicWords) {
    // Use as keyword search rather than subject: so it also matches body snippets
    parts.push(topicWords);
  }

  // 3. Unread filter
  if (lower.includes('unread')) parts.push('is:unread');

  // 4. Date filters — only when the text mentions a specific time/date
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

  // 5. Fallback — search inbox with any meaningful content words
  if (parts.length === 0) {
    const stopWords = new Set([
      'can','you','check','if','any','do','i','have','is','are','the','a',
      'an','in','my','please','look','find','show','me','see','get','all',
      'some','their','from','about','at','on','for','of','to','and','or',
      'emails','email','gmail','inbox','messages','message','mail',
    ]);
    const keywords = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
      .slice(0, 4)
      .join(' ');
    parts.push(keywords || 'in:inbox');
  }

  return parts.join(' ');
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatBot() {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

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

    try {
      // ── Timezone + date context — injected into EVERY system prompt ────────
      // This fixes "Could you let me know what today's date is?" — Claude always
      // knows the user's local date and time without needing to ask.
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const now      = new Date();
      const todayStr = now.toLocaleDateString('en-US', {
        timeZone: timezone,
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
      const timeStr = now.toLocaleTimeString('en-US', {
        timeZone: timezone,
        timeStyle: 'short',
      });
      const dateContext =
        `Today is ${todayStr}. Current time is ${timeStr}. ` +
        `User's timezone is ${timezone}.\n` +
        `Always use this date when the user says "today", "yesterday", "this week", or "this month". ` +
        `Never ask the user what today's date is.`;

      // Base system always includes date context regardless of intent
      let system     = `${CHATBOT_SYSTEM}\n\n${dateContext}`;
      let checkedTag = null; // 'calendar' | 'gmail' | 'both'

      const wantsCalendar = hasCalendarIntent(text);
      const wantsEmail    = hasEmailIntent(text);

      // ── Fetch context data (parallel when both are needed) ─────────────────
      if (wantsCalendar || wantsEmail) {

        // Build both fetch promises (or null if not needed)
        const calendarPromise = wantsCalendar
          ? (async () => {
              const { start, end } = detectDateRange(text);
              const events         = await getCalendarEventsForRange(start, end);
              return buildCalendarContext(events, start, end);
            })()
          : Promise.resolve(null);

        const emailPromise = wantsEmail
          ? (async () => {
              const query = buildGmailQuery(text);
              const emails = await searchEmails(query);
              return { block: formatEmailsForPrompt(emails, query), query };
            })()
          : Promise.resolve(null);

        // Run both in parallel; handle each error independently
        const [calendarResult, emailResult] = await Promise.allSettled([
          calendarPromise,
          emailPromise,
        ]);

        let calendarBlock = null;
        let emailBlock    = null;

        // ── Calendar result handling ────────────────────────────────────────
        if (wantsCalendar) {
          if (calendarResult.status === 'fulfilled') {
            calendarBlock = calendarResult.value;
          } else {
            const msg = calendarResult.reason?.message ?? 'Unknown error';
            const notConnected = {
              role:    'assistant',
              content: msg.toLowerCase().includes('cancel')
                ? "I need access to your Google Calendar to answer that. Please try again and complete the sign-in when prompted."
                : `I couldn't load your calendar right now (${msg}). Please try again in a moment.`,
              meta: { checked: null },
            };
            setMessages((prev) => [...prev, notConnected].slice(-MAX_MESSAGES));
            setLoading(false);
            return;
          }
        }

        // ── Email result handling ───────────────────────────────────────────
        if (wantsEmail) {
          if (emailResult.status === 'fulfilled') {
            emailBlock = emailResult.value?.block ?? null;
          } else {
            const err = emailResult.reason;
            const errMsg = err?.message ?? '';

            if (errMsg === 'GMAIL_AUTH_CANCELLED') {
              // Show inline reconnect prompt without aborting the whole response;
              // if calendar data is available, we can still answer that part.
              const reconnectMsg = {
                role:    'assistant',
                content: "To search your Gmail I need Google account access. Please try again and complete the sign-in when prompted.",
                meta:    { reconnectGmail: true },
              };
              setMessages((prev) => [...prev, reconnectMsg].slice(-MAX_MESSAGES));
              if (!wantsCalendar) { setLoading(false); return; }
              // Fall through to answer the calendar part
            } else if (errMsg === 'GMAIL_SCOPE_MISSING') {
              const reconnectMsg = {
                role:    'assistant',
                content: "Gmail access isn't enabled for this session yet.",
                meta:    { reconnectGmail: true },
              };
              setMessages((prev) => [...prev, reconnectMsg].slice(-MAX_MESSAGES));
              if (!wantsCalendar) { setLoading(false); return; }
            } else if (errMsg === 'GMAIL_RATE_LIMIT') {
              const rateLimitMsg = {
                role:    'assistant',
                content: "Gmail is receiving too many requests right now — please try again in a moment.",
                meta:    { checked: null },
              };
              setMessages((prev) => [...prev, rateLimitMsg].slice(-MAX_MESSAGES));
              if (!wantsCalendar) { setLoading(false); return; }
            } else {
              // Generic Gmail error — log in dev, fall through gracefully
              if (import.meta.env.DEV) {
                console.warn('[Taski Gmail]', errMsg);
              }
            }
          }
        }

        // ── Build the combined system prompt ────────────────────────────────
        const hasCalData = calendarBlock !== null;
        const hasEmailData = emailBlock !== null;

        if (hasCalData && hasEmailData) {
          checkedTag = 'both';
          // `system` already has CHATBOT_SYSTEM + dateContext; append data blocks
          system +=
            `\n\nGOOGLE CALENDAR EVENTS:\n${calendarBlock}\n\n` +
            `GMAIL RESULTS:\n${emailBlock}\n\n` +
            `Use the calendar events and email results above to answer the user's question naturally. ` +
            `All email times are already in the user's local timezone (${timezone}). ` +
            `Be concise and conversational. Never make up events or emails not in the data.`;
        } else if (hasCalData) {
          checkedTag = 'calendar';
          system +=
            `\n\nHere are the user's actual Google Calendar events:\n` +
            `${calendarBlock}\n\n` +
            `Use this real calendar data to answer their scheduling question accurately. ` +
            `Be concise and conversational.`;
        } else if (hasEmailData) {
          checkedTag = 'gmail';
          system +=
            `\n\nThe user asked about their emails. ` +
            `Here are the matching emails found in their Gmail:\n\n` +
            `${emailBlock}\n\n` +
            `Each email shows: sender, subject, date (already converted to the user's local ` +
            `timezone ${timezone}), and a preview. ` +
            `Answer the user's question naturally based on these results. ` +
            `If no emails were found, say so clearly. ` +
            `Never make up emails that are not in the results.`;
        }
      }

      // Strip any UI-only fields (e.g. `meta`) before sending to the Claude API.
      // The API only accepts { role, content } — extra keys cause a validation error.
      const apiMessages  = next.map(({ role, content }) => ({ role, content }));
      const reply        = await callClaude(apiMessages, { system });
      const assistantMsg = {
        role:    'assistant',
        content: reply,
        meta:    { checked: checkedTag },
      };
      setMessages((prev) => [...prev, assistantMsg].slice(-MAX_MESSAGES));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Reconnect handler — triggers a fresh OAuth popup ─────────────────────
  async function handleReconnectGoogle() {
    clearToken();
    try {
      await getGoogleAccessToken();
      const successMsg = {
        role:    'assistant',
        content: "Google account reconnected! You can now ask about emails or calendar events.",
        meta:    { checked: null },
      };
      setMessages((prev) => [...prev, successMsg].slice(-MAX_MESSAGES));
    } catch {
      // User cancelled — nothing to do
    }
  }

  // ── Source tag renderer (Tron badge style) ────────────────────────────────
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
          display:      'inline-block',
          fontFamily:   "'Rajdhani', sans-serif",
          fontSize:     '10px',
          fontWeight:   500,
          letterSpacing: '0.08em',
          padding:      '2px 8px',
          borderRadius: '100px',
          marginBottom: '4px',
          background:   'var(--color-neon-cyan-glow)',
          border:       '1px solid var(--color-neon-cyan-border)',
          color:        'var(--color-neon-cyan)',
        }}
      >
        {label}
      </span>
    );
  }

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
          {/* ── Panel header ── */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{
              background:   'var(--color-bg-raised)',
              borderBottom: '1px solid var(--color-border)',
              boxShadow:    '0 1px 15px var(--color-neon-cyan-glow)',
            }}
          >
            <div className="flex items-center gap-2">
              <MessageCircle
                size={16}
                style={{ color: 'var(--color-neon-cyan)' }}
                aria-hidden="true"
              />
              <span
                style={{
                  fontFamily:   "'Orbitron', sans-serif",
                  fontSize:     '13px',
                  fontWeight:   700,
                  letterSpacing: '0.08em',
                  color:        'var(--color-neon-cyan)',
                  textShadow:   '0 0 12px rgba(0,212,255,0.6)',
                }}
              >
                TASKI AI
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              style={{
                color:      'var(--color-text-dim)',
                background: 'none',
                border:     'none',
                cursor:     'pointer',
                padding:    '4px',
                transition: 'color 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-neon-cyan)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-dim)'; }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          {/* ── Messages ── */}
          <div
            className="flex-1 overflow-y-auto p-4 flex flex-col gap-3"
          >
            {messages.length === 0 && (
              <p
                style={{
                  fontFamily:   "'Rajdhani', sans-serif",
                  fontSize:     '13px',
                  letterSpacing: '0.04em',
                  color:        'var(--color-text-secondary)',
                  textAlign:    'center',
                  marginTop:    '32px',
                  lineHeight:   1.6,
                }}
              >
                Hi! I'm Taski AI.<br />
                Ask me about tasks, schedule, or emails.
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
                      maxWidth:     '82%',
                      padding:      '8px 12px',
                      borderRadius: '4px',
                      fontFamily:   "'Rajdhani', sans-serif",
                      fontSize:     '14px',
                      letterSpacing: '0.02em',
                      lineHeight:   1.5,
                      background:   'rgba(0,212,255,0.08)',
                      border:       '1px solid var(--color-neon-cyan-border)',
                      color:        'var(--color-text-primary)',
                    }}
                  >
                    {msg.content}
                  </div>
                ) : (
                  /* ── Assistant bubble ── */
                  <div style={{ maxWidth: '82%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3px' }}>
                    <SourceTag checked={msg.meta?.checked} />
                    <div
                      style={{
                        padding:      '8px 12px',
                        borderRadius: '4px',
                        fontFamily:   "'Rajdhani', sans-serif",
                        fontSize:     '14px',
                        letterSpacing: '0.02em',
                        lineHeight:   1.5,
                        background:   'var(--color-bg-raised)',
                        border:       '1px solid var(--color-border)',
                        color:        'var(--color-text-primary)',
                        width:        '100%',
                      }}
                    >
                      {msg.content}

                      {/* Reconnect Google link */}
                      {msg.meta?.reconnectGmail && (
                        <button
                          onClick={handleReconnectGoogle}
                          style={{
                            display:      'block',
                            marginTop:    '8px',
                            fontFamily:   "'Rajdhani', sans-serif",
                            fontSize:     '12px',
                            letterSpacing: '0.04em',
                            color:        'var(--color-neon-cyan)',
                            background:   'none',
                            border:       'none',
                            cursor:       'pointer',
                            padding:      0,
                            textDecoration: 'underline',
                            textUnderlineOffset: '3px',
                            transition:   'opacity 150ms',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                        >
                          Reconnect Google to enable Gmail access →
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
                    padding:      '8px 12px',
                    borderRadius: '4px',
                    background:   'var(--color-bg-raised)',
                    border:       '1px solid var(--color-border)',
                    display:      'flex',
                    alignItems:   'center',
                    gap:          '8px',
                  }}
                >
                  <Loader2
                    size={13}
                    className="animate-spin"
                    style={{ color: 'var(--color-neon-cyan)' }}
                    aria-hidden="true"
                  />
                  <span
                    style={{
                      fontFamily:   "'Rajdhani', sans-serif",
                      fontSize:     '12px',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color:        'var(--color-text-secondary)',
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
                  fontFamily:   "'Rajdhani', sans-serif",
                  fontSize:     '12px',
                  letterSpacing: '0.04em',
                  color:        'var(--color-danger)',
                  textAlign:    'center',
                  padding:      '0 8px',
                }}
              >
                {error}
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          {/* ── Input row ── */}
          <form
            onSubmit={handleSend}
            className="flex gap-2 flex-shrink-0 p-3"
            style={{ borderTop: '1px solid var(--color-border)' }}
          >
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask about tasks, schedule, or emails…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              style={{
                flex:         1,
                background:   'var(--color-bg-raised)',
                border:       '1px solid var(--color-border)',
                borderRadius: '4px',
                padding:      '8px 12px',
                color:        'var(--color-text-primary)',
                fontFamily:   "'Rajdhani', sans-serif",
                fontSize:     '14px',
                letterSpacing: '0.02em',
                outline:      'none',
                caretColor:   'var(--color-neon-cyan)',
                transition:   'border-color 250ms, box-shadow 250ms',
                opacity:      loading ? 0.5 : 1,
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--color-border-bright)';
                e.target.style.boxShadow   = '0 0 0 3px var(--color-neon-cyan-glow)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--color-border)';
                e.target.style.boxShadow   = 'none';
              }}
            />
            {/* Send — outlined icon button */}
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
          </form>
        </div>
      )}

      {/* ── Floating bubble — transparent + glowPulse ── */}
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
          e.currentTarget.style.boxShadow  = '0 0 30px rgba(0,212,255,0.8), inset 0 0 20px rgba(0,212,255,0.1)';
          e.currentTarget.style.animation  = 'none';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow  = '';
          if (!open) e.currentTarget.style.animation = 'glowPulse 2s ease-in-out infinite';
        }}
        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; }}
        onMouseUp={(e)   => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {open
          ? <X size={20} aria-hidden="true" />
          : <MessageCircle size={20} aria-hidden="true" />
        }
      </button>
    </>
  );
}

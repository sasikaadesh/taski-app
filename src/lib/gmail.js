// gmail.js — Gmail API helper for the Taski chatbot.
//
// PRIVACY & SECURITY:
//   • Requests gmail.readonly (reading) and gmail.send (sending) scopes.
//   • Email content is never stored in localStorage.
//   • Email data is only passed to the Claude API for answering/drafting.
//   • Email is NEVER sent without explicit user confirmation via UI button click.
//
// SETUP REQUIRED:
//   You must enable the Gmail API in Google Cloud Console before this will work:
//   https://console.cloud.google.com/apis/library/gmail.googleapis.com
//   The gmail.send scope should already be covered since the Gmail API was
//   enabled earlier — verify it appears in your OAuth consent screen scopes.
//   Add the same OAuth 2.0 Client ID you use for Google Calendar.

import { getValidToken, signOut } from './googleAuth';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

// ── Query builder ─────────────────────────────────────────────────────────────

/**
 * Build a Gmail search query from a natural-language user message.
 * Handles partial domain searches (e.g. "emails from Temu.com" → from:@temu.com).
 */
export function buildQuery(userMessage) {
  const msg = userMessage.toLowerCase();
  const tz  = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let queryParts = [];

  // ── Sender detection ───────────────────────────────────────────────────────
  const fromPatterns = [
    /emails?\s+from\s+([a-zA-Z0-9@._\-\s]+?)(?=\s+(?:on|today|yesterday|this|about|that|which|and)\b|$)/i,
    /from\s+([a-zA-Z0-9@._\-\s]+?)(?=\s+(?:on|today|yesterday|this|about|emails?)\b|$)/i,
    /sent\s+by\s+([a-zA-Z0-9@._\-\s]+?)(?=\s|$)/i,
    /messages?\s+from\s+([a-zA-Z0-9@._\-\s]+?)(?=\s|$)/i,
  ];

  let senderRaw = null;
  for (const pattern of fromPatterns) {
    const match = userMessage.match(pattern);
    if (match?.[1]) { senderRaw = match[1].trim(); break; }
  }

  if (senderRaw) {
    const sender = senderRaw.trim().replace(/\s+/g, ' ');

    if (sender.includes('@')) {
      // Full email address: john@company.com
      queryParts.push('from:' + sender);
    } else if (sender.match(/\.[a-z]{2,}$/i) && !sender.includes(' ')) {
      // Domain with extension: temu.com, amazon.co.uk
      // from:@domain catches any email sent from that domain
      const cleanDomain = sender.toLowerCase().replace(/^www\./, '');
      queryParts.push('from:@' + cleanDomain);
    } else if (sender.includes(' ')) {
      // Multi-word name: "John Smith", "Amazon Web Services"
      const noSpaces   = sender.replace(/\s+/g, '');
      const fromClause = '(from:' + noSpaces + ' OR "' + sender + '")';
      queryParts.push(fromClause);
    } else {
      // Single word: "Temu", "Netflix", "Amazon"
      queryParts.push(
        '(from:' + sender + ' OR from:@' + sender.toLowerCase() + '.com)',
      );
    }
  }

  // ── Subject detection ──────────────────────────────────────────────────────
  const subjectPatterns = [
    /about\s+["']?([a-zA-Z0-9\s\-_]+?)["']?(?=\s+from|\s+on|$)/i,
    /subject[:\s]+["']?([a-zA-Z0-9\s\-_]+?)["']?(?=\s|$)/i,
    /regarding\s+([a-zA-Z0-9\s\-_]+?)(?=\s|$)/i,
    /related\s+to\s+([a-zA-Z0-9\s\-_]+?)(?=\s|$)/i,
  ];
  for (const pattern of subjectPatterns) {
    const match = userMessage.match(pattern);
    if (match?.[1] && match[1].trim().length > 2) {
      queryParts.push('subject:"' + match[1].trim() + '"');
      break;
    }
  }

  // ── Date detection ─────────────────────────────────────────────────────────
  const now = new Date();
  const localDate = (d) => d.toLocaleDateString('en-CA', { timeZone: tz });

  if (msg.includes('today')) {
    queryParts.push('after:' + localDate(now));
  } else if (msg.includes('yesterday')) {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    queryParts.push('after:' + localDate(y) + ' before:' + localDate(now));
  } else if (msg.includes('this week') || msg.includes('past week') || msg.includes('last week')) {
    const w = new Date(now); w.setDate(w.getDate() - 7);
    queryParts.push('after:' + localDate(w));
  } else if (msg.includes('this month')) {
    const m = new Date(now); m.setDate(1);
    queryParts.push('after:' + localDate(m));
  }

  const dateMatch = userMessage.match(/on\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})/i);
  if (dateMatch) {
    const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
    const month  = months[dateMatch[1].toLowerCase().slice(0, 3)];
    const day    = dateMatch[2].padStart(2, '0');
    queryParts.push('after:' + now.getFullYear() + '/' + month + '/' + day);
  }

  // ── Other filters ──────────────────────────────────────────────────────────
  if (msg.includes('unread'))                              queryParts.push('is:unread');
  if (msg.includes('attachment') || msg.includes('attached')) queryParts.push('has:attachment');
  if (msg.includes('sent') && !msg.includes('from'))       queryParts.push('in:sent');

  // ── Fallback keyword extraction ────────────────────────────────────────────
  if (queryParts.length === 0) {
    const stopWords = new Set([
      'are','there','any','emails','email','from','my','the','a','an','on','in',
      'at','to','for','of','and','or','with','have','has','been','today','show',
      'me','find','search','check','get','can','you','please','gmail','inbox',
      'messages','sent','received','i','is','it','this','that',
    ]);
    const keywords = userMessage.toLowerCase()
      .replace(/[^\w\s]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
      .slice(0, 3);
    return keywords.length > 0 ? keywords.join(' ') : 'in:inbox newer_than:1d';
  }

  return queryParts.join(' ');
}

// ── Authenticated fetch helper ────────────────────────────────────────────────

/**
 * Make an authenticated request to the Gmail REST API.
 * On 401 (token expired / wrong scope) the token is cleared and the user is
 * prompted to re-authenticate with the updated scope list, then the request
 * is retried once.
 *
 * Throws typed error strings so callers can show appropriate UI:
 *   'GMAIL_SCOPE_MISSING'  — 401 / 403 persisted even after re-auth
 *   'GMAIL_RATE_LIMIT'     — 429 from Gmail
 *   'GMAIL_AUTH_CANCELLED' — user closed the re-auth popup
 *   'GMAIL_ERROR:<status>' — other HTTP error
 */
async function gmailFetch(url, init = {}) {
  let token;
  try {
    token = await getValidToken();
  } catch (err) {
    if (err.message?.toLowerCase().includes('cancel')) {
      throw new Error('GMAIL_AUTH_CANCELLED');
    }
    throw err;
  }

  const withAuth = (t) => ({
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` },
  });

  let res = await fetch(url, withAuth(token));

  if (res.status === 429) throw new Error('GMAIL_RATE_LIMIT');

  // 401 = expired / revoked  •  403 = insufficient scope (old calendar-only token)
  // Clear the stored token, which forces a fresh sign-in with the updated SCOPES
  // (now includes gmail.readonly) so the user consents once and both services work.
  if (res.status === 401 || res.status === 403) {
    signOut();
    let freshToken;
    try {
      freshToken = await getValidToken();
    } catch (err) {
      if (err.message?.toLowerCase().includes('cancel')) {
        throw new Error('GMAIL_AUTH_CANCELLED');
      }
      throw err;
    }
    res = await fetch(url, withAuth(freshToken));
    if (res.status === 401 || res.status === 403) {
      throw new Error('GMAIL_SCOPE_MISSING');
    }
    if (res.status === 429) throw new Error('GMAIL_RATE_LIMIT');
    if (!res.ok) throw new Error(`GMAIL_ERROR:${res.status}`);
    return res;
  }

  if (!res.ok) throw new Error(`GMAIL_ERROR:${res.status}`);
  return res;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Search Gmail and return up to 5 matching emails.
 *
 * @param {string} query — Gmail search query string (e.g. "from:James after:2026/05/25")
 * @returns {Promise<Array<{id, from, subject, date, snippet, unread}>>}
 */
export async function searchEmails(query) {
  console.log('Searching Gmail with:', query);

  // Step 1 — get matching message IDs
  const messageIds = await fetchMessageIds(query, 5);

  // If no results and query has a from: clause, retry without it
  if (messageIds.length === 0 && query.includes('from:')) {
    const broaderQuery = query
      .replace(/from:\([^)]+\)/g, '')
      .replace(/from:\S+/g, '')
      .trim();
    if (broaderQuery.length > 0) {
      console.log('Retrying broader query:', broaderQuery);
      const fallbackIds = await fetchMessageIds(broaderQuery, 5).catch(() => []);
      if (fallbackIds.length > 0) {
        return fetchMessageDetails(fallbackIds);
      }
    }
    return [];
  }

  if (messageIds.length === 0) return [];
  return fetchMessageDetails(messageIds);
}

async function fetchMessageIds(query, max) {
  const listUrl = new URL(`${GMAIL_BASE}/messages`);
  listUrl.searchParams.set('q',          query);
  listUrl.searchParams.set('maxResults', String(max));
  const listRes  = await gmailFetch(listUrl.toString());
  const listData = await listRes.json();
  return (listData.messages ?? []).slice(0, max).map((m) => m.id);
}

async function fetchMessageDetails(messageIds) {
  const results = await Promise.all(
    messageIds.map(async (id) => {
      const msgUrl =
        `${GMAIL_BASE}/messages/${id}` +
        '?format=metadata' +
        '&metadataHeaders=From' +
        '&metadataHeaders=Subject' +
        '&metadataHeaders=Date';
      try {
        const msgRes = await gmailFetch(msgUrl);
        const msg    = await msgRes.json();
        return parseMessage(msg);
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

/**
 * Send an email via the Gmail API using the user's Google account.
 *
 * // Email is never sent without explicit user confirmation via UI button click.
 *
 * @param {Object} emailData
 * @param {string} emailData.to      — Recipient email address (validated before calling)
 * @param {string} emailData.subject — Email subject line
 * @param {string} emailData.body    — Plain-text email body
 * @param {string} [emailData.cc]    — Optional CC address
 * @returns {Promise<{id: string, threadId: string}>} — Gmail message object from API
 *
 * Throws typed error strings:
 *   'GMAIL_INVALID_EMAIL'  — `to` address fails basic RFC format check
 *   'GMAIL_SCOPE_MISSING'  — the send scope was not granted
 *   'GMAIL_AUTH_CANCELLED' — user closed the auth popup
 *   'GMAIL_RATE_LIMIT'     — 429 from Gmail
 *   'GMAIL_ERROR:<status>' — other HTTP error
 */
export async function sendEmail({ to, subject, body, cc }) {
  // Validate the recipient address before touching the API
  const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  if (!EMAIL_RE.test(to.trim())) {
    throw new Error('GMAIL_INVALID_EMAIL');
  }

  // Build an RFC 2822 message.  CRLF line endings are required by the spec.
  const lines = [];
  lines.push(`To: ${to.trim()}`);
  if (cc?.trim()) lines.push(`Cc: ${cc.trim()}`);
  lines.push(`Subject: ${subject}`);
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/plain; charset=UTF-8');
  lines.push('');          // blank line separates headers from body
  lines.push(body);
  const rawMessage = lines.join('\r\n');

  // Base64url encode (RFC 4648 §5) — Gmail API requires this exact encoding.
  // btoa() only handles Latin-1; encodeURIComponent → unescape expands UTF-8.
  const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g,  '');

  const sendRes = await gmailFetch(`${GMAIL_BASE}/messages/send`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ raw: encoded }),
  });

  return sendRes.json(); // { id, threadId, labelIds }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse a Gmail API message object into a flat, display-friendly shape. */
function parseMessage(msg) {
  const headers  = msg.payload?.headers ?? [];
  const get      = (name) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

  // `internalDate` is a UTC epoch in milliseconds (as a string) — always returned
  // by the API regardless of format. It's a precise UTC timestamp, unlike the
  // `Date` header which reflects the sender's timezone and can be spoofed.
  // Convert it to the user's local timezone so Claude always sees local times,
  // never UTC. Never show UTC times to the user or Claude.
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let localDate  = get('Date'); // raw RFC-2822 fallback if internalDate is absent
  if (msg.internalDate) {
    try {
      localDate = new Date(parseInt(msg.internalDate, 10)).toLocaleString('en-US', {
        timeZone:  timezone,
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      // keep raw header as fallback
    }
  }

  return {
    id:      msg.id,
    from:    get('From'),
    subject: get('Subject') || '(No subject)',
    date:    localDate,
    // snippet is a plain-text preview already provided by the API (no body needed)
    snippet: (msg.snippet ?? '').slice(0, 200),
    unread:  (msg.labelIds ?? []).includes('UNREAD'),
  };
}

/**
 * Format an array of email objects into a concise text block for the Claude
 * system prompt.  Never logs the content — only returned as a string.
 *
 * @param {Array}  emails  — from searchEmails()
 * @param {string} query   — original Gmail query (shown for transparency)
 * @returns {string}
 */
export function formatEmailsForPrompt(emails, query) {
  if (emails.length === 0) {
    return `No emails found matching query: "${query}"`;
  }

  const lines = [`Found ${emails.length} email(s) matching "${query}":\n`];
  emails.forEach((em, i) => {
    lines.push(`Email ${i + 1}:`);
    lines.push(`  From:    ${em.from}`);
    lines.push(`  Subject: ${em.subject}`);
    lines.push(`  Date:    ${em.date}`);
    lines.push(`  Preview: ${em.snippet}`);
    if (em.unread) lines.push('  Status:  UNREAD');
    lines.push('');
  });

  return lines.join('\n');
}

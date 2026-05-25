// gmail.js — Gmail API helper for the Taski chatbot.
//
// PRIVACY & SECURITY:
//   • Only requests gmail.readonly scope — never write or send permissions.
//   • Email content is never stored in localStorage.
//   • Email data is only passed to the Claude API for answering the user's question.
//
// SETUP REQUIRED:
//   You must enable the Gmail API in Google Cloud Console before this will work:
//   https://console.cloud.google.com/apis/library/gmail.googleapis.com
//   Add the same OAuth 2.0 Client ID you use for Google Calendar.

import { getGoogleAccessToken, clearToken } from './googleCalendar';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

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
    token = await getGoogleAccessToken();
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
    clearToken();
    let freshToken;
    try {
      freshToken = await getGoogleAccessToken();
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
  // Step 1 — get matching message IDs
  const listUrl = new URL(`${GMAIL_BASE}/messages`);
  listUrl.searchParams.set('q',          query);
  listUrl.searchParams.set('maxResults', '5');

  const listRes  = await gmailFetch(listUrl.toString());
  const listData = await listRes.json();
  const messageIds = (listData.messages ?? []).slice(0, 5).map((m) => m.id);

  if (messageIds.length === 0) return [];

  // Step 2 — fetch metadata for each message in parallel
  // (metadata format avoids downloading the full body for privacy & speed)
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
        // Skip individual messages that fail — still return the others
        return null;
      }
    })
  );

  return results.filter(Boolean);
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

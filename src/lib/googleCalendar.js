// googleCalendar.js — frontend-only Google Calendar integration.
//
// Flow:
//   1. getCalendarEvents(date) / createCalendarEvent(todo) are the public entry points.
//   2. If we have a valid cached token, skip straight to the API call.
//   3. Otherwise, open a small OAuth popup (implicit / token flow — no secret needed).
//   4. Poll until Google redirects back to our origin with #access_token in the hash.
//   5. Store the token + expiry in localStorage and close the popup.
//   6. Call the Calendar REST API and return the result.
//
// Scope: calendar covers reading/writing events AND listing all calendars (calendarList).

const CLIENT_ID    = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const REDIRECT_URI = window.location.origin; // e.g. http://localhost:5173
// Full calendar scope + Gmail readonly.
// gmail.readonly is needed for the chatbot Gmail search feature.
// NOTE: You must also enable the Gmail API in Google Cloud Console:
//   https://console.cloud.google.com/apis/library/gmail.googleapis.com
const SCOPES =
  'https://www.googleapis.com/auth/calendar ' +
  'https://www.googleapis.com/auth/gmail.readonly';
const TOKEN_KEY    = 'taski_goog_token';

// ── Token storage ─────────────────────────────────────────────────────────────

function storeToken(accessToken, expiresIn) {
  const data = {
    token:     accessToken,
    expiresAt: Date.now() + parseInt(expiresIn, 10) * 1000,
  };
  try { localStorage.setItem(TOKEN_KEY, JSON.stringify(data)); } catch { /* ignore */ }
  return data.token;
}

function getStoredToken() {
  try {
    const data = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null');
    if (data?.token && data.expiresAt > Date.now() + 60_000) return data.token;
  } catch { /* ignore */ }
  return null;
}

export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

/**
 * Return a valid Google access token.
 * Uses the cached token if still valid; otherwise opens the OAuth popup.
 * Exported so that other modules (e.g. gmail.js) can share the same auth flow.
 */
export async function getGoogleAccessToken() {
  let token = getStoredToken();
  if (!token) token = await signInWithPopup();
  return token;
}

// ── OAuth2 implicit-flow popup ────────────────────────────────────────────────

function buildAuthUrl() {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id',     CLIENT_ID);
  url.searchParams.set('redirect_uri',  REDIRECT_URI);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('scope',         SCOPES);
  url.searchParams.set('prompt',        'select_account');
  return url.toString();
}

/**
 * Open a popup to Google's OAuth consent screen.
 * Resolves with the access token once the popup lands back on our origin.
 * Rejects if the user closes the popup without completing sign-in.
 */
function signInWithPopup() {
  return new Promise((resolve, reject) => {
    const popup = window.open(
      buildAuthUrl(),
      'taski-google-auth',
      'width=520,height=620,left=200,top=100,toolbar=0,menubar=0,scrollbars=1'
    );

    if (!popup) {
      reject(new Error('Popup was blocked. Please allow popups for this site and try again.'));
      return;
    }

    const timer = setInterval(() => {
      // If user closed the popup without finishing
      if (popup.closed) {
        clearInterval(timer);
        reject(new Error('Google sign-in was cancelled.'));
        return;
      }

      try {
        // This throws while the popup is on google.com (cross-origin).
        // Once it redirects back to our origin we can read the hash.
        const hash = popup.location.hash;
        if (!hash) return;

        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get('access_token');
        const expiresIn   = params.get('expires_in') ?? '3599';

        if (accessToken) {
          clearInterval(timer);
          popup.close();
          const token = storeToken(accessToken, expiresIn);
          resolve(token);
        }
      } catch {
        // Still on google.com — keep polling
      }
    }, 400);
  });
}

// ── Authenticated fetch helper ────────────────────────────────────────────────

/**
 * Make an authenticated request to the Google Calendar API.
 * Automatically retries once after re-auth if the token is expired (401)
 * or lacks sufficient scope (403).
 *
 * @param {string} url
 * @param {RequestInit} init
 * @returns {Promise<Response>} — guaranteed ok, or throws
 */
async function calendarFetch(url, init = {}) {
  let token = getStoredToken();
  if (!token) token = await signInWithPopup();

  const withAuth = (t) => ({
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${t}` },
  });

  const res = await fetch(url, withAuth(token));

  // 401 = expired / revoked  •  403 = insufficient scope (old readonly token)
  // Either way: clear + re-auth, then retry once.
  if (res.status === 401 || res.status === 403) {
    clearToken();
    const fresh = await signInWithPopup();
    const retry = await fetch(url, withAuth(fresh));
    if (!retry.ok) throw new Error(`Google Calendar API error ${retry.status}`);
    return retry;
  }

  if (!res.ok) throw new Error(`Google Calendar API error ${res.status}`);
  return res;
}

// ── Calendar list helper ──────────────────────────────────────────────────────

/**
 * Fetch all calendar IDs the signed-in user has access to.
 * Returns an array of calendar ID strings (e.g. ["primary", "work@...", ...]).
 * Requires the `calendar` or `calendar.readonly` OAuth scope.
 */
async function getCalendarList() {
  const url = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList');
  url.searchParams.set('maxResults', '50');

  const res  = await calendarFetch(url.toString());
  const data = await res.json();
  const items = data.items ?? [];

  console.log(
    '[Taski] Calendar list (%d calendars):',
    items.length,
    items.map((c) => ({ id: c.id, summary: c.summary, accessRole: c.accessRole })),
  );

  return items.map((c) => c.id);
}

// ── Google Calendar REST API ──────────────────────────────────────────────────

/**
 * Fetch all events on `date` (YYYY-MM-DD) across ALL of the signed-in user's calendars.
 * Uses the local timezone (not UTC) for the day boundary.
 * Returns an array of simplified event objects: { summary, start, end, allDay, calendarId }.
 */
export async function getCalendarEvents(date) {
  // Build day boundaries in local time — setHours avoids the UTC-shift problem.
  const dayStart = new Date(`${date}T00:00:00`);  // local midnight
  const dayEnd   = new Date(`${date}T23:59:59`);  // local end-of-day

  const calendarIds = await getCalendarList();
  console.log(`[Taski] Fetching events for ${date} from ${calendarIds.length} calendar(s)`);
  console.log(`[Taski] Time range: ${dayStart.toISOString()} — ${dayEnd.toISOString()}`);

  const allItems = [];

  for (const calendarId of calendarIds) {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    );
    url.searchParams.set('timeMin',      dayStart.toISOString());
    url.searchParams.set('timeMax',      dayEnd.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy',      'startTime');
    url.searchParams.set('maxResults',   '50');

    try {
      const res   = await calendarFetch(url.toString());
      const data  = await res.json();
      const items = data.items ?? [];

      console.log(
        `[Taski] Calendar "${calendarId}" → ${items.length} event(s):`,
        items.map((e) => ({ summary: e.summary, start: e.start })),
      );

      // Tag each item with the source calendarId for traceability
      items.forEach((item) => { item._calendarId = calendarId; });
      allItems.push(...items);
    } catch (err) {
      console.warn(`[Taski] Could not fetch from calendar "${calendarId}":`, err.message);
    }
  }

  return normaliseEvents(allItems);
}

/**
 * Create a Google Calendar event for the given todo.
 * Events are always written to the "primary" calendar (the user's main calendar).
 *
 * - If `todo.time` is set  → timed event from `time` to `time + 1 hour`.
 * - If `todo.time` is missing → all-day event on `todo.date`.
 *
 * Returns the created event object from the API (includes `id` and `htmlLink`).
 * Throws if `todo.date` is missing or the API call fails.
 */
export async function createCalendarEvent({ title, date, time }) {
  if (!date) throw new Error('Cannot create a calendar event without a date.');

  let eventBody;
  if (time) {
    const startDt = new Date(`${date}T${time}:00`);
    const endDt   = new Date(startDt.getTime() + 60 * 60 * 1000); // +1 hour
    eventBody = {
      summary: title,
      start: { dateTime: startDt.toISOString() },
      end:   { dateTime: endDt.toISOString() },
    };
  } else {
    // All-day: Google Calendar expects start.date === end.date for a single all-day event
    eventBody = {
      summary: title,
      start: { date },
      end:   { date },
    };
  }

  const res  = await calendarFetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(eventBody),
    }
  );
  return res.json(); // { id, htmlLink, summary, start, end, … }
}

/**
 * Fetch events across a date range across ALL of the signed-in user's calendars.
 * `startDate` and `endDate` are plain JS Date objects (time is ignored — the full
 * calendar day at each end is included, in local time).
 * Returns the same normalised array as getCalendarEvents.
 */
export async function getCalendarEventsForRange(startDate, endDate) {
  // Build boundaries in local time so we don't lose a day at midnight for non-UTC zones.
  const timeMin = new Date(startDate);
  timeMin.setHours(0, 0, 0, 0);   // local midnight

  const timeMax = new Date(endDate);
  timeMax.setHours(23, 59, 59, 999); // local end-of-day

  const calendarIds = await getCalendarList();
  console.log(
    `[Taski] Fetching events for range ${localDateKey(timeMin)} — ${localDateKey(timeMax)} ` +
    `from ${calendarIds.length} calendar(s)`,
  );
  console.log(`[Taski] UTC range: ${timeMin.toISOString()} — ${timeMax.toISOString()}`);

  const allItems = [];

  for (const calendarId of calendarIds) {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    );
    url.searchParams.set('timeMin',      timeMin.toISOString());
    url.searchParams.set('timeMax',      timeMax.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy',      'startTime');
    url.searchParams.set('maxResults',   '50');

    try {
      const res   = await calendarFetch(url.toString());
      const data  = await res.json();
      const items = data.items ?? [];

      console.log(
        `[Taski] Calendar "${calendarId}" → ${items.length} event(s):`,
        items.map((e) => ({ summary: e.summary, start: e.start })),
      );

      items.forEach((item) => { item._calendarId = calendarId; });
      allItems.push(...items);
    } catch (err) {
      console.warn(`[Taski] Could not fetch from calendar "${calendarId}":`, err.message);
    }
  }

  return normaliseEvents(allItems);
}

/**
 * Returns true if a valid (non-expired) Google OAuth token is already cached.
 * This is a synchronous check — it never opens the auth popup.
 */
export function isSignedIn() {
  return Boolean(getStoredToken());
}

/**
 * Build a human-readable calendar context block for the chatbot system prompt.
 * Groups events by calendar day and includes a header for each day in the range.
 *
 * @param {Array}  events    — normalised event objects from getCalendarEventsForRange
 * @param {Date}   startDate
 * @param {Date}   endDate
 * @returns {string}
 */
export function buildCalendarContext(events, startDate, endDate) {
  // Index events by their LOCAL date key (YYYY-MM-DD).
  // We extract the date from the start string directly (the API returns local-time
  // dateTime strings like "2026-05-28T01:00:00+05:30") so splitting on 'T' is correct.
  const byDate = {};
  events.forEach((ev) => {
    const key = ev.start.includes('T') ? ev.start.split('T')[0] : ev.start;
    (byDate[key] ??= []).push(ev);
  });

  const lines  = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

  const stop = new Date(endDate);
  stop.setHours(0, 0, 0, 0);

  while (cursor <= stop) {
    // Use local date components — toISOString() would give the UTC date which
    // can be a day behind for users in timezones east of UTC.
    const key      = localDateKey(cursor);
    const dayLabel = cursor.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
    const dayEvents = byDate[key] ?? [];

    lines.push(`${dayLabel}:`);
    if (dayEvents.length === 0) {
      lines.push('  No events scheduled.');
    } else {
      dayEvents.forEach((ev) => {
        if (ev.allDay) {
          lines.push(`  • ${ev.summary} (all day)`);
        } else {
          lines.push(`  • ${ev.summary}: ${fmtTime(ev.start)} – ${fmtTime(ev.end)}`);
        }
      });
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return lines.join('\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Return "YYYY-MM-DD" using LOCAL date components (not UTC).
 * Using toISOString() for this gives the wrong date for non-UTC timezones.
 */
function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normaliseEvents(items) {
  return items.map((ev) => {
    const allDay = Boolean(ev.start?.date && !ev.start?.dateTime);
    const start  = ev.start?.dateTime ?? ev.start?.date ?? '';
    const end    = ev.end?.dateTime   ?? ev.end?.date   ?? '';
    return {
      summary:    ev.summary ?? '(No title)',
      start,
      end,
      allDay,
      calendarId: ev._calendarId ?? 'unknown',
    };
  });
}

/**
 * Format an events array into a human-readable block for Claude's context.
 * Returns a short "(No events found)" message when the calendar is empty.
 */
export function formatEventsForPrompt(events) {
  if (!events.length) return 'No events found on this day.';

  return events
    .map((ev) => {
      if (ev.allDay) return `• ${ev.summary} (all day)`;
      const s = fmtTime(ev.start);
      const e = fmtTime(ev.end);
      return `• ${ev.summary}: ${s}–${e}`;
    })
    .join('\n');
}

function fmtTime(iso) {
  if (!iso) return '?';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

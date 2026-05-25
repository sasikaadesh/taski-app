// useCalendarCheck — fetches Google Calendar events via REST API, then asks
// Claude to reason about conflicts. No MCP involved.

import { useState, useCallback } from 'react';
import { callClaude, buildCalendarCheckSystem } from '../lib/claude';
import { getCalendarEvents, formatEventsForPrompt } from '../lib/googleCalendar';

/**
 * Returns { suggestion, loading, error, check, clear }
 *
 * Usage:
 *   const { suggestion, loading, check, clear } = useCalendarCheck();
 *   check({ title, date, time });   // fetches calendar events, then asks Claude
 *   clear();                        // dismiss the banner
 */
export function useCalendarCheck() {
  const [suggestion, setSuggestion] = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const check = useCallback(async (todo) => {
    // Only run if a date was provided (time is optional)
    if (!todo.date) return;

    setLoading(true);
    setError('');
    setSuggestion('');

    try {
      // ── Step 1: Fetch Google Calendar events for the task's date ─────────
      let eventsContext = '';
      try {
        const events = await getCalendarEvents(todo.date);
        eventsContext = formatEventsForPrompt(events);
      } catch (calErr) {
        // If the user cancelled sign-in or the calendar fetch failed,
        // still let Claude respond — just without calendar data.
        eventsContext = `(Calendar unavailable: ${calErr.message})`;
      }

      // ── Step 2: Ask Claude to reason about conflicts ──────────────────────
      const system = buildCalendarCheckSystem(todo);

      const userPrompt =
        `Here are the existing Google Calendar events for ${todo.date}:\n\n` +
        `${eventsContext}\n\n` +
        `My new task is: "${todo.title}"` +
        (todo.time ? ` scheduled at ${todo.time}.` : ' (no specific time set).') +
        `\n\nAre there any conflicts I should know about?`;

      const reply = await callClaude(
        [{ role: 'user', content: userPrompt }],
        { system }
      );

      setSuggestion(reply);
    } catch (err) {
      // Surface a friendly message; keep the todo — don't block the user
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setSuggestion('');
    setError('');
  }, []);

  return { suggestion, loading, error, check, clear };
}

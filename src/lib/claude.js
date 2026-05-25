// Central module for all Anthropic Claude API calls — keep all AI logic here.

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-20250514';
const API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * callClaude — generic wrapper for the Claude Messages API.
 *
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages
 * @param {Object} options
 * @param {string} options.system - Optional system prompt
 * @returns {Promise<string>}     - Claude's final text response
 */
export async function callClaude(messages, { system = '' } = {}) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error(
      'Missing VITE_ANTHROPIC_API_KEY — copy .env.example → .env and add your key.'
    );
  }

  const body = {
    model: MODEL,
    max_tokens: 1024,
    messages,
  };

  if (system) body.system = system;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key':                               ANTHROPIC_API_KEY,
      'anthropic-version':                       '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type':                            'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Claude API error ${response.status}`);
  }

  const data = await response.json();

  // Extract the text block from the response
  const textBlock = [...(data.content ?? [])].reverse().find((b) => b.type === 'text');
  return textBlock?.text ?? '';
}

// ── System prompts ────────────────────────────────────────────────────────────

/** System prompt for the floating chatbot panel */
export const CHATBOT_SYSTEM = `You are Taski Assistant, a friendly AI built into the Taski todo app.
You help users manage their tasks and schedule.
Keep answers concise (2-4 sentences max unless the user asks for more detail).
The app has: a todo list with date/time pickers, and Google Calendar conflict detection.`;

/**
 * Build a calendar-check system prompt for a specific todo.
 * Calendar events for the day are fetched separately and passed via the user message.
 *
 * @param {{ title: string, date: string, time: string }} todo
 */
export function buildCalendarCheckSystem({ title, date, time }) {
  return `You are a smart scheduling assistant integrated into the Taski todo app.
The user just added a task titled "${title}" scheduled for ${date || 'an unspecified date'}${time ? ' at ' + time : ''}.
You will be given their Google Calendar events for that day as context.
Reply in ONE short paragraph (2-3 sentences) with either:
  • A conflict warning and a suggested alternative time, or
  • A friendly confirmation that the slot looks clear.
Be direct and conversational. Do not repeat the raw calendar data back to the user.`;
}

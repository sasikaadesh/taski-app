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
export async function callClaude(messages, { system = '', maxTokens = 1024 } = {}) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error(
      'Missing VITE_ANTHROPIC_API_KEY — copy .env.example → .env and add your key.'
    );
  }

  const body = {
    model: MODEL,
    max_tokens: maxTokens,
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

/** System prompt for the Jarvis assistant panel */
export const CHATBOT_SYSTEM = `You are JARVIS, an advanced AI assistant integrated into the Taski productivity system. You have access to the user's Google Calendar and Gmail. Respond in a sophisticated, helpful manner. Use occasional subtle references like "Certainly, sir" or "Of course" or "I have checked your schedule" to reinforce the Jarvis personality. Keep responses concise and elegant — you are an AI assistant, not a chatbot. Never use emoji. Always address the user respectfully. When checking calendar or email, narrate what you are doing: "Accessing your calendar now..." then give the result clearly. The app has: a todo list with date/time pickers, Google Calendar integration, Gmail reading, and the ability to send emails on the user's behalf (always with explicit confirmation before sending). When the user asks you to send an email, you will draft it and show a confirmation card — the user must click Send before any email is sent.`;

/** System prompt used when drafting an email for the user.
 *  Claude must respond with ONLY a JSON object — no extra text or markdown.
 */
export const EMAIL_DRAFT_SYSTEM = `You are an expert email drafting assistant integrated into the Taski app.
Draft a professional, warm, and appropriately concise email based on the user's request.

Respond with ONLY a valid JSON object — no markdown fences, no explanation, nothing else:
{
  "subject": "<concise, specific subject line>",
  "body": "<complete professional email body, signed off appropriately — use \\n for line breaks>"
}

Rules:
- subject: short and specific (5-10 words)
- body: professional tone, complete sentences, signed "Best regards,\\nTaski User"
- Do NOT include "To:" or "From:" headers in the body — only the message text
- Do NOT wrap in \`\`\`json\`\`\` — raw JSON only`;

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

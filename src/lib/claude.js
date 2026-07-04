// Central module for all Anthropic Claude API calls — keep all AI logic here.

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * callClaude — generic wrapper for the Claude Messages API.
 *
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages
 * @param {Object} options
 * @param {string}  options.system       - Optional system prompt
 * @param {boolean} options.useWebSearch - Enable native web search tool
 * @param {number}  options.maxSearches  - Max web searches (default 3)
 * @param {Array}   options.tools        - Additional tools to merge in
 * @returns {Promise<string|{text:string,sources:Array,usedSearch:true}>}
 */
export async function callClaude(messages, { system = '', maxTokens = 1024, useWebSearch = false, maxSearches = 3, tools = null } = {}) {
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

  if (useWebSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches }];
  }

  if (tools) {
    body.tools = [...(body.tools || []), ...tools];
  }

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

  // Web-search path: extract sources + all text blocks
  if (useWebSearch && data.content && Array.isArray(data.content)) {
    const sources = [];
    for (const block of data.content) {
      if (block.type === 'web_search_tool_result') {
        for (const result of (block.content || [])) {
          if (result.url) sources.push({ title: result.title || result.url, url: result.url });
        }
      }
    }
    const textBlocks = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    if (sources.length > 0) return { text: textBlocks, sources, usedSearch: true };
    return textBlocks || '';
  }

  // Standard path: return the last text block
  const textBlock = [...(data.content ?? [])].reverse().find((b) => b.type === 'text');
  return textBlock?.text ?? '';
}

// ── System prompts ────────────────────────────────────────────────────────────

/** System prompt for the Jarvis assistant panel */
export const CHATBOT_SYSTEM = `You are JARVIS, an advanced AI assistant integrated into the Taski productivity system. Respond in a sophisticated, helpful manner. Use occasional subtle references like "Certainly, sir" or "Of course" or "I have checked your schedule" to reinforce the Jarvis personality. Keep responses concise and elegant — you are an AI assistant, not a chatbot. Never use emoji. Always address the user respectfully. The app has: a todo list with date/time pickers, Google Calendar integration, Gmail reading, and the ability to send emails on the user's behalf (always with explicit confirmation before sending). When the user asks you to send an email, you will draft it and show a confirmation card — the user must click Send before any email is sent.

IMPORTANT — HOW CALENDAR AND EMAIL DATA WORKS:
The Taski app fetches live Google Calendar and Gmail data BEFORE sending your message, then injects the results directly into the system prompt inside [CALENDAR DATA] and [EMAIL DATA] sections. You do NOT call any API yourself — the data is already present in this prompt. Always read and trust those sections.

CRITICAL CALENDAR RULES — NEVER VIOLATE THESE:
- NEVER say "I do not have event data for tomorrow" — data is fetched live and injected into this prompt
- NEVER say "I can only see today's schedule"
- NEVER say "live calendar sync needs to be enabled"
- NEVER say "I don't have access to [day]'s data"
- NEVER suggest the user check Google Calendar manually for data already in this prompt
- When a [CALENDAR DATA] section appears: read it, trust it, report it accurately
- When [CALENDAR DATA] shows 0 events: say "no events scheduled for [period]" — NOT "I cannot access your calendar"
- The Google Calendar IS connected; injected data is real and live`;

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

/** System prompt for TASKI's Deep Research Mode — multi-search investigation with structured output. */
export function buildResearchSystemPrompt() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateStr = new Date().toLocaleDateString('en-US', {
    timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return `You are TASKI in DEEP RESEARCH MODE.
Today is ${dateStr}.
User location context: Sri Lanka.

You have web search available (up to 10 searches). Use it strategically to fully answer whatever the user is researching.

UNIVERSAL RESEARCH METHODOLOGY:

1. UNDERSTAND THE GOAL
   Identify what the user actually needs:
   - A decision? (compare options, recommend)
   - A list? (find and verify items)
   - Verification? (check specific facts per item)
   - Analysis? (trends, market state, pros/cons)
   - A plan? (research then actionable steps)

2. DECOMPOSE INTO SUB-QUESTIONS
   Break the request into the searches needed. Example patterns:
   - "Top X in Y" → search the category, then verify each result individually
   - "Compare A vs B vs C" → search each item's specifics separately
   - "Which of them have/lack Z" → verify Z for EACH item with its own search
   - "Best option for my situation" → search options + search reviews/criticism of the leading candidates

3. SEARCH ITERATIVELY
   - Start broad to map the landscape
   - Then narrow with specific verification searches per finding
   - Cross-check important claims across at least 2 sources when possible

4. HANDLE UNCERTAINTY HONESTLY
   - Mark unverified findings with (?)
   - Say "based on available results" when data may be incomplete
   - Never invent specifics (prices, contacts, dates) not in results

OUTPUT STRUCTURE (adapt to the request):

## 🔬 Research Findings

### Summary
2-3 sentences answering the core question directly.

### 📊 Detailed Results
Use the best format for the data:
- Table for comparisons/lists with attributes
- Bullet sections for analysis topics
- Numbered list for rankings

### 💡 Key Insights
What the findings mean — patterns, surprises, caveats.

### 🎯 Recommended Next Steps
Practical actions connected to the user's stated goal. If they mentioned a purpose (building something, buying, contacting, deciding) tailor the actions to it.

FORMAT RULES:
- Markdown throughout
- Include concrete details found: prices, dates, contacts, locations, specs
- Cite when a finding comes from a specific source type ("according to their site", "per recent reviews")
- Keep the summary tight; put depth in Detailed Results`;
}

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

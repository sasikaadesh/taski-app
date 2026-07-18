// agentLoop.js — agentic tool loop: native web_search + send_telegram with user confirmation.

import { callClaudeRaw, buildAgentSystemPrompt } from './claude';
import { sendTelegramMessage } from './telegramService';

const MAX_ROUNDS = 8; // hard cap on API round-trips — never loop unbounded

const AGENT_TOOLS = [
  { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
  {
    name: 'send_telegram',
    description:
      'Send a message to the user on Telegram. Call this once, after gathering all information, ' +
      'with the complete formatted result. The message must be PLAIN TEXT (no markdown symbols), ' +
      'point form, short lines. The user reviews and confirms before it actually sends.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The plain-text message to deliver to Telegram' },
      },
      required: ['message'],
    },
  },
];

/**
 * runAgentLoop — calls Claude with tools, executes client tools on stop_reason
 * "tool_use", feeds tool_result blocks back, and repeats until a final text
 * response (or the round cap). The API is stateless, so the full conversation
 * (assistant tool_use + user tool_result blocks) is re-sent on every call.
 *
 * @param {string} userText
 * @param {Object}   opts
 * @param {Function} opts.onStatus                 - ({ phase, round, max }) live status for the UI
 * @param {Function} opts.requestSendConfirmation  - (draftText) => Promise<{action:'send'|'cancel', message}>
 * @returns {Promise<{text, sources, sentToTelegram, rounds, cappedOut}>}
 */
export async function runAgentLoop(userText, { onStatus = () => {}, requestSendConfirmation = null } = {}) {
  const messages = [{ role: 'user', content: userText }];
  const sources  = [];
  let lastText       = '';
  let sentToTelegram = false;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    onStatus({ phase: 'working', round, max: MAX_ROUNDS });

    const resp    = await callClaudeRaw(messages, {
      system:    buildAgentSystemPrompt(),
      tools:     AGENT_TOOLS,
      maxTokens: 2500,
    });
    const content = Array.isArray(resp.content) ? resp.content : [];

    // Blocks are located by type, never by index
    for (const block of content) {
      if (block.type === 'web_search_tool_result') {
        for (const r of (Array.isArray(block.content) ? block.content : [])) {
          if (r.url) sources.push({ title: r.title || r.url, url: r.url });
        }
      }
    }
    const roundText = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    if (roundText.trim()) lastText = roundText;

    console.log(`[Agent] Round ${round}/${MAX_ROUNDS} — stop_reason: ${resp.stop_reason}`);

    if (resp.stop_reason === 'pause_turn') {
      // Server-side web search paused mid-turn — re-send so the server resumes it
      messages.push({ role: 'assistant', content });
      continue;
    }

    if (resp.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content });

      const toolResults = [];
      for (const tool of content.filter((b) => b.type === 'tool_use')) {
        console.log('[Agent] Tool call:', tool.name, tool.input);
        let result;
        if (tool.name === 'send_telegram') {
          result = await executeSendTelegram(tool.input, { onStatus, requestSendConfirmation });
          if (result.sent) sentToTelegram = true;
        } else {
          result = { text: `Unknown tool: ${tool.name}`, isError: true };
        }
        console.log('[Agent] Tool result:', result.text);
        toolResults.push({
          type:        'tool_result',
          tool_use_id: tool.id,
          content:     result.text,
          ...(result.isError ? { is_error: true } : {}),
        });
      }

      // All results for a round go back in ONE user message
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // end_turn / max_tokens — done
    return { text: lastText || 'Done.', sources, sentToTelegram, rounds: round, cappedOut: false };
  }

  return {
    text:
      (lastText ? lastText + '\n\n' : '') +
      `⚠ Reached the ${MAX_ROUNDS}-step limit — here is what I gathered so far.`,
    sources,
    sentToTelegram,
    rounds:    MAX_ROUNDS,
    cappedOut: true,
  };
}

// send_telegram never fires without explicit user confirmation
async function executeSendTelegram(input, { onStatus, requestSendConfirmation }) {
  const draft = typeof input?.message === 'string' ? input.message.trim() : '';
  if (!draft) return { text: 'send_telegram was called with an empty message.', isError: true };

  const DECLINED =
    'The user declined to send this Telegram message. Do not retry; summarize the findings in chat instead.';
  if (!requestSendConfirmation) return { text: DECLINED };

  onStatus({ phase: 'confirming' });
  const decision = await requestSendConfirmation(draft); // resolves on SEND / CANCEL click

  if (decision?.action !== 'send') return { text: DECLINED };

  onStatus({ phase: 'sending' });
  const res = await sendTelegramMessage(decision.message);
  return res.ok
    ? { text: 'Message sent to Telegram successfully.', sent: true }
    : { text: `Telegram send failed: ${res.error}`, isError: true };
}

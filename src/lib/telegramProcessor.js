// telegramProcessor.js — Routes Telegram messages through the full Taski pipeline.

import { sendMessage, sendTyping } from './telegramService';
import { transcribeAudio }         from './whisperService';
import { callClaude }              from './claude';
import { speakText }               from './ttsManager';

export async function processTelegramMessage(token, chatId, userText, username) {
  console.log('[Telegram] Processing:', userText);

  await sendTyping(token, chatId);

  const tz      = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit',
  });

  let systemPrompt =
    `You are TASKI, a Jarvis-style AI assistant responding via Telegram.\n` +
    `User: ${username}\n` +
    `Date: ${dateStr}\n` +
    `Time: ${timeStr}\n` +
    `Timezone: ${tz}\n\n` +
    `Keep responses concise and clear for Telegram. Use plain text, avoid heavy markdown. Max 3-4 paragraphs.`;

  const msg = userText.toLowerCase();

  // ── Route 1: Morning briefing ──
  const briefingWords = ['morning briefing', 'good morning', 'start my day', 'brief me', 'daily briefing', 'morning summary'];
  if (briefingWords.some((w) => msg.includes(w))) {
    try {
      const { getMorningBriefing } = await import('./morningBriefing');
      const data = await getMorningBriefing();
      const result = await callClaude(
        [{ role: 'user', content: data.context }],
        { system: systemPrompt, maxTokens: 1000 }
      );
      const text = typeof result === 'object' ? result.text : result;
      await sendMessage(token, chatId, text);
      speakText(text); // ttsManager checks the mute flag itself
      return;
    } catch (e) {
      await sendMessage(token, chatId, 'Could not get morning briefing: ' + e.message);
      return;
    }
  }

  // ── Route 2: Calendar queries ──
  const calWords = ['calendar', 'meeting', 'meetings', 'schedule', 'events', 'appointment', 'training', 'do i have'];
  if (calWords.some((w) => msg.includes(w))) {
    try {
      const { getCalendarEvents, getCalendarEventsForRange } = await import('./googleCalendar');
      let events = [];

      if (msg.includes('week')) {
        const start = new Date().toISOString().split('T')[0];
        const end   = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
        events = await getCalendarEventsForRange(start, end);
      } else if (msg.includes('tomorrow')) {
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        events = await getCalendarEvents(tomorrow);
      } else {
        const today = new Date().toISOString().split('T')[0];
        events = await getCalendarEvents(today);
      }

      if (events.length > 0) {
        systemPrompt +=
          '\n\nCALENDAR EVENTS:\n' +
          events.map((e) => {
            const start = e.start
              ? new Date(e.start).toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
              : 'All day';
            return `• ${e.title || e.summary} at ${start}` + (e.location ? ` (${e.location})` : '');
          }).join('\n');
      } else {
        systemPrompt += '\n\nCALENDAR: No events found.';
      }
    } catch (e) {
      systemPrompt += '\n\nCALENDAR: Not connected.';
    }
  }

  // ── Route 3: Email queries ──
  const emailWords = ['email', 'emails', 'gmail', 'inbox', 'unread', 'messages'];
  if (emailWords.some((w) => msg.includes(w))) {
    try {
      const { searchEmails } = await import('./gmail');
      const emails = await searchEmails('is:unread newer_than:1d');

      if (emails?.length > 0) {
        systemPrompt +=
          '\n\nRECENT EMAILS:\n' +
          emails.slice(0, 5).map((e) => `• From: ${e.from}\n  Subject: ${e.subject}`).join('\n\n');
      } else {
        systemPrompt += '\n\nEMAIL: No unread emails.';
      }
    } catch (e) {
      systemPrompt += '\n\nEMAIL: Not connected.';
    }
  }

  // ── Route 4: Todo queries ──
  const todoWords = ['todo', 'todos', 'task', 'tasks', 'my list', 'pending', 'add task', 'add todo', 'remind'];
  if (todoWords.some((w) => msg.includes(w))) {
    try {
      let todos = [];
      if (window.taskiAPI?.quickTodosLoad) {
        todos = await window.taskiAPI.quickTodosLoad();
      } else {
        const saved = localStorage.getItem('taski-quicktodos');
        todos = saved ? JSON.parse(saved) : [];
      }

      const pending = todos.filter((t) => !t.done);
      if (pending.length > 0) {
        systemPrompt +=
          '\n\nPENDING TODOS:\n' +
          pending.map((t) =>
            `• [${(t.priority || 'med').toUpperCase()}] ${t.title}` + (t.dueDate ? ` (${t.dueDate})` : '')
          ).join('\n');
      } else {
        systemPrompt += '\n\nTODOS: No pending tasks.';
      }
    } catch (e) {
      systemPrompt += '\n\nTODOS: Could not load.';
    }
  }

  // ── Default: Claude with context ──
  try {
    const result = await callClaude(
      [{ role: 'user', content: userText }],
      { system: systemPrompt, maxTokens: 800, useWebSearch: false }
    );
    const text = typeof result === 'object' ? result.text : result;
    await sendMessage(token, chatId, text || 'Sorry, I could not process that request.');
    if (text) speakText(text); // ttsManager checks the mute flag itself
  } catch (e) {
    await sendMessage(token, chatId, 'Error: ' + e.message);
  }
}

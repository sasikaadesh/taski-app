// telegramService.js — Telegram Bot API calls: polling, sending, and file handling.

const BASE_URL = (token) => `https://api.telegram.org/bot${token}`;

let lastUpdateId = 0;

export async function getUpdates(token) {
  try {
    const res = await fetch(
      `${BASE_URL(token)}/getUpdates?offset=${lastUpdateId + 1}&timeout=0&allowed_updates=["message"]`
    );
    const data = await res.json();

    if (!data.ok || !data.result?.length) return [];

    const updates = data.result;
    lastUpdateId = updates[updates.length - 1].update_id;
    return updates;
  } catch (e) {
    console.warn('[Telegram] Poll failed:', e.message);
    return [];
  }
}

const CHAT_ID_KEY = 'taski_telegram_chat_id';

export function rememberChatId(chatId) {
  if (chatId) localStorage.setItem(CHAT_ID_KEY, String(chatId));
}

export function getSavedChatId() {
  return localStorage.getItem(CHAT_ID_KEY);
}

// The ONE send path — used for replies and proactive sends alike.
// Plain text on purpose: parse_mode Markdown makes Telegram 400 on any
// unbalanced * _ [ in generated content, and the message silently dies.
export async function sendTelegramMessage(text, chatId = null) {
  const token  = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
  const target = chatId ?? getSavedChatId();

  if (!token)  return reportSendError('VITE_TELEGRAM_BOT_TOKEN is not set in .env');
  if (!target) return reportSendError('No chat_id known — send the bot any message from Telegram once so Taski can learn it');
  if (!text)   return { ok: true };

  for (const chunk of splitChunks(String(text), 4096)) {
    try {
      const res  = await fetch(`${BASE_URL(token)}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: target, text: chunk }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        return reportSendError(data.description || `HTTP ${res.status}`);
      }
    } catch (e) {
      return reportSendError(e.message);
    }
  }
  return { ok: true };
}

function splitChunks(text, limit) {
  const chunks = [];
  let rest = text;
  while (rest.length > limit) {
    // Prefer breaking at a newline in the back half of the window
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit / 2) cut = limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, '');
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function reportSendError(reason) {
  console.error('[Telegram] Send failed:', reason);
  window.dispatchEvent(new CustomEvent('taski-telegram-send-error', { detail: { reason } }));
  return { ok: false, error: reason };
}

export async function sendTyping(token, chatId) {
  await fetch(`${BASE_URL(token)}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
  });
}

export async function getVoiceFileUrl(token, fileId) {
  try {
    const res = await fetch(`${BASE_URL(token)}/getFile?file_id=${fileId}`);
    const data = await res.json();
    if (!data.ok) return null;
    return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
  } catch (e) {
    return null;
  }
}

export async function downloadVoiceFile(fileUrl) {
  try {
    const res = await fetch(fileUrl);
    const blob = await res.blob();
    return new File([blob], 'voice.ogg', { type: 'audio/ogg' });
  } catch (e) {
    console.error('[Telegram] Download failed:', e.message);
    return null;
  }
}

export function parseUpdate(update) {
  const msg = update.message;
  if (!msg) return null;

  return {
    updateId: update.update_id,
    chatId:   msg.chat.id,
    userId:   msg.from?.id,
    username: msg.from?.username || msg.from?.first_name || 'User',
    text:     msg.text || null,
    voice:    msg.voice || null,
    audio:    msg.audio || null,
    date:     msg.date,
  };
}

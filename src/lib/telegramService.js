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

export async function sendMessage(token, chatId, text) {
  const limit = 4000;
  const chunks = [];
  for (let i = 0; i < text.length; i += limit) {
    chunks.push(text.slice(i, i + limit));
  }

  for (const chunk of chunks) {
    await fetch(`${BASE_URL(token)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }),
    });
  }
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

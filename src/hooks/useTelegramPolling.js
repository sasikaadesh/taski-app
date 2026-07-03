// useTelegramPolling.js — polls Telegram every 3 s and routes messages through Taski pipeline.

import { useState, useEffect, useRef } from 'react';
import {
  getUpdates,
  parseUpdate,
  getVoiceFileUrl,
  downloadVoiceFile,
  sendMessage,
  sendTyping,
} from '../lib/telegramService';
import { transcribeAudio }         from '../lib/whisperService';
import { processTelegramMessage }  from '../lib/telegramProcessor';

export function useTelegramPolling() {
  const [isActive,      setIsActive]      = useState(false);
  const [status,        setStatus]        = useState('inactive');
  const [lastMessage,   setLastMessage]   = useState(null);
  const [messageCount,  setMessageCount]  = useState(0);
  const pollRef       = useRef(null);
  const processingRef = useRef(new Set());

  const token = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;

  async function handleUpdate(update) {
    const parsed = parseUpdate(update);
    if (!parsed) return;

    const key = parsed.updateId.toString();
    if (processingRef.current.has(key)) return;
    processingRef.current.add(key);

    console.log('[Telegram] New message from', parsed.username);

    setLastMessage({
      from: parsed.username,
      type: parsed.voice ? 'voice' : 'text',
      time: new Date().toLocaleTimeString(),
    });
    setMessageCount((prev) => prev + 1);

    try {
      let userText = parsed.text;

      if (parsed.voice || parsed.audio) {
        setStatus('transcribing');
        await sendTyping(token, parsed.chatId);

        const fileId  = parsed.voice?.file_id || parsed.audio?.file_id;
        const fileUrl = await getVoiceFileUrl(token, fileId);

        if (!fileUrl) {
          await sendMessage(token, parsed.chatId, 'Could not download voice message.');
          return;
        }

        const audioFile = await downloadVoiceFile(fileUrl);
        if (!audioFile) {
          await sendMessage(token, parsed.chatId, 'Could not process audio.');
          return;
        }

        userText = await transcribeAudio(audioFile);
        console.log('[Telegram] Transcribed:', userText);

        if (!userText?.trim()) {
          await sendMessage(token, parsed.chatId, 'Could not understand audio. Please try again.');
          return;
        }

        await sendMessage(token, parsed.chatId, `🎤 _"${userText}"_\n\nProcessing...`);
      }

      if (!userText?.trim()) return;

      setStatus('processing');
      await processTelegramMessage(token, parsed.chatId, userText, parsed.username);
      setStatus('active');
    } catch (e) {
      console.error('[Telegram] Error:', e);
      setStatus('active');
      try {
        await sendMessage(token, parsed.chatId, 'Sorry, something went wrong: ' + e.message);
      } catch { /* ignore send error */ }
    } finally {
      setTimeout(() => processingRef.current.delete(key), 5000);
    }
  }

  function startPolling() {
    if (!token) {
      console.warn('[Telegram] No bot token');
      return;
    }

    setIsActive(true);
    setStatus('active');

    async function poll() {
      const updates = await getUpdates(token);
      for (const update of updates) {
        await handleUpdate(update);
      }
    }

    poll();
    pollRef.current = setInterval(poll, 3000);
    console.log('[Telegram] Polling started');
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setIsActive(false);
    setStatus('inactive');
    console.log('[Telegram] Polling stopped');
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Auto-start if token is present
  useEffect(() => {
    if (token && !isActive) startPolling();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return { isActive, status, lastMessage, messageCount, startPolling, stopPolling, hasToken: !!token };
}

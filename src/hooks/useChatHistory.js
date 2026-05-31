/* useChatHistory — persists chat sessions to Documents/Taski/chats.json or localStorage */

import { useState, useRef, useEffect } from 'react';

export default function useChatHistory() {
  const [sessions, setSessions]               = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const sessionsRef = useRef([]);

  useEffect(() => { loadSessions(); }, []);

  async function loadSessions() {
    let data = [];
    if (window.taskiAPI?.chatsLoad) {
      data = (await window.taskiAPI.chatsLoad()) || [];
    } else {
      const saved = localStorage.getItem('taski-chats');
      data = saved ? JSON.parse(saved) : [];
    }
    sessionsRef.current = data;
    setSessions(data);
  }

  async function saveSessions(updated) {
    const trimmed = updated.slice(0, 50);
    sessionsRef.current = trimmed;
    setSessions(trimmed);
    if (window.taskiAPI?.chatsSave) {
      await window.taskiAPI.chatsSave(trimmed);
    } else {
      localStorage.setItem('taski-chats', JSON.stringify(trimmed));
    }
  }

  function startNewSession() {
    const id = `chat_${Date.now()}`;
    setCurrentSessionId(id);
    return id;
  }

  async function saveMessage(sessionId, _message, allMessages) {
    const existing = sessionsRef.current.find(s => s.id === sessionId);

    // Strip large binary data from imagen results before saving
    const sanitized = allMessages.map(m => {
      if (m.meta?.type === 'imagen-result') {
        return {
          role:      m.role,
          content:   `[Image generated: ${m.meta.prompt || 'image'}]`,
          timestamp: m.timestamp || new Date().toISOString(),
          skill:     m.skill || null,
        };
      }
      if (m.meta?.type === 'imagen-loading') return null;
      return {
        role:      m.role,
        content:   m.content,
        timestamp: m.timestamp || new Date().toISOString(),
        skill:     m.skill || null,
      };
    }).filter(Boolean);

    const updatedSession = {
      id:             sessionId,
      startedAt:      existing?.startedAt || new Date().toISOString(),
      lastMessageAt:  new Date().toISOString(),
      messageCount:   sanitized.length,
      firstMessage:   sanitized.find(m => m.role === 'user')?.content?.substring(0, 60) || 'New chat',
      messages:       sanitized,
    };

    const others = sessionsRef.current.filter(s => s.id !== sessionId);
    await saveSessions([updatedSession, ...others]);
  }

  async function deleteSession(sessionId) {
    await saveSessions(sessionsRef.current.filter(s => s.id !== sessionId));
  }

  async function exportSession(sessionId) {
    const session = sessionsRef.current.find(s => s.id === sessionId);
    if (!session) return;

    const lines = [
      'TASKI CHAT EXPORT',
      `Date: ${new Date(session.startedAt).toLocaleString()}`,
      `Messages: ${session.messageCount}`,
      '─────────────────────────────',
      '',
      ...session.messages.map(m =>
        `[${m.role.toUpperCase()}] ${new Date(m.timestamp).toLocaleTimeString()}\n${m.content}\n`
      ),
    ];
    const text = lines.join('\n');

    if (window.taskiAPI?.chatsExportTxt) {
      await window.taskiAPI.chatsExportTxt(sessionId, text);
    }
  }

  return { sessions, currentSessionId, startNewSession, saveMessage, deleteSession, exportSession };
}

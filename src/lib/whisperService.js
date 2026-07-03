// whisperService.js — OpenAI Whisper transcription for voice messages.

export async function transcribeAudio(audioFile) {
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY;

  if (!openaiKey) throw new Error('OpenAI key not set');

  const formData = new FormData();
  formData.append('file', audioFile, 'voice.ogg');
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: formData,
  });

  if (!res.ok) throw new Error('Whisper failed: ' + res.status);

  const data = await res.json();
  return data.text || '';
}

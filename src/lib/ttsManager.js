// ttsManager.js — single source of truth for TTS enabled/disabled state and speech playback.
// Every component reads/writes mute state through here so the mute button always works,
// no matter which panel toggles it.

const TTS_KEY = 'taski_tts_enabled';

/** Always reads a fresh value from localStorage — never rely on stale React state. */
export function isTTSEnabled() {
  return localStorage.getItem(TTS_KEY) !== 'false';
}

export function setTTSEnabled(enabled) {
  localStorage.setItem(TTS_KEY, String(enabled));

  if (!enabled) {
    try { window.speechSynthesis?.cancel(); } catch { /* no-op */ }
  }

  window.dispatchEvent(new CustomEvent('taski-tts-changed', { detail: { enabled } }));
}

function pickVoice(voices) {
  return (
    voices.find((v) => v.name === 'Google UK English Male') ||
    voices.find((v) => v.name.includes('Google') && v.lang.startsWith('en')) ||
    voices.find((v) => v.lang.startsWith('en')) ||
    voices[0] ||
    null
  );
}

export function speakText(text, options = {}) {
  // Read fresh from storage every time — never trust cached component state.
  if (!isTTSEnabled()) {
    console.log('[TTS] Muted — skipping');
    return;
  }
  if (!text?.trim() || !window.speechSynthesis) return;

  // Stop any current speech first.
  window.speechSynthesis.cancel();

  const utterance  = new SpeechSynthesisUtterance(text);
  utterance.rate   = options.rate   ?? 0.9;
  utterance.pitch  = options.pitch  ?? 0.85;
  utterance.volume = 1.0;

  function speak() {
    const voice = pickVoice(window.speechSynthesis.getVoices());
    if (voice) utterance.voice = voice;

    utterance.onstart = () => {
      window.dispatchEvent(new CustomEvent('taski-tts-speaking', { detail: { speaking: true } }));
    };
    utterance.onend = () => {
      window.dispatchEvent(new CustomEvent('taski-tts-speaking', { detail: { speaking: false } }));
    };
    utterance.onerror = () => {
      window.dispatchEvent(new CustomEvent('taski-tts-speaking', { detail: { speaking: false } }));
    };

    window.speechSynthesis.speak(utterance);
  }

  // Voices load asynchronously in some browsers — wait for them if needed.
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.addEventListener('voiceschanged', speak, { once: true });
  } else {
    speak();
  }
}

export function stopSpeaking() {
  try { window.speechSynthesis?.cancel(); } catch { /* no-op */ }
  window.dispatchEvent(new CustomEvent('taski-tts-speaking', { detail: { speaking: false } }));
}

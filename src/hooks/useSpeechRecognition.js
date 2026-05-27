// useSpeechRecognition — browser Web Speech API wrapper. No external API or key needed.
// Falls back gracefully when the API is not available (e.g. Firefox, Safari < 14.1).

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Configuration ─────────────────────────────────────────────────────────────
// Change SPEECH_LANG to support other locales (e.g. 'en-GB', 'fr-FR', 'es-ES').
const SPEECH_LANG = 'en-US';

// Resolve browser-vendor prefix.  Chrome ships it as webkitSpeechRecognition.
const SpeechRecognitionAPI =
  (typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)) ||
  null;

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useSpeechRecognition()
 *
 * Exposes:
 *   isListening  {boolean}     — true while the mic is open
 *   transcript   {string}      — live / final recognised text (resets on startListening)
 *   isSupported  {boolean}     — false when the browser has no SpeechRecognition
 *   error        {string|null} — typed error code, or null
 *
 * Error codes:
 *   'PERMISSION_DENIED' — user or OS blocked the microphone
 *   'NO_SPEECH'         — silence was detected during the session
 *   'NETWORK'           — the cloud speech service could not be reached
 *   'UNKNOWN'           — any other error
 *
 * Functions:
 *   startListening()  — clears transcript, requests mic, begins recognition
 *   stopListening()   — stops immediately (finalises current interim result)
 *   resetTranscript() — clears transcript to ''
 *   clearError()      — resets error to null (so the same error can re-fire)
 */
export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript,  setTranscript]  = useState('');
  const [error,       setError]       = useState(null);

  const recognitionRef = useRef(null);
  const isSupported    = Boolean(SpeechRecognitionAPI);

  // ── Build recognition instance once on mount ────────────────────────────────
  useEffect(() => {
    if (!isSupported) return;

    const recognition = new SpeechRecognitionAPI();

    // continuous = false  → auto-stops after the first utterance / silence gap.
    // This gives the simplest UX: speak → stop → text appears → send.
    recognition.continuous     = false;
    recognition.interimResults = true;   // surface partial results in real time
    recognition.lang           = SPEECH_LANG;

    // ── onresult: fired repeatedly as words come in ──────────────────────────
    recognition.onresult = (event) => {
      let finalText   = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText   += piece;
        } else {
          interimText += piece;
        }
      }

      // Prefer the final result; fall back to the latest interim fragment.
      setTranscript(finalText || interimText);
    };

    // ── onend: fires when the session ends (naturally or via stop/abort) ─────
    recognition.onend = () => {
      setIsListening(false);
    };

    // ── onerror: translate Web Speech error strings to our typed codes ───────
    recognition.onerror = (event) => {
      setIsListening(false);

      switch (event.error) {
        case 'not-allowed':
        case 'permission-denied':
          setError('PERMISSION_DENIED');
          break;

        case 'no-speech':
          setError('NO_SPEECH');
          break;

        case 'network':
          setError('NETWORK');
          break;

        case 'aborted':
          // User cancelled — not an error worth surfacing to the UI.
          break;

        default:
          setError('UNKNOWN');
      }
    };

    recognitionRef.current = recognition;

    // Cleanup: remove handlers then abort any ongoing session on unmount.
    return () => {
      recognition.onresult = null;
      recognition.onend    = null;
      recognition.onerror  = null;
      try { recognition.abort(); } catch { /* ignore if already stopped */ }
    };
  // isSupported is a constant derived from window — safe to list once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Public API ────────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (!isSupported || isListening) return;
    setTranscript('');
    setError(null);
    try {
      recognitionRef.current?.start();
      setIsListening(true);
    } catch (err) {
      // InvalidStateError if already running — shouldn't happen due to the
      // isListening guard above, but be safe.
      if (import.meta.env.DEV) {
        console.warn('[useSpeechRecognition] start() threw:', err);
      }
    }
  }, [isSupported, isListening]);

  const stopListening = useCallback(() => {
    if (!isListening) return;
    try {
      // stop() finalises the current result; abort() would discard it.
      recognitionRef.current?.stop();
    } catch { /* ignore */ }
    // Don't call setIsListening(false) here — wait for the onend event so
    // the final transcript has time to land before we drop the listening state.
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isListening,
    transcript,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
    clearError,
  };
}

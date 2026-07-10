// ambientSound.js — HTML5 Audio wrapper for ambient background music.
// Single source of truth for playback state: always read isAmbientPlaying(), never cache it.
// Every state transition — including ones the element triggers internally — emits
// 'taski-ambient-changed' with { playing } so buttons can subscribe instead of guessing.

const audio = new Audio('/sounds/ambient.mp3');
audio.loop   = true;
audio.volume = 0.4;

let userVolume   = 0.4;   // 0.0 – 1.0, mirrors audio.volume at non-ducked level
let fadeTimer    = null;
let lastNotified = null;  // dedupe so subscribers only hear real transitions

function notify() {
  const playing = !audio.paused;
  if (playing === lastNotified) return;
  lastNotified = playing;
  window.dispatchEvent(new CustomEvent('taski-ambient-changed', { detail: { playing } }));
}

// Element events cover every transition, including internal ones (ended, OS media keys).
audio.addEventListener('play',  notify);
audio.addEventListener('pause', notify);
audio.addEventListener('ended', notify);

function fadeVolume(targetVol, durationMs) {
  if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
  const steps    = 20;
  const interval = durationMs / steps;
  const startVol = audio.volume;
  const stepSize = (targetVol - startVol) / steps;
  let count = 0;
  fadeTimer = setInterval(() => {
    count++;
    audio.volume = Math.min(1, Math.max(0, startVol + stepSize * count));
    if (count >= steps) { clearInterval(fadeTimer); fadeTimer = null; }
  }, interval);
}

export function isAmbientPlaying() { return !audio.paused; }

/**
 * Resolves true when playback actually started. audio.play() is async and can
 * reject (autoplay policy) — state is only announced after the promise settles,
 * so subscribers never see a "playing" that isn't real.
 */
export async function playAmbient() {
  try {
    await audio.play();
    notify();
    return true;
  } catch {
    notify(); // still paused — re-announce so any optimistic UI corrects itself
    return false;
  }
}

export function pauseAmbient() {
  audio.pause();
  notify();
}

export function toggleAmbient() {
  if (audio.paused) playAmbient();
  else              pauseAmbient();
}

export function setAmbientVolume(vol) {
  userVolume   = Math.max(0, Math.min(1, vol));
  audio.volume = userVolume;
}

/** Reduce music for voice input (10% of full volume) over 300 ms */
export function duckAmbient() {
  fadeVolume(0.1, 300);
}

/** Reduce music to near-silence for TTS speech (5%) over 300 ms */
export function duckAmbientForSpeech() {
  fadeVolume(0.05, 300);
}

/** Restore music to user-set volume over 500 ms */
export function restoreAmbient() {
  fadeVolume(userVolume, 500);
}

export function getUserVolume() { return userVolume; }

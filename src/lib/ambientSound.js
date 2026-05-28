// ambientSound.js — HTML5 Audio wrapper for ambient background music.

const audio = new Audio('/sounds/ambient.mp3');
audio.loop   = true;
audio.volume = 0.4;

let userVolume = 0.4;   // 0.0 – 1.0, mirrors audio.volume at non-ducked level
let fadeTimer  = null;

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

export function startAmbient() {
  audio.play().catch(() => {});
}

export function stopAmbient() {
  audio.pause();
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

export function getIsPlaying() { return !audio.paused; }
export function getUserVolume() { return userVolume; }

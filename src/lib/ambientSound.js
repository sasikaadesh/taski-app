// ambientSound.js — programmatic futuristic ambient music via Web Audio API.
// No external audio files, no CDN links. All sounds generated with OscillatorNode.

let audioCtx       = null;
let masterGain     = null;
let oscillators    = [];
let lfoOscillators = [];
let pulseGainNode  = null;
let pulseTimer     = null;
let isPlaying      = false;
let userVolume     = 0.4;   // 0.0 – 1.0, default 40%
let duckMultiplier = 1.0;   // 1.0 normal | 0.1 voice | 0.05 TTS

// ── Internal helpers ──────────────────────────────────────────────────────────

function getEffectiveGain() {
  return userVolume * duckMultiplier;
}

function applyGain(rampSec = 0.1) {
  if (!masterGain || !audioCtx) return;
  const now = audioCtx.currentTime;
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.setValueAtTime(masterGain.gain.value, now);
  masterGain.gain.linearRampToValueAtTime(getEffectiveGain(), now + rampSec);
}

function createLFO(ctx, freq, depth) {
  const lfo     = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type              = 'sine';
  lfo.frequency.value   = freq;
  lfoGain.gain.value    = depth;
  lfo.connect(lfoGain);
  lfo.start();
  lfoOscillators.push(lfo);
  return lfoGain; // caller connects this to the target AudioParam
}

function schedulePulse() {
  if (!pulseGainNode || !audioCtx) return;
  const now = audioCtx.currentTime;
  pulseGainNode.gain.cancelScheduledValues(now);
  pulseGainNode.gain.setValueAtTime(0, now);
  pulseGainNode.gain.linearRampToValueAtTime(0.06, now + 0.5);
  pulseGainNode.gain.linearRampToValueAtTime(0,    now + 1.8);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startAmbient() {
  if (isPlaying) return;

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    // Master lowpass — cuts harsh highs, keeps sound warm
    const masterFilter           = audioCtx.createBiquadFilter();
    masterFilter.type            = 'lowpass';
    masterFilter.frequency.value = 800;
    masterFilter.connect(audioCtx.destination);

    // Master gain node
    masterGain             = audioCtx.createGain();
    masterGain.gain.value  = getEffectiveGain();
    masterGain.connect(masterFilter);

    // ── Layer 1 — Deep bass drone: 55 Hz (A1) ──────────────────────────────
    const osc1  = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type            = 'sine';
    osc1.frequency.value = 55;
    gain1.gain.value     = 0.08;
    const lfo1 = createLFO(audioCtx, 0.1, 2);   // very slow breath
    lfo1.connect(osc1.frequency);
    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start();
    oscillators.push(osc1);

    // ── Layer 2 — Mid harmonic: 110 Hz (A2) ────────────────────────────────
    const osc2  = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type            = 'sine';
    osc2.frequency.value = 110;
    gain2.gain.value     = 0.05;
    const lfo2 = createLFO(audioCtx, 0.15, 3);
    lfo2.connect(osc2.frequency);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start();
    oscillators.push(osc2);

    // ── Layer 3 — High shimmer: 440 Hz (A4) ────────────────────────────────
    const osc3  = audioCtx.createOscillator();
    const gain3 = audioCtx.createGain();
    osc3.type            = 'sine';
    osc3.frequency.value = 440;
    gain3.gain.value     = 0.02;
    const lfo3 = createLFO(audioCtx, 0.05, 5);
    lfo3.connect(osc3.frequency);
    osc3.connect(gain3);
    gain3.connect(masterGain);
    osc3.start();
    oscillators.push(osc3);

    // ── Layer 4 — Pulse heartbeat: 220 Hz (A3) ─────────────────────────────
    const osc4    = audioCtx.createOscillator();
    pulseGainNode = audioCtx.createGain();
    osc4.type            = 'sine';
    osc4.frequency.value = 220;
    pulseGainNode.gain.value = 0;
    osc4.connect(pulseGainNode);
    pulseGainNode.connect(masterGain);
    osc4.start();
    oscillators.push(osc4);

    // Start the 2-second pulse rhythm
    schedulePulse();
    pulseTimer = setInterval(schedulePulse, 2000);

    isPlaying = true;
  } catch (err) {
    if (import.meta.env?.DEV) console.warn('[Taski Ambient] Failed to start audio:', err);
  }
}

export function stopAmbient() {
  if (!isPlaying) return;

  clearInterval(pulseTimer);
  pulseTimer = null;

  oscillators.forEach((osc) => { try { osc.stop(); osc.disconnect(); } catch {} });
  lfoOscillators.forEach((lfo) => { try { lfo.stop(); lfo.disconnect(); } catch {} });
  oscillators    = [];
  lfoOscillators = [];
  pulseGainNode  = null;

  if (masterGain) { masterGain.disconnect(); masterGain = null; }
  if (audioCtx)   { audioCtx.close().catch(() => {}); audioCtx = null; }

  isPlaying = false;
}

export function setAmbientVolume(vol) {
  userVolume = Math.max(0, Math.min(1, vol));
  applyGain(0.1);
}

/** Reduce music for voice input (10% of user volume) over 300 ms */
export function duckAmbient() {
  duckMultiplier = 0.1;
  applyGain(0.3);
}

/** Reduce music to near-silence for TTS speech (5%) over 300 ms */
export function duckAmbientForSpeech() {
  duckMultiplier = 0.05;
  applyGain(0.3);
}

/** Restore music to user-set volume over 500 ms */
export function restoreAmbient() {
  duckMultiplier = 1.0;
  applyGain(0.5);
}

export function getIsPlaying() { return isPlaying; }
export function getUserVolume() { return userVolume; }

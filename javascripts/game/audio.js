// Procedural retro-style sound effects via the Web Audio API — no audio
// files, just short oscillator sweeps and noise bursts. Every play*()
// function is a safe no-op until initAudio() has run (it must be called
// from a real user-gesture handler — browsers refuse to start an
// AudioContext otherwise) and while muted.
const MUTE_KEY = "devops-platformer.muted.v1";

let ctx = null;
let masterGain = null;
let muted = readMuted();

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  if (masterGain) masterGain.gain.value = muted ? 0 : 1;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Storage unavailable — the preference just won't survive a refresh.
  }
}

export function toggleMuted() {
  setMuted(!muted);
  return muted;
}

export function initAudio() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume();
    return;
  }
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return;
  ctx = new AudioContextCtor();
  masterGain = ctx.createGain();
  masterGain.gain.value = muted ? 0 : 1;
  masterGain.connect(ctx.destination);
}

// A single oscillator with a fast-attack/exponential-decay envelope,
// optionally sweeping from `freq` to `endFreq` over its duration.
function tone({ type = "square", freq, endFreq, duration = 0.12, gain = 0.18, delay = 0 }) {
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), start + duration);
  }
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(gain, start + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(env);
  env.connect(masterGain);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

// A short burst of white noise with a decaying envelope — used for
// impacts (hits, defeats) where a pure tone reads too clean.
function noiseBurst({ duration = 0.15, gain = 0.22, delay = 0 } = {}) {
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(env);
  env.connect(masterGain);
  src.start(start);
}

export function playJump() {
  tone({ type: "square", freq: 320, endFreq: 720, duration: 0.12, gain: 0.16 });
}

export function playShoot() {
  tone({ type: "square", freq: 880, endFreq: 420, duration: 0.07, gain: 0.14 });
}

export function playHit() {
  noiseBurst({ duration: 0.12, gain: 0.22 });
  tone({ type: "sawtooth", freq: 180, endFreq: 60, duration: 0.18, gain: 0.18 });
}

export function playEnemyDefeated() {
  tone({ type: "square", freq: 520, endFreq: 180, duration: 0.1, gain: 0.16 });
  tone({ type: "square", freq: 300, duration: 0.08, gain: 0.12, delay: 0.09 });
}

export function playCollectCash() {
  tone({ type: "square", freq: 620, duration: 0.06, gain: 0.14 });
  tone({ type: "square", freq: 940, duration: 0.09, gain: 0.14, delay: 0.06 });
}

export function playCollectPower() {
  tone({ type: "triangle", freq: 440, duration: 0.08, gain: 0.16 });
  tone({ type: "triangle", freq: 660, duration: 0.08, gain: 0.16, delay: 0.07 });
  tone({ type: "triangle", freq: 880, duration: 0.14, gain: 0.16, delay: 0.14 });
}

export function playCollectRedundancy() {
  tone({ type: "triangle", freq: 500, endFreq: 760, duration: 0.16, gain: 0.16 });
  tone({ type: "triangle", freq: 760, duration: 0.12, gain: 0.12, delay: 0.14 });
}

export function playWin() {
  tone({ type: "square", freq: 523, duration: 0.1, gain: 0.16 });
  tone({ type: "square", freq: 659, duration: 0.1, gain: 0.16, delay: 0.1 });
  tone({ type: "square", freq: 784, duration: 0.1, gain: 0.16, delay: 0.2 });
  tone({ type: "square", freq: 1047, duration: 0.22, gain: 0.18, delay: 0.3 });
}

export function playLose() {
  tone({ type: "sawtooth", freq: 300, duration: 0.16, gain: 0.16 });
  tone({ type: "sawtooth", freq: 220, duration: 0.16, gain: 0.16, delay: 0.15 });
  tone({ type: "sawtooth", freq: 140, duration: 0.3, gain: 0.16, delay: 0.3 });
}

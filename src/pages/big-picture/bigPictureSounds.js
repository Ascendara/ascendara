// Interface sounds for Big Picture. Everything is synthesized with Web Audio so
// a button press is heard on the same frame, with no files to load or decode.
// Each sound is a soft, glassy tone fed into a long airy reverb, which gives
// the console-style "aura" around every move.

let ctx = null;
let master = null;
let reverb = null;
let enabled = false;
let lastMoveAt = 0;

// Overall level. These play constantly while navigating, so they sit well
// below notification sounds.
const MASTER_GAIN = 0.45;

function impulse(context, seconds, decay) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let smooth = 0;
    for (let i = 0; i < length; i++) {
      // Lowpassed noise keeps the tail airy instead of hissy
      smooth += 0.22 * (Math.random() * 2 - 1 - smooth);
      data[i] = smooth * (1 - i / length) ** decay;
    }
  }
  return buffer;
}

function audio() {
  if (ctx) return ctx;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  ctx = new AudioContext({ latencyHint: "interactive" });

  master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.ratio.value = 6;
  master.connect(limiter).connect(ctx.destination);

  const convolver = ctx.createConvolver();
  convolver.buffer = impulse(ctx, 2.6, 3.2);
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 5200;
  reverb = ctx.createGain();
  reverb.connect(convolver).connect(tone).connect(master);
  return ctx;
}

// One soft sine voice: quick swell, exponential fade, optional pitch glide,
// with part of the signal sent to the reverb
function voice({
  freq,
  to,
  at = 0,
  attack = 0.004,
  length = 0.25,
  gain = 0.5,
  wet = 0.35,
  type = "sine",
}) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + length * 0.6);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + length);

  const send = ctx.createGain();
  send.gain.value = wet;
  osc.connect(env);
  env.connect(master);
  env.connect(send).connect(reverb);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

// A breath of filtered noise, used for page swipes
function air({ at = 0, length = 0.18, from = 900, to = 3200, gain = 0.18, wet = 0.5 }) {
  const t = ctx.currentTime + at;
  const samples = Math.floor(ctx.sampleRate * length);
  const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.4;
  band.frequency.setValueAtTime(from, t);
  band.frequency.exponentialRampToValueAtTime(to, t + length);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + length * 0.35);
  env.gain.exponentialRampToValueAtTime(0.0001, t + length);

  const send = ctx.createGain();
  send.gain.value = wet;
  source.connect(band).connect(env);
  env.connect(master);
  env.connect(send).connect(reverb);
  source.start(t);
}

const sounds = {
  // A tiny glassy tick, kept very short so held directions don't pile up
  move() {
    voice({ freq: 1480, to: 1320, length: 0.07, gain: 0.32, wet: 0.28 });
  },
  // Bright rising pair that blooms into the reverb
  confirm() {
    voice({ freq: 1046.5, length: 0.22, gain: 0.32, wet: 0.4 });
    voice({ freq: 1567.98, at: 0.045, length: 0.38, gain: 0.3, wet: 0.5 });
    voice({ freq: 3135.96, at: 0.045, length: 0.2, gain: 0.05, wet: 0.6 });
  },
  // Soft falling tone
  back() {
    voice({ freq: 987.77, to: 659.25, length: 0.2, gain: 0.5, wet: 0.35 });
  },
  // Airy rising three-note shimmer for menus and overlays
  open() {
    [783.99, 1174.66, 1567.98].forEach((freq, i) =>
      voice({ freq, at: i * 0.035, attack: 0.012, length: 0.45, gain: 0.18, wet: 0.6 })
    );
  },
  // Whoosh with a light tick when switching pages or tabs
  page(direction) {
    air(direction < 0 ? { from: 3200, to: 900 } : {});
    voice({
      freq: direction < 0 ? 1174.66 : 1318.51,
      at: 0.05,
      length: 0.12,
      gain: 0.16,
      wet: 0.45,
    });
  },
  // A slow ambient chord when Big Picture opens
  enter() {
    [261.63, 392.0, 493.88, 587.33, 783.99].forEach((freq, i) =>
      voice({ freq, at: i * 0.06, attack: 0.35, length: 2.4, gain: 0.08, wet: 0.75 })
    );
    voice({ freq: 1567.98, at: 0.45, attack: 0.2, length: 1.6, gain: 0.05, wet: 0.9 });
  },
};

const ACTION_SOUNDS = {
  UP: "move",
  DOWN: "move",
  LEFT: "move",
  RIGHT: "move",
  CONFIRM: "confirm",
  BACK: "back",
  MENU: "open",
  SEARCH: "open",
  X: "open",
  PREVIOUS_PAGE: ["page", -1],
  NEXT_PAGE: ["page", 1],
};

export function playBigPictureSound(name, ...args) {
  if (!enabled || !sounds[name]) return;
  try {
    if (!audio()) return;
    if (ctx.state === "suspended") ctx.resume();
    if (name === "move") {
      // Held directions repeat every 90ms; skip anything closer than that
      const now = performance.now();
      if (now - lastMoveAt < 60) return;
      lastMoveAt = now;
    }
    sounds[name](...args);
  } catch (error) {
    console.error("Big Picture sound failed:", error);
  }
}

export function playControllerActionSound(action) {
  const entry = ACTION_SOUNDS[action];
  if (!entry) return;
  const [name, ...args] = Array.isArray(entry) ? entry : [entry];
  playBigPictureSound(name, ...args);
}

// The same keys Big Picture navigates with (see useBigPicturePage)
const KEY_ACTIONS = {
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  Enter: "CONFIRM",
  Escape: "BACK",
  Backspace: "BACK",
  Tab: "MENU",
  m: "MENU",
  M: "MENU",
  ContextMenu: "MENU",
  " ": "SEARCH",
  PageUp: "PREVIOUS_PAGE",
  PageDown: "NEXT_PAGE",
};

const isTyping = target =>
  target instanceof Element &&
  (target.isContentEditable ||
    !!target.closest("input, textarea, select, [contenteditable]"));

function playKeyboardActionSound(event) {
  // Screens that fake key presses for the controller already played a sound
  if (!event.isTrusted || event.ctrlKey || event.altKey || event.metaKey) return;
  const action = KEY_ACTIONS[event.key];
  if (!action) return;
  if (event.repeat && !event.key.startsWith("Arrow")) return;
  // In a text field only Enter and Escape act on the page, everything else is typing
  if (isTyping(event.target) && event.key !== "Enter" && event.key !== "Escape") return;
  playControllerActionSound(action);
}

export function setBigPictureSoundsEnabled(value) {
  enabled = !!value;
  if (!enabled && ctx?.state === "running") ctx.suspend();
}

// Registered once when this module loads, before any Big Picture screen
// mounts, so it runs ahead of every dialog's capture-phase key handler (some
// stop propagation). It stays silent outside Big Picture since sounds are
// only enabled while it is open.
window.addEventListener("keydown", playKeyboardActionSound, { capture: true });

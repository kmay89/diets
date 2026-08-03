/**
 * feedback.js — the small sounds and motions that make an interface feel alive.
 *
 * Sound is synthesised with the Web Audio API rather than shipped as files: it
 * adds nothing to the download, works offline, and stays a few hundred bytes.
 * Everything here is short, quiet, and tuned to a pentatonic scale so that two
 * sounds landing together never clash.
 *
 * Three rules this module keeps:
 *   1. Nothing ever plays without a user action first — no sound on load, ever.
 *   2. `prefers-reduced-motion` disables motion, and is treated as a signal to
 *      be gentler with sound too.
 *   3. One switch turns all of it off, and the choice is remembered.
 *
 * ERRERLabs — MIT licensed.
 */

const STORAGE_KEY = 'errerlabs.diets.sound';

let ctx = null;
let master = null;
let enabled = readPref();
let unlocked = false;

function readPref() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === null ? true : v === '1';
  } catch {
    return false;
  }
}

export function soundEnabled() { return enabled; }

export function setSoundEnabled(on) {
  enabled = !!on;
  try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch { /* storage may be blocked */ }
  if (enabled) play('tap');
}

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Browsers require a user gesture before audio can start. We create the context
 * lazily on the first real interaction and never before.
 */
function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.09;          // deliberately quiet — this is texture, not an alert
  master.connect(ctx.destination);
  return ctx;
}

export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  const c = ensureContext();
  if (c?.state === 'suspended') c.resume().catch(() => {});
}

/** One soft sine tone with a quick attack and a long tail. */
function tone(freq, { at = 0, duration = 0.16, gain = 1, type = 'sine' } = {}) {
  const c = ensureContext();
  if (!c) return;
  const t0 = c.currentTime + at;

  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);

  const env = c.createGain();
  // A tiny attack instead of an instant one: square edges are what make
  // synthesised sound feel cheap.
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(env).connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Short filtered noise — used for the dice rattle. */
function noise({ at = 0, duration = 0.06, gain = 0.35 } = {}) {
  const c = ensureContext();
  if (!c) return;
  const frames = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);

  const src = c.createBufferSource();
  src.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1800;
  filter.Q.value = 0.9;

  const env = c.createGain();
  env.gain.value = gain;

  src.connect(filter).connect(env).connect(master);
  src.start(c.currentTime + at);
}

// A minor pentatonic scale: any two of these together sound intentional.
const NOTE = { C: 523.25, Eb: 622.25, F: 698.46, G: 783.99, Bb: 932.33, C2: 1046.5, G_low: 392, C_low: 261.63 };

const VOICES = {
  tap: () => tone(NOTE.G, { duration: 0.09, gain: 0.5 }),
  check: () => tone(NOTE.C2, { duration: 0.12, gain: 0.6 }),
  uncheck: () => tone(NOTE.G_low, { duration: 0.1, gain: 0.4 }),
  add: () => { tone(NOTE.G, { duration: 0.12, gain: 0.5 }); tone(NOTE.C2, { at: 0.07, duration: 0.16, gain: 0.5 }); },
  remove: () => { tone(NOTE.F, { duration: 0.1, gain: 0.4 }); tone(NOTE.C_low, { at: 0.06, duration: 0.14, gain: 0.35 }); },
  roll: () => {
    for (let i = 0; i < 5; i++) noise({ at: i * 0.045, duration: 0.05, gain: 0.3 - i * 0.04 });
    tone(NOTE.C, { at: 0.24, duration: 0.2, gain: 0.45 });
    tone(NOTE.G, { at: 0.3, duration: 0.24, gain: 0.4 });
  },
  complete: () => {
    [NOTE.C, NOTE.Eb, NOTE.G, NOTE.C2].forEach((f, i) =>
      tone(f, { at: i * 0.075, duration: 0.32, gain: 0.42 }));
  },
  cooked: () => {
    [NOTE.G, NOTE.C2].forEach((f, i) => tone(f, { at: i * 0.1, duration: 0.4, gain: 0.4 }));
  },
  warn: () => { tone(NOTE.F, { duration: 0.14, gain: 0.4, type: 'triangle' }); }
};

/** Play a named sound. Silently does nothing if sound is off or unsupported. */
export function play(name) {
  if (!enabled || !unlocked) return;
  try {
    VOICES[name]?.();
  } catch {
    // Audio is a nicety. It never breaks the app.
  }
}

/* ------------------------------------------------------------------ *
 * Motion
 * ------------------------------------------------------------------ */

/**
 * Stagger children into view. Uses the Web Animations API so there is no
 * stylesheet coupling, and does nothing at all under reduced-motion.
 */
export function stagger(container, { selector = ':scope > *', step = 45, distance = 10 } = {}) {
  if (!container || prefersReducedMotion()) return;
  const items = [...container.querySelectorAll(selector)];
  items.forEach((el, i) => {
    el.animate(
      [
        { opacity: 0, transform: `translateY(${distance}px)` },
        { opacity: 1, transform: 'none' }
      ],
      { duration: 320, delay: Math.min(i * step, 400), easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' }
    );
  });
}

/** A quick attention pulse — used when a number changes under your finger. */
export function pulse(el) {
  if (!el || prefersReducedMotion()) return;
  el.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }],
    { duration: 260, easing: 'cubic-bezier(.3,1.4,.5,1)' }
  );
}

/** A soft horizontal shake for "that did not work". */
export function shake(el) {
  if (!el || prefersReducedMotion()) return;
  el.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }],
    { duration: 240, easing: 'ease-in-out' }
  );
}

/** The dice tumble on the roll button. */
export function tumble(el) {
  if (!el || prefersReducedMotion()) return;
  el.animate(
    [
      { transform: 'rotate(0) scale(1)' },
      { transform: 'rotate(-18deg) scale(1.18)' },
      { transform: 'rotate(14deg) scale(1.1)' },
      { transform: 'rotate(-6deg) scale(1.04)' },
      { transform: 'rotate(0) scale(1)' }
    ],
    { duration: 620, easing: 'cubic-bezier(.3,.8,.3,1)' }
  );
}

/** Wire the first interaction anywhere in the document to unlock audio. */
export function initFeedback() {
  const once = { once: true, passive: true };
  for (const evt of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(evt, unlockAudio, once);
  }
}

/**
 * timers.js — timers that belong to the kitchen, not to a screen.
 *
 * The old ones lived inside a cook-mode step. Move to the next step and the
 * timer died; leave cook mode to check the shopping list and it died. That is
 * exactly backwards, because the moment you most need a timer running is the
 * moment you have wandered off to do something else, and a timer you cannot
 * trust to survive a tap is a timer you stop starting.
 *
 * So they live here instead: a small store, outside every view, with one tick
 * for all of them. Anything can start one, nothing can accidentally end one,
 * and they are written to storage on every change so closing the tab mid-braise
 * and coming back does not lose the count — the clock keeps running while the
 * app is shut, because the pot did too.
 *
 * More than one at a time on purpose. Real cooking is a pasta timer and a sauce
 * timer and an oven, and an app that allows exactly one is an app that gets
 * ignored in favor of the phone's own.
 *
 * A timer carries more than a number. It knows which dish and which step it came
 * from, so tapping it takes you back to the pan rather than leaving you to
 * remember; it knows what the step said to look for, so it can ask you to check
 * something instead of just going off; and it knows how much slack the recipe
 * allowed, so running out is a prompt rather than a verdict. It also records
 * when it rang, because a timer that finished while the app was closed should
 * say it finished forty minutes ago rather than pretending to be urgent now.
 *
 * ERRERLabs — MIT licensed.
 */

const KEY = 'errerlabs.diets.timers.v1';

/** @type {{id:string,label:string,seconds:number,upto:number,cue:string,endsAt:number|null,left:number,rangAt:number|null,recipeId:string|null,step:number|null,done:boolean}[]} */
let timers = load();
const listeners = new Set();
let ticker = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const saved = JSON.parse(raw);
    return Array.isArray(saved) ? saved.filter(t => t && t.id) : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(timers));
  } catch { /* a full disk should not take the timers down with it */ }
}

function emit() {
  for (const fn of listeners) fn(list());
}

export function subscribeTimers(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * How long is left, worked out from a wall-clock end time rather than counted
 * down in memory.
 *
 * A running timer stores when it ends; a paused one stores what was left. That
 * means a backgrounded tab, a locked phone or a browser that throttles the
 * interval to once a minute all still produce the right number, because the
 * number was never being accumulated in the first place.
 */
function remaining(t) {
  if (t.endsAt == null) return Math.max(0, t.left);
  return Math.max(0, Math.round((t.endsAt - Date.now()) / 1000));
}

/**
 * The timers as a view wants them: the raw record plus everything derivable
 * from the clock, so no view has to do date arithmetic to draw a pill.
 *
 * `over` is how long ago it rang, which is what makes a stale timer read as
 * stale. `progress` is for a quiet bar rather than a countdown in bold — the
 * same information, without the last-ten-seconds feeling.
 */
export function list() {
  const now = Date.now();
  return timers.map(t => {
    const left = remaining(t);
    return {
      ...t,
      left,
      running: t.endsAt != null && left > 0,
      paused: t.endsAt == null && !t.done && left > 0,
      over: t.done && t.rangAt ? Math.max(0, Math.round((now - t.rangAt) / 1000)) : 0,
      progress: t.seconds > 0 ? Math.min(1, Math.max(0, 1 - left / t.seconds)) : 1
    };
  });
}

export const activeCount = () => list().filter(t => t.running || (!t.done && t.left > 0)).length;
export const anyRinging = () => list().some(t => t.done);

/**
 * Start one. An id that is already running is left alone rather than restarted,
 * so tapping the same step's timer twice does not silently reset the pasta.
 *
 * `upto` and `cue` come from the step's own wording and are what let the pill
 * ask a question instead of announcing a deadline; `recipeId` and `step` are
 * what let it take you back to the pan.
 */
export function startTimer({
  id, label, seconds, upto = 0, cue = '', recipeId = null, step = null
}) {
  if (!(seconds > 0)) return null;
  const existing = timers.find(t => t.id === id);
  if (existing && existing.endsAt != null && remaining(existing) > 0) return existing;

  const timer = {
    id: id || `t_${Date.now()}_${timers.length}`,
    label: label || 'Timer',
    seconds,
    upto: upto > seconds ? upto : 0,
    cue: cue || '',
    endsAt: Date.now() + seconds * 1000,
    left: seconds,
    rangAt: null,
    recipeId,
    step,
    done: false
  };
  timers = [...timers.filter(t => t.id !== timer.id), timer];
  persist();
  ensureTicking();
  emit();
  return timer;
}

export function pauseTimer(id) {
  const t = timers.find(x => x.id === id);
  if (!t || t.endsAt == null) return;
  t.left = remaining(t);
  t.endsAt = null;
  persist();
  emit();
}

export function resumeTimer(id) {
  const t = timers.find(x => x.id === id);
  if (!t || t.endsAt != null || t.left <= 0) return;
  t.endsAt = Date.now() + t.left * 1000;
  t.done = false;
  t.rangAt = null;
  persist();
  ensureTicking();
  emit();
}

export function toggleTimer(id) {
  const t = timers.find(x => x.id === id);
  if (!t) return;
  if (t.endsAt != null) pauseTimer(id); else resumeTimer(id);
}

/**
 * A bit longer, for the thing that is nearly but not quite there.
 *
 * Measured from now rather than from when it rang: a timer you come back to ten
 * minutes late and give five more minutes should give you five more minutes,
 * not go off again the instant you press it.
 */
export function addMinute(id, seconds = 60) {
  const t = timers.find(x => x.id === id);
  if (!t) return;
  if (t.done) t.endsAt = Date.now() + seconds * 1000;
  else if (t.endsAt != null) t.endsAt += seconds * 1000;
  else t.left += seconds;
  t.done = false;
  t.rangAt = null;
  t.seconds += seconds;
  persist();
  ensureTicking();
  emit();
}

export function clearTimer(id) {
  timers = timers.filter(t => t.id !== id);
  persist();
  emit();
  if (!timers.length) stopTicking();
}

export function clearAllTimers() {
  timers = [];
  persist();
  stopTicking();
  emit();
}

export const timerFor = (id) => list().find(t => t.id === id) || null;

/* ------------------------------------------------------------------ *
 * The tick
 * ------------------------------------------------------------------ */

let onRing = null;

/** What to do when one finishes — a sound, a buzz. Set once, at boot. */
export function setTimerAlarm(fn) { onRing = fn; }

function ensureTicking() {
  if (ticker) return;
  ticker = setInterval(() => {
    let changed = false;
    for (const t of timers) {
      if (t.endsAt == null || t.done) continue;
      if (remaining(t) <= 0) {
        t.done = true;
        t.rangAt = t.endsAt;
        t.endsAt = null;
        t.left = 0;
        changed = true;
        try { onRing?.(t); } catch { /* an alarm that throws must not stop the clock */ }
      }
    }
    if (changed) persist();
    emit();
    if (!timers.some(t => t.endsAt != null)) stopTicking();
  }, 1000);
}

function stopTicking() {
  if (ticker) { clearInterval(ticker); ticker = null; }
}

/**
 * Pick the count back up on load.
 *
 * A timer whose end time has already passed while the app was closed is shown
 * as finished rather than quietly deleted — a braise that finished forty minutes
 * ago is something you want told about, not something to hide. It is not sounded
 * though, and it says how long ago it was: waking an app to a fresh-sounding
 * alarm for something that happened while you were out is a fright, and a fright
 * on launch is how an app teaches you to dread opening it.
 */
export function initTimers() {
  for (const t of timers) {
    if (t.endsAt != null && remaining(t) <= 0) {
      t.done = true;
      t.rangAt = t.rangAt ?? t.endsAt;
      t.endsAt = null;
      t.left = 0;
    }
  }
  persist();
  if (timers.some(t => t.endsAt != null)) ensureTicking();
  emit();
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${m}:${String(rest).padStart(2, '0')}`;
}

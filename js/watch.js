/**
 * watch.js — what the wrist gets.
 *
 * watchOS has no web view. That is not a limitation to work around, it is the
 * whole design brief: the watch cannot be this app made small, so it has to be
 * a different, much shorter app that happens to share a kitchen. What it gets
 * is the three things you want when your hands are in a bowl and the phone is
 * on the other counter:
 *
 *   the timers      the reason to own a cooking app on a watch at all
 *   the step        what goes in next, and how much of it
 *   the list        because a shopping list belongs on the wrist in a shop
 *
 * Everything else — 242 recipes, the flavor panel, the technique map, the
 * cookbook — stays on the phone, where there is room to read it. A watch app
 * that tries to be a recipe browser is a watch app nobody opens twice.
 *
 * This file is the phone's half. It keeps a small snapshot of that state in
 * sync across WatchConnectivity, and applies the handful of commands the watch
 * can send back. Like js/native.js it talks only to an injected global, so in
 * a browser it does nothing and the site is unchanged.
 *
 * The snapshot is deliberately tiny and deliberately absolute. Timers travel as
 * `endsAt` wall-clock times rather than as remaining seconds, so the watch can
 * keep counting correctly with the phone in another room, asleep, or out of
 * range — the same reason the timers themselves are stored that way.
 *
 * ERRERLabs — MIT licensed.
 */

import { list as timers, subscribeTimers, toggleTimer, addMinute, clearTimer, startTimer, timerFor } from './timers.js';
import { getState, subscribe, toggleChecked } from './store.js';
import { nativePlugin } from './native.js';

const bridge = () => nativePlugin('WatchBridge');

/** Whether a watch is actually paired and reachable. */
export const hasWatch = () => !!bridge();

/* ------------------------------------------------------------------ *
 * What the watch is shown
 * ------------------------------------------------------------------ */

/**
 * The step being cooked right now, published by cook mode.
 *
 * Held here rather than derived, because cook mode's position is a property of
 * the screen somebody is standing in front of and nothing else in the app
 * knows it. Cleared when they leave, so the watch never shows a step from a
 * dish that came off the heat an hour ago.
 */
let currentStep = null;

export function setWatchStep(step) {
  currentStep = step;
  push();
}

export function clearWatchStep() {
  if (!currentStep) return;
  currentStep = null;
  push();
}

/**
 * The snapshot. Small on purpose — this crosses a Bluetooth link to a device
 * with a small battery, and a payload that carries the whole shopping list plus
 * 242 recipe titles is one that arrives late or not at all.
 */
export function snapshot(state = getState()) {
  return {
    at: Date.now(),
    timers: timers()
      .filter(t => t.done || t.left > 0)
      .slice(0, 6)
      .map(t => ({
        id: t.id,
        label: t.label,
        cue: t.cue || '',
        // Absolute, so the watch counts correctly on its own.
        endsAt: t.endsAt ?? null,
        left: t.left,
        done: !!t.done,
        paused: !!t.paused
      })),
    step: currentStep && {
      ...currentStep,
      // Offered only while it is not already running. A wrist showing "Start
      // 10 min" beside a pot that has been counting for four minutes is the
      // kind of small wrongness that gets a timer started twice.
      timer: currentStep.timer && !timerFor(currentStep.timer.id) ? currentStep.timer : null
    },
    list: shoppingRows(state).slice(0, 60)
  };
}

/**
 * The shopping list, flattened to what a wrist can show: a name, an amount and
 * whether it is ticked. Aisle grouping is a phone affordance — on a watch you
 * are looking at one line at a time anyway.
 */
function shoppingRows(state) {
  const rows = [];
  for (const item of state.customItems || []) {
    rows.push({ key: item.id, name: item.name, qty: item.qty || '', checked: !!state.checked[item.id] });
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * Keeping it in sync
 * ------------------------------------------------------------------ */

let pending = null;

/**
 * Coalesced, because a running timer emits once a second and a watch does not
 * need sixty updates a minute. The watch is counting its own clock from
 * `endsAt`; what it needs from here is the fact that the set of timers changed,
 * not the fact that one of them is one second shorter.
 */
function push() {
  const api = bridge();
  if (!api) return;
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    try {
      api.sync({ state: JSON.stringify(snapshot()) });
    } catch { /* an unreachable watch is the normal case, not an error */ }
  }, 400);
}

/* ------------------------------------------------------------------ *
 * What the watch can ask for
 * ------------------------------------------------------------------ */

/**
 * The commands, deliberately few.
 *
 * A watch is a glance and one button. Anything that needs a decision — a swap,
 * a serving count, a note — belongs on the phone, and offering it here would
 * only produce choices made badly on a two-inch screen.
 */
export function applyCommand(cmd = {}, { onStep } = {}) {
  switch (cmd.type) {
    case 'timer.toggle': toggleTimer(cmd.id); return true;
    case 'timer.more': addMinute(cmd.id, Number(cmd.seconds) || 60); return true;
    case 'timer.clear': clearTimer(cmd.id); return true;
    // Starting the step's own timer, which is the button somebody was about to
    // walk across the kitchen for. The terms come from the step, not from the
    // watch — a wrist is no place to pick a duration.
    case 'timer.start': {
      if (!currentStep?.timer) return false;
      startTimer(currentStep.timer);
      return true;
    }
    case 'list.toggle': toggleChecked(cmd.key); return true;
    // Advancing the step is the one command that has to reach a screen rather
    // than the store: cook mode owns where it is.
    case 'step.next': onStep?.(1); return true;
    case 'step.back': onStep?.(-1); return true;
    default: return false;
  }
}

/**
 * Wire the phone's half up. Safe to call in a browser, where it does nothing.
 *
 * @param onStep  called with +1 or -1 when the watch advances the step
 */
export function initWatch({ onStep } = {}) {
  const api = bridge();
  if (!api) return false;

  subscribeTimers(push);
  subscribe(push);

  try {
    api.addListener?.('command', (event) => {
      applyCommand(event, { onStep });
      push();
    });
  } catch { /* no listener support means one-way sync, which still works */ }

  push();
  return true;
}

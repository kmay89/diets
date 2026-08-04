/**
 * timer-dock.js — the timers, floating above everything.
 *
 * They used to live inside a cook-mode step, which meant they died the moment
 * you moved on or went to look at something else. This mounts once, at the app
 * level, and stays: leave cook mode, open the shopping list, come back, and the
 * pasta is still counting.
 *
 * The harder problem is tone. A dock full of red numbers racing to zero is a
 * dashboard of things about to go wrong, and cooking dinner is stressful enough
 * without one. So a running timer here is deliberately quiet — a label, a clock
 * and a bar filling up, no pulsing and no color until there is something to say.
 * Nothing on it is a deadline; the recipe's own upper bound is carried along so
 * that when the count ends the pill can offer the slack rather than imply the
 * food is now ruined.
 *
 * When one does finish it opens up instead of flashing, and says three things in
 * the order you need them: which pot, what to look for, and how long ago it was.
 * "Have a look — until the lentils are tender" hands the decision back to the
 * cook, which is where it belonged; "rang 12 min ago" is the difference between
 * a timer you can trust and one you have to reconstruct.
 *
 * Every pill is a way back to the pan it came from. Tapping one opens that
 * recipe at that step, because the thing you want after a timer goes off is
 * never the timer — it is the sentence that set it.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount } from '../ui.js';
import {
  list, subscribeTimers, pauseTimer, resumeTimer, clearTimer, addMinute, formatClock
} from '../timers.js';
import { ringWords, sinceWords, bumpSeconds } from '../step-timing.js';
import { play } from '../feedback.js';

/** More than this stacked over the tab bar stops being a dock and becomes a wall. */
const SHOWN = 3;

let host = null;

export function initTimerDock() {
  if (host) return host;
  host = h('div#timer-dock.timer-dock', { 'aria-live': 'polite' });
  document.body.appendChild(host);
  subscribeTimers(draw);
  draw(list());
  return host;
}

/** Anything needing an answer first, then whatever is closest to needing one. */
const order = (a, b) => Number(b.done) - Number(a.done) || a.left - b.left;

function draw(timers = list()) {
  if (!host) return;
  const live = timers.filter(t => t.done || t.left > 0).sort(order);
  host.classList.toggle('is-empty', !live.length);
  host.classList.toggle('is-ringing', live.some(t => t.done));
  if (!live.length) { mount(host); return; }

  const shown = live.slice(0, SHOWN);
  const hidden = live.length - shown.length;

  mount(host,
    ...shown.map(t => (t.done ? finishedPill(t) : countingPill(t))),
    hidden > 0 ? h('p.timer-dock__more', `+${hidden} more running`) : null
  );
}

/** Where this timer came from, if it came from a step we can go back to. */
function jumpTo(t) {
  if (!t.recipeId) return null;
  const step = Number.isInteger(t.step) ? `?step=${t.step + 1}` : '';
  return () => { play('tap'); location.hash = `#/cook/${t.recipeId}${step}`; };
}

/**
 * A timer still counting: label, clock, and a bar.
 *
 * Pause is its own button rather than the whole pill. Tapping a timer by
 * accident and silently stopping it is the one failure that makes people give
 * up on an app's timers entirely, and it is invisible until dinner is late.
 */
function countingPill(t) {
  const go = jumpTo(t);
  const body = [
    h('span.timer-pill__clock', formatClock(t.left)),
    h('span.timer-pill__label', t.label),
    t.paused ? h('span.timer-pill__state', 'Paused') : null
  ];

  return h('div', { class: `timer-pill ${t.paused ? 'is-paused' : 'is-running'}` },
    go
      ? h('button.timer-pill__main', {
          type: 'button',
          'aria-label': `${t.label}, ${formatClock(t.left)} left. Open this step.`,
          onclick: go
        }, ...body)
      : h('div.timer-pill__main', { role: 'group', 'aria-label': `${t.label}, ${formatClock(t.left)} left` }, ...body),

    h('button.timer-pill__act', {
      type: 'button',
      'aria-label': t.paused ? `Resume ${t.label}` : `Pause ${t.label}`,
      onclick: () => { play('tap'); t.paused ? resumeTimer(t.id) : pauseTimer(t.id); }
    }, t.paused ? '▶' : '❙❙'),

    h('button.timer-pill__act', {
      type: 'button',
      'aria-label': `Stop ${t.label}`,
      onclick: () => { play('uncheck'); clearTimer(t.id); }
    }, '✕'),

    h('span.timer-pill__track', h('span.timer-pill__fill', { style: `transform: scaleX(${t.progress.toFixed(3)})` }))
  );
}

/**
 * A timer that has run out.
 *
 * Never the word "done": the timer is done, the food might not be, and a screen
 * that conflates the two is how a pan of underbaked brownies comes out with
 * everyone's blessing. It asks you to look, tells you what for, and says how
 * long ago it was so a timer that ended while the app was shut reads as history
 * rather than as an emergency.
 */
function finishedPill(t) {
  const words = ringWords(t);
  // Offer exactly what the recipe offered. The note under the button said "up
  // to 5 min more if it needs it", so a button reading +5 min is the same
  // promise kept rather than a second, unrelated number to reason about.
  const slack = t.upto > t.seconds ? Math.max(60, Math.round((t.upto - t.seconds) / 60) * 60) : 0;
  const bump = slack || bumpSeconds(t.seconds || 0);
  const go = jumpTo(t);
  const since = sinceWords(t.over);

  return h('div.timer-pill.is-done',
    h(go ? 'button.timer-pill__open' : 'div.timer-pill__open', go ? { type: 'button', onclick: go } : {},
      h('p.timer-pill__head', t.label),
      h('p.timer-pill__cue', `${words.head} — ${words.look}`),
      h('p.timer-pill__since', [since === 'just now' ? 'time is up' : `time was up ${since}`, words.slack].filter(Boolean).join(' · '))
    ),
    h('div.timer-pill__acts',
      h('button.timer-pill__more', {
        type: 'button',
        'aria-label': `Give ${t.label} ${bump / 60} more minutes`,
        onclick: () => { play('tap'); addMinute(t.id, bump); }
      }, `+${bump / 60} min`),
      h('button.timer-pill__ok', {
        type: 'button',
        'aria-label': `Clear ${t.label}`,
        onclick: () => { play('check'); clearTimer(t.id); }
      }, 'Got it')
    )
  );
}

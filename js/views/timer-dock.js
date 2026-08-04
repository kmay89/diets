/**
 * timer-dock.js — the timers, floating above everything.
 *
 * They used to live inside a cook-mode step, which meant they died the moment
 * you moved on or went to look at something else. This mounts once, at the app
 * level, and stays: leave cook mode, open the shopping list, come back, and the
 * pasta is still counting.
 *
 * It sits above the tab bar and shows every running timer, because a kitchen
 * with one pot in it is not a kitchen. When one finishes the pill turns and
 * stays turned until somebody dismisses it — a timer that rings once while you
 * are in another room has not told you anything.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount } from '../ui.js';
import {
  list, subscribeTimers, toggleTimer, clearTimer, addMinute, formatClock
} from '../timers.js';
import { play } from '../feedback.js';

let host = null;

export function initTimerDock() {
  if (host) return host;
  host = h('div#timer-dock.timer-dock', { 'aria-live': 'polite' });
  document.body.appendChild(host);
  subscribeTimers(draw);
  draw(list());
  return host;
}

function draw(timers = list()) {
  if (!host) return;
  const live = timers.filter(t => t.done || t.left > 0);
  host.classList.toggle('is-empty', !live.length);
  host.classList.toggle('is-ringing', live.some(t => t.done));
  if (!live.length) { mount(host); return; }

  mount(host, ...live.map(t => h('div', { class: `timer-pill ${t.done ? 'is-done' : ''} ${t.running ? 'is-running' : ''}` },
    h('button.timer-pill__main', {
      type: 'button',
      'aria-label': t.done ? `${t.label} is done` : `${t.running ? 'Pause' : 'Resume'} ${t.label}`,
      onclick: () => { play('tap'); toggleTimer(t.id); }
    },
      h('span.timer-pill__dot'),
      h('span.timer-pill__clock', t.done ? 'done' : formatClock(t.left)),
      h('span.timer-pill__label', t.label)
    ),
    t.done
      ? h('button.timer-pill__act', {
          type: 'button',
          title: 'Another minute',
          'aria-label': `Give ${t.label} another minute`,
          onclick: () => { play('tap'); addMinute(t.id); }
        }, '+1')
      : null,
    h('button.timer-pill__act', {
      type: 'button',
      'aria-label': `Dismiss ${t.label}`,
      onclick: () => { play('uncheck'); clearTimer(t.id); }
    }, '✕')
  )));
}

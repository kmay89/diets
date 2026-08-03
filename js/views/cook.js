/**
 * cook.js (view) — cook mode. One step, full screen, hands busy.
 *
 * The recipe screen is for deciding; this is for standing at the stove with a
 * pan going. One instruction at a time, at a size you can read from a step
 * back, on a dark field so it does not glare in a dim kitchen. Nothing here
 * scrolls: if a step does not fit, that is a sign the step is doing too much.
 *
 * Steps are plain sentences in the data, so two things are derived rather than
 * authored: the ingredient icons beside a step (matched from its text) and the
 * timer (parsed from durations written in the instruction). Both are garnish —
 * when the guess fails you get a step with no icons and no timer, which is
 * exactly the screen you would have had otherwise.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount } from '../ui.js';
import { getDb } from '../data.js';
import { foodIcon, ingredientsNamedIn } from '../food-icon.js';
import { play, prefersReducedMotion } from '../feedback.js';
import { getState, markCooked } from '../store.js';

/* ------------------------------------------------------------------ *
 * Deriving a timer from the instruction text
 * ------------------------------------------------------------------ */

const UNIT_SECONDS = { second: 1, sec: 1, minute: 60, min: 60, hour: 3600, hr: 3600 };

/**
 * "cook 10-12 minutes" -> 720. "60 seconds" -> 60. "1 hr" -> 3600.
 * A range takes its upper bound: a timer that goes off before the food is
 * ready teaches people to ignore timers.
 */
export function parseDuration(text) {
  const re = /(\d+)\s*(?:[-–—]|\s+to\s+)?\s*(\d+)?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/gi;
  let best = 0;
  for (const m of String(text).matchAll(re)) {
    const unit = m[3].toLowerCase().replace(/s$/, '');
    const mult = UNIT_SECONDS[unit] ?? UNIT_SECONDS[unit.replace(/s$/, '')] ?? 0;
    const n = Number(m[2] ?? m[1]);
    if (mult && Number.isFinite(n)) best = Math.max(best, n * mult);
  }
  // Over an hour is a braise or a rise, not something to stand and watch.
  return best > 0 && best <= 3600 ? best : 0;
}

export function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** First sentence as the headline, the rest as the detail underneath. */
function splitStep(text) {
  const s = String(text).trim();
  const m = s.match(/^(.{10,110}?[.!?])\s+(.*)$/s);
  return m ? { title: m[1], body: m[2] } : { title: s, body: '' };
}

/* ------------------------------------------------------------------ *
 * The view
 * ------------------------------------------------------------------ */

/** Only one countdown can be running, and it dies with the screen. */
let ticker = null;
function stopTicker() {
  if (ticker) { clearInterval(ticker); ticker = null; }
}

export function render(root, { navigate, params }) {
  stopTicker();
  const { recipeIndex } = getDb();
  const recipe = recipeIndex.get(params.id);

  if (!recipe) {
    mount(root, h('section.view',
      h('p.empty', 'That recipe is not in the collection.'),
      h('button.btn.btn--primary', { onclick: () => navigate('#/browse') }, 'Browse recipes')
    ));
    return;
  }

  // Cook mode owns the whole screen, so its state is local to the visit
  // rather than persisted — closing and reopening should start at step one.
  const session = { step: 0, remaining: 0, running: false };
  const draw = () => {
    stopTicker();
    mount(root, screen(recipe, session, draw, navigate));
  };
  draw();
}

function steps(recipe, withOmnivore) {
  const base = (recipe.steps || []).map(text => ({ text, fork: null }));
  if (withOmnivore && recipe.omnivore?.steps?.length) {
    for (const text of recipe.omnivore.steps) base.push({ text, fork: recipe.omnivore.label });
  }
  if (recipe.vegetarianSwap?.steps?.length) {
    for (const text of recipe.vegetarianSwap.steps) base.push({ text, fork: recipe.vegetarianSwap.label });
  }
  return base;
}

function screen(recipe, session, draw, navigate) {
  const state = getState();
  const { ingIndex } = getDb();
  const entry = state.plan.find(e => e.recipeId === recipe.id);
  const withOmnivore = entry ? entry.withOmnivore !== false : !!recipe.omnivore;

  const all = steps(recipe, withOmnivore);
  const total = all.length;
  const i = Math.min(session.step, total - 1);
  const current = all[i];
  const { title, body } = splitStep(current.text);

  const lines = [
    ...(recipe.ingredients || []),
    ...(withOmnivore ? recipe.omnivore?.add || [] : []),
    ...(recipe.vegetarianSwap?.add || [])
  ];
  const icons = ingredientsNamedIn(current.text, lines, ingIndex);
  const seconds = parseDuration(current.text);
  const isLast = i === total - 1;

  const goTo = (n) => { session.step = Math.max(0, Math.min(total - 1, n)); session.running = false; session.remaining = 0; draw(); };

  return h('section.cookmode', { 'aria-label': `Cooking ${recipe.title}` },
    h('header.cookmode__bar',
      h('button.cookmode__close', {
        type: 'button',
        onclick: () => { stopTicker(); navigate(`#/recipe/${recipe.id}`); }
      }, '✕ Close'),
      h('span.cookmode__count', `Step ${i + 1} of ${total}`)
    ),

    h('div.cookmode__body',
      icons.length
        ? h('div.cookmode__icons', ...icons.map(item =>
            h('span.cookmode__icon', foodIcon(item, { size: 62 }))
          ))
        : null,

      current.fork ? h('p.cookmode__fork', current.fork) : null,
      h('h1.cookmode__title', title),
      body ? h('p.cookmode__text', body) : null,

      seconds ? timerPill(seconds, session, draw) : null
    ),

    h('footer.cookmode__foot',
      h('div.cookmode__dots',
        ...all.map((_, n) => h('button', {
          type: 'button',
          class: `cookmode__dot ${n === i ? 'is-current' : ''} ${n < i ? 'is-done' : ''}`,
          'aria-label': `Step ${n + 1}`,
          'aria-current': n === i ? 'step' : null,
          onclick: () => goTo(n)
        }))
      ),
      h('div.cookmode__actions',
        i > 0
          ? h('button.cookmode__back', { type: 'button', onclick: () => goTo(i - 1) }, 'Back')
          : null,
        h('button.cookmode__next', {
          type: 'button',
          onclick: () => {
            if (!isLast) { play('tap'); goTo(i + 1); return; }
            markCooked(recipe.id);
            play('cooked');
            stopTicker();
            navigate('#/today');
          }
        }, isLast ? 'Finish · plate up' : 'Next step')
      )
    )
  );
}

function timerPill(seconds, session, draw) {
  if (!session.remaining) session.remaining = seconds;

  const label = h('span.cookmode__clock', formatClock(session.remaining));
  const hint = h('span.cookmode__timerhint', session.running ? 'tap to pause' : 'start timer');

  const pill = h('button.cookmode__timer', {
    type: 'button',
    class: `cookmode__timer ${session.running ? 'is-running' : ''}`,
    onclick: () => {
      session.running = !session.running;
      if (session.running) start(); else stopTicker();
      hint.textContent = session.running ? 'tap to pause' : 'start timer';
      pill.classList.toggle('is-running', session.running);
    }
  }, h('span.cookmode__timerdot'), label, hint);

  function start() {
    stopTicker();
    ticker = setInterval(() => {
      // The router swaps #main out from under us on navigation; when that
      // happens the node is orphaned and the interval has nothing to update.
      if (!pill.isConnected) { stopTicker(); return; }
      session.remaining = Math.max(0, session.remaining - 1);
      label.textContent = formatClock(session.remaining);
      if (session.remaining === 0) {
        stopTicker();
        session.running = false;
        pill.classList.remove('is-running');
        pill.classList.add('is-done');
        hint.textContent = 'time is up';
        play('cooked');
        if (!prefersReducedMotion()) pill.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }],
          { duration: 420, iterations: 3 }
        );
      }
    }, 1000);
  }

  return pill;
}

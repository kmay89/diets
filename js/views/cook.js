/**
 * cook.js (view) — cook mode. One step, full screen, hands busy.
 *
 * The recipe screen is for deciding; this is for standing at the stove with a
 * pan going. One instruction at a time, at a size you can read from a step
 * back, on a dark field so it does not glare in a dim kitchen.
 *
 * Three things this screen has to get right that a printed recipe cannot.
 *
 * How much. An ingredient list says "2 tbsp olive oil" once, and a method says
 * "heat the oil" in step two and "the rest of the oil" in step six. A cook
 * reading a step needs the amount *for that step*, scaled to the number of
 * servings they are actually cooking, or all of it goes in at step two. So each
 * step names its own ingredients with their own amounts, and says plainly when
 * something is being split rather than guessing a fraction.
 *
 * Where you are. The strip down the side is every ingredient in the recipe,
 * shrunk — what has gone in, what is going in now, what is still to come. It is
 * the minimap from a text editor applied to a pot: position at a glance, and a
 * tap to jump.
 *
 * Timers that outlive the step. They belong to js/timers.js, which is outside
 * every view, so moving to the next step or leaving cook mode entirely does not
 * end them.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, toast } from '../ui.js';
import { getDb } from '../data.js';
import { foodIcon } from '../food-icon.js';
import { play, prefersReducedMotion } from '../feedback.js';
import { getState, markCooked } from '../store.js';
import { askAboutIt } from './after-cooking.js';
import { asCooked } from '../swaps.js';
import { servingEquivalents } from '../nutrition.js';
import { stepsWithAmounts } from '../cook-steps.js';
import { startTimer, timerFor, formatClock, toggleTimer, subscribeTimers } from '../timers.js';
import { stepTiming, timerLabel, ringWords } from '../step-timing.js';
import { setWatchStep, clearWatchStep } from '../watch.js';

/* ------------------------------------------------------------------ *
 * Deriving a timer from the instruction text
 * ------------------------------------------------------------------ */

/**
 * When to ring for a step. The reading lives in step-timing.js, which also
 * pulls out the upper bound and the "until ..." clause — this is the thin
 * spelling for callers and tests that only want the number.
 */
export const parseDuration = (text) => stepTiming(text).seconds;

export { formatClock };

/** First sentence as the headline, the rest as the detail underneath. */
function splitStep(text) {
  const s = String(text).trim();
  const m = s.match(/^(.{10,110}?[.!?])\s+(.*)$/s);
  return m ? { title: m[1], body: m[2] } : { title: s, body: '' };
}

/* ------------------------------------------------------------------ *
 * The view
 * ------------------------------------------------------------------ */

export function render(root, { navigate, params }) {
  const { recipeIndex, ingIndex } = getDb();
  const state = getState();
  const base = recipeIndex.get(params.id);

  if (!base) {
    mount(root, h('section.view',
      h('p.empty', 'That recipe is not in the collection.'),
      h('button.btn.btn--primary', { onclick: () => navigate('#/browse') }, 'Browse recipes')
    ));
    return;
  }

  // The dish as this household cooks it — their swaps and anything they added —
  // at the number of servings they are actually making, because a cook halving
  // a recipe should never be doing arithmetic with wet hands.
  const recipe = asCooked(base, { swaps: state.swaps, additions: state.additions });
  const entry = state.plan.find(e => e.recipeId === base.id);
  const equiv = servingEquivalents(state.household.members, recipe.course);
  // A kitchen with nobody entered into it cooks the recipe as written. Scaling
  // an unconfigured app down to a single serving turns every amount into a
  // fraction of a fraction, which is the opposite of what this screen is for.
  const forHousehold = equiv.total > 0 ? Math.max(1, Math.ceil(equiv.total)) : 0;
  const servings = entry?.servings || forHousehold || recipe.servings || 1;
  const scale = servings / (recipe.servings || 1);
  const withOmnivore = entry ? entry.withOmnivore !== false : !!recipe.omnivore;

  const lines = [
    ...(recipe.ingredients || []),
    ...(withOmnivore ? recipe.omnivore?.add || [] : []),
    ...(recipe.vegetarianSwap?.add || [])
  ];
  const texts = stepTexts(recipe, withOmnivore);
  const plan = stepsWithAmounts({ ...recipe, steps: texts.map(s => s.text) }, ingIndex, { scale, lines });

  // Closing and reopening starts at step one, unless something sent you to a
  // particular step — a timer in the dock going off is exactly that, and
  // dropping you back at step one after it does is a small daily insult.
  const asked = Number(new URLSearchParams(location.hash.split('?')[1] || '').get('step'));
  const session = { step: Number.isFinite(asked) && asked > 0 ? Math.min(asked - 1, texts.length - 1) : 0, timer: null };
  const draw = () => mount(root, screen({
    recipe, base, texts, plan, lines, ingIndex, servings, session, draw, navigate,
    // Snapshotted at the end, not read back later: these are current settings
    // and a household changes its mind.
    swapsUsed: state.swaps?.[base.id] || {},
    addedUsed: state.additions?.[base.id] || [],
    withOmnivore
  }));
  draw();

  // The step's timer is part of this screen, so it has to move when the timer
  // does: a button still reading START after you pressed it is a button that
  // gets pressed twice. Only the button's own text is repainted, never the
  // screen — a redraw a second would snap a cook back to the top of the step
  // every time they scrolled down to finish reading it.
  const stop = subscribeTimers(() => {
    if (!root.isConnected || !root.querySelector('.cookmode')) { stop(); return; }
    if (session.timer) paintTimer(root, session.timer);
  });

  bindKeys(root, session, draw);

  // The wrist gets where this screen is, so a cook with their hands in a bowl
  // can see what goes in next without finding the phone. Cleared on the way
  // out: a step from a dish that came off the heat an hour ago is worse than
  // a blank watch face.
  session.onStep = (delta) => {
    session.step = Math.max(0, Math.min(texts.length - 1, session.step + delta));
    draw();
  };
  session.recipeId = base.id;
  session.publish = () => publishStep(recipe, texts, plan, session);
  session.publish();
  // The one thing outside this module that needs to reach the live screen is a
  // watch saying "next". A single named handle beats threading a callback
  // through the router for one caller.
  window.__cookSession = session;

  subscribeToLeaving(root, clearWatchStep);
}

/**
 * What the watch shows: the sentence, and what goes in for it.
 *
 * The first sentence only. A step in this collection runs to three hundred
 * characters — the instruction, then why it matters, then what it looks like
 * when it is right — and all of that is worth reading on a phone propped
 * against the toaster. On a wrist it is four screens of scrolling to find the
 * verb, so the wrist gets the instruction and the phone keeps the rest.
 */
function publishStep(recipe, texts, plan, session) {
  const i = Math.min(session.step, texts.length - 1);
  setWatchStep({
    recipe: recipe.title,
    index: i,
    total: texts.length,
    text: splitStep(texts[i]?.text || '').title,
    wants: (plan[i]?.wants || []).map(w => ({
      name: w.item.name,
      amount: w.amount || w.label
    })),
    // The one button worth having on a wrist. Standing at the stove with a pan
    // going, the phone is on the other counter and this is the thing you were
    // going to reach for it to press.
    //
    // Always sent. Whether it is still *on offer* is decided when the snapshot
    // is taken, because starting it from the watch does not redraw this screen
    // — baked in here, the wrist went on showing Start for a pot already
    // counting.
    timer: timerOffer(texts[i]?.text || '', session.recipeId, i, recipe.title)
  });
}

/** The step's timer as the watch needs it, or null when the step has none. */
function timerOffer(text, recipeId, index, title) {
  const timing = stepTiming(text);
  if (!timing.seconds) return null;
  return {
    id: `${recipeId}:${index}`,
    seconds: timing.seconds,
    upto: timing.upto,
    cue: timing.cue,
    label: timerLabel(title, text, index + 1),
    step: index,
    recipeId
  };
}

/**
 * Notice when this screen has been replaced, so the watch stops showing a step
 * nobody is standing over. The router swaps the contents of #main rather than
 * calling any teardown, so there is no hook to hang this on — an observer that
 * removes itself is the honest way to do it without inventing one.
 */
function subscribeToLeaving(root, fn) {
  const observer = new MutationObserver(() => {
    if (!root.isConnected || !root.querySelector('.cookmode')) {
      observer.disconnect();
      if (window.__cookSession) window.__cookSession = null;
      fn();
    }
  });
  observer.observe(root, { childList: true });
}

/**
 * Advancing a step without touching the screen.
 *
 * On a Mac, and on an iPad with a keyboard, this is the difference between a
 * cooking screen and a web page: space to move on is what every slideshow and
 * every video player has taught everybody's hands already, and it works with
 * one wet knuckle on the edge of the keyboard.
 *
 * Ignored while somebody is typing — a note with "next step" in it should be a
 * note, not a navigation. Unhooks itself when the screen leaves.
 */
function bindKeys(root, session, draw) {
  const onKey = (e) => {
    if (!root.isConnected || !root.querySelector('.cookmode')) {
      window.removeEventListener('keydown', onKey);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;

    const go = (n) => { session.step = n; draw(); e.preventDefault(); };
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') go(session.step + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(Math.max(0, session.step - 1));
    else if (e.key === 'Home') go(0);
  };
  window.addEventListener('keydown', onKey);
}

function stepTexts(recipe, withOmnivore) {
  const base = (recipe.steps || []).map(text => ({ text, fork: null }));
  if (withOmnivore && recipe.omnivore?.steps?.length) {
    for (const text of recipe.omnivore.steps) base.push({ text, fork: recipe.omnivore.label });
  }
  if (recipe.vegetarianSwap?.steps?.length) {
    for (const text of recipe.vegetarianSwap.steps) base.push({ text, fork: recipe.vegetarianSwap.label });
  }
  return base;
}

function screen({ recipe, base, texts, plan, lines, ingIndex, servings, session, draw, navigate, swapsUsed, addedUsed, withOmnivore }) {
  const total = texts.length;
  const i = Math.min(session.step, total - 1);
  const current = texts[i];
  const wants = plan[i]?.wants || [];
  const { title, body } = splitStep(current.text);
  const timing = stepTiming(current.text);
  const isLast = i === total - 1;
  const timerId = `${base.id}:${i}`;
  session.timer = timing.seconds ? { id: timerId, timing } : null;

  const goTo = (n) => { session.step = Math.max(0, Math.min(total - 1, n)); draw(); };
  // Every redraw is a step change as far as the wrist is concerned.
  session.publish?.();

  return h('section.cookmode', { 'aria-label': `Cooking ${recipe.title}` },
    h('header.cookmode__bar',
      h('button.cookmode__close', {
        type: 'button',
        onclick: () => navigate(`#/recipe/${base.id}`)
      }, '✕ Close'),
      h('span.cookmode__count', `Step ${i + 1} of ${total}`),
      h('span.cookmode__servings', `${servings} ${servings === 1 ? 'serving' : 'servings'}`)
    ),

    h('div.cookmode__stage',
      h('div.cookmode__body',
        current.fork ? h('p.cookmode__fork', current.fork) : null,

        // What goes in, and how much of it, before the instruction — because
        // this is the part you reach for while reading the sentence.
        wants.length ? amountsPanel(wants) : null,

        h('h1.cookmode__title', title),
        body ? h('p.cookmode__text', body) : null,

        timing.seconds
          ? timerButton({
              id: timerId,
              timing,
              label: timerLabel(recipe.title, current.text, i + 1),
              recipeId: base.id,
              step: i
            })
          : null
      ),

      minimap(lines, plan, i, ingIndex, goTo)
    ),

    h('footer.cookmode__foot',
      h('div.cookmode__dots',
        ...texts.map((_, n) => h('button', {
          type: 'button',
          class: `cookmode__dot ${n === i ? 'is-current' : ''} ${n < i ? 'is-done' : ''}`,
          'aria-label': `Step ${n + 1}`,
          'aria-current': n === i ? 'step' : null,
          onclick: () => goTo(n)
        }))
      ),
      h('div.cookmode__actions',
        i > 0 ? h('button.cookmode__back', { type: 'button', onclick: () => goTo(i - 1) }, 'Back') : null,
        h('button.cookmode__next', {
          type: 'button',
          onclick: () => {
            if (!isLast) { play('tap'); goTo(i + 1); return; }
            // Recorded as it was actually cooked — this household's swaps, the
            // things they added, the size they made. Read a year later, that is
            // the difference between "you made this" and "you made this like
            // so, and here is what you said about it".
            const entry = markCooked(base.id, new Date(), {
              servings,
              swaps: swapsUsed,
              added: addedUsed,
              fork: withOmnivore
            });
            play('cooked');
            askAboutIt(base, entry, () => navigate('#/today'));
          }
        }, isLast ? 'Finish · plate up' : 'Next step')
      )
    )
  );
}

/**
 * The ingredients this step calls for, with the amount for this step.
 *
 * Anything that is not simply "all of it" is marked, because that is the case
 * where a cook glancing at the list would get it wrong — half the oil, the rest
 * of the cilantro, a cup of the pasta water held back.
 */
function amountsPanel(wants) {
  return h('div.amounts',
    ...wants.map(w => h('div', { class: `amount ${w.careful ? 'is-careful' : ''} ${w.sure ? '' : 'is-unsure'}` },
      foodIcon(w.item, { size: 34 }),
      h('div.amount__body',
        h('p.amount__qty', w.amount || w.label),
        h('p.amount__name', w.item.name),
        w.careful
          ? h('p.amount__note',
              w.detail || (w.amount ? `${w.label} of ${w.full}` : `${w.label} — of ${w.full} in total`),
              w.sure ? null : h('span.amount__flag', ' · check the list'))
          : null
      )
    ))
  );
}

/**
 * The minimap: the whole ingredient list, shrunk.
 *
 * Borrowed from a text editor, and it answers the question cook mode otherwise
 * cannot — where am I in this recipe, and what is still coming. Bright is
 * going in now, solid is already in, faint is still to come. Tapping a row
 * jumps to the step that calls for it.
 */
function minimap(lines, plan, current, ingIndex, goTo) {
  const firstStepOf = new Map();
  const nowSet = new Set((plan[current]?.wants || []).map(w => w.line.ing));
  plan.forEach((step, index) => {
    for (const w of step.wants) if (!firstStepOf.has(w.line.ing)) firstStepOf.set(w.line.ing, index);
  });

  return h('aside.minimap', { 'aria-label': 'Where you are in the ingredients' },
    ...lines.map(line => {
      const item = ingIndex.get(line.ing);
      if (!item) return null;
      const at = firstStepOf.get(line.ing);
      const state = nowSet.has(line.ing) ? 'now' : at != null && at < current ? 'done' : 'later';
      return h('button', {
        type: 'button',
        class: `minimap__row is-${state}`,
        title: item.name,
        'aria-label': `${item.name}${at != null ? `, step ${at + 1}` : ''}`,
        onclick: () => { if (at != null) { play('tap'); goTo(at); } }
      },
        h('span.minimap__bar'),
        h('span.minimap__name', item.name)
      );
    }).filter(Boolean)
  );
}

/**
 * The timer for this step, handed to the global store.
 *
 * It says what it is going to do before you press it, which is the difference
 * between a timer you set and one you set once and then watch anxiously. A
 * range in the step becomes "rings at 20 min so you can look — up to 25 if it
 * needs it", so running out is understood as a check-in from the beginning
 * rather than a deadline you discover you have missed.
 *
 * One button for every state, dispatching on what the store says rather than on
 * what was true when the screen was drawn. Extending and dismissing happen in
 * the dock, which is visible from every screen — so there is exactly one place a
 * running timer lives and no way to strand one behind a navigation.
 */
function timerButton({ id, timing, label, recipeId, step }) {
  const { seconds, upto, cue } = timing;

  const wrap = h('div.cookmode__timerwrap',
    h('button.cookmode__timer', {
      type: 'button',
      onclick: (e) => {
        if (timerFor(id)) { play('tap'); toggleTimer(id); return; }
        startTimer({ id, seconds, upto, cue, label, recipeId, step });
        play('tap');
        if (!prefersReducedMotion()) {
          e.currentTarget.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }],
            { duration: 260 }
          );
        }
      }
    },
      h('span.cookmode__timerdot'),
      h('span.cookmode__clock'),
      h('span.cookmode__timerhint')
    ),
    h('p.cookmode__timernote')
  );

  paintTimer(wrap, { id, timing });
  return wrap;
}

/**
 * Bring the button up to date with the store, in place.
 *
 * Text and classes only. Redrawing the screen once a second would throw away
 * scroll position and any selection, and a cook who has scrolled down to finish
 * reading a long step would be snapped back to the top of it every tick.
 */
function paintTimer(scope, { id, timing }) {
  const button = scope.querySelector('.cookmode__timer');
  if (!button) return;
  const t = timerFor(id);

  const [clock, hint, note] = [
    button.querySelector('.cookmode__clock'),
    button.querySelector('.cookmode__timerhint'),
    scope.querySelector('.cookmode__timernote')
  ];

  button.classList.toggle('is-running', !!t?.running);
  button.classList.toggle('is-done', !!t?.done);

  if (!t) {
    clock.textContent = formatClock(timing.seconds);
    hint.textContent = 'start timer';
    note.textContent = whenItRings(timing);
  } else if (t.done) {
    clock.textContent = 'have a look';
    hint.textContent = 'answer it below';
    note.textContent = hasRung(timing);
  } else {
    clock.textContent = formatClock(t.left);
    hint.textContent = t.running ? 'tap to pause' : 'paused · tap to resume';
    note.textContent = t.running
      ? 'running — it stays with you wherever you go'
      : 'paused — nothing is counting until you start it again';
  }
}

/**
 * The promise the button is making, before it is pressed.
 *
 * Saying the terms up front is most of the work: a cook who knows the bell
 * means "come and look, there are five more minutes in hand" never has to feel
 * the bell as a failure.
 */
function whenItRings({ seconds, upto, cue }) {
  const at = seconds < 60 ? `${seconds} sec` : `${Math.round(seconds / 60)} min`;
  return [
    `Rings at ${at} so you can look`,
    cue ? `until ${cue}` : null,
    upto > seconds ? `up to ${Math.round(upto / 60)} min if it needs it` : null
  ].filter(Boolean).join(' · ');
}

/**
 * The same terms once it has gone off. The button beside it already says "have
 * a look", so this is only what to look for and how much room is left.
 */
function hasRung({ seconds, upto, cue }) {
  const { look, slack } = ringWords({ seconds, upto, cue });
  return [look, slack].filter(Boolean).join(' · ');
}

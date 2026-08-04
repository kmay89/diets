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
import { asCooked } from '../swaps.js';
import { servingEquivalents } from '../nutrition.js';
import { stepsWithAmounts } from '../cook-steps.js';
import { startTimer, timerFor, formatClock, toggleTimer } from '../timers.js';
import { labelFor } from '../recipe-table.js';

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
  // Over four hours is a marinade or a rise, not something to stand and watch.
  return best > 0 && best <= 14400 ? best : 0;
}

export { formatClock };

/** Enough of the dish's name to recognize it in a dock across the kitchen. */
const shortTitle = (title) => String(title).split(/[,(—]/)[0].trim().split(/\s+/).slice(0, 3).join(' ');

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

  // Local to the visit: closing and reopening should start at step one.
  const session = { step: 0 };
  const draw = () => mount(root, screen({
    recipe, base, texts, plan, lines, ingIndex, servings, session, draw, navigate
  }));
  draw();
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

function screen({ recipe, base, texts, plan, lines, ingIndex, servings, session, draw, navigate }) {
  const total = texts.length;
  const i = Math.min(session.step, total - 1);
  const current = texts[i];
  const wants = plan[i]?.wants || [];
  const { title, body } = splitStep(current.text);
  const seconds = parseDuration(current.text);
  const isLast = i === total - 1;
  const timerId = `${base.id}:${i}`;
  // "Bolognese · simmer" rather than the first forty characters of the step —
  // the dock is glanceable from another room and a truncated sentence is not.
  const timerLabel = `${shortTitle(recipe.title)} · ${labelFor(current.text).verb.toLowerCase()}`;
  const running = timerFor(timerId);

  const goTo = (n) => { session.step = Math.max(0, Math.min(total - 1, n)); draw(); };

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

        seconds ? timerButton(timerId, seconds, timerLabel, running) : null
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
            markCooked(base.id);
            play('cooked');
            toast('Nice. Marked as cooked.');
            navigate('#/today');
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
 * The button only ever starts it. Pausing, extending and dismissing happen in
 * the dock, which is visible from every screen — so there is exactly one place
 * a running timer lives and no way to strand one behind a navigation.
 */
function timerButton(id, seconds, label, running) {
  if (running) {
    return h('button', {
      type: 'button',
      class: `cookmode__timer ${running.running ? 'is-running' : ''} ${running.done ? 'is-done' : ''}`,
      onclick: () => { play('tap'); toggleTimer(id); }
    },
      h('span.cookmode__timerdot'),
      h('span.cookmode__clock', running.done ? 'time is up' : formatClock(running.left)),
      h('span.cookmode__timerhint', running.done ? 'in the dock below' : running.running ? 'tap to pause' : 'tap to resume')
    );
  }

  return h('button.cookmode__timer', {
    type: 'button',
    onclick: (e) => {
      startTimer({ id, seconds, label });
      play('tap');
      if (!prefersReducedMotion()) {
        e.currentTarget.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }],
          { duration: 260 }
        );
      }
      toast('Timer started — it keeps running wherever you go');
    }
  },
    h('span.cookmode__timerdot'),
    h('span.cookmode__clock', formatClock(seconds)),
    h('span.cookmode__timerhint', 'start timer')
  );
}

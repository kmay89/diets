/**
 * roll.js (view) — the dice screen. Deal a hand of meals, keep what you like,
 * re-roll what you do not, send the keepers to the plan.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, chip, toast, minutes, scoreBadge, pill, plural } from '../ui.js';
import { getDb, pantryCoverage, seasonNow, heartFor } from '../data.js';
import { getState, setPref, addToPlan, isPlanned, setRecipeLike } from '../store.js';
import { roll, rerollOne, newSeed, explainPick } from '../roll.js';
import { servingEquivalents } from '../nutrition.js';
import { play, tumble, stagger, pulse } from '../feedback.js';
import { upcomingOccasion, recipesForOccasion } from '../occasions.js';

/** Session-only: the current hand. Not persisted — a roll is a moment, not a document. */
let hand = [];        // [{ recipe, locked }]
let lastSeed = null;
let course = 'dinner';

export function render(root, { navigate }) {
  const draw = () => mount(root, view(draw, navigate));
  draw();
}

function view(draw, navigate) {
  const state = getState();
  const equiv = servingEquivalents(state.household.members, course);

  return h('section.view',
    header(state, equiv, draw),
    upcomingCard(navigate),
    controls(state, draw),
    hand.length ? results(state, draw, navigate) : emptyState(state, draw)
  );
}

function upcomingCard(navigate) {
  const occ = upcomingOccasion();
  if (!occ) return null;
  const count = recipesForOccasion(occ.id).length;
  if (!count) return null;
  return h('button.card.upcoming', {
    type: 'button',
    onclick: () => navigate(`#/browse?occasion=${occ.id}`)
  },
    h('span.upcoming__icon', occ.icon),
    h('div.upcoming__body',
      h('strong', occ.name),
      h('p', `${occ.blurb} · ${count} recipes`)
    ),
    h('span.muted', '→')
  );
}

function header(state, equiv, draw) {
  return h('div.view__head',
    h('div',
      h('h1.view__title', 'Roll tonight'),
      h('p.view__sub',
        `${state.household.members.filter(m => m.eats !== false).length} eating · `,
        `about ${equiv.total} servings a meal · `,
        `${seasonNow()}`
      )
    )
  );
}

const SIZES = [1, 2, 3, 4, 5, 6, 7];

function controls(state, draw) {
  const size = state.prefs.rollSize;

  const doRoll = (n) => {
    const state2 = getState();
    const keep = hand.filter(x => x.locked).map(x => x.recipe);
    play('roll');
    const result = roll(state2, Math.max(0, n - keep.length), { course, keep });
    lastSeed = result.seed;
    hand = [
      ...hand.filter(x => x.locked),
      ...result.picks.map(r => ({ recipe: r, locked: false }))
    ];
    if (result.exhausted) {
      toast('Ran out of matching recipes — loosen a filter for more variety', { kind: 'warn' });
    }
    draw();
    requestAnimationFrame(() => stagger(document.querySelector('.card-grid')));
  };

  return h('div.card.roller',
    h('div.roller__row',
      h('span.roller__label', 'How many meals?'),
      h('div.chip-row.chip-row--tight',
        ...SIZES.map(n => chip(String(n), {
          on: size === n,
          onclick: () => { setPref('rollSize', n); draw(); }
        })),
        chip('🎲 surprise', {
          onclick: () => {
            const n = 2 + Math.floor((newSeed() % 5));
            setPref('rollSize', n);
            doRoll(n);
            toast(`Rolled ${n} meals`);
          }
        })
      )
    ),
    h('div.roller__row',
      h('span.roller__label', 'Meal'),
      h('div.chip-row.chip-row--tight',
        ...[['dinner', 'Dinners'], ['lunch', 'Lunches'], ['breakfast', 'Breakfasts'], ['snack', 'Snacks']].map(([c, label]) =>
          chip(label, { on: course === c, onclick: () => { course = c; hand = []; draw(); } }))
      )
    ),
    h('div.roller__row.roller__row--filters',
      chip(`≤ ${state.prefs.maxActiveMin} min active`, { on: true, onclick: () => cycleTime(draw) }),
      chip('Kid-friendly only', { on: state.prefs.kidFriendlyOnly, onclick: () => { setPref('kidFriendlyOnly', !state.prefs.kidFriendlyOnly); draw(); } }),
      chip('Use the pantry', { on: state.prefs.preferPantry, onclick: () => { setPref('preferPantry', !state.prefs.preferPantry); draw(); } }),
      chip('In season', { on: state.prefs.seasonAware, onclick: () => { setPref('seasonAware', !state.prefs.seasonAware); draw(); } }),
      chip('Heart-forward', { on: state.prefs.heartMode, onclick: () => { setPref('heartMode', !state.prefs.heartMode); draw(); } }),
      chip('🍯 Treat night', {
        on: state.prefs.treatNight,
        onclick: () => {
          const on = !state.prefs.treatNight;
          setPref('treatNight', on);
          hand = [];
          play(on ? 'complete' : 'tap');
          if (on) toast('Rolling the crave list. Scores still show — they just stop steering.', { duration: 3600 });
          draw();
        }
      })
    ),
    h('button.btn.btn--primary.btn--big', {
      type: 'button',
      onclick: (e) => { tumble(e.currentTarget.querySelector('.dice') || e.currentTarget); doRoll(state.prefs.rollSize); }
    }, h('span.dice', '🎲'), ' ', hand.length ? `Re-roll ${hand.filter(x => !x.locked).length || size} unlocked` : `Roll ${size} ${course}${size > 1 ? 's' : ''}`)
  );
}

function cycleTime(draw) {
  const order = [15, 20, 30, 45, 60];
  const cur = getState().prefs.maxActiveMin;
  const next = order[(order.indexOf(cur) + 1) % order.length] ?? 30;
  setPref('maxActiveMin', next);
  draw();
}

function emptyState(state, draw) {
  return h('div.empty-state',
    h('div.empty-state__dice', '🎲'),
    h('h2', 'Nothing rolled yet'),
    h('p.muted', 'Pick a number and roll. Lock the ones you like, re-roll the rest, then send them to the plan.'),
    !state.household.members.length
      ? h('p.muted', h('a', { href: '#/onboarding' }, 'Set up your household first'), ' so portions and diets come out right.')
      : null
  );
}

function results(state, draw, navigate) {
  const equiv = servingEquivalents(state.household.members, course);

  return h('div',
    h('div.results__actions',
      h('button.btn.btn--primary', {
        type: 'button',
        onclick: () => {
          let added = 0;
          for (const { recipe } of hand) {
            if (isPlanned(recipe.id)) continue;
            addToPlan(recipe.id, { course, servings: suggestedServings(recipe, equiv) });
            added++;
          }
          play(added ? 'complete' : 'warn');
          toast(added ? `Added ${added} to the plan` : 'Everything here is already planned');
          draw();
        }
      }, 'Add all to plan'),
      h('button.btn', { type: 'button', onclick: () => { hand = []; draw(); } }, 'Clear hand'),
      lastSeed != null ? h('span.seed', `seed ${lastSeed}`) : null
    ),
    h('div.card-grid', ...hand.map((slot, i) => recipeCard(slot, i, state, equiv, draw, navigate)))
  );
}

function suggestedServings(recipe, equiv) {
  // Round up to a whole serving; leftovers are a feature, not a bug.
  return Math.max(1, Math.ceil(equiv.total));
}

function recipeCard(slot, index, state, equiv, draw, navigate) {
  const { recipe, locked } = slot;
  const heart = heartFor(recipe);
  const cov = pantryCoverage(recipe, state.pantry);
  const reasons = explainPick(recipe, state, hand.filter((_, i) => i !== index).map(x => x.recipe));
  const planned = isPlanned(recipe.id);
  const servings = suggestedServings(recipe, equiv);

  return h('article', { class: `card recipe-card ${locked ? 'is-locked' : ''}` },
    h('div.recipe-card__head',
      h('div',
        h('h3.recipe-card__title', { onclick: () => navigate(`#/recipe/${recipe.id}`), role: 'button', tabindex: '0' }, recipe.title),
        h('p.recipe-card__blurb', recipe.blurb)
      ),
      scoreBadge(heart)
    ),

    h('div.pill-row',
      pill(`${minutes(recipe.activeMin)} active`),
      pill(minutes(recipe.totalMin) + ' total'),
      recipe.diet?.includes('vegan') ? pill('vegan', 'green') : recipe.diet?.includes('vegetarian') ? pill('vegetarian', 'green') : null,
      recipe.omnivore ? pill('+ omnivore add-on', 'meat') : null,
      recipe.vegetarianSwap ? pill('+ vegetarian swap', 'green') : null,
      recipe.kidFriendly ? pill('kids eat it') : null,
      cov.total ? pill(`${cov.have}/${cov.total} in pantry`, cov.ratio > 0.5 ? 'green' : '') : null
    ),

    reasons.length ? h('p.why', h('span.why__label', 'Why this one: '), reasons.slice(0, 3).join(', ')) : null,

    recipe.omnivore
      ? h('p.fork', h('strong', '🍽 Fork in the road: '), recipe.omnivore.label, ' — ', recipe.omnivore.note)
      : null,

    h('div.recipe-card__actions',
      h('button.btn', {
        type: 'button',
        onclick: () => { slot.locked = !slot.locked; play(slot.locked ? 'check' : 'uncheck'); draw(); }
      }, locked ? '🔒 Locked' : '🔓 Lock'),
      h('button.btn', {
        type: 'button',
        onclick: () => {
          const others = hand.filter((_, i) => i !== index).map(x => x.recipe);
          const next = rerollOne(getState(), others, { course, exclude: [recipe.id] });
          if (!next) return toast('No other recipe fits those filters', { kind: 'warn' });
          hand[index] = { recipe: next, locked: false };
          draw();
        }
      }, '🎲 Swap'),
      h('button.btn', {
        type: 'button',
        onclick: () => { setRecipeLike(recipe.id, -1); hand.splice(index, 1); toast('Hidden from future rolls'); draw(); }
      }, '🚫 Not for us'),
      h('button', {
        class: planned ? 'btn' : 'btn btn--primary',
        type: 'button',
        disabled: planned,
        onclick: () => { addToPlan(recipe.id, { course, servings }); toast(`Added — cooking ${plural(servings, 'serving')}`); draw(); }
      }, planned ? 'In the plan' : `Add (${plural(servings, 'serving')})`),
      h('button.btn.btn--ghost', { type: 'button', onclick: () => navigate(`#/recipe/${recipe.id}`) }, 'Open →')
    )
  );
}

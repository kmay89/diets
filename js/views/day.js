/**
 * day.js (view) — one day, every meal on it.
 *
 * The plan screen answers "what is the week"; this answers "what is Tuesday".
 * It is the only place the courses stack up in the order they get eaten, which
 * is also the only order in which the day's numbers mean anything — a dinner
 * that looks heavy on its own often is not, once breakfast is in the column.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, minutes, num } from '../ui.js';
import { getDb, nutritionFor, heartFor } from '../data.js';
import { foodIcon } from '../food-icon.js';
import { getState, updatePlanEntry, DAYS } from '../store.js';
import { dailyTargets, typicalBody } from '../nutrition.js';
import { heroIngredients } from './today.js';

/** Breakfast first, snacks last — the order a day is actually eaten in. */
const COURSE_ORDER = ['breakfast', 'lunch', 'dinner', 'side', 'snack', 'sauce', 'component'];

export function render(root, { navigate, params }) {
  const dayName = DAYS.find(d => d.toLowerCase() === String(params.day || '').toLowerCase());
  const draw = () => mount(root, dayName ? view(dayName, draw, navigate) : notFound(navigate));
  draw();
}

function notFound(navigate) {
  return h('section.view',
    h('p.empty', 'That is not a day of the week.'),
    h('button.btn.btn--primary', { onclick: () => navigate('#/plan') }, 'Back to the week')
  );
}

function view(dayName, draw, navigate) {
  const state = getState();
  const { recipeIndex, ingIndex } = getDb();

  const meals = state.plan
    .filter(e => e.day === dayName)
    .map(entry => ({ entry, recipe: recipeIndex.get(entry.recipeId) }))
    .filter(x => x.recipe)
    .sort((a, b) => COURSE_ORDER.indexOf(a.recipe.course) - COURSE_ORDER.indexOf(b.recipe.course));

  return h('section.view',
    h('button.linkish', { type: 'button', onclick: () => navigate('#/plan') }, '‹ This week'),

    h('div.view__head',
      h('div', h('h1.view__title', dayName)),
      dayScore(meals)
    ),

    meals.length ? daySummary(meals, state, ingIndex) : null,

    meals.length
      ? h('div.day__meals', ...meals.map(m => mealRow(m, ingIndex, draw, navigate)))
      : h('p.muted', `Nothing pinned to ${dayName} yet. Anything on the plan without a night can be moved here.`),

    unpinned(state, recipeIndex, dayName, draw),

    h('button.btn.btn--big', { type: 'button', onclick: () => navigate('#/create') },
      `+ Add a meal to ${dayName}`)
  );
}

function dayScore(meals) {
  const scored = meals.map(m => heartFor(m.recipe)).filter(x => x && x.score != null);
  if (!scored.length) return null;
  const avg = Math.round(scored.reduce((a, b) => a + b.score, 0) / scored.length);
  return h('div.day__score',
    h('span.day__score-num', avg),
    h('span.day__score-label', 'day score')
  );
}

function daySummary(meals, state, ingIndex) {
  const totals = { sodium_mg: 0, fiber_g: 0, satfat_g: 0 };
  const plants = new Set();

  for (const { entry, recipe } of meals) {
    const per = nutritionFor(recipe, { withOmnivore: entry.withOmnivore }).perServing;
    totals.sodium_mg += per.sodium_mg;
    totals.fiber_g += per.fiber_g;
    totals.satfat_g += per.satfat_g;
    for (const line of recipe.ingredients || []) {
      const item = ingIndex.get(line.ing);
      if (item && (item.aisle === 'produce' || item.aisle === 'nuts-seeds' || item.aisle === 'dry-goods')) {
        plants.add(item.id);
      }
    }
  }

  const eaters = state.household.members.filter(m => m.eats !== false);
  const targets = dailyTargets(eaters[0] || typicalBody(), { heartMode: state.prefs.heartMode });

  const cells = [
    { value: num(totals.sodium_mg), unit: 'mg', label: 'sodium', of: `of ${num(targets.sodium_mg)}` },
    { value: num(totals.fiber_g), unit: 'g', label: 'fibre', of: `of ${num(targets.fiber_g)}` },
    { value: num(totals.satfat_g, 1), unit: 'g', label: 'sat fat', of: `of ${num(targets.satfat_g)}` },
    { value: String(plants.size), unit: '', label: 'plants', of: 'different' }
  ];

  return h('div.day__summary', ...cells.map(c =>
    h('div.day__cell',
      h('span.day__cell-value', c.value, c.unit ? h('span.day__cell-unit', c.unit) : null),
      h('span.day__cell-label', c.label),
      h('span.day__cell-of', c.of)
    )
  ));
}

function mealRow({ entry, recipe }, ingIndex, draw, navigate) {
  const heart = heartFor(recipe);
  const [a, b] = heroIngredients(recipe, ingIndex, 2);

  return h('article.day__meal',
    h('button.day__meal-art', {
      type: 'button',
      'aria-label': recipe.title,
      onclick: () => navigate(`#/recipe/${recipe.id}`)
    },
      a ? foodIcon(a, { size: 42 }) : null,
      b ? h('span.day__meal-art-b', foodIcon(b, { size: 26 })) : null
    ),
    h('div.day__meal-text',
      h('p.eyebrow.eyebrow--clay', recipe.course),
      h('button.day__meal-title', {
        type: 'button',
        onclick: () => navigate(`#/recipe/${recipe.id}`)
      }, recipe.title),
      h('p.muted.small',
        `${minutes(recipe.activeMin)} active`,
        entry.withOmnivore && recipe.omnivore ? ` · ${recipe.omnivore.label.toLowerCase()}` : '',
        ` · serves ${entry.servings || recipe.servings}`
      )
    ),
    h('div.day__meal-side',
      heart?.score != null ? h('span.day__meal-score', heart.score) : null,
      h('button.linkish.small', {
        type: 'button',
        onclick: () => { updatePlanEntry(entry.id, { day: null }); draw(); }
      }, 'Unpin')
    )
  );
}

/** Anything on the plan with no night yet can be dropped onto this day. */
function unpinned(state, recipeIndex, dayName, draw) {
  const loose = state.plan
    .filter(e => !e.day)
    .map(entry => ({ entry, recipe: recipeIndex.get(entry.recipeId) }))
    .filter(x => x.recipe);

  if (!loose.length) return null;

  return h('section.card.block',
    h('h2.block__title', 'Not on a night yet'),
    h('div.chip-row', ...loose.map(({ entry, recipe }) =>
      h('button.chip', {
        type: 'button',
        onclick: () => { updatePlanEntry(entry.id, { day: dayName }); draw(); }
      }, `${recipe.title} →`)
    ))
  );
}

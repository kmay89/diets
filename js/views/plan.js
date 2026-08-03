/**
 * plan.js (view) — the week. What is being cooked, for how many, on which night.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, pill, toast, minutes, scoreBadge, meter, titleCase, confirmSheet } from '../ui.js';
import { getDb, nutritionFor, heartFor, sharesShoppingWith } from '../data.js';
import { getState, updatePlanEntry, removeFromPlan, clearPlan, addToPlan, markCooked, DAYS } from '../store.js';
import { servingEquivalents, householdTargets, NUTRIENT_LABELS } from '../nutrition.js';

export function render(root, { navigate }) {
  const draw = () => mount(root, view(draw, navigate));
  draw();
}

function view(draw, navigate) {
  const state = getState();
  const { recipeIndex } = getDb();
  const entries = state.plan
    .map(e => ({ entry: e, recipe: recipeIndex.get(e.recipeId) }))
    .filter(x => x.recipe);

  if (!entries.length) {
    return h('section.view',
      h('div.view__head', h('h1.view__title', 'The plan')),
      h('div.empty-state',
        h('div.empty-state__dice', '📋'),
        h('h2', 'Nothing planned yet'),
        h('p.muted', 'Roll a few meals, or browse the collection and add what looks good.'),
        h('div.row-actions',
          h('button.btn.btn--primary', { onclick: () => navigate('#/roll') }, '🎲 Roll some meals'),
          h('button.btn', { onclick: () => navigate('#/browse') }, 'Browse recipes')
        )
      )
    );
  }

  return h('section.view',
    h('div.view__head',
      h('div',
        h('h1.view__title', 'The plan'),
        h('p.view__sub', `${entries.length} meals · ${totalActive(entries)} minutes of active cooking this week`)
      )
    ),

    h('div.results__actions',
      h('button.btn.btn--primary', { type: 'button', onclick: () => navigate('#/list') }, '🛒 Build the shopping list'),
      h('button.btn', {
        type: 'button',
        onclick: async () => {
          if (await confirmSheet('Clear the plan?', 'This removes every meal from the week. Your pantry, tastes and shopping extras stay.', { confirmLabel: 'Clear it', danger: true })) {
            clearPlan(); draw();
          }
        }
      }, 'Clear plan')
    ),

    h('div.plan-list', ...entries.map(({ entry, recipe }) => planRow(entry, recipe, state, draw, navigate))),

    weekSummary(entries, state),
    suggestions(entries, state, draw, navigate)
  );
}

function totalActive(entries) {
  return entries.reduce((a, x) => a + x.recipe.activeMin, 0);
}

function planRow(entry, recipe, state, draw, navigate) {
  const heart = heartFor(recipe);
  const nut = nutritionFor(recipe, { withOmnivore: entry.withOmnivore });

  return h('article.card.plan-row',
    h('div.plan-row__head',
      h('div',
        h('h3.recipe-card__title', { role: 'button', tabindex: '0', onclick: () => navigate(`#/recipe/${recipe.id}`) }, recipe.title),
        h('p.muted.small', `${minutes(recipe.activeMin)} active · ${minutes(recipe.totalMin)} total · ${Math.round(nut.perServing.kcal)} kcal a serving`)
      ),
      scoreBadge(heart)
    ),

    h('div.plan-row__controls',
      h('label.field.field--inline',
        h('span.field__label', 'Night'),
        h('select.input', { onchange: (e) => { updatePlanEntry(entry.id, { day: e.target.value || null }); draw(); } },
          h('option', { value: '', selected: !entry.day }, 'Any night'),
          ...DAYS.map(d => h('option', { value: d, selected: entry.day === d }, d))
        )
      ),
      h('label.field.field--inline',
        h('span.field__label', 'Servings'),
        h('div.stepper',
          h('button.icon-btn', { type: 'button', onclick: () => { updatePlanEntry(entry.id, { servings: Math.max(1, (entry.servings || recipe.servings) - 1) }); draw(); } }, '−'),
          h('span.stepper__value', entry.servings || recipe.servings),
          h('button.icon-btn', { type: 'button', onclick: () => { updatePlanEntry(entry.id, { servings: (entry.servings || recipe.servings) + 1 }); draw(); } }, '+')
        )
      ),
      recipe.omnivore
        ? h('label.switch-inline',
            h('input', { type: 'checkbox', checked: !!entry.withOmnivore, onchange: (e) => { updatePlanEntry(entry.id, { withOmnivore: e.target.checked }); draw(); } }),
            h('span', recipe.omnivore.label)
          )
        : null,
      recipe.vegetarianSwap
        ? h('label.switch-inline',
            h('input', { type: 'checkbox', checked: !!entry.withVegSwap, onchange: (e) => { updatePlanEntry(entry.id, { withVegSwap: e.target.checked }); draw(); } }),
            h('span', recipe.vegetarianSwap.label)
          )
        : null
    ),

    h('div.recipe-card__actions',
      h('button.btn', { type: 'button', onclick: () => { markCooked(recipe.id); removeFromPlan(entry.id); toast('Nice. Marked as cooked.'); draw(); } }, '✓ Cooked'),
      h('button.btn.btn--ghost', { type: 'button', onclick: () => { removeFromPlan(entry.id); draw(); } }, 'Remove')
    )
  );
}

function weekSummary(entries, state) {
  const eaters = state.household.members.filter(m => m.eats !== false);
  if (!eaters.length) return null;

  const targets = householdTargets(eaters, { heartMode: state.prefs.heartMode });
  const equiv = servingEquivalents(eaters, 'dinner');

  // Average per-person-per-meal figures across the plan.
  let kcal = 0, sodium = 0, satfat = 0, fiber = 0;
  for (const { entry, recipe } of entries) {
    const n = nutritionFor(recipe, { withOmnivore: entry.withOmnivore });
    kcal += n.perServing.kcal;
    sodium += n.perServing.sodium_mg;
    satfat += n.perServing.satfat_g;
    fiber += n.perServing.fiber_g;
  }
  const c = entries.length || 1;

  const perPersonDay = {
    sodium: Math.round(targets.sodium_mg / eaters.length),
    satfat: Math.round(targets.satfat_g / eaters.length),
    fiber: Math.round(targets.fiber_g / eaters.length)
  };

  return h('section.card.block',
    h('h2.block__title', 'How the week looks'),
    h('p.muted.small', `Averages per serving across the ${entries.length} planned meals, against one person's whole-day target.`),
    h('div.meters',
      meter(Math.round(sodium / c), perPersonDay.sodium, { label: 'Sodium per meal vs a day', unit: ' mg' }),
      meter(Math.round(satfat / c), perPersonDay.satfat, { label: 'Saturated fat per meal vs a day', unit: ' g' }),
      meter(Math.round(fiber / c), perPersonDay.fiber, { label: 'Fiber per meal vs a day', unit: ' g' })
    ),
    h('p.muted.small', `Average meal: ${Math.round(kcal / c)} kcal a serving. Your table eats about ${equiv.total} servings a meal.`),
    h('p.fine-print', 'A meal landing near a third of the day target is roughly on pace. Breakfast and snacks fill the rest.')
  );
}

function suggestions(entries, state, draw, navigate) {
  const ids = entries.map(e => e.recipe.id);
  const near = sharesShoppingWith(ids).slice(0, 3);
  if (!near.length) return null;

  return h('section.card.block',
    h('h2.block__title', 'Cheap to add'),
    h('p.muted.small', 'These reuse what you are already buying, so they add almost nothing to the list.'),
    h('div.suggest-row',
      ...near.map(({ recipe, overlap }) =>
        h('div.suggest',
          h('div',
            h('strong', { role: 'button', tabindex: '0', onclick: () => navigate(`#/recipe/${recipe.id}`) }, recipe.title),
            h('p.muted.small', `${Math.round(overlap * 100)}% of the ingredients overlap`)
          ),
          h('button.btn', { type: 'button', onclick: () => { addToPlan(recipe.id, { course: recipe.course }); toast('Added'); draw(); } }, 'Add')
        )
      )
    )
  );
}

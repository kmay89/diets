/**
 * today.js (view) — the one screen you open at 5pm.
 *
 * Everything here answers "what is happening tonight, and what do I need to do
 * about it". It owns no data of its own: tonight's dinner comes from the plan,
 * the counts come from the shopping list, the trend comes from what has
 * actually been cooked. When there is no plan it says so and points at the
 * dice, rather than inventing a card to fill the space.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, minutes } from '../ui.js';
import { getDb, heartFor, gramsForLine } from '../data.js';
import { foodIcon, ingredientsNamedIn } from '../food-icon.js';
import { buildList } from '../shopping.js';
import { getState, DAYS } from '../store.js';
import { recentNutrition } from './progress.js';
import { worthRepeating, whenWords } from '../memory.js';
import { avoidedSet, recipeConflicts } from '../allergy.js';

export function render(root, { navigate }) {
  const draw = () => mount(root, view(draw, navigate));
  draw();
}

function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "Tuesday, 4 August" */
function longDate(now = new Date()) {
  return now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * How well an ingredient stands for a dish in a picture.
 *
 * Weight alone picks badly: the heaviest things in a lentil bolognese are a
 * tin of tomatoes and a carton of broth, so the card ends up illustrated with
 * packaging. Whole food outranks a tin at the same weight.
 */
const AISLE_PROMINENCE = {
  produce: 5, 'nuts-seeds': 4, 'meat-seafood': 4, 'dry-goods': 3,
  bakery: 2, 'dairy-eggs': 2, frozen: 2, 'canned-jarred': 1,
  international: 1, condiments: 0, baking: 0, beverages: 0
};

/**
 * The few ingredients that should illustrate a recipe.
 *
 * What the title names comes first — a dish called "Lentil Bolognese" is
 * about lentils however little they weigh — then whatever else is both
 * substantial and recognisable.
 */
export function heroIngredients(recipe, ingIndex, count = 3) {
  const lines = recipe.ingredients || [];
  const picked = ingredientsNamedIn(recipe.title, lines, ingIndex, count);
  const taken = new Set(picked.map(i => i.id));

  const rest = lines
    .map(line => ({ item: ingIndex.get(line.ing), grams: gramsForLine(line) || 0 }))
    .filter(x => x.item && !taken.has(x.item.id))
    .filter(x => AISLE_PROMINENCE[x.item.aisle] != null && AISLE_PROMINENCE[x.item.aisle] > 0)
    .sort((a, b) =>
      AISLE_PROMINENCE[b.item.aisle] - AISLE_PROMINENCE[a.item.aisle] || b.grams - a.grams)
    .map(x => x.item);

  return [...picked, ...rest].slice(0, count);
}

function view(draw, navigate) {
  const state = getState();
  const { recipeIndex, ingIndex } = getDb();
  const now = new Date();
  const todayName = DAYS[now.getDay()];

  const planned = state.plan
    .map(entry => ({ entry, recipe: recipeIndex.get(entry.recipeId) }))
    .filter(x => x.recipe);

  // Tonight is whatever is pinned to today; failing that, the first thing on
  // the plan, because an unpinned plan is still a plan.
  const tonight = planned.find(x => x.entry.day === todayName) || planned[0] || null;

  const eaters = state.household.members.filter(m => m.eats !== false);

  return h('section.view',
    h('div.view__head.today__head',
      h('div',
        h('p.eyebrow', longDate(now)),
        h('h1.view__title',
          `${greeting(now)},`,
          h('br'),
          h('em', state.household.label || 'everyone')
        )
      ),
      eaters.length ? h('div.today__eaters', ...eaters.slice(0, 4).map(m =>
        h('span.today__eater', { title: m.name }, (m.name || '?').trim().charAt(0).toUpperCase())
      )) : null
    ),

    tonight ? tonightCard(tonight, ingIndex, navigate) : noPlanCard(state, recipeIndex, navigate),

    // The on-ramps for a returning cook: three tiles, no more. The dice only
    // join the row once a plan exists — before that, the card above IS the
    // dice, and saying it twice on one screen is nagging.
    h('div.today__quick',
      tonight ? rollTile(state, navigate) : null,
      quickTile('🏠', 'Use up', 'what is already here', () => navigate('#/pantry')),
      shoppingTile(state, navigate)
    ),

    trendCard(state, navigate)
  );
}

function tonightCard({ entry, recipe }, ingIndex, navigate) {
  const heart = heartFor(recipe);
  const icons = heroIngredients(recipe, ingIndex);
  const oneLine = [
    minutes(recipe.totalMin),
    recipe.tags?.includes('one-pot') ? 'one pot' : null,
    recipe.tags?.includes('sheet-pan') ? 'one pan' : null
  ].filter(Boolean).join(' · ');

  return h('article.tonight',
    h('div.tonight__art', ...icons.map((item, i) =>
      h('span', { class: `tonight__art-item tonight__art-item--${i}` }, foodIcon(item, { size: 92 }))
    )),
    h('div.tonight__body',
      h('p.eyebrow.eyebrow--clay', `Tonight · ${oneLine}`),
      h('h2.tonight__title', recipe.title),
      h('div.tonight__row',
        h('button.btn.btn--primary.tonight__cta', {
          type: 'button',
          onclick: () => navigate(`#/cook/${recipe.id}`)
        }, 'Start cooking'),
        heart && heart.score != null
          ? h('div.tonight__score',
              h('span.tonight__score-num', heart.score),
              h('span.tonight__score-label', 'heart')
            )
          : null
      ),
      h('button.linkish', {
        type: 'button',
        onclick: () => navigate(`#/recipe/${recipe.id}`)
      }, 'Read the recipe first')
    )
  );
}

function noPlanCard(state, recipeIndex, navigate) {
  // The cheapest possible decision for a tired cook is "the thing that worked
  // last time, again" — so offer one by name. One tap, zero novelty, dinner
  // solved.
  //
  // Not literally the last thing cooked, though: that is usually last night,
  // and nobody wants last night twice. It is the most recent meal old enough to
  // want again, skipping anything the kitchen said no to — and skipping
  // anything that has since become an allergen in this house, because what got
  // cooked before a flag was set does not get recommended after it.
  const avoid = avoidedSet(state.prefs);
  const safe = (recipe) =>
    recipe && !(avoid.size && recipeConflicts(recipe, avoid, getDb().ingIndex).length);

  const repeat = worthRepeating(state, { limit: 8 })
      .find(e => safe(recipeIndex.get(e.id)))
    || state.history.find(e => safe(recipeIndex.get(e.id)));
  const again = repeat ? recipeIndex.get(repeat.id) : null;

  return h('article.card.tonight--empty',
    h('h2.block__title', 'Nothing planned for tonight'),
    h('p.muted.small', 'Roll a few dinners and pin one to a night, and this screen will have something to say.'),
    h('div.row-actions',
      h('button.btn.btn--primary', { type: 'button', onclick: () => navigate('#/roll') }, '🎲 Roll dinner'),
      h('button.btn', { type: 'button', onclick: () => navigate('#/create') }, 'Other ways in')
    ),
    again
      ? h('button.linkish', {
          type: 'button',
          onclick: () => navigate(`#/recipe/${again.id}`)
        }, `Or cook ${again.title} again — you made it ${whenWords(repeat.at)} →`)
      : null
  );
}

/**
 * The dice tile for a returning cook. The subtitle knows where the week
 * stands, so the tile is a status line and an invitation in one: either the
 * dice have already dealt some dinners and can deal more, or the whole week is
 * still theirs to roll.
 */
function rollTile(state, navigate) {
  const dinners = state.plan.filter(e => (e.course || 'dinner') === 'dinner').length;
  return quickTile('🎲', 'Roll',
    dinners ? `${dinners} dinner${dinners === 1 ? '' : 's'} banked — deal more` : 'let the dice pick dinner',
    () => navigate('#/roll'));
}

function quickTile(icon, strong, rest, onclick) {
  return h('button.quick-tile', { type: 'button', onclick },
    h('span.quick-tile__icon', icon),
    h('span.quick-tile__text', h('strong', strong), h('br'), rest)
  );
}

function shoppingTile(state, navigate) {
  let left = 0;
  try {
    const { items } = buildList(state);
    left = items.filter(i => !i.checked).length;
  } catch {
    left = 0;
  }
  return quickTile('🛒', 'Shop list',
    left ? `${left} item${left === 1 ? '' : 's'} left` : 'nothing left to get',
    () => navigate('#/list'));
}

function trendCard(state, navigate) {
  const trend = recentNutrition(state, 7);
  if (!trend.days.length) return null;

  return h('section.card.trend',
    h('div.trend__head',
      h('span.eyebrow', "This week's heart trend"),
      h('button.linkish', { type: 'button', onclick: () => navigate('#/progress') }, 'See all ›')
    ),
    h('div.trend__row', ...trend.metrics.map(m =>
      h('div.trend__metric',
        h('span.trend__value', m.display),
        h('span.trend__label', `${m.label} · ${m.unit}`),
        h('div.trend__bars', ...m.bars.map(pct =>
          h('span.trend__bar', { style: { height: `${Math.max(4, pct)}%` } })
        ))
      )
    ))
  );
}

/**
 * plate.js (view) — build a plate in four quarters.
 *
 * The other front doors start from a recipe. This one starts from the shape of
 * a good dinner — a whole grain, a vegetable, a protein and something that
 * finishes it — and lets you watch the numbers move as you fill the quarters.
 * It is the only screen in the app that teaches composition rather than
 * delivering a dish.
 *
 * It deliberately does not invent a recipe. A plate assembled here is a
 * *brief*: once there is enough on it, the screen finds the dinners in the
 * collection that already cook this combination, because a real recipe with
 * real steps beats a pile of ingredients and a wish. Nothing is written to the
 * plan until you pick one of those.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, num } from '../ui.js';
import { getDb, heartFor, recipesUsing } from '../data.js';
import { foodIcon } from '../food-icon.js';
import { play } from '../feedback.js';
import { getState } from '../store.js';
import { lineNutrients, heartScore, dailyTargets, typicalBody, dailyValue, MEAL_SHARE } from '../nutrition.js';
import { avoidedSet, blocksItem, recipeConflicts } from '../allergy.js';

function isProtein(item) {
  return (item.tags || []).some(t => t === 'protein' || t === 'lean-protein' || t === 'complete-protein')
    || item.aisle === 'meat-seafood';
}

function isFinisher(item) {
  return item.aisle === 'nuts-seeds' || item.aisle === 'condiments' || item.aisle === 'oils-vinegars'
    || (item.tags || []).some(t => t === 'finisher' || t === 'finishing' || t === 'garnish');
}

/**
 * Sweet fruit shares the produce aisle with vegetables and nothing in the data
 * separates them — there is no "fruit" flag to read, and the tags that come
 * closest ("snack", "breakfast") are about when it gets eaten. Listing them is
 * a curation decision, so it is written down as one rather than inferred from
 * a tag that does not mean what it would need to mean.
 */
const SWEET_FRUIT = new Set([
  'ing.orange', 'ing.apple', 'ing.pear', 'ing.banana', 'ing.blueberries',
  'ing.strawberries', 'ing.grapes', 'ing.cranberries.fresh', 'ing.watermelon',
  'ing.grapefruit', 'ing.peach'
]);

/**
 * The four quarters, the portion each contributes to one serving, and how to
 * recognize the ingredients that belong in it. Grams are a plated serving:
 * grain is dry weight, the rest as they land on the plate.
 */
const SLOTS = [
  {
    id: 'grain',
    label: 'Whole grain',
    grams: 75,
    tint: 'gold',
    // Lentils and dried beans share the dry-goods aisle with rice and farro,
    // so the aisle alone would file a bag of lentils under "grain". They are
    // the protein quarter's business, and a plate wants one of each.
    fits: (i) => (i.aisle === 'dry-goods' || i.aisle === 'bakery') && !isProtein(i)
  },
  {
    id: 'veg',
    label: 'Vegetables',
    grams: 150,
    tint: 'green',
    // A lemon belongs in Finish, not here, or it turns up in both.
    fits: (i) => i.aisle === 'produce' && !SWEET_FRUIT.has(i.id) && !isFinisher(i)
  },
  {
    id: 'protein',
    label: 'Protein',
    grams: 110,
    tint: 'clay',
    fits: isProtein
  },
  {
    id: 'finish',
    label: 'Finish',
    grams: 20,
    tint: 'red',
    fits: isFinisher
  }
];

/** Shown in an empty quarter, grayed back — the shape of what goes there. */
const SLOT_GHOST = {
  grain: 'ing.farro',
  veg: 'ing.broccoli',
  protein: 'ing.beans.cannellini',
  finish: 'ing.walnuts'
};

const SHELF_LIMIT = 16;

export function render(root, { navigate }) {
  // The plate is a scratchpad, not saved state: it should be empty the next
  // time you open it, the way a chopping board is.
  const picks = { grain: null, veg: null, protein: null, finish: null };
  let openSlot = 'veg';

  const draw = () => mount(root, view());

  function view() {
    const state = getState();
    const { ingIndex } = getDb();
    const chosen = SLOTS.map(s => ({ slot: s, item: picks[s.id] ? ingIndex.get(picks[s.id]) : null }));
    const filled = chosen.filter(c => c.item);

    const nut = plateNutrition(filled);
    const heart = filled.length ? heartScore(nut, { course: 'dinner' }) : null;

    const select = (slotId, ingredientId) => {
      picks[slotId] = picks[slotId] === ingredientId ? null : ingredientId;
      openSlot = slotId;
      play('tap');
      draw();
    };

    return h('section.view',
      h('div.view__head',
        h('div',
          h('p.eyebrow', 'Create'),
          h('h1.view__title', 'Build a ', h('em', 'plate'))
        ),
        h('button.btn.btn--small', { type: 'button', onclick: () => navigate('#/create') }, 'Other ways in')
      ),

      plateDial(chosen, heart, (slotId) => { openSlot = slotId; draw(); }, openSlot),

      h('div.plate__legend', ...chosen.map(({ slot, item }) =>
        h('button', {
          type: 'button',
          class: `plate__legend-row ${openSlot === slot.id ? 'is-open' : ''}`,
          onclick: () => { openSlot = slot.id; draw(); }
        },
          h('span', { class: `plate__dot plate__dot--${slot.tint} ${item ? 'is-on' : ''}` }),
          h('span.plate__legend-text',
            h('span.plate__slot', slot.label),
            h('span', { class: `plate__pick ${item ? '' : 'is-empty'}` }, item ? item.name : 'tap to add')
          )
        )
      )),

      shelf(openSlot, picks, state, select),

      filled.length ? nutritionStrip(nut, state) : null,
      conflictNote(filled, state),
      matches(filled, state, navigate),

      h('p.fine-print', 'Portions are one plated serving — 75 g of dry grain, 150 g of vegetables, 110 g of protein, 20 g to finish. The score uses the same heuristic as every recipe in the app, so the two are comparable.')
    );
  }

  draw();
}

/* ------------------------------------------------------------------ *
 * The dial
 * ------------------------------------------------------------------ */

function plateDial(chosen, heart, onSlot, openSlot) {
  const { ingIndex } = getDb();

  return h('div.plate',
    h('div.plate__disc',
      ...chosen.map(({ slot, item }, i) => {
        const ghost = ingIndex.get(SLOT_GHOST[slot.id]);
        return h('button', {
          type: 'button',
          class: `plate__quarter plate__quarter--${i} plate__quarter--${slot.tint} ${item ? 'is-filled' : ''} ${openSlot === slot.id ? 'is-open' : ''}`,
          'aria-label': item ? `${slot.label}: ${item.name}` : `${slot.label}: empty`,
          onclick: () => onSlot(slot.id)
        },
          h('span.plate__quarter-inner',
            item
              ? foodIcon(item, { size: 52 })
              : h('span.plate__ghost', ghost ? foodIcon(ghost, { size: 30 }) : null),
            item ? null : h('span.plate__plus', '+')
          )
        );
      }),
      h('div.plate__hub',
        heart
          ? h('span.plate__hub-num', heart.score)
          : h('span.plate__hub-num.is-empty', '—'),
        h('span.plate__hub-label', 'heart score')
      )
    )
  );
}

/* ------------------------------------------------------------------ *
 * The shelf of things you can put in the open quarter
 * ------------------------------------------------------------------ */

function shelf(openSlot, picks, state, select) {
  const slot = SLOTS.find(s => s.id === openSlot);
  const { ingredients } = getDb();
  const avoid = avoidedSet(state.prefs);
  const eaters = state.household.members.filter(m => m.eats !== false);

  const candidates = ingredients
    .filter(slot.fits)
    // Anything marked "never" is gone, and an allergen in the house is gone —
    // the jars that only commonly carry one included.
    .filter(i => state.likes[i.id] !== -1)
    .filter(i => !blocksItem(i, avoid))
    .map(i => ({ item: i, rank: shelfRank(i, state, eaters) }))
    .sort((a, b) => b.rank - a.rank || a.item.name.localeCompare(b.item.name))
    .slice(0, SHELF_LIMIT);

  return h('section.shelf',
    h('div.shelf__head',
      h('span.eyebrow', `${slot.label} · ${candidates.length} to choose from`),
      picks[slot.id]
        ? h('button.linkish', { type: 'button', onclick: () => select(slot.id, picks[slot.id]) }, 'Clear')
        : null
    ),
    h('div.shelf__rail', ...candidates.map(({ item }) => {
      const on = picks[slot.id] === item.id;
      return h('button', {
        type: 'button',
        class: `shelf__tile ${on ? 'is-on' : ''}`,
        onclick: () => select(slot.id, item.id)
      },
        h('span.shelf__art', foodIcon(item, { size: 44 })),
        h('span.shelf__name', item.name)
      );
    }))
  );
}

/** Loved things first, then heart-forward things, then what is in the house. */
function shelfRank(item, state, eaters) {
  let r = 0;
  const tags = item.tags || [];
  if (state.likes[item.id] === 1) r += 6;
  if (tags.includes('heart-star')) r += 4;
  if (tags.includes('fiber')) r += 2;
  if (state.pantry[item.id]) r += 3;
  if (tags.includes('high-sodium')) r -= 3;
  if (tags.includes('high-satfat')) r -= 2;
  // Something nobody at the table can eat is a poor thing to lead with.
  if (eaters.length && eaters.every(m => !ingredientSuits(item, m.diet))) r -= 8;
  return r;
}

function ingredientSuits(item, diet) {
  if (!diet || diet === 'omnivore') return true;
  const d = item.diet || [];
  if (diet === 'vegan') return d.includes('vegan');
  if (diet === 'vegetarian') return d.includes('vegetarian') || d.includes('vegan');
  if (diet === 'pescatarian') return d.includes('vegetarian') || d.includes('vegan') || d.includes('pescatarian');
  if (diet === 'gluten-free') return d.includes('gluten-free');
  return true;
}

/* ------------------------------------------------------------------ *
 * Numbers
 * ------------------------------------------------------------------ */

/** One plate is one serving, so the line totals are the per-serving figures. */
function plateNutrition(filled) {
  const { ingIndex } = getDb();
  const lines = filled.map(({ slot, item }) => ({ ing: item.id, qty: slot.grams, unit: 'g' }));
  return lineNutrients(lines, ingIndex).total;
}

/**
 * The same reading the recipe page gives, on a plate you are still building.
 *
 * These bars used to carry a fixed tint each — fiber always green, sodium
 * always gold, saturated fat always clay — which made the color decoration
 * rather than information: a plate of nothing but salt looked exactly like a
 * plate of nothing but lentils. Worse, the recipe screen next door was busy
 * deriving an actual verdict from `dailyValue()`, so the two screens could
 * describe the same sodium in two different tones.
 *
 * One source of thresholds now. A plate is one dinner, so the day-share it is
 * measured against is dinner's, exactly as on the recipe page.
 */
function nutritionStrip(nut, state) {
  const eaters = state.household.members.filter(m => m.eats !== false);
  const ref = eaters[0] || typicalBody();
  const targets = dailyTargets(ref, { heartMode: state.prefs.heartMode });
  const pace = Math.round(MEAL_SHARE.dinner * 100);

  const rows = [
    { key: 'fiber_g', label: 'Fiber', value: nut.fiber_g, unit: 'g' },
    { key: 'sodium_mg', label: 'Sodium', value: nut.sodium_mg, unit: 'mg' },
    { key: 'satfat_g', label: 'Sat fat', value: nut.satfat_g, unit: 'g' }
  ];

  return h('div.plate__nutri', ...rows.map(r => {
    const dv = dailyValue(r.key, r.value, targets[r.key], { pace });
    const pct = Math.min(100, dv.pct ?? 0);
    return h('div', { class: `plate__nutri-cell nut-row--${dv.tone}` },
      h('div.plate__nutri-top',
        h('span.eyebrow', r.label),
        h('span.plate__nutri-val', `${num(r.value, r.unit === 'g' ? 1 : 0)}${r.unit}`)
      ),
      h('div.plate__nutri-track',
        h('div.plate__nutri-fill', { style: { width: `${pct}%` } })
      ),
      // The word, not just the color — same rule as the recipe page.
      h('span.plate__nutri-band', dv.note)
    );
  }));
}

/* ------------------------------------------------------------------ *
 * Who at this table cannot eat this
 * ------------------------------------------------------------------ */

function conflictNote(filled, state) {
  if (!filled.length) return null;
  const eaters = state.household.members.filter(m => m.eats !== false);
  if (!eaters.length) return null;

  const trouble = [];
  for (const m of eaters) {
    const blocked = filled.filter(({ item }) => !ingredientSuits(item, m.diet));
    if (blocked.length) {
      trouble.push(`${m.name || 'Someone'} (${m.diet}) — ${blocked.map(b => b.item.name.toLowerCase()).join(', ')}`);
    }
  }
  if (!trouble.length) return null;

  return h('div.plate__conflict',
    h('span.plate__conflict-dot'),
    h('div',
      h('p.plate__conflict-text', 'This plate does not work for everyone as it stands:'),
      h('ul.tight', ...trouble.map(t => h('li', t))),
      h('p.muted.small', 'Swap the quarter, or keep it and fork that one ingredient at the table.')
    )
  );
}

/* ------------------------------------------------------------------ *
 * Real recipes that already cook this
 * ------------------------------------------------------------------ */

function matches(filled, state, navigate) {
  if (filled.length < 2) {
    return h('p.muted.small', 'Fill two quarters and the dinners that already cook this combination will show up here.');
  }

  const wanted = filled.map(f => f.item.id);
  const avoid = avoidedSet(state.prefs);
  const { ingIndex } = getDb();
  const counts = new Map();
  for (const id of wanted) {
    for (const recipe of recipesUsing(id)) {
      if (recipe.course !== 'dinner') continue;
      // These are recommendations, and the rule for recommendations holds.
      if (avoid.size && recipeConflicts(recipe, avoid, ingIndex).length) continue;
      counts.set(recipe, (counts.get(recipe) || 0) + 1);
    }
  }

  const ranked = [...counts.entries()]
    .map(([recipe, hits]) => ({ recipe, hits, heart: heartFor(recipe) }))
    .sort((a, b) => b.hits - a.hits || (b.heart?.score || 0) - (a.heart?.score || 0))
    .slice(0, 3);

  if (!ranked.length) {
    return h('p.muted.small', 'Nothing in the collection cooks this exact combination yet — which does not make it a bad plate, only an unwritten one.');
  }

  return h('section.plate__matches',
    h('h2.block__title', `Dinners that cook this`),
    ...ranked.map(({ recipe, hits, heart }) =>
      h('button.match', { type: 'button', onclick: () => navigate(`#/recipe/${recipe.id}`) },
        h('span.match__text',
          h('span.match__title', recipe.title),
          h('span.match__meta', `${hits} of your ${filled.length} quarter${filled.length === 1 ? '' : 's'} · ${recipe.totalMin} min`)
        ),
        heart?.score != null ? h('span.match__score', heart.score) : null
      )
    )
  );
}

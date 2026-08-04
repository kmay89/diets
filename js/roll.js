/**
 * roll.js — the dice. Weighted, seeded, constraint-aware meal selection.
 *
 * "Roll" is deliberately random, but not uniformly random: every candidate gets
 * a score from the household's preferences, the pantry, the season, the clock
 * and the shopping overlap with what has already been rolled, and then a
 * Gumbel-noise sample picks from that distribution. Same seed, same roll —
 * which is what makes "re-roll just this one" work without shuffling the rest.
 *
 * ERRERLabs — MIT licensed.
 */

import { getDb, pantryCoverage, inSeason, seasonNow, allergensOf, heartFor, sharesShoppingWith } from './data.js';
import { cookedRank } from './memory.js';

/* ---------- seeded randomness ---------- */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/** Gumbel noise turns scores into a weighted sample without replacement. */
function gumbel(rand) {
  const u = Math.max(rand(), 1e-9);
  return -Math.log(-Math.log(u));
}

/* ---------- household constraints ---------- */

/**
 * Can this recipe feed everyone at the table, using the base dish plus its
 * built-in swaps? A vegetarian cook needs either a vegetarian base or an
 * explicit vegetarian swap; omnivores are happy either way.
 */
export function canServeHousehold(recipe, members) {
  const eaters = members.filter(m => m.eats !== false);
  if (!eaters.length) return true;
  return eaters.every(m => {
    const d = m.diet || 'omnivore';
    if (d === 'omnivore') return true;
    const base = recipe.diet || [];
    if (d === 'vegan') return base.includes('vegan') || !!recipe.vegetarianSwap;
    if (d === 'vegetarian') return base.includes('vegetarian') || base.includes('vegan') || !!recipe.vegetarianSwap;
    if (d === 'pescatarian') return true;
    if (d === 'gluten-free') return true; // handled through allergen filtering
    return true;
  });
}

/** Hard filters. Anything failing these never appears in a roll. */
export function isCandidate(recipe, state, { course = 'dinner' } = {}) {
  if (course !== 'any' && recipe.course !== course) return false;
  if (recipe.course === 'component') return false;

  const { prefs, likes, household } = state;

  if (!canServeHousehold(recipe, household.members)) return false;

  // A "never" ingredient is a hard no unless it is optional in this recipe.
  for (const line of recipe.ingredients) {
    if (likes[line.ing] === -1 && !line.optional) return false;
  }

  if (prefs.avoidAllergens?.length) {
    const present = allergensOf(recipe);
    if (present.some(a => prefs.avoidAllergens.includes(a))) return false;
  }

  if (prefs.kidFriendlyOnly && !recipe.kidFriendly) return false;

  if (state.recipeLikes[recipe.id] === -1) return false;

  return true;
}

/* ---------- scoring ---------- */

export function scoreRecipe(recipe, state, ctx = {}) {
  const { prefs, likes, pantry, recipeLikes, household } = state;
  const chosen = ctx.chosen || [];
  const season = ctx.season || seasonNow();
  const parts = {};

  // Heart-forward weighting, stronger when heart mode is on.
  //
  // Treat night suspends it. Not inverts — a lower score never becomes a
  // reason to pick something. It stops being a reason not to, and the recipes
  // built to be craved get pulled to the front instead. The grade and its
  // caveats still show on every card either way; nothing here hides a number.
  const heart = heartFor(recipe);
  const treat = !!prefs.treatNight;
  if (heart.score != null && !treat) {
    parts.heart = ((heart.score - 60) / 40) * (prefs.heartMode ? 22 : 8);
  } else {
    parts.heart = 0;
  }
  parts.crave = treat && recipe.tags?.includes('crave') ? 26 : 0;

  // Loved ingredients.
  let loved = 0;
  for (const line of recipe.ingredients) if (likes[line.ing] === 1) loved++;
  parts.loved = Math.min(loved, 5) * 5;

  // Explicit recipe favorite.
  parts.favorite = recipeLikes[recipe.id] === 1 ? 25 : 0;

  // Time budget: a soft cliff, not a hard filter — 5 minutes over is not a no.
  const over = recipe.activeMin - (prefs.maxActiveMin || 30);
  parts.time = over > 0 ? -Math.min(over * 1.4, 28) : Math.min(-over * 0.25, 6);

  // Season.
  parts.season = prefs.seasonAware ? (inSeason(recipe, season) ? 10 : -12) : 0;

  // Use what is already in the house.
  if (prefs.preferPantry) {
    const cov = pantryCoverage(recipe, pantry);
    parts.pantry = cov.ratio * 22;
  } else {
    parts.pantry = 0;
  }

  // Do not repeat what was cooked recently.
  //
  // This asked `history.indexOf(recipe.id)` for a long time after history
  // stopped being a list of ids and became a list of entries, so it answered -1
  // for everything and every dish scored as though it had never been made. The
  // roll was happily dealing Tuesday's dinner again on Thursday, and the bug was
  // invisible because the wrong answer is a plausible one.
  const recent = cookedRank(recipe.id, state);
  parts.recency = recent === -1 ? 4 : -Math.max(30 - recent * 3, 4);

  // Kids at the table.
  const hasKids = household.members.some(m => (m.age ?? 40) < 14 && m.eats !== false);
  parts.kids = hasKids && recipe.kidFriendly ? 8 : 0;

  // Variety within this roll.
  let variety = 0;
  for (const other of chosen) {
    if (other.id === recipe.id) variety -= 500;
    if (other.cuisine === recipe.cuisine) variety -= 14;
    if (other.course === recipe.course && other.tags?.some(t => recipe.tags?.includes(t) && MAJOR_TAGS.has(t))) variety -= 6;
    const overlapProtein = PROTEIN_KEYS.find(k => usesProtein(other, k) && usesProtein(recipe, k));
    if (overlapProtein) variety -= 10;
  }
  parts.variety = variety;

  // Shopping efficiency: reward recipes that reuse this week's ingredients.
  parts.shopping = 0;
  if (chosen.length) {
    const near = sharesShoppingWith(chosen.map(r => r.id));
    const match = near.find(n => n.recipe.id === recipe.id);
    if (match) parts.shopping = match.overlap * 18;
  }

  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { total, parts, heart };
}

const MAJOR_TAGS = new Set(['sheet-pan', 'one-pot', 'soup', 'taco-night', 'pasta', 'comfort']);
const PROTEIN_KEYS = ['ing.tofu.firm', 'ing.lentil.brown', 'ing.lentil.red', 'ing.chickpeas.canned', 'ing.beans.black', 'ing.beans.cannellini', 'ing.egg', 'ing.tempeh'];

function usesProtein(recipe, id) {
  return recipe.ingredients.some(l => l.ing === id);
}

/* ---------- the roll ---------- */

/**
 * Roll `count` meals.
 * options: { seed, course, exclude:[recipeId], keep:[recipe], temperature }
 */
export function roll(state, count = 4, options = {}) {
  const { recipes } = getDb();
  const seed = options.seed ?? newSeed();
  const rand = mulberry32(seed);
  const course = options.course || 'dinner';
  const temperature = options.temperature ?? 9;
  const exclude = new Set(options.exclude || []);
  const chosen = [...(options.keep || [])];

  const pool = recipes.filter(r => isCandidate(r, state, { course }) && !exclude.has(r.id) && !chosen.some(c => c.id === r.id));

  const picks = [];
  while (picks.length < count) {
    const remaining = pool.filter(r => !chosen.some(c => c.id === r.id));
    if (!remaining.length) break;

    let best = null;
    let bestKey = -Infinity;
    for (const r of remaining) {
      const { total } = scoreRecipe(r, state, { chosen });
      const key = total / temperature + gumbel(rand);
      if (key > bestKey) { bestKey = key; best = r; }
    }
    if (!best) break;
    chosen.push(best);
    picks.push(best);
  }

  return { seed, picks, all: chosen, exhausted: picks.length < count };
}

/** Re-roll a single slot, holding everything else steady. */
export function rerollOne(state, keepRecipes, { course = 'dinner', exclude = [], seed } = {}) {
  const result = roll(state, 1, { seed: seed ?? newSeed(), course, keep: keepRecipes, exclude });
  return result.picks[0] || null;
}

/**
 * A week: dinners first, then optionally breakfasts and lunches that reuse
 * the same ingredients where possible.
 */
export function rollWeek(state, { dinners = 4, breakfasts = 0, lunches = 0, seed } = {}) {
  const s = seed ?? newSeed();
  const out = [];
  const dinnerRoll = roll(state, dinners, { seed: s, course: 'dinner' });
  out.push(...dinnerRoll.picks.map(r => ({ recipe: r, course: 'dinner' })));

  if (breakfasts) {
    const b = roll(state, breakfasts, { seed: s + 1, course: 'breakfast', keep: dinnerRoll.all });
    out.push(...b.picks.map(r => ({ recipe: r, course: 'breakfast' })));
  }
  if (lunches) {
    const l = roll(state, lunches, { seed: s + 2, course: 'lunch', keep: dinnerRoll.all });
    out.push(...l.picks.map(r => ({ recipe: r, course: 'lunch' })));
  }
  return { seed: s, entries: out };
}

/** Human-readable explanation of why a recipe came up. */
export function explainPick(recipe, state, chosen = []) {
  const { parts, heart } = scoreRecipe(recipe, state, { chosen });
  const reasons = [];
  if (parts.pantry > 8) reasons.push('uses a lot of what you already have');
  if (parts.loved > 0) reasons.push('has ingredients you marked as favorites');
  if (parts.season > 0) reasons.push(`in season right now`);
  if (heart.score != null && heart.score >= 80) reasons.push('scores well on the heart-forward measures');
  if (parts.time > 0) reasons.push(`under your ${state.prefs.maxActiveMin} minute active-time budget`);
  if (parts.shopping > 4) reasons.push('shares ingredients with the rest of this week');
  if (parts.kids > 0) reasons.push('one the kids will eat');
  if (parts.favorite > 0) reasons.push('you starred it');
  return reasons;
}

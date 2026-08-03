/**
 * swaps.js — using something else, and having the app mean it.
 *
 * A substitution is only useful if it comes with an amount. "Use tahini
 * instead" is a fact; "use 2 tbsp tahini instead of 2 tbsp peanut butter" is a
 * decision you can act on, and a decision the shopping list has to follow.
 *
 * So a swap here is not a note. It rewrites the ingredient line: the recipe
 * page, the nutrition panel, the heart score and the shopping list all read the
 * substitute and its converted amount, not the original.
 *
 * Conversion runs through grams, because grams are the one unit every
 * ingredient in the database has. The ratio comes from the substitution itself
 * and defaults to 1 — right for most pairs, and badly wrong for a few, which is
 * why the pairs that are not one-for-one carry an explicit ratio in the data.
 *
 * ERRERLabs — MIT licensed.
 */

import { getDb } from './data.js';
import { gramsFor } from './nutrition.js';

/**
 * The substitutions for an ingredient, normalised.
 *
 * The data allows a bare id for the common one-for-one case and an object when
 * there is a ratio or a caveat to carry. Callers should not have to know which.
 */
export function substitutionsFor(ingredientId, { diet = [] } = {}) {
  const { ingIndex } = getDb();
  const from = ingIndex.get(ingredientId);
  return (from?.subs || []).map(s => {
    const id = typeof s === 'string' ? s : s.id;
    const item = ingIndex.get(id);
    if (!item) return null;
    return { item, ratio: (typeof s === 'object' && s.ratio) || 1, note: (typeof s === 'object' && s.note) || null };
  }).filter(Boolean).filter(s => fits(s.item, diet));
}

/**
 * Would this substitute still let the recipe make the claim on its label?
 *
 * A vegan recipe that offers honey for maple syrup is not offering a swap, it
 * is offering to make the recipe's own badge wrong. The data already stops a
 * meat-free ingredient carrying a meat substitute; this is the same check one
 * level stricter, applied per recipe rather than per ingredient.
 */
function fits(item, diet) {
  const d = item.diet || [];
  if (diet.includes('vegan')) return d.includes('vegan');
  if (diet.includes('vegetarian')) return !d.includes('omnivore') && !d.includes('pescatarian');
  return true;
}

/**
 * The unit an amount of this ingredient is most naturally written in.
 *
 * Picking the wrong one is how you get "0.02 cups" or "340 g" where a cook
 * wanted "2 tbsp" and "3 cloves". Prefer whatever puts the number in the range
 * a recipe would actually print, and fall back to grams when nothing does.
 */
export function naturalUnit(item, grams) {
  let best = null;
  for (const [unit, per] of Object.entries(item.units || {})) {
    if (unit === 'g' || !(per > 0)) continue;
    const qty = grams / per;
    // Closeness to a quantity of about 2 — well inside what a recipe writes —
    // with anything outside a quarter to twelve pushed firmly to the back.
    const inRange = qty >= 0.2 && qty <= 12;
    const score = (inRange ? 0 : 100) + Math.abs(Math.log(qty / 2));
    if (!best || score < best.score) best = { unit, qty, score };
  }
  if (!best) return { qty: Math.max(1, Math.round(grams)), unit: 'g' };
  return { qty: best.qty, unit: best.unit };
}

/**
 * What one ingredient line becomes when swapped. Returns null when the original
 * has no gram weight for its unit, which would make any conversion a guess.
 */
export function swappedLine(line, subId) {
  const { ingIndex } = getDb();
  const from = ingIndex.get(line.ing);
  const sub = substitutionsFor(line.ing).find(s => s.item.id === subId);
  if (!from || !sub) return null;

  const grams = gramsFor(from, line.qty, line.unit);
  if (grams == null) return null;

  const target = grams * sub.ratio;
  // A one-for-one swap that shares the unit keeps it, so "2 tbsp" stays
  // "2 tbsp" rather than being re-derived into something equivalent but odd.
  const keepsUnit = sub.ratio === 1 && sub.item.units?.[line.unit] === from.units?.[line.unit];
  const amount = keepsUnit ? { qty: line.qty, unit: line.unit } : naturalUnit(sub.item, target);

  return {
    ...line,
    ing: sub.item.id,
    qty: amount.qty,
    unit: amount.unit,
    swappedFrom: line.ing,
    note: sub.note
  };
}

/**
 * A recipe with the household's swaps applied.
 *
 * Returns the original object when there is nothing to apply, so identity
 * checks and caches upstream keep working and nothing re-renders for free.
 */
export function withSwaps(recipe, swaps = {}) {
  const chosen = swaps?.[recipe.id];
  if (!chosen || !Object.keys(chosen).length) return recipe;

  let touched = false;
  const ingredients = recipe.ingredients.map(line => {
    const subId = chosen[line.ing];
    if (!subId) return line;
    const next = swappedLine(line, subId);
    if (!next) return line;
    touched = true;
    return next;
  });

  return touched ? { ...recipe, ingredients } : recipe;
}

/** How many lines of this recipe the household has swapped. */
export function swapCount(recipe, swaps = {}) {
  const chosen = swaps?.[recipe.id] || {};
  return recipe.ingredients.filter(l => chosen[l.ing]).length;
}

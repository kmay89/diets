/**
 * allergy.js — the one place that knows what "allergic to X" means.
 *
 * The rule every surface follows: nothing the app *recommends* may contain a
 * flagged allergen. A rolled dinner, a substitute on the ladder, a flavor fix,
 * a protein for the fork in the road, a plate suggestion — if it carries the
 * tag, it is not offered, full stop. Browsing is different: the collection is
 * a cookbook, and tearing pages out of a cookbook helps nobody, so a recipe
 * opened by hand says loudly that it conflicts instead of disappearing.
 *
 * Two levels of certainty, because jars lie by omission:
 *
 *   allergens     — the ingredient IS the allergen, or unambiguously contains
 *                   it. Cheese is dairy. Shrimp is shellfish.
 *   allergensMay  — the jar on the shelf commonly contains it even though the
 *                   name does not say so: Thai curry paste and shrimp paste,
 *                   chili crisp and peanuts, gochujang and wheat. Blocked just
 *                   the same — for an allergy, "commonly" is "yes" — but the
 *                   interface says "often contains, check the jar" rather than
 *                   claiming certainty it does not have.
 *
 * Honest limits, stated here once and repeated where people read: this engine
 * reads the app's own ingredient lists. It cannot see cross-contact in a
 * kitchen or a factory, a "may contain" line on a package, or what an
 * unlisted brand puts in a sauce. "Gluten" here means no ingredient that
 * contains gluten — which is not the same thing as certified safe for celiac
 * disease. For a severe allergy, the label on the package outranks anything
 * this app says, every time.
 *
 * Pure on purpose: nothing here touches the DOM, fetch or the store, so every
 * promise above is checked against the real data by test/allergy.test.mjs.
 *
 * ERRERLabs — MIT licensed.
 */

/** The allergens the app understands — the major ones it can actually track. */
export const ALLERGENS = [
  { id: 'dairy', label: 'dairy' },
  { id: 'egg', label: 'egg' },
  { id: 'gluten', label: 'gluten' },
  { id: 'soy', label: 'soy' },
  { id: 'peanut', label: 'peanut' },
  { id: 'tree-nut', label: 'tree nut' },
  { id: 'sesame', label: 'sesame' },
  { id: 'fish', label: 'fish' },
  { id: 'shellfish', label: 'shellfish' }
];

export const allergenLabel = (id) =>
  ALLERGENS.find(a => a.id === id)?.label || String(id).replace('-', ' ');

/** The flagged allergens as a Set, from wherever prefs live. */
export function avoidedSet(prefs) {
  return new Set(prefs?.avoidAllergens || []);
}

/**
 * How one ingredient conflicts with the flagged list.
 * @returns [{ allergen, certain }] — empty when it is fine.
 */
export function itemConflicts(item, avoid) {
  if (!item || !avoid?.size) return [];
  const out = [];
  for (const a of item.allergens || []) {
    if (avoid.has(a)) out.push({ allergen: a, certain: true });
  }
  for (const a of item.allergensMay || []) {
    if (avoid.has(a) && !out.some(c => c.allergen === a)) out.push({ allergen: a, certain: false });
  }
  return out;
}

/** Does this ingredient carry anything flagged? The yes/no most callers want. */
export const blocksItem = (item, avoid) => itemConflicts(item, avoid).length > 0;

/**
 * Conflicts across a list of ingredient lines, deduplicated by allergen.
 * A certain hit outranks a "commonly contains" hit for the same allergen.
 */
export function linesConflicts(lines, avoid, ingIndex) {
  if (!avoid?.size) return [];
  const by = new Map();
  for (const line of lines || []) {
    for (const c of itemConflicts(ingIndex.get(line.ing), avoid)) {
      const prev = by.get(c.allergen);
      if (!prev || (c.certain && !prev.certain)) by.set(c.allergen, c);
    }
  }
  return [...by.values()];
}

/**
 * Conflicts in the recipe as rolled — the base everyone eats. The forks are
 * judged separately, because a clean base with a shrimp add-on is a dinner the
 * house can still cook; the add-on just must not be offered.
 */
export function recipeConflicts(recipe, avoid, ingIndex) {
  return linesConflicts(recipe?.ingredients, avoid, ingIndex);
}

/** Conflicts in one fork (recipe.omnivore or recipe.vegetarianSwap). */
export function forkConflicts(fork, avoid, ingIndex) {
  return linesConflicts(fork?.add, avoid, ingIndex);
}

/** Conflicts in a make-it-yourself combo's component list. */
export function comboConflicts(combo, avoid, ingIndex) {
  return linesConflicts(combo?.from, avoid, ingIndex);
}

/**
 * The sentence for a conflict list: "contains dairy" or "often contains
 * shellfish — check the jar", joined when there are several.
 */
export function conflictPhrase(conflicts) {
  if (!conflicts?.length) return '';
  const certain = conflicts.filter(c => c.certain).map(c => allergenLabel(c.allergen));
  const maybe = conflicts.filter(c => !c.certain).map(c => allergenLabel(c.allergen));
  const parts = [];
  if (certain.length) parts.push(`contains ${certain.join(' and ')}`);
  if (maybe.length) parts.push(`often contains ${maybe.join(' and ')} — check the jar`);
  return parts.join('; ');
}

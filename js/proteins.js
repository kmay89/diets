/**
 * proteins.js — which protein, and what to do to it.
 *
 * These are two different decisions and a recipe usually conflates them. "Firm
 * tofu, cubed and seared" is one line in an ingredient list, but a cook with no
 * tofu and forty minutes is holding two separate questions: what else works
 * here, and what should I do to it given the time I have.
 *
 * The first question is answered by weight. Cooks substitute a pound of chicken
 * with a pound of tofu, not with the weight that matches its protein content,
 * so the ratios here are by mass against a meat baseline of one. That is what a
 * recipe means when it says "or use tofu".
 *
 * The second question is where the actual cooking lives. The same block of tofu
 * seared, roasted, crumbled or simmered is four different dinners, and nothing
 * in an ingredient list says so. Each method here carries what it does, why it
 * works, how to tell it is done, and the way it goes wrong — because the
 * failure mode is the part a recipe never prints and the part that decides
 * whether somebody cooks it again.
 *
 * ERRERLabs — MIT licensed.
 */

import { gramsFor } from './nutrition.js';
import { naturalUnit } from './swaps.js';
import { blocksItem } from './allergy.js';

let model = null;

export async function loadProteins(path = 'data/proteins.json') {
  if (model) return model;
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  model = await res.json();
  return model;
}

export function getProteinModel() { return model; }
export function allProteins(m = model) { return m?.proteins || []; }
export function allMethods(m = model) { return m?.methods || []; }
export function prepSteps(m = model) { return m?.before || []; }

export const proteinById = (id, m = model) => (m?.proteins || []).find(p => p.id === id) || null;
export const methodById = (id, m = model) => (m?.methods || []).find(x => x.id === id) || null;
export const proteinForIngredient = (ingId, m = model) => (m?.proteins || []).find(p => p.ing === ingId) || null;

/**
 * The protein lines in a recipe, base and forks alike.
 *
 * A dish can have more than one — a chickpea curry with a fork in the road for
 * chicken has both, and both are swappable independently.
 */
export function proteinsIn(recipe, m = model) {
  const found = [];
  const scan = (lines, from) => {
    for (const line of lines || []) {
      const protein = proteinForIngredient(line.ing, m);
      if (protein) found.push({ protein, line, from });
    }
  };
  scan(recipe.ingredients, 'base');
  scan(recipe.omnivore?.add, 'omnivore');
  scan(recipe.vegetarianSwap?.add, 'veg');
  return found;
}

/**
 * What else could go in this dish, with the amount already worked out.
 *
 * Ordered by what is in the kitchen, then by whether the cuisine matches, then
 * by how close the swap is in effort. Anything that would break the recipe's
 * own diet label is left out entirely rather than shown and disabled — a vegan
 * recipe offering chicken is not a helpful option, it is a bug.
 */
export function proteinOptionsFor(recipe, current, {
  ingIndex, pantry = {}, diet = [], avoid = null, m = model, limit = 8
} = {}) {
  if (!m || !current) return [];
  const fromItem = ingIndex.get(current.line.ing);
  const grams = fromItem ? gramsFor(fromItem, current.line.qty, current.line.unit) : null;
  const cuisine = String(recipe.cuisine || '').toLowerCase();
  // The omnivore fork is the meat side of the fork in the road. Filtering its
  // options by the base dish's vegetarian label would offer tofu as a
  // replacement for the chicken that exists precisely because somebody wanted
  // chicken.
  const recipeDiet = current.from === 'omnivore' ? [] : (diet.length ? diet : (recipe.diet || []));

  return (m.proteins || [])
    .filter(p => p.id !== current.protein.id)
    .filter(p => fitsDiet(p, recipeDiet))
    .filter(p => sharesAMethod(p, current.protein))
    .map(p => {
      const item = ingIndex.get(p.ing);
      if (!item) return null;
      // Salmon is not "what else works here" for a fish allergy, and shrimp
      // is not it for shellfish. Left out entirely rather than shown and
      // disabled, same as the diet rule above.
      if (avoid?.size && blocksItem(item, avoid)) return null;
      const ratio = (p.swapRatio || 1) / (current.protein.swapRatio || 1);
      const amount = grams != null ? naturalUnit(item, grams * ratio) : null;
      const cuisineFit = (p.cuisines || []).some(c => c === 'any' || cuisine.includes(c));
      const minutesDelta = (p.minutes || 0) - (current.protein.minutes || 0);
      return {
        protein: p,
        item,
        amount,
        ratio,
        inPantry: !!pantry[p.ing],
        cuisineFit,
        minutesDelta,
        shared: sharedMethods(p, current.protein, m),
        score: (pantry[p.ing] ? 100 : 0)
          + (cuisineFit ? 25 : 0)
          + sharedMethods(p, current.protein, m).length * 8
          - Math.min(30, Math.abs(minutesDelta))
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function fitsDiet(protein, diet = []) {
  const d = protein.diet || [];
  if (diet.includes('vegan')) return d.includes('vegan');
  if (diet.includes('vegetarian')) return d.includes('vegan') || d.includes('vegetarian');
  if (diet.includes('pescatarian')) return !d.includes('omnivore') || d.includes('pescatarian');
  return true;
}

const sharesAMethod = (a, b) => (a.methods || []).some(m => (b.methods || []).includes(m));
const sharedMethods = (a, b, m = model) =>
  (a.methods || []).filter(id => (b.methods || []).includes(id)).map(id => methodById(id, m)).filter(Boolean);

/** Every way to cook this protein, fastest first. */
export function methodsFor(proteinId, m = model) {
  const p = proteinById(proteinId, m);
  if (!p) return [];
  return (p.methods || [])
    .map(id => methodById(id, m))
    .filter(Boolean)
    .sort((a, b) => a.minutes[0] - b.minutes[0]);
}

/** The preparation steps worth doing to this protein before any heat. */
export function prepFor(proteinId, m = model) {
  return (m?.before || []).filter(b => (b.worksOn || []).includes(proteinId));
}

/**
 * Which method the recipe is already using, guessed from its own steps.
 *
 * A guess, and treated as one: when nothing matches, the panel shows every
 * method for that protein rather than inventing a wrong answer. The words are
 * checked longest first so "stir-fry" is not read as "fry".
 */
const METHOD_WORDS = [
  ['method.slowcook', ['slow cooker', 'crock', 'slow-cook']],
  ['method.stirfry', ['stir-fry', 'stir fry', 'wok']],
  ['method.airfry', ['air fryer', 'air-fry']],
  ['method.braise', ['braise', 'braising', 'cover and cook', 'covered, 1 hour']],
  ['method.scramble', ['scramble', 'scrambled', 'soft curds']],
  ['method.crumble', ['breaking it up', 'break it up', 'crumble', 'crumbled']],
  ['method.poach', ['poach', 'poached', 'barely a simmer']],
  ['method.steam', ['steam', 'steamed', 'steamer']],
  ['method.grill', ['grill', 'grilled', 'grate over the coals']],
  ['method.crisp', ['until they blister', 'crisp the beans', 'crispy chickpeas']],
  ['method.roast', ['roast', 'roasted', 'sheet pan', 'oven at 4']],
  ['method.bake', ['bake', 'baked', 'into the oven']],
  ['method.simmer', ['simmer', 'simmering']],
  ['method.fry', ['fry an egg', 'fried egg']],
  ['method.sear', ['sear', 'seared', 'sear it', 'brown on', 'until golden and crisp']]
];

export function methodUsedBy(recipe, protein, m = model) {
  const text = [...(recipe.steps || []), ...(recipe.omnivore?.steps || [])].join(' ').toLowerCase();
  const allowed = new Set(protein?.methods || []);
  for (const [id, words] of METHOD_WORDS) {
    if (allowed.size && !allowed.has(id)) continue;
    if (words.some(w => text.includes(w))) return methodById(id, m);
  }
  return null;
}

/**
 * The line a protein swap produces, ready to hand to the store.
 *
 * Deliberately the same shape the substitution engine emits, so a protein swap
 * and an ingredient swap are the same kind of change everywhere downstream —
 * the shopping list, the nutrition panel and the heart score all follow it
 * without knowing which screen it came from.
 */
export function proteinSwapLine(line, fromProtein, toProtein, ingIndex) {
  const fromItem = ingIndex.get(line.ing);
  const toItem = ingIndex.get(toProtein.ing);
  if (!fromItem || !toItem) return null;
  const grams = gramsFor(fromItem, line.qty, line.unit);
  if (grams == null) return null;
  const ratio = (toProtein.swapRatio || 1) / (fromProtein.swapRatio || 1);
  const amount = naturalUnit(toItem, grams * ratio);
  return { ...line, ing: toItem.id, qty: amount.qty, unit: amount.unit, swappedFrom: line.ing };
}

/** Methods sorted for a cook with a specific amount of time, and a reason why. */
export function methodsByTime(proteinId, maxMinutes = null, m = model) {
  const list = methodsFor(proteinId, m);
  if (maxMinutes == null) return list;
  return list.filter(x => x.minutes[0] <= maxMinutes);
}

/** The one-line trade a method makes, for a chip beside its name. */
export function methodTrade(method) {
  const s = method?.scores || {};
  if (s.flavor >= 5 && s.handsOff <= 2) return 'Most flavor, least freedom';
  if (s.handsOff >= 5 && s.speed <= 2) return 'Slow, but it cooks itself';
  if (s.speed >= 5) return 'Fastest thing here';
  if (s.forgiving >= 5) return 'Hardest to get wrong';
  if (s.handsOff >= 4) return 'Leaves you free';
  return 'A fair trade all round';
}

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
 * The direct substitutes in the ingredient database answer the easy version of
 * the question and run out immediately: if a recipe wants lemon and the two
 * listed substitutes are lime and white wine vinegar, a kitchen with none of
 * the three has been handed nothing. So the ladder below keeps going.
 *
 *   1. what the data says to use instead
 *   2. what those things say to use instead — one step further out
 *   3. anything that plays the same part, from the role groups
 *   4. making the missing thing out of what is already in the house
 *   5. leaving it out, with an honest account of what that costs
 *
 * Everything is ranked with the pantry first, because the substitution somebody
 * actually makes is the one that does not involve going to a store.
 *
 * ERRERLabs — MIT licensed.
 */

import { getDb } from './data.js';
import { gramsFor } from './nutrition.js';
import { computeBalance, balanceDelta, getBalanceModel, axisPotency } from './balance.js';

let subModel = null;

export async function loadSubstitutions(path = 'data/substitutions.json') {
  if (subModel) return subModel;
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  subModel = await res.json();
  return subModel;
}

export function getSubstitutionModel() { return subModel; }

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
const COUNTABLE = new Set([
  'each', 'block', 'can', 'fillet', 'clove', 'stalk', 'sprig', 'spear', 'package',
  'piece', 'bunch', 'slice', 'ear', 'head', 'link', 'jar', 'bag', 'box', 'loaf',
  'sheet', 'bulb', 'rib', 'breast', 'thigh', 'leaf', 'strip', 'pod'
]);

export function naturalUnit(item, grams) {
  // Things you can count are how people think about them. Given a choice
  // between eight eggs and two and a bit cups of egg, or five portobellos and
  // seven cups of mushroom, the countable one is the one a cook can act on.
  let counted = null;
  for (const [unit, per] of Object.entries(item.units || {})) {
    if (!COUNTABLE.has(unit) || !(per > 0)) continue;
    const qty = grams / per;
    if (qty < 0.4 || qty > 12) continue;
    if (!counted || Math.abs(qty - Math.round(qty)) < Math.abs(counted.qty - Math.round(counted.qty))) {
      counted = { qty, unit };
    }
  }
  if (counted) return counted;

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
 * The conversion for one chosen substitute, wherever on the ladder it came from.
 *
 * A direct substitution brings its own ratio and caveat. Anything further out —
 * a substitute's substitute, or something from the same role group — has no
 * authored ratio, so it converts one for one by weight and says so. That is the
 * honest default: equal weights of two things doing the same job is right far
 * more often than it is wrong, and the cases where it is wrong are exactly the
 * ones the data already names.
 */
function resolveSub(fromId, subId, ingIndex, unit = null) {
  const direct = substitutionsFor(fromId).find(s => s.item.id === subId);
  if (direct) {
    const { ratio, assumed } = refineRatio(fromId, subId, unit, direct.ratio);
    return { ...direct, ratio, assumed };
  }

  const item = ingIndex.get(subId);
  if (!item) return null;

  // One step out: the ratios multiply through grams.
  const from = ingIndex.get(fromId);
  for (const s of from?.subs || []) {
    const mid = normalizeSub(s, ingIndex);
    if (!mid) continue;
    const onward = (mid.item.subs || []).map(x => normalizeSub(x, ingIndex)).find(x => x?.item.id === subId);
    if (onward) {
      return {
        item,
        ratio: mid.ratio * onward.ratio,
        note: onward.note || `By way of ${mid.item.name}, which both of them stand in for.`
      };
    }
  }

  // Same role: converted by whatever that group knows about its members.
  const shared = rolesFor(fromId).find(r => r.members.includes(subId));
  if (!shared) return { item, ratio: 1, note: null, assumed: true };
  return {
    item,
    ratio: roleRatio(shared, fromId, subId, unit),
    note: shared.swapNote || shared.does || null,
    assumed: true
  };
}

/**
 * How much of one member of a role group stands in for another.
 *
 * Two sources, both of them data. A group can point at one of the flavor dials
 * — dry chile heat is scaled by the heat intensities in balance.json, so
 * cayenne comes out at roughly half a measure of pepper flakes — or it can
 * carry its own table for the differences that are not a flavor dial at all,
 * like dried herb against fresh. Anything outside a sane multiplier is refused
 * rather than printed, because a suggestion of "0.004 tsp" is not advice.
 */
export function roleRatio(role, fromId, toId, unit = null, balanceModel = getBalanceModel()) {
  if (role?.strength) {
    const a = role.strength[fromId];
    const b = role.strength[toId];
    if (a > 0 && b > 0) return clampRatio(a / b);
  }
  const axis = role?.scaleBy?.startsWith('balance:') ? role.scaleBy.slice(8) : null;
  if (axis && balanceModel) {
    const a = axisPotency(axis, fromId, unit, balanceModel);
    const b = axisPotency(axis, toId, null, balanceModel);
    if (a > 0 && b > 0) return clampRatio(a / b);
  }
  return 1;
}

const clampRatio = (r) => (r >= 0.002 && r <= 200 ? r : 1);

/**
 * A direct substitution with no authored ratio means "one for one", which is
 * the right default for most pairs and quietly wrong for the rest — a whole
 * lemon and its weight in white wine vinegar are not the same amount of sour.
 * Where both sides sit in a role group that knows how to scale between its
 * members, use that instead of the default.
 */
function refineRatio(fromId, toId, unit, authored, model = subModel, balanceModel = getBalanceModel()) {
  if (authored !== 1) return { ratio: authored, assumed: false };
  const role = (model?.roles || []).find(r =>
    (r.scaleBy || r.strength) && r.members.includes(fromId) && r.members.includes(toId));
  if (!role) return { ratio: 1, assumed: false };
  const ratio = roleRatio(role, fromId, toId, unit, balanceModel);
  return ratio === 1 ? { ratio: 1, assumed: false } : { ratio, assumed: true };
}

/**
 * What one ingredient line becomes when swapped. Returns null when the original
 * has no gram weight for its unit, which would make any conversion a guess.
 */
export function swappedLine(line, subId) {
  const { ingIndex } = getDb();
  const from = ingIndex.get(line.ing);
  const sub = resolveSub(line.ing, subId, ingIndex, line.unit);
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

/* ------------------------------------------------------------------ *
 * The ladder — what to do when the two listed substitutes are also out
 * ------------------------------------------------------------------ */

/** The role groups an ingredient belongs to: "a bright acid", "a melting cheese". */
export function rolesFor(ingredientId, model = subModel) {
  return (model?.roles || []).filter(r => r.members.includes(ingredientId));
}

/** The things you can make this ingredient out of, from what is in the house. */
export function combosFor(ingredientId, model = subModel) {
  return (model?.combos || []).filter(c => c.makes === ingredientId);
}

/** A normalized direct substitution — the bare-id and object forms, unified. */
function normalizeSub(s, ingIndex) {
  const id = typeof s === 'string' ? s : s?.id;
  const item = ingIndex.get(id);
  if (!item) return null;
  return { item, ratio: (typeof s === 'object' && s.ratio) || 1, note: (typeof s === 'object' && s.note) || null };
}

/**
 * Everything you could do instead, in tiers, best first inside each tier.
 *
 * Pure on purpose: every model it needs is passed in, so the ranking can be
 * tested against the real data without a browser anywhere near it.
 */
export function buildLadder(ingredientId, {
  ingIndex,
  model = subModel,
  balanceModel = getBalanceModel(),
  recipe = null,
  line = null,
  diet = [],
  pantry = {},
  likes = {},
  limit = 8
} = {}) {
  const from = ingIndex.get(ingredientId);
  if (!from) return null;

  const weights = model?.ranking || {};
  const seen = new Set([ingredientId]);
  const options = [];

  const consider = (item, { tier, ratio = 1, note = null, via = null, role = null, assumed = false }) => {
    if (!item || seen.has(item.id)) return;
    if (!fits(item, diet)) return;
    seen.add(item.id);
    options.push({
      item, tier, ratio, note, via, role, assumedRatio: assumed,
      inPantry: !!pantry[item.id],
      disliked: likes[item.id] === -1,
      loved: likes[item.id] === 1,
      roles: rolesFor(item.id, model).map(r => r.name)
    });
  };

  // 1. What the ingredient itself says.
  const direct = (from.subs || []).map(s => normalizeSub(s, ingIndex)).filter(Boolean);
  for (const d of direct) {
    const { ratio, assumed } = refineRatio(ingredientId, d.item.id, line?.unit, d.ratio, model, balanceModel);
    consider(d.item, { tier: 'direct', ratio, note: d.note, assumed });
  }

  // 2. One step further out. A substitute's own substitutes are usually still
  //    in the neighborhood, and the ratios multiply cleanly through grams.
  for (const d of direct) {
    for (const s of d.item.subs || []) {
      const next = normalizeSub(s, ingIndex);
      if (!next) continue;
      consider(next.item, {
        tier: 'second',
        ratio: d.ratio * next.ratio,
        note: next.note,
        via: d.item.name
      });
    }
  }

  // 3. Anything that plays the same part. This is the tier that answers the
  //    question the old sheet could not: neither of the two listed, now what.
  const groups = rolesFor(ingredientId, model);
  for (const role of groups) {
    for (const id of role.members) {
      const ratio = roleRatio(role, ingredientId, id, line?.unit, balanceModel);
      consider(ingIndex.get(id), {
        tier: 'role',
        ratio,
        note: role.swapNote || role.does,
        role: role.name,
        // One oil for another really is one for one, and saying "start here and
        // taste" about that is noise. The caveat belongs on the conversions the
        // app derived rather than the ones that are simply equal.
        assumed: ratio !== 1
      });
    }
  }

  // Score, then sort. Everything in the kitchen already floats to the top.
  for (const o of options) {
    let score = 0;
    if (o.inPantry) score += weights.inPantry ?? 100;
    score += o.tier === 'direct' ? (weights.direct ?? 60)
      : o.tier === 'second' ? (weights.secondDegree ?? 25)
        : (weights.sameRole ?? 20);
    score += sharedTagCount(from, o.item) * (weights.sharedTags ?? 6);
    if (from.aisle === o.item.aisle) score += weights.sameAisle ?? 4;
    if (o.disliked) score += weights.dislikedPenalty ?? -80;
    if (o.loved) score += weights.lovedBonus ?? 12;

    // Does the swap keep the dish in balance? Only worth asking when there is a
    // recipe and a line to ask it about.
    if (recipe && line && balanceModel) {
      const effect = swapEffect(recipe, line, o.item.id, { ingIndex, balanceModel, ratio: o.ratio });
      o.effect = effect;
      if (effect?.lost?.length) score += weights.breaksBalance ?? -30;
      else if (effect && !effect.lost.length && effect.changed) score += weights.keepsBalance ?? 14;
    }
    o.score = score;
  }
  options.sort((a, b) => b.score - a.score);

  const byTier = (t) => options.filter(o => o.tier === t).slice(0, limit);

  return {
    from,
    roles: groups,
    direct: byTier('direct'),
    second: byTier('second'),
    role: byTier('role'),
    best: options.slice(0, limit),
    combos: combosFor(ingredientId, model).map(c => ({
      ...c,
      parts: c.from.map(f => ({ ...f, item: ingIndex.get(f.ing), inPantry: !!pantry[f.ing] })),
      ready: c.from.every(f => pantry[f.ing])
    })),
    omit: recipe && line ? omitAdvice(recipe, line, { ingIndex, balanceModel, model }) : null
  };
}

function sharedTagCount(a, b) {
  const set = new Set(a.tags || []);
  return (b.tags || []).filter(t => set.has(t)).length;
}

/* ------------------------------------------------------------------ *
 * What a change does to the balance of the dish
 * ------------------------------------------------------------------ */

/** The recipe with one line replaced by another ingredient, for comparison. */
function recipeWithLine(recipe, line, nextLine) {
  return {
    ...recipe,
    ingredients: recipe.ingredients.map(l => (l === line || l.ing === line.ing ? nextLine : l)).filter(Boolean)
  };
}

/**
 * Which dials a substitution moves, and whether it moves any of them out of
 * their band. This is what lets the swap sheet say "keeps the acid" or "there
 * goes the only acid in the dish" beside an option rather than after the fact.
 */
export function swapEffect(recipe, line, substituteId, { ingIndex, balanceModel = getBalanceModel(), ratio = 1 } = {}) {
  if (!balanceModel || !recipe || !line) return null;
  const sub = ingIndex.get(substituteId);
  const from = ingIndex.get(line.ing);
  if (!sub || !from) return null;

  const grams = gramsFor(from, line.qty, line.unit);
  if (grams == null) return null;
  const amount = naturalUnit(sub, grams * ratio);
  const nextLine = { ...line, ing: sub.id, qty: amount.qty, unit: amount.unit };

  const before = computeBalance(recipe, ingIndex, balanceModel);
  const after = computeBalance(recipeWithLine(recipe, line, nextLine), ingIndex, balanceModel);
  const changes = balanceDelta(before, after);

  return {
    changed: changes.length > 0,
    lost: changes.filter(c => c.lost),
    gained: changes.filter(c => c.gained),
    overshot: changes.filter(c => c.overshot),
    label: effectLabel(changes)
  };
}

/** Six words or fewer, because it goes on a button. */
function effectLabel(changes) {
  const lost = changes.find(c => c.lost);
  if (lost) return `loses the ${nameOf(lost).toLowerCase()}`;
  const over = changes.find(c => c.overshot);
  if (over) return `more ${nameOf(over).toLowerCase()} than the original`;
  const gained = changes.find(c => c.gained);
  if (gained) return `adds ${nameOf(gained).toLowerCase()}`;
  return 'balance unchanged';
}

const nameOf = (change) => change.axis?.name || change.finisher?.name || 'balance';

/**
 * Leaving it out.
 *
 * An app that only ever offers replacements is quietly telling people they need
 * to go to the store. Often they do not — but they deserve to know which of the
 * three things it is: no consequence, a different dish, or the load-bearing
 * wall. The answer comes from taking the line out and looking at what moved.
 */
export function omitAdvice(recipe, line, { ingIndex, balanceModel = getBalanceModel(), model = subModel } = {}) {
  const item = ingIndex.get(line.ing);
  if (!item) return null;

  const without = { ...recipe, ingredients: recipe.ingredients.filter(l => l !== line && l.ing !== line.ing) };
  const before = balanceModel ? computeBalance(recipe, ingIndex, balanceModel) : null;
  const after = balanceModel ? computeBalance(without, ingIndex, balanceModel) : null;
  const changes = before && after ? balanceDelta(before, after).filter(c => c.lost) : [];

  const copy = model?.omit || {};
  let verdict, say;
  if (changes.length) {
    verdict = 'loadBearing';
    say = copy.loadBearing || 'This one is doing real work.';
  } else if (line.optional) {
    verdict = 'safeToSkip';
    say = copy.safeToSkip || 'Nothing here is structural.';
  } else {
    verdict = 'changesDish';
    say = copy.changesDish || 'You can leave it out.';
  }

  // What to put in its place, taken from the balance model's own fix list for
  // whichever dial the dish just lost.
  const compensate = changes.flatMap(c => {
    const source = c.axis || c.finisher;
    const fixes = source?.whenLow?.fixes || source?.whenMissing?.fixes || [];
    return fixes.slice(0, 2).map(f => ({ ...f, axis: source.name, item: ingIndex.get(f.ing) || null }));
  });

  return { verdict, say, lost: changes.map(c => nameOf(c)), compensate };
}

/**
 * balance.js — where the flavor in a dish comes from, counted.
 *
 * A recipe is a list of amounts, and an amount is something arithmetic can be
 * done to. So the question "is this dish balanced" does not have to be a matter
 * of taste memory: salt is sodium per serving, fat is fat per serving, and acid
 * is the weight of the acidic things in the pot times how acidic each one is.
 *
 * Two rules keep it honest.
 *
 * The first is that a dial below its band is a prompt, not a verdict. Plenty of
 * excellent dishes have no chile in them and no sweetness at all. What the app
 * says is "there is nothing lifting this" and hands over a teaspoon of vinegar;
 * what it never says is that the recipe is wrong.
 *
 * The second is that this is an estimate of a moving thing. Acid and fresh
 * aroma cook away, and the app cannot see whether the lemon went in at the
 * start or at the table. It uses total time as a rough proxy, and the panel
 * says so in the open rather than presenting a guess as a measurement.
 *
 * The reason any of this exists: a substitution changes the numbers. Swap
 * yogurt for sour cream and nothing moves. Swap lemon for lemongrass and the
 * acid leaves the dish entirely — and until now nothing anywhere said so.
 *
 * ERRERLabs — MIT licensed.
 */

import { lineNutrients, gramsFor, clamp, topContributors } from './nutrition.js';

let model = null;

export async function loadBalance(path = 'data/balance.json') {
  if (model) return model;
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  model = await res.json();
  return model;
}

export function getBalanceModel() { return model; }
export function balanceAxes() { return model?.axes || []; }
export function balanceLessons() { return model?.lessons || []; }

/* ------------------------------------------------------------------ *
 * The arithmetic — pure, so the tests can run it without a browser
 * ------------------------------------------------------------------ */

/**
 * The intensity of one ingredient measured in one unit.
 *
 * Most entries are a single number: an intensity per gram, whatever the recipe
 * wrote. A few have to know the unit, because for them the unit is the whole
 * fact — a lemon weighs 84 grams and yields about 30 grams of juice, so "1
 * lemon, juiced" and "2 tbsp lemon juice" cannot be scored off the same number.
 * The "note" keys that document a table from inside it fall through to zero.
 */
function potencyOf(map, id, unit) {
  const entry = map?.[id];
  if (typeof entry === 'number') return entry;
  if (entry && typeof entry === 'object') {
    if (typeof entry[unit] === 'number') return entry[unit];
    if (typeof entry.default === 'number') return entry.default;
  }
  return 0;
}

/**
 * How much of a volatile axis survives the cook.
 *
 * Acid and fresh aroma both go dull with time and heat. A thirty-minute skillet
 * keeps nearly all of it; a three-hour braise keeps a fraction. Anything the
 * recipe marks optional, or that the ingredient database tags as a finisher,
 * is exempt — those go on at the end by definition.
 */
function survives(axisId, line, item, recipe, m) {
  const rule = m.cookedAway;
  if (!rule || !rule.axes.includes(axisId)) return 1;
  if (rule.exemptFinishers && (line.optional || isFinisher(item))) return 1;
  const over = Math.max(0, (recipe.totalMin || 0) - rule.keepUnder);
  return clamp(1 - over * rule.perMinute, rule.floor, 1);
}

const isFinisher = (item) =>
  (item?.tags || []).some(t => t === 'finisher' || t === 'finishing' || t === 'garnish');

/**
 * Is this line still crisp when it reaches the table?
 *
 * A carrot is crunchy in a slaw and soft in a soffritto, and the difference is
 * not in the ingredient — it is in what the recipe does to it. The app reads
 * three signals: the recipe never cooks anything, the line is a topping, or the
 * prep note says it is going on raw.
 */
function staysRaw(line, item, recipe, m) {
  const rules = m.rawRules || {};
  const tags = recipe.tags || [];
  if ((rules.recipeTags || []).some(t => tags.includes(t))) return true;
  if (rules.optionalCounts && line.optional) return true;
  if (isFinisher(item)) return true;
  const prep = String(line.prep || '').toLowerCase();
  return (rules.prepWords || []).some(w => prep.includes(w));
}

/** The intensity of one ingredient on one axis, tags included. */
function intensity(axisId, item, m, unit) {
  if (!item) return 0;
  const direct = potencyOf(m.potency?.[axisId], item.id, unit);
  if (direct) return direct;
  const byTag = m.tagPotency?.[axisId] || {};
  let best = 0;
  for (const tag of item.tags || []) best = Math.max(best, byTag[tag] || 0);
  return best;
}

/**
 * How strongly one ingredient reads on one dial, for anybody outside this file.
 *
 * The substitution engine uses it to convert amounts between things that do the
 * same job: a teaspoon of cayenne and a teaspoon of gochugaru are both "dry
 * chile heat" and are not remotely the same amount of it, and these numbers are
 * already calibrated for exactly that comparison.
 */
export function axisPotency(axisId, ingredientId, unit = null, m = model) {
  if (!m) return 0;
  const direct = potencyOf(m.potency?.[axisId], ingredientId, unit);
  if (direct) return direct;
  const raw = axisId === 'crunch' ? potencyOf(m.potency?.crunchRaw, ingredientId, unit) : 0;
  return raw || 0;
}

/** Crunch has a second table for the things that are only crisp uncooked. */
function crunchIntensity(line, item, recipe, m) {
  const kept = intensity('crunch', item, m, line.unit);
  if (kept) return kept;
  if (!staysRaw(line, item, recipe, m)) return 0;
  const raw = potencyOf(m.potency?.crunchRaw, item.id, line.unit);
  if (raw) return raw;
  const byTag = m.tagPotency?.crunchRaw || {};
  let best = 0;
  for (const tag of item.tags || []) best = Math.max(best, byTag[tag] || 0);
  return best;
}

/** Per-line contributions to a counted axis, biggest first. */
function countedContributions(axisId, lines, ingIndex, recipe, m) {
  const out = [];
  for (const line of lines) {
    const item = ingIndex.get(line.ing);
    if (!item) continue;
    const per = axisId === 'crunch'
      ? crunchIntensity(line, item, recipe, m)
      : intensity(axisId, item, m, line.unit);
    if (!per) continue;
    const grams = gramsFor(item, line.qty, line.unit);
    if (grams == null) continue;
    const value = grams * per * survives(axisId, line, item, recipe, m);
    if (value > 0) out.push({ id: item.id, name: item.name, value });
  }
  return out.sort((a, b) => b.value - a.value);
}

const bandFor = (axis, course) =>
  axis.bands?.[course] || axis.bands?.dinner || [0, Infinity];

/**
 * Where one dial sits.
 *
 * `state` is the word the interface acts on: 'low' asks for a fix, 'high'
 * offers a rescue, 'off' means an optional dial that is simply not in use, and
 * 'ok' means leave it alone.
 */
function dialFor(axis, value, course) {
  const [lo, hi] = bandFor(axis, course);
  let state = 'ok';
  if (value > hi) state = 'high';
  else if (value < lo) state = axis.optional || lo === 0 ? 'off' : 'low';
  if (axis.optional && value <= 0) state = 'off';
  // The bar runs from nothing to a bit past the top of the band, so a dish that
  // is genuinely over the line looks over the line rather than pinned at full.
  const ceiling = Math.max(hi * 1.25, value, 0.0001);
  return {
    state,
    value,
    band: [lo, hi],
    fill: clamp(value / ceiling, 0, 1),
    bandStart: clamp(lo / ceiling, 0, 1),
    bandEnd: clamp(hi / ceiling, 0, 1)
  };
}

/**
 * The whole profile for one recipe.
 *
 * `servings` defaults to the recipe's own, because every number here is per
 * serving and scaling a recipe up does not change how it tastes.
 */
export function computeBalance(recipe, ingIndex, m = model, { withOmnivore = false } = {}) {
  if (!m) return null;
  const lines = [
    ...(recipe.ingredients || []),
    ...(withOmnivore ? recipe.omnivore?.add || [] : [])
  ];
  const servings = Math.max(1, recipe.servings || 1);
  const course = recipe.course || 'dinner';
  const { total: nut } = lineNutrients(lines, ingIndex);

  const axes = (m.axes || []).map(axis => {
    let value, contributors;
    if (axis.kind === 'measured') {
      value = (nut[axis.measure] || 0) / servings;
      contributors = topContributors(lines, ingIndex, axis.measure)
        .map(c => ({ id: c.id, name: c.name, pct: c.pct }));
    } else {
      const parts = countedContributions(axis.id, lines, ingIndex, recipe, m);
      const total = parts.reduce((s, p) => s + p.value, 0);
      value = total / servings;
      contributors = parts.slice(0, 3).map(p => ({
        id: p.id, name: p.name, pct: total ? Math.round((p.value / total) * 100) : 0
      }));
    }
    const dial = dialFor(axis, round2(value), course);
    // An ingredient list is not the whole seasoning story. "Cook the pasta in
    // well-salted water" is salt nobody wrote down, and reporting the dish as
    // under-seasoned because of it would be confidently wrong.
    const uncounted = m.uncounted?.axis === axis.id && dial.state === 'low'
      && mentions(recipe, m.uncounted.phrases);
    return { ...axis, ...dial, contributors, uncounted, uncountedSay: uncounted ? m.uncounted.say : null };
  });

  const finishers = (m.finishers || []).map(f => {
    const parts = countedContributions(f.id, lines, ingIndex, recipe, m);
    const total = parts.reduce((s, p) => s + p.value, 0) / servings;
    const threshold = m.thresholds?.[f.id] ?? 0.25;
    return {
      ...f,
      value: round2(total),
      present: total >= threshold,
      contributors: parts.slice(0, 3).map(p => ({ id: p.id, name: p.name }))
    };
  });

  // A dial can be low and the dish still right, because the dials lean on each
  // other. Salt, acid and savory depth all push on the same perception: a
  // lightly salted pot with lemon and miso in it does not taste under-seasoned,
  // and telling somebody to add salt to it would make that dish worse.
  const carrying = new Map([
    ...axes.map(a => [a.id, a.state === 'ok' || a.state === 'high']),
    ...finishers.map(f => [f.id, f.present])
  ]);
  for (const axis of axes) {
    if (axis.state !== 'low' || !axis.carriedBy?.length) continue;
    const held = axis.carriedBy.filter(id => carrying.get(id));
    axis.carried = held.length > 0;
    axis.carriedByNames = held.map(id =>
      axes.find(a => a.id === id)?.name || finishers.find(f => f.id === id)?.name || id);
  }

  return { axes, finishers, servings, course, notes: gaps(axes, finishers) };
}

/** Does the method say any of these? Used for the salt the recipe never lists. */
function mentions(recipe, phrases = []) {
  const text = [...(recipe.steps || []), ...(recipe.omnivore?.steps || [])].join(' ').toLowerCase();
  return phrases.some(p => text.includes(p));
}

/** The one-line read: what a cook would say after tasting it. */
function gaps(axes, finishers) {
  // A low dial that another dial is carrying, or salt the method adds without
  // writing down, is not something to hand the cook a fix for.
  const low = axes.filter(a => a.state === 'low' && !a.carried && !a.uncounted);
  const high = axes.filter(a => a.state === 'high');
  const missing = finishers.filter(f => !f.present);
  return { low, high, missing, settled: !low.length && !high.length && !missing.length };
}

const round2 = (n) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ *
 * What a substitution did to the balance
 * ------------------------------------------------------------------ */

/**
 * The axes a swap moved, and whether the move matters.
 *
 * Only crossings are reported. A swap that takes the acid from the middle of
 * its band to the low end of it changed a number and did not change the dish;
 * a swap that takes it below the band changed the dish, and that is worth a
 * sentence and a way to put it back.
 */
export function balanceDelta(before, after) {
  if (!before || !after) return [];
  const wasFine = new Map(before.axes.map(a => [a.id, a]));
  const changes = [];

  for (const now of after.axes) {
    const was = wasFine.get(now.id);
    if (!was || was.state === now.state) continue;
    changes.push({
      axis: now,
      from: was.state,
      to: now.state,
      lost: (was.state === 'ok' || was.state === 'high') && (now.state === 'low' || now.state === 'off'),
      gained: (was.state === 'low' || was.state === 'off') && now.state === 'ok',
      overshot: was.state !== 'high' && now.state === 'high'
    });
  }

  const wasPresent = new Map(before.finishers.map(f => [f.id, f.present]));
  for (const f of after.finishers) {
    const had = wasPresent.get(f.id);
    if (had === f.present) continue;
    changes.push({ finisher: f, lost: had && !f.present, gained: !had && f.present });
  }
  return changes;
}

/**
 * The fixes for one dial, in the direction it needs.
 *
 * Returned with the ingredient record attached where the database has one, so
 * the panel can show an icon and the shopping list can add it in one tap.
 */
export function fixesFor(axis, direction, ingIndex) {
  const list = direction === 'high'
    ? axis.whenHigh?.fixes
    : axis.whenMissing?.fixes || axis.whenLow?.fixes;
  return (list || []).map(f => ({ ...f, item: ingIndex?.get?.(f.ing) || null }));
}

/** The sentence for a dial that needs attention. */
export function sayFor(axis, direction) {
  if (direction === 'high') return axis.whenHigh?.say || '';
  return axis.whenMissing?.say || axis.whenLow?.say || '';
}

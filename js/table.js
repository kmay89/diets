/**
 * table.js — the twenty minutes on either side of the pan coming off the heat.
 *
 * A recipe ends at "serve hot" and leaves the rest to figure itself out: when
 * to start so that everything lands together, how to get it onto a plate while
 * it is still worth eating, what order to eat it in, and what to drink. That is
 * the part of dinner nobody writes down, and it is where a good dish most often
 * turns into a mediocre meal.
 *
 * Two kinds of guidance live here and they are kept visibly apart. The
 * countdown and the plating are craft — mechanisms, not studies. The eating and
 * drinking guidance carries claim ids into data/claims.json, so every sentence
 * about glucose or hydration renders with its source and its caveat attached,
 * the same as everywhere else in this app. Anything that could not be sourced
 * that way is either named as one way of doing things or listed as a myth.
 *
 * ERRERLabs — MIT licensed.
 */

let model = null;

export async function loadTable(path = 'data/table.json') {
  if (model) return model;
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  model = await res.json();
  return model;
}

export function getTableModel() { return model; }

/* ------------------------------------------------------------------ *
 * The countdown
 * ------------------------------------------------------------------ */

/**
 * A working-backward plan for one recipe, in minutes before sitting down.
 *
 * Every number comes from the recipe's own times, so a fifteen-minute skillet
 * and a three-hour braise get different plans instead of the same advice. Marks
 * that do not apply — resting a salad, warming a plate for ice cream — are
 * dropped rather than shown with a caveat.
 */
export function timelineFor(recipe, m = model) {
  if (!m?.timeline) return [];
  const tags = new Set([...(recipe.tags || []), recipe.course, String(recipe.cuisine || '')]);
  const plating = m.timeline.platingMin || 4;
  const total = (recipe.totalMin || 0) + plating;

  const marks = [];
  for (const mark of m.timeline.marks) {
    if (mark.onlyFor && !mark.onlyFor.some(t => tags.has(t))) continue;
    if (mark.skipFor && mark.skipFor.some(t => tags.has(t))) continue;

    let at;
    if (mark.offset === 'total') at = total;
    else if (mark.offset === 'active') at = Math.min(total, (recipe.activeMin || 0) + plating);
    else at = mark.offset;
    // A mark that would land before the cooking starts is noise on a fast
    // recipe: there is no "set the table ten minutes out" in a six-minute dish.
    if (at > total) continue;
    marks.push({ ...mark, at });
  }

  // Two marks landing on the same minute read as a contradiction rather than a
  // plan. The first one defined wins, because the file is written in the order
  // the evening happens — on a fifteen-minute dish "start here" and "hands on
  // from here" are the same moment, and the useful one to print is the start.
  const seen = new Map();
  for (const mark of marks) if (!seen.has(mark.at)) seen.set(mark.at, mark);
  return [...seen.values()].sort((a, b) => b.at - a.at);
}

/** The countdown as clock times, once somebody says when they want to eat. */
export function timelineAt(recipe, serveAt, m = model) {
  return timelineFor(recipe, m).map(mark => ({
    ...mark,
    time: new Date(serveAt.getTime() - mark.at * 60000)
  }));
}

/** When to start, given a time to sit down. */
export function startTimeFor(recipe, serveAt, m = model) {
  const marks = timelineFor(recipe, m);
  const first = marks[0];
  return first ? new Date(serveAt.getTime() - first.at * 60000) : new Date(serveAt);
}

/* ------------------------------------------------------------------ *
 * Plating
 * ------------------------------------------------------------------ */

export function platingFor(recipe, m = model) {
  if (!m?.plating) return null;
  return {
    principles: m.plating.principles || [],
    forCourse: m.plating.byCourse?.[recipe.course] || null
  };
}

/* ------------------------------------------------------------------ *
 * Eating and drinking
 * ------------------------------------------------------------------ */

/**
 * Which water notes this particular plate earns.
 *
 * A rule with no condition is always on. The rest read either a per-serving
 * nutrient or one of the flavor dials, so "this one is hot, and water is the
 * one thing that will not help" appears on a dish with chile in it and nowhere
 * else. Guidance that fires on every meal is guidance nobody reads.
 */
export function waterNotesFor({ perServing = {}, balance = null } = {}, m = model) {
  const rules = m?.water?.rules || [];
  return rules.filter(rule => matches(rule.when, perServing, balance));
}

function matches(when, perServing, balance) {
  if (!when) return true;
  const value = when.axis
    ? balance?.axes?.find(a => a.id === when.axis)?.value
    : perServing?.[when.metric];
  if (value == null) return false;
  if (when.op === '>') return value > when.value;
  if (when.op === '<') return value < when.value;
  if (when.op === '>=') return value >= when.value;
  if (when.op === '<=') return value <= when.value;
  return false;
}

/** The habits section, in the order it should be read. */
export function eatingNotes(m = model) {
  const e = m?.eating || {};
  return [e.order, e.pace, e.after, e.late].filter(Boolean);
}

export function waterBase(m = model) { return m?.water?.base || null; }
export function waterMyths(m = model) { return m?.water?.myths || []; }
export function leftoverNote(m = model) { return m?.leftovers || null; }

/**
 * Everything the table section needs for one recipe, in one call.
 *
 * The view should not have to know that water notes read nutrition and plating
 * reads the course. It asks for the table and gets the table.
 */
export function tableFor(recipe, { perServing = {}, balance = null, serveAt = null } = {}, m = model) {
  if (!m) return null;
  return {
    timeline: serveAt ? timelineAt(recipe, serveAt, m) : timelineFor(recipe, m),
    plating: platingFor(recipe, m),
    eating: eatingNotes(m),
    water: {
      base: waterBase(m),
      notes: waterNotesFor({ perServing, balance }, m),
      myths: waterMyths(m)
    },
    leftovers: leftoverNote(m)
  };
}

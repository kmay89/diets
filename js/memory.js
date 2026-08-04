/**
 * memory.js — what this kitchen has actually cooked, and what it did to it.
 *
 * The app used to remember a list of recipe ids and the dates beside them. That
 * is a log, not a memory. It cannot answer the question anybody actually has
 * when they open a recipe they have cooked before, which is never "have I made
 * this" — you know that — but "what did I do last time, and did it work?"
 *
 * So a cook is recorded with the dish as it was *actually cooked*: the swaps in
 * force, anything added to it, how many servings, whether the meat fork was
 * taken. Those live in state as current settings and change over time, so they
 * are snapshotted at the moment of cooking rather than read back later — a
 * kitchen that swapped the feta out in June should not be told it did that in
 * March.
 *
 * And a note, if there is one. "Needed ten more minutes." "Double the garlic."
 * That single sentence is worth more than everything else in this file, because
 * it is the only part the app could never have worked out on its own, and it is
 * the thing that turns a recipe you followed into a recipe you own.
 *
 * Nothing here counts anything at anybody. There are no streaks and no totals
 * in the scoring sense — a quiet month is a quiet month. What is counted is
 * counted because a cook asked: how many times, and how long ago.
 *
 * ERRERLabs — MIT licensed.
 */

/* ------------------------------------------------------------------ *
 * Reading the log
 * ------------------------------------------------------------------ */

/** Every cook of one dish, newest first. */
export function cooksOf(recipeId, state) {
  return (state?.history || []).filter(e => e && e.id === recipeId);
}

/** How many times this kitchen has made it. Undated old entries still count. */
export const timesCooked = (recipeId, state) => cooksOf(recipeId, state).length;

/** The most recent cook, or null. */
export const lastCook = (recipeId, state) => cooksOf(recipeId, state)[0] || null;

/**
 * The most recent note anybody wrote about this dish, with the cook it came
 * from. Notes are what people come back for, and they are worth surfacing even
 * when they were written four cooks ago.
 */
export function lastNote(recipeId, state) {
  return cooksOf(recipeId, state).find(e => e.note && e.note.trim()) || null;
}

/** Every note on this dish, newest first — the recipe's margin. */
export const notesOn = (recipeId, state) =>
  cooksOf(recipeId, state).filter(e => e.note && e.note.trim());

/* ------------------------------------------------------------------ *
 * Saying when
 * ------------------------------------------------------------------ */

const DAY = 86400000;

/**
 * How long ago, in the words somebody would use out loud.
 *
 * "Last Tuesday" rather than "9 days ago" for anything inside a fortnight,
 * because that is how people hold recent time; a date for anything older,
 * because "eleven weeks ago" is a number nobody converts. Undated entries —
 * the ones from before the log kept dates — say so instead of guessing.
 */
export function whenWords(iso, now = new Date()) {
  if (!iso) return 'at some point';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 'at some point';

  const days = Math.floor((startOfDay(now) - startOfDay(then)) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `last ${then.toLocaleDateString(undefined, { weekday: 'long' })}`;
  if (days < 14) return 'last week';
  if (days < 28) return `${Math.round(days / 7)} weeks ago`;

  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString(undefined,
    sameYear ? { month: 'long', day: 'numeric' } : { month: 'long', year: 'numeric' });
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Three times", "Twice", "Once" — small counts read better as words. */
export function timesWords(n) {
  const words = ['never', 'once', 'twice', 'three times', 'four times', 'five times',
    'six times', 'seven times', 'eight times', 'nine times', 'ten times'];
  return words[n] || `${n} times`;
}

/* ------------------------------------------------------------------ *
 * What you did to it
 * ------------------------------------------------------------------ */

/**
 * The changes made to a dish that time, as sentences.
 *
 * Written from the snapshot on the entry rather than from current settings, so
 * it stays true even after the household has changed its mind. Anything that no
 * longer resolves to a real ingredient is dropped rather than shown as an id —
 * a memory that reads "ing.feta" is worse than a memory that stays quiet.
 */
export function changesIn(entry, ingIndex) {
  if (!entry) return [];
  const name = (id) => ingIndex.get(id)?.name?.toLowerCase() || null;
  const swapped = [];
  const added = [];

  for (const [from, to] of Object.entries(entry.swaps || {})) {
    const a = name(from);
    const b = name(to);
    if (a && b) swapped.push(`${b} instead of ${a}`);
  }
  for (const line of entry.added || []) {
    const n = name(line.ing);
    if (n) added.push(n);
  }

  return { swapped, added };
}

/** "a, b and c" — the serial comma left out on purpose; this is prose. */
function list(items) {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * One line summarizing what was different about a cook, or null when nothing
 * was — the caller is already showing the date, and "you cooked it as written"
 * is a sentence nobody needs to read on 200 recipes.
 *
 * Swapping and adding are two different verbs and are kept apart. Folding them
 * into one list produces "you used added lemon", which is the kind of sentence
 * that makes somebody stop believing the rest of the page.
 */
export function whatHappened(entry, ingIndex) {
  const { swapped, added } = changesIn(entry, ingIndex);
  const clauses = [];
  if (swapped.length) clauses.push(`used ${list(swapped)}`);
  if (added.length) clauses.push(`added ${list(added)}`);
  if (!clauses.length) return null;
  return `You ${clauses.join(', and ')}.`;
}

/* ------------------------------------------------------------------ *
 * The kitchen as a whole
 * ------------------------------------------------------------------ */

/**
 * A quiet summary of everything cooked — for the progress screen, which is
 * explicit that it is not a scoreboard. These are facts about a kitchen, not
 * scores: how much has been cooked, how much of it was different, and when the
 * record starts. No targets, no streaks, nothing to break.
 */
export function kitchenMemory(state, now = new Date()) {
  const history = state?.history || [];
  const dated = history.filter(e => e.at && !Number.isNaN(Date.parse(e.at)));
  const distinct = new Set(history.map(e => e.id));
  const withNotes = history.filter(e => e.note && e.note.trim()).length;

  const oldest = dated.length
    ? dated.reduce((a, b) => (Date.parse(a.at) < Date.parse(b.at) ? a : b)).at
    : null;

  // The dish this kitchen returns to. A cook's actual favorite is the one they
  // make again, which is rarely the one they said they liked.
  const counts = new Map();
  for (const e of history) counts.set(e.id, (counts.get(e.id) || 0) + 1);
  let mostCooked = null;
  for (const [id, n] of counts) {
    if (n > 1 && (!mostCooked || n > mostCooked.times)) mostCooked = { id, times: n };
  }

  return {
    total: history.length,
    distinct: distinct.size,
    withNotes,
    since: oldest,
    sinceWords: oldest ? whenWords(oldest, now) : null,
    mostCooked
  };
}

/**
 * The dishes worth offering again: cooked before, liked or at least not
 * disliked, and not so recently that it would be the same week twice.
 */
export function worthRepeating(state, { after = 10, limit = 6, now = new Date() } = {}) {
  const cutoff = now.getTime() - after * DAY;
  const seen = new Set();
  const out = [];

  for (const entry of state?.history || []) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    if (state.recipeLikes?.[entry.id] === -1) continue;
    if (entry.again === -1) continue;
    if (entry.at && Date.parse(entry.at) > cutoff) continue;
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * How recently a dish was cooked, as a position in the log: 0 is the last thing
 * cooked, 1 the one before, and -1 never.
 *
 * This exists because the roll needs it and used to get it wrong. `history` was
 * a list of ids once and became a list of entries, and the call site kept
 * asking `history.indexOf(recipe.id)` — which quietly answered -1 forever, so
 * every dish looked equally fresh and the roll happily served Tuesday's dinner
 * again on Thursday.
 */
export function cookedRank(recipeId, state) {
  const history = state?.history || [];
  for (let i = 0; i < history.length; i++) if (history[i]?.id === recipeId) return i;
  return -1;
}

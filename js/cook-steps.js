/**
 * cook-steps.js — how much of what, at this exact moment.
 *
 * The failure this exists to stop: a recipe lists two tablespoons of olive oil,
 * step two says "heat the oil", step six says "stir in the rest of the oil off
 * the heat", and cook mode showed the same picture of a bottle both times. So
 * all of it goes in at step two, the finishing drizzle never happens, and the
 * dish is worse for a reason nobody can name. Same story with "half the
 * cilantro", "a splash of the broth", "reserve a cup of the pasta water".
 *
 * A recipe's ingredient list is a shopping document. What a cook needs at the
 * stove is the opposite: not "2 tbsp olive oil" once, but "1 tbsp — half of it"
 * now and "the other 1 tbsp" later. That is what this file works out.
 *
 * It reads the step's own words, because the words are already there and are
 * usually explicit: cooks write "half", "the rest", "2 of the 4 cloves". Where
 * the words say nothing and the ingredient is used only once, all of it goes in
 * and the panel says so plainly. Where they say nothing and it is used more than
 * once, the panel says it is split rather than inventing a fraction — a guess
 * stated as an amount is the exact error this is here to prevent.
 *
 * ERRERLabs — MIT licensed.
 */

import { formatQty } from './nutrition.js';

const TOO_GENERIC = new Set([
  'fresh', 'ground', 'large', 'small', 'whole', 'plain', 'dried', 'frozen',
  'canned', 'sauce', 'powder', 'extra', 'virgin', 'sodium', 'added', 'unsalted',
  'nonfat', 'light', 'sliced', 'chopped', 'style', 'mixed', 'baby', 'wheat',
  'free', 'part', 'skim', 'juice', 'leaves', 'seeds', 'grain', 'seasoning',
  // Preparation words. They describe what was done to a thing rather than
  // which thing it is, and several ingredient names contain one — "crushed
  // tomatoes" was claiming every step that said "crushed fennel seed".
  'crushed', 'minced', 'diced', 'grated', 'torn', 'toasted', 'drained',
  'rinsed', 'halved', 'thinly', 'roughly', 'finely', 'packed', 'divided',
  'shredded', 'cooked', 'peeled', 'trimmed', 'softened', 'melted', 'beaten'
]);

/**
 * The part of a name that identifies the thing, without the sales copy.
 *
 * "Crushed tomatoes, no salt added" is a can of tomatoes; the rest is a label
 * claim, and taking the word salt from it made every pinch of salt in every
 * recipe read as a pinch of canned tomatoes. Everything after the first comma,
 * and everything in parentheses, describes rather than identifies.
 */
const nameCore = (name) => String(name).toLowerCase().split(',')[0].replace(/\([^)]*\)/g, ' ');

function matchKeys(item) {
  const fromId = String(item.id).replace(/^ing\./, '').split('.');
  const fromName = nameCore(item.name).match(/[a-z]+/g) || [];
  const keys = new Set();
  // Three letters is enough when the word is one of the ingredient's own id
  // tokens, which are curated: "oil", "egg", "rye". Three-letter words pulled
  // out of a name are not — "red", "raw", "low" identify nothing.
  for (const w of fromId) if (w.length >= 3 && !TOO_GENERIC.has(w)) keys.add(w);
  for (const w of fromName) if (w.length >= 4 && !TOO_GENERIC.has(w)) keys.add(w);
  return [...keys].sort((a, b) => b.length - a.length);
}

/** Where in the sentence this ingredient is named, and by which word. */
function findMention(lower, keys) {
  let best = null;
  for (const key of keys) {
    const at = lower.indexOf(key);
    if (at === -1) continue;
    if (!best || at < best.at || (at === best.at && key.length > best.key.length)) best = { at, key };
  }
  return best;
}

/**
 * Which ingredient a mention actually refers to.
 *
 * "Tomato paste" and "crushed tomatoes" both answer to the word tomato, so a
 * step saying "fry the tomato paste" was crediting the can of tomatoes too, and
 * then showing a quantity for the wrong thing. Only ingredients claiming the
 * *same* words compete — an earlier version compared against everything in the
 * sentence, which let the onion take the carrot's mention purely for having a
 * longer name. The tie goes to whichever ingredient the words there describe
 * more completely: crushed tomatoes brings two of its words to "crushed
 * tomatoes" and one to "tomato paste".
 */
function claimAt(lower, item, keys, rivals) {
  const mine = findMention(lower, keys);
  if (!mine) return null;

  const window = lower.slice(Math.max(0, mine.at - 16), mine.at + mine.key.length + 16);
  const present = (ks) => ks.filter(k => window.includes(k)).length;
  const myScore = present(keys);

  for (const rival of rivals) {
    if (rival.item.id === item.id) continue;
    const theirs = findMention(lower, rival.keys);
    if (!theirs) continue;
    // Only a rival standing on the same words is a rival at all.
    const overlaps = theirs.at < mine.at + mine.key.length && mine.at < theirs.at + theirs.key.length;
    if (!overlaps) continue;
    const theirScore = present(rival.keys);
    if (theirScore > myScore) return null;
    if (theirScore === myScore && theirs.key.length > mine.key.length) return null;
    if (theirScore === myScore && theirs.key.length === mine.key.length
      && rival.item.name.length > item.name.length) return null;
  }
  return mine;
}

/**
 * The fractions cooks actually write.
 *
 * Ordered longest-first so "three quarters" is not read as "three". Each entry
 * is matched near the ingredient's own name, not anywhere in the sentence — a
 * step that says "half the onion" and also mentions garlic must not halve the
 * garlic too.
 */
const FRACTIONS = [
  [/\bthree[- ]quarters?\b/i, 0.75, 'three quarters'],
  [/\btwo[- ]thirds?\b/i, 2 / 3, 'two thirds'],
  [/\bone[- ]quarter\b|\ba quarter\b/i, 0.25, 'a quarter'],
  [/\bone[- ]third\b|\ba third\b/i, 1 / 3, 'a third'],
  [/\bhalf\b/i, 0.5, 'half'],
  [/\ba few\b/i, null, 'a few'],
  [/\ba pinch\b/i, null, 'a pinch'],
  [/\ba splash\b/i, null, 'a splash'],
  [/\ba handful\b/i, null, 'a handful'],
  [/\ba spoonful\b/i, null, 'a spoonful'],
  [/\ba drizzle\b/i, null, 'a drizzle']
];

/** The phrases that mean "whatever is left of it". */
const REST = /\b(the rest of|remaining|what(?:ever)?(?:'s| is) left|the other half|the last of)\b/i;

/** The phrases that mean "keep some back" — the one people get wrong. */
const RESERVE = /\b(reserve|set aside|save|keep back|hold back)\b/i;

/** An explicit amount pulled out of a larger quantity: "2 tbsp of the oil". */
const OF_THE = /(\d+(?:[.,]\d+)?|½|¼|¾|⅓|⅔|one|two|three|four)\s*(tablespoons?|tbsp|teaspoons?|tsp|cups?|cloves?|sprigs?|slices?|pieces?)?\s*of the\b/i;

const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

/**
 * The words that qualify a mention, which in English come immediately before
 * it and stop at the previous comma or conjunction.
 *
 * The first version read forty-six characters in both directions, which meant
 * "Add onion, carrot, celery and a pinch of salt" put a pinch of onion in the
 * pan. A modifier belongs to the noun it is attached to and to nothing else, so
 * the window ends at the punctuation that separates one item from the next.
 */
function contextAround(text, at, keyLength) {
  const before = text.slice(Math.max(0, at - 40), at);
  const cut = Math.max(
    before.lastIndexOf(','), before.lastIndexOf(';'), before.lastIndexOf('.'),
    before.lastIndexOf(' and '), before.lastIndexOf(' then ')
  );
  const near = cut === -1 ? before : before.slice(cut + 1);
  // A couple of words after, for "the oil, half of it" constructions — but cut
  // at the next separator too, or "celery and a pinch of salt" pinches the
  // celery.
  const after = text.slice(at, at + keyLength + 14);
  const stop = after.slice(keyLength).search(/[,;.]| and | then /);
  return `${near} ${stop === -1 ? after : after.slice(0, keyLength + stop)}`;
}

/**
 * What one step wants of one ingredient.
 *
 * Returns the share of the whole line, a label for it, and whether that is a
 * fact read off the sentence or an assumption the panel should own up to.
 */
function portionAt(text, claim, { usedTimes, seenBefore }) {
  const near = contextAround(String(text).toLowerCase(), claim.at, claim.key.length);

  if (REST.test(near)) {
    return { share: null, label: 'the rest of it', sure: true, kind: 'rest' };
  }

  const explicit = near.match(OF_THE);
  if (explicit) {
    const n = WORD_NUMBERS[explicit[1]] ?? Number(String(explicit[1]).replace(',', '.'));
    if (Number.isFinite(n)) {
      const unit = explicit[2] ? ` ${explicit[2].replace(/s$/, '')}` : '';
      return { share: null, label: `${trim(n)}${unit}`, sure: true, kind: 'amount' };
    }
  }

  for (const [re, share, label] of FRACTIONS) {
    if (re.test(near)) return { share, label, sure: true, kind: share == null ? 'vague' : 'fraction' };
  }

  if (RESERVE.test(near)) {
    return { share: null, label: 'keep some back', sure: true, kind: 'reserve' };
  }

  // Nothing in the words. If this is the only step that calls for it, it all
  // goes in; if it is not, say it is shared rather than pick a number.
  if (usedTimes <= 1) return { share: 1, label: 'all of it', sure: true, kind: 'all' };
  return {
    share: null,
    label: seenBefore ? 'the rest' : 'some now',
    detail: seenBefore
      ? 'the rest of it — some already went in earlier'
      : 'not all of it — this one comes back in a later step',
    sure: false,
    kind: 'split'
  };
}

const trim = (n) => (Math.abs(n - Math.round(n)) < 0.01 ? String(Math.round(n)) : String(Math.round(n * 100) / 100));

/**
 * Every ingredient each step calls for, with the amount for that step.
 *
 * `scale` is the household's serving multiplier, so the number on the screen is
 * the number to put in the pan rather than the number the recipe was written
 * for. That is the whole point: a cook halving a recipe should never be doing
 * arithmetic with wet hands.
 */
export function stepsWithAmounts(recipe, ingIndex, { scale = 1, lines = null } = {}) {
  const steps = recipe.steps || [];
  const source = lines || recipe.ingredients || [];

  const rivals = source
    .map(line => ({ line, item: ingIndex.get(line.ing) }))
    .filter(x => x.item)
    .map(x => ({ ...x, keys: matchKeys(x.item) }));

  // Settle every mention first, then count. Counting with a looser matcher than
  // the one that assigns the mentions is how "3 tbsp tomato paste" became "some
  // of it, the rest comes later" in a recipe that only uses it once: the count
  // saw the word tomato in a later step about canned tomatoes and the claim did
  // not. One pass, one answer.
  const claims = steps.map(text => {
    const lower = text.toLowerCase();
    const found = new Map();
    for (const r of rivals) {
      const claim = claimAt(lower, r.item, r.keys, rivals);
      if (claim) found.set(r.line.ing, claim);
    }
    return found;
  });

  const uses = new Map();
  for (const r of rivals) {
    uses.set(r.line.ing, claims.filter(c => c.has(r.line.ing)).length);
  }

  const seen = new Set();
  return steps.map((text, index) => {
    const wants = [];
    for (const r of rivals) {
      const claim = claims[index].get(r.line.ing);
      if (!claim) continue;
      const portion = portionAt(text, claim, {
        usedTimes: uses.get(r.line.ing) || 0,
        seenBefore: seen.has(r.line.ing)
      });
      seen.add(r.line.ing);

      const line = r.line;
      const full = formatQty(line.qty * scale, line.unit);
      const amount = portion.share != null && portion.share !== 1
        ? formatQty(line.qty * scale * portion.share, line.unit)
        : portion.share === 1 ? full : null;

      wants.push({
        line,
        item: r.item,
        ...portion,
        amount,
        full,
        // Worth a warning triangle: an amount the cook has to divide themselves,
        // or one where using the whole thing would be the wrong move.
        careful: portion.kind !== 'all'
      });
    }
    return { index, text, wants };
  });
}

/**
 * The ingredients a step calls for, for the step currently on screen.
 * Thin wrapper so a view does not have to rebuild the whole recipe to ask.
 */
export function wantsForStep(recipe, ingIndex, index, opts = {}) {
  return stepsWithAmounts(recipe, ingIndex, opts)[index]?.wants || [];
}

/** Which ingredients have been called for by the time you reach this step. */
export function progressAt(recipe, ingIndex, index, opts = {}) {
  const all = stepsWithAmounts(recipe, ingIndex, opts);
  const done = new Set();
  const now = new Set();
  all.forEach((step, i) => {
    for (const w of step.wants) {
      if (i < index) done.add(w.line.ing);
      else if (i === index) now.add(w.line.ing);
    }
  });
  // Something going in again right now reads as "now" rather than "done" — the
  // minimap gives each row one state, and the useful one is the live one.
  for (const id of now) done.delete(id);
  return { done, now };
}

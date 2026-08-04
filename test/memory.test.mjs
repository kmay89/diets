/**
 * Tests for what the kitchen remembers.
 *
 * Two kinds of failure matter here and they are opposites. The first is
 * forgetting: a record that silently drops what somebody wrote, or a swap
 * snapshot that goes stale and reports a change made in June as though it were
 * made in March. The second is remembering wrong out loud — "you used
 * ing.feta", "three weeks ago" for something cooked yesterday — which is worse
 * than saying nothing, because a memory you have caught being wrong once is a
 * memory you stop trusting entirely.
 *
 * The roll's recency test is here rather than with the roll, because the bug it
 * covers was not a roll bug. It was a memory bug: `history` stopped being a list
 * of ids and became a list of entries, the roll kept asking `indexOf(id)`, and
 * the answer -1 is a perfectly plausible one — so for a long time every dish
 * scored as though it had never been cooked and Tuesday's dinner came back
 * around on Thursday.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  cooksOf, timesCooked, lastCook, lastNote, notesOn, whenWords, timesWords,
  changesIn, whatHappened, kitchenMemory, worthRepeating, cookedRank
} from '../js/memory.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const items = JSON.parse(readFileSync(join(root, 'data/ingredients.json'), 'utf8')).items;
const ingIndex = new Map(items.map(i => [i.id, i]));

const at = (iso) => new Date(iso).toISOString();
const state = (history, extra = {}) => ({ history, recipeLikes: {}, ...extra });

/* ------------------------------------------------------------------ *
 * Keeping the record
 * ------------------------------------------------------------------ */

test('a dish cooked twice is two cooks, not one moved to the top', () => {
  // Otherwise the record quietly rewrites itself every time somebody repeats a
  // favorite, and "we make this every winter" becomes "we made this once".
  const s = state([
    { id: 'rec.a', at: at('2026-03-01') },
    { id: 'rec.b', at: at('2026-02-20') },
    { id: 'rec.a', at: at('2026-01-04') }
  ]);
  assert.equal(timesCooked('rec.a', s), 2);
  assert.equal(cooksOf('rec.a', s).length, 2);
  assert.equal(lastCook('rec.a', s).at, at('2026-03-01'), 'the newest cook is not first');
});

test('a note survives being buried under later cooks', () => {
  // The note is the only thing in the log the app could not have worked out on
  // its own, so it is worth surfacing from four cooks back.
  const s = state([
    { id: 'rec.a', at: at('2026-03-01') },
    { id: 'rec.a', at: at('2026-02-01') },
    { id: 'rec.a', at: at('2026-01-01'), note: 'Double the garlic.' }
  ]);
  assert.equal(lastNote('rec.a', s).note, 'Double the garlic.');
  assert.equal(notesOn('rec.a', s).length, 1);
});

test('the entries from before the log kept dates still count', () => {
  // Old records are real cooks. They just cannot answer a question about a
  // window of time, and must not be thrown away for it.
  const s = state([{ id: 'rec.a', at: null }, { id: 'rec.a', at: at('2026-03-01') }]);
  assert.equal(timesCooked('rec.a', s), 2);
  assert.equal(whenWords(null), 'at some point');
});

/* ------------------------------------------------------------------ *
 * Saying it out loud
 * ------------------------------------------------------------------ */

test('how long ago is said the way somebody would say it', () => {
  const now = new Date('2026-08-04T19:00:00');
  const ago = (days, h = 12) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    d.setHours(h, 0, 0, 0);
    return d.toISOString();
  };
  assert.equal(whenWords(ago(0), now), 'today');
  assert.equal(whenWords(ago(1), now), 'yesterday');
  assert.match(whenWords(ago(3), now), /^last /);
  assert.equal(whenWords(ago(9), now), 'last week');
  assert.equal(whenWords(ago(20), now), '3 weeks ago');
  // Past a month it becomes a date, because nobody converts "eleven weeks ago".
  assert.match(whenWords(ago(70), now), /[A-Za-z]+ \d+/);
  // And a different year says which one.
  assert.match(whenWords('2024-05-02T12:00:00', now), /2024/);
});

test('small counts are words and large ones are numbers', () => {
  assert.equal(timesWords(1), 'once');
  assert.equal(timesWords(2), 'twice');
  assert.equal(timesWords(3), 'three times');
  assert.equal(timesWords(24), '24 times');
});

test('what you did is said in ingredient names, never in ids', () => {
  // "You used ing.feta instead of ing.ricotta" is worse than saying nothing:
  // it is the app visibly failing to speak English on a page about dinner.
  const entry = {
    id: 'rec.a',
    at: at('2026-03-01'),
    swaps: { 'ing.cheese.feta': 'ing.ricotta.partskim' },
    added: [{ ing: 'ing.lemon' }]
  };
  const said = whatHappened(entry, ingIndex);
  assert.ok(said, 'a cook with a swap and an addition said nothing');
  assert.doesNotMatch(said, /ing\./, said);
  assert.match(said, /instead of/);
  assert.match(said, /added/);
  // Two different verbs. Folded into one list this reads "you used added
  // lemon", which is the sentence that makes somebody distrust the whole page.
  assert.doesNotMatch(said, /used added/);
});

test('a change naming an ingredient that no longer exists is dropped, not printed', () => {
  const entry = { id: 'rec.a', swaps: { 'ing.gone': 'ing.alsogone' }, added: [{ ing: 'ing.vanished' }] };
  assert.deepEqual(changesIn(entry, ingIndex), { swapped: [], added: [] });
  assert.equal(whatHappened(entry, ingIndex), null,
    'the block would have rendered an empty sentence');
});

test('a cook with nothing unusual about it says nothing about it', () => {
  assert.equal(whatHappened({ id: 'rec.a', at: at('2026-03-01') }, ingIndex), null);
});

/* ------------------------------------------------------------------ *
 * The kitchen as a whole
 * ------------------------------------------------------------------ */

test('the dish you keep making is the one you made more than once', () => {
  // A kitchen where everything was cooked exactly once has no favorite, and
  // announcing an arbitrary one would be the app inventing a fact about
  // somebody's taste.
  const once = state([{ id: 'rec.a', at: at('2026-03-01') }, { id: 'rec.b', at: at('2026-02-01') }]);
  assert.equal(kitchenMemory(once).mostCooked, null);

  const twice = state([...once.history, { id: 'rec.b', at: at('2026-01-01') }]);
  assert.deepEqual(kitchenMemory(twice).mostCooked, { id: 'rec.b', times: 2 });
});

test('the record knows how far back it goes', () => {
  const m = kitchenMemory(state([
    { id: 'rec.a', at: at('2026-03-01') },
    { id: 'rec.b', at: at('2025-11-02') }
  ]), new Date('2026-08-04'));
  assert.equal(m.total, 2);
  assert.equal(m.distinct, 2);
  assert.match(m.sinceWords, /November/);
});

test('an empty kitchen reports empty rather than throwing', () => {
  const m = kitchenMemory({});
  assert.equal(m.total, 0);
  assert.equal(m.since, null);
  assert.equal(m.mostCooked, null);
});

/* ------------------------------------------------------------------ *
 * Offering something again
 * ------------------------------------------------------------------ */

test('what to cook again skips last night and anything you said no to', () => {
  const now = new Date('2026-08-04T18:00:00Z');
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();
  const s = state([
    { id: 'rec.lastnight', at: daysAgo(1) },
    { id: 'rec.nope', at: daysAgo(30), again: -1 },
    { id: 'rec.hidden', at: daysAgo(40) },
    { id: 'rec.good', at: daysAgo(21) }
  ], { recipeLikes: { 'rec.hidden': -1 } });

  const ids = worthRepeating(s, { now }).map(e => e.id);
  assert.ok(!ids.includes('rec.lastnight'), 'offered last night again');
  assert.ok(!ids.includes('rec.nope'), 'offered a dish the kitchen said no to');
  assert.ok(!ids.includes('rec.hidden'), 'offered a hidden recipe');
  assert.deepEqual(ids, ['rec.good']);
});

test('a dish is offered once however many times it was cooked', () => {
  const now = new Date('2026-08-04T18:00:00Z');
  const old = new Date(now.getTime() - 40 * 86400000).toISOString();
  const s = state([{ id: 'rec.a', at: old }, { id: 'rec.a', at: old }, { id: 'rec.b', at: old }]);
  assert.deepEqual(worthRepeating(s, { now }).map(e => e.id), ['rec.a', 'rec.b']);
});

/* ------------------------------------------------------------------ *
 * The roll's memory
 * ------------------------------------------------------------------ */

test('how recently a dish was cooked is a position, and never is -1', () => {
  const s = state([
    { id: 'rec.tuesday', at: at('2026-08-03') },
    { id: 'rec.monday', at: at('2026-08-02') }
  ]);
  assert.equal(cookedRank('rec.tuesday', s), 0);
  assert.equal(cookedRank('rec.monday', s), 1);
  assert.equal(cookedRank('rec.never', s), -1);
});

test('the roll is told about a dish cooked last night', async () => {
  // The regression this file exists for. `history.indexOf(recipe.id)` answered
  // -1 for every dish once entries became objects, so the recency penalty never
  // fired and the dice cheerfully re-dealt what was just eaten.
  globalThis.fetch = async (u) => ({
    ok: true,
    json: async () => JSON.parse(readFileSync(join(root, String(u).replace(/^\.?\//, '')), 'utf8'))
  });
  const { loadAll, getDb } = await import('../js/data.js');
  const { scoreRecipe } = await import('../js/roll.js');
  await loadAll();
  const { recipes } = getDb();
  const dish = recipes.find(r => r.course === 'dinner');

  const base = {
    prefs: { heartMode: true, maxActiveMin: 30, seasonAware: false, preferPantry: false },
    likes: {}, pantry: {}, recipeLikes: {}, household: { members: [] }, history: []
  };
  const fresh = scoreRecipe(dish, base);
  const cookedLastNight = scoreRecipe(dish, { ...base, history: [{ id: dish.id, at: at('2026-08-03') }] });

  assert.ok(cookedLastNight.parts.recency < fresh.parts.recency,
    'a dish cooked last night scored no worse than one never cooked');
  assert.ok(cookedLastNight.total < fresh.total);
});

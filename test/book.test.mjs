/**
 * Tests for the household's own cookbook.
 *
 * What has to be true here is that the book describes what was cooked rather
 * than what is currently configured. Those two drift apart the moment somebody
 * changes a swap, and a book that quietly rewrites its own history is worse
 * than no book — it is a record you cannot use to settle an argument about how
 * you made it last time.
 *
 * The export gets the same attention as the screen. A cookbook you cannot get
 * out of the software is not yours, it is the software's, so the text version
 * is checked for the parts nobody else has: your version and your notes.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildBook, bookAsText, OWNED_AT } from '../js/book.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const items = JSON.parse(readFileSync(join(root, 'data/ingredients.json'), 'utf8')).items;
const ingIndex = new Map(items.map(i => [i.id, i]));

const recipeIndex = new Map([
  ['rec.a', { id: 'rec.a', title: 'Bolognese', ingredients: [] }],
  ['rec.b', { id: 'rec.b', title: 'Shakshuka', ingredients: [] }],
  ['rec.c', { id: 'rec.c', title: 'Tacos', ingredients: [] }]
]);

const at = (days) => new Date(Date.now() - days * 86400000).toISOString();
const state = (history, extra = {}) => ({ history, recipeLikes: {}, ...extra });

test('one row per dish, ordered by what was cooked most recently', () => {
  const book = buildBook(state([
    { id: 'rec.b', at: at(2) },
    { id: 'rec.a', at: at(9) },
    { id: 'rec.a', at: at(40) }
  ]), recipeIndex);

  assert.deepEqual(book.entries.map(e => e.recipe.id), ['rec.b', 'rec.a']);
  assert.equal(book.entries[1].times, 2);
  assert.equal(book.total, 2);
  assert.equal(book.cooks, 3, 'three cooks of two dishes were counted as two');
});

test('a dish moves shelf by being cooked, not by being chosen', () => {
  // No "add to my book" button anywhere: a button somebody has to remember to
  // press produces a list of intentions rather than a list of dinners.
  const nearly = Array.from({ length: OWNED_AT - 1 }, (_, i) => ({ id: 'rec.a', at: at(i * 7) }));
  assert.equal(buildBook(state(nearly), recipeIndex).owned.length, 0);

  const enough = [...nearly, { id: 'rec.a', at: at(60) }];
  const book = buildBook(state(enough), recipeIndex);
  assert.equal(book.owned.length, 1);
  assert.equal(book.cooked.length, 0, 'a dish appeared on both shelves at once');
});

test('your version is the one you cooked, not the one you have configured now', () => {
  // The whole reason the cook log snapshots swaps. A household that swapped the
  // feta out in June must not have its March entry rewritten to match.
  const book = buildBook(state([
    { id: 'rec.a', at: at(5), swaps: { 'ing.cheese.feta': 'ing.ricotta.partskim' } },
    { id: 'rec.a', at: at(90) }
  ], { swaps: { 'rec.a': { 'ing.cheese.feta': 'ing.cheese.cheddar' } } }), recipeIndex);

  assert.deepEqual(book.entries[0].swaps, { 'ing.cheese.feta': 'ing.ricotta.partskim' },
    'the book read the current settings instead of the cook');
});

test('every note on a dish is kept, newest first', () => {
  const book = buildBook(state([
    { id: 'rec.a', at: at(2), note: 'Double the garlic.' },
    { id: 'rec.a', at: at(30) },
    { id: 'rec.a', at: at(60), note: 'Too salty.' }
  ]), recipeIndex);

  assert.deepEqual(book.entries[0].notes.map(n => n.note), ['Double the garlic.', 'Too salty.']);
  assert.equal(book.noted.length, 1);
});

test('a cook of a recipe that has left the collection does not become a blank row', () => {
  const book = buildBook(state([{ id: 'rec.gone', at: at(3) }, { id: 'rec.a', at: at(4) }]), recipeIndex);
  assert.deepEqual(book.entries.map(e => e.recipe.id), ['rec.a']);
  assert.equal(book.cooks, 1);
});

test('an empty kitchen produces an empty book rather than an error', () => {
  const book = buildBook({}, recipeIndex);
  assert.equal(book.total, 0);
  assert.equal(book.owned.length, 0);
  assert.equal(book.entries.length, 0);
});

/* ------------------------------------------------------------------ *
 * Getting it out
 * ------------------------------------------------------------------ */

test('the export carries the parts nobody else has', () => {
  // The recipes are still in the app. What is unique to this file is the
  // version and the notes, and an export missing those is a table of contents.
  const book = buildBook(state([
    {
      id: 'rec.a', at: at(4), servings: 6,
      swaps: { 'ing.cheese.feta': 'ing.ricotta.partskim' },
      added: [{ ing: 'ing.lemon' }],
      note: 'Double the garlic.'
    },
    { id: 'rec.a', at: at(20) },
    { id: 'rec.a', at: at(50) },
    { id: 'rec.b', at: at(9) }
  ]), recipeIndex);

  const text = bookAsText(book, ingIndex, { title: 'Our cookbook' });
  assert.match(text, /# Our cookbook/);
  assert.match(text, /## Dishes you make/);
  assert.match(text, /## Also cooked/);
  assert.match(text, /Bolognese/);
  assert.match(text, /part-skim ricotta instead of feta/i);
  assert.match(text, /Added: lemon/);
  assert.match(text, /Double the garlic\./);
  assert.doesNotMatch(text, /ing\./, 'an ingredient id leaked into something a person reads');
});

test('nothing in the book says "last last"', () => {
  // whenWords already carries its own preposition — "last Friday", "3 weeks
  // ago" — so anything putting "last" in front of it doubles up. It is a small
  // wrongness that appears everywhere at once and reads as carelessness.
  const book = buildBook(state([
    { id: 'rec.a', at: at(3) },
    { id: 'rec.b', at: at(40) }
  ]), recipeIndex);
  const text = bookAsText(book, ingIndex);
  assert.doesNotMatch(text, /\blast last\b/);
  for (const entry of book.entries) {
    assert.doesNotMatch(`made ${entry.lastWords}`, /\bmade last week ago\b/);
  }
});

test('an export with no ingredient index still produces readable text', () => {
  // Export is the last thing that should ever throw: it is what somebody
  // reaches for when they are leaving, or worried about losing everything.
  const book = buildBook(state([{ id: 'rec.a', at: at(3), note: 'Keep.' }]), recipeIndex);
  const text = bookAsText(book, undefined);
  assert.match(text, /Bolognese/);
  assert.match(text, /Keep\./);
});

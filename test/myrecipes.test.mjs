/**
 * Tests for the recipes you wrote.
 *
 * The design rests on one claim: a recipe somebody made here is not a
 * second-class kind of recipe, it is the same shape in the same index, and that
 * is what gets it the flavor panel, cook mode, the diagram and the nutrition
 * without a single one of those being special-cased.
 *
 * A claim like that is only true while the shape actually matches, and it will
 * stop being true the first time a field is left off — not loudly, but as a
 * `.length` of undefined three views away, in whichever screen nobody opened
 * with a user recipe. So what is checked here is the contract: every field the
 * collection carries is present, and anything that cannot honor it is refused
 * outright rather than saved half-built.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RECIPE_FILES } from '../tools/recipe-files.mjs';

globalThis.localStorage ??= {
  _v: {}, getItem(k) { return this._v[k] ?? null; },
  setItem(k, v) { this._v[k] = String(v); }, removeItem(k) { delete this._v[k]; }
};

const { toRecipe, idFor, isMine, whatIsMissing, canSave, MINE } =
  await import('../js/myrecipes.js');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const collection = RECIPE_FILES.flatMap(f => read(f).recipes);

const draft = (over = {}) => ({
  title: "Mom's Chili",
  ingredients: [{ ing: 'ing.onion.yellow', qty: 1, unit: 'each', prep: 'diced' }],
  steps: ['Cook the onion 8 minutes until soft.'],
  ...over
});

test('a recipe written here carries every field the collection carries', () => {
  // The claim the whole feature rests on. A field left off is not a blank on a
  // screen, it is an exception in whichever view nobody tried yet.
  const mine = toRecipe(draft());
  const theirs = collection[0];
  const required = ['id', 'title', 'blurb', 'course', 'cuisine', 'difficulty',
    'servings', 'activeMin', 'totalMin', 'tags', 'ingredients', 'steps'];

  for (const key of required) {
    assert.ok(key in theirs, `the collection stopped carrying ${key}`);
    assert.ok(mine[key] != null, `a written recipe has no ${key}`);
    assert.equal(Array.isArray(mine[key]), Array.isArray(theirs[key]),
      `${key} is a different kind of thing than the collection's`);
  }
});

test('an ingredient line matches the collection\'s line shape exactly', () => {
  const line = toRecipe(draft()).ingredients[0];
  assert.deepEqual(Object.keys(line).sort(), ['ing', 'prep', 'qty', 'unit']);
  assert.equal(typeof line.qty, 'number');
  assert.equal(typeof line.ing, 'string');
});

test('a half-built draft is refused rather than saved as an empty page', () => {
  // A recipe with no steps in the index is a page that opens to nothing, and a
  // cook-mode button that leads to a blank screen.
  assert.equal(toRecipe(draft({ title: '' })), null);
  assert.equal(toRecipe(draft({ ingredients: [] })), null);
  assert.equal(toRecipe(draft({ steps: [] })), null);
  assert.equal(toRecipe(null), null);
  assert.equal(canSave(draft()), true);
});

test('a line with no ingredient behind it is dropped from the saved recipe', () => {
  // It is still on screen in the builder as something to finish — but saved, it
  // would be a line the nutrition and the shopping list silently cannot see.
  const r = toRecipe(draft({
    ingredients: [
      { ing: 'ing.onion.yellow', qty: 1, unit: 'each' },
      { name: 'grandma\'s spice mix', qty: 1, unit: 'tbsp' }
    ]
  }));
  assert.equal(r.ingredients.length, 1);
});

test('ids are namespaced, so nothing can collide with the collection', () => {
  const id = toRecipe(draft()).id;
  assert.ok(id.startsWith(MINE));
  assert.ok(isMine(id));
  assert.ok(!collection.some(r => r.id === id));
});

test('two recipes with the same name do not overwrite each other', () => {
  // "Chili" is a title two people in one household will both reach for, and the
  // second one silently replacing the first is a lost recipe with no message.
  const first = idFor('Chili');
  const second = idFor('Chili', new Set([first]));
  assert.notEqual(first, second);
});

test('editing keeps the id, so a saved recipe is updated and not duplicated', () => {
  const original = toRecipe(draft());
  const edited = toRecipe({ ...draft({ title: 'Renamed' }), id: original.id });
  assert.equal(edited.id, original.id);
});

test('times are clamped rather than trusted, and total is never under active', () => {
  // A typo of 900 for 90 would put a recipe past every time filter in the app.
  const r = toRecipe(draft({ activeMin: 5, totalMin: 2 }));
  assert.ok(r.totalMin >= r.activeMin, 'a dish that finishes before you start it');
  // Zero servings clamps to one rather than to the default: somebody typing 0
  // meant something small, and quietly making it four is a different dinner.
  assert.equal(toRecipe(draft({ servings: 0 })).servings, 1);
  assert.equal(toRecipe(draft({ servings: 9999 })).servings, 40);
});

test('an unknown course or difficulty falls back rather than leaking through', () => {
  // These are matched against elsewhere with ===; an unexpected value does not
  // error, it just quietly stops the recipe appearing in a roll.
  assert.equal(toRecipe(draft({ course: 'brunchish' })).course, 'dinner');
  assert.equal(toRecipe(draft({ difficulty: 'gruelling' })).difficulty, 'easy');
  assert.equal(toRecipe(draft({ course: 'dessert' })).course, 'dessert');
});

test('what is missing is said as consequence, not as a scolding', () => {
  const gaps = whatIsMissing({ title: '', ingredients: [], steps: [] });
  assert.equal(gaps.length, 3);
  for (const gap of gaps) {
    assert.ok(gap.says.length > 20, `${gap.field} says nothing useful`);
    assert.doesNotMatch(gap.says, /required|invalid|must |error/i,
      `${gap.field} reads like a form validator rather than an explanation`);
  }
});

test('an unmatched line is reported as a consequence for the nutrition', () => {
  const gaps = whatIsMissing(draft({
    ingredients: [{ ing: 'ing.onion.yellow', qty: 1 }, { name: 'mystery', qty: 1 }]
  }));
  const unmatched = gaps.find(g => g.field === 'unmatched');
  assert.ok(unmatched, 'an unmatched line was not mentioned at all');
  assert.match(unmatched.says, /nutrition|list/);
});

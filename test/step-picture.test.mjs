/**
 * step-picture.test.mjs — the wordless step.
 *
 * The rule this file exists to defend: a picture is a second way of saying what
 * the sentence says, and one that says something *different* is worse than no
 * picture, because there is no way for a cook to tell which of the two is wrong.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stepPicture, pictureWords, worthPicturing, allActions, actionFor } from '../js/step-picture.js';
import { ingredientsIn } from '../js/recipe-table.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const recipes = read('data/recipes.index.json').parts
  .map(p => read(p.file)).flatMap(p => p.recipes);
const ingIndex = new Map(read('data/ingredients.json').items.map(i => [i.id, i]));
const byId = new Map(recipes.map(r => [r.id, r]));

/* ------------------------------------------------------------------ *
 * Matching the right things
 * ------------------------------------------------------------------ */

test('a key shared by two ingredients identifies neither', () => {
  // "Crushed tomatoes, no salt added" carries the key "salt", so every step
  // saying "a pinch of salt" claimed the tomatoes were going in — putting a can
  // of tomatoes in the picture of every step of the bolognese, including the
  // one where you soften the onion.
  const recipe = byId.get('rec.lentil-bolognese');
  assert.ok(recipe, 'fixture recipe is still in the collection');

  const first = ingredientsIn(recipe.steps[0], recipe, ingIndex).map(x => x.item.name);
  assert.ok(!first.some(n => /tomato/i.test(n)),
    `step 1 softens onion and celery, and claimed: ${first.join(', ')}`);
});

test('how a thing was cut does not identify what it is', () => {
  // "crushed fennel seed" pulled in "Crushed tomatoes".
  const recipe = byId.get('rec.lentil-bolognese');
  const second = ingredientsIn(recipe.steps[1], recipe, ingIndex).map(x => x.item.name);
  assert.ok(!second.some(n => /tomato/i.test(n)), second.join(', '));
  assert.ok(second.some(n => /fennel/i.test(n)), `fennel should still be found: ${second.join(', ')}`);
});

/* ------------------------------------------------------------------ *
 * Saying the same thing as the sentence
 * ------------------------------------------------------------------ */

test('the picture and the timeline never disagree about a step', () => {
  // "Bring to a simmer, cover, cook 30 minutes" drew a splash of water, because
  // the action came from the first verb while the schedule came from the one
  // that owned the clock. Both read the same verb now.
  const pic = stepPicture(
    'Add lentils and broth. Bring to a simmer, cover partway, and cook 30-35 minutes until tender.',
    { ingredients: [] }, ingIndex);
  assert.equal(pic.action.id, 'low', `drew "${pic.action.name}" for half an hour of simmering`);
  assert.equal(pic.minutes, 30);
});

test('"cook" is read as heat or simmer depending on how long', () => {
  const quick = stepPicture('Cook 60 seconds until fragrant.', { ingredients: [] }, ingIndex);
  const slow = stepPicture('Cook 30 minutes, covered, until tender.', { ingredients: [] }, ingIndex);
  assert.equal(quick.action.id, 'heat', 'a minute of blooming spices is not a simmer');
  assert.equal(slow.action.id, 'low');
});

test('every picture can be written down', () => {
  // A row of icons with no text alternative is a decoration at best and a
  // locked door at worst. If it cannot be said, it was not saying anything.
  for (const r of recipes) {
    for (const s of r.steps || []) {
      const pic = stepPicture(s, r, ingIndex);
      if (!worthPicturing(pic)) continue;
      const words = pictureWords(pic);
      assert.ok(words.length > 2, `${r.id}: empty caption`);
      assert.doesNotMatch(words, /undefined|NaN|\[object/, `${r.id}: "${words}"`);
      assert.doesNotMatch(words, /\b1 minutes\b/, `${r.id}: "${words}"`);
    }
  }
});

/* ------------------------------------------------------------------ *
 * The vocabulary
 * ------------------------------------------------------------------ */

test('the vocabulary is small enough to be read rather than learned', () => {
  assert.ok(allActions().length <= 12, 'more than twelve glyphs is a second language');
});

test('every action carries a name, not only a glyph', () => {
  // An unlabeled icon language is a quiz placed between a cook and their dinner.
  for (const a of allActions()) {
    assert.ok(a.glyph && a.glyph.length <= 4, `${a.id} has no glyph`);
    assert.ok(a.name && a.name.length >= 3, `${a.id} has no readable name`);
  }
});

test('an unknown verb falls back rather than throwing', () => {
  const pic = stepPicture('Spatchcock the thing.', { ingredients: [] }, ingIndex);
  assert.ok(pic.action, 'no action at all');
  assert.equal(worthPicturing(pic), false, 'a picture of nothing should not be drawn');
});

test('actionFor never returns undefined', () => {
  for (const verb of ['Chop', 'Bake', 'Then', 'NotAVerb', '', null]) {
    assert.ok(actionFor(verb), `no action for ${verb}`);
  }
});

/* ------------------------------------------------------------------ *
 * Across the collection
 * ------------------------------------------------------------------ */

test('most steps get a picture', () => {
  let drawable = 0;
  let total = 0;
  for (const r of recipes) {
    for (const s of r.steps || []) {
      total++;
      if (worthPicturing(stepPicture(s, r, ingIndex))) drawable++;
    }
  }
  assert.ok(drawable / total >= 0.7, `only ${drawable} of ${total} steps draw`);
});

test('no picture claims more things than the step actually names', () => {
  for (const r of recipes) {
    for (const s of r.steps || []) {
      const pic = stepPicture(s, r, ingIndex);
      const named = ingredientsIn(s, r, ingIndex);
      assert.equal(pic.things.length + pic.more, named.length,
        `${r.id}: picture shows ${pic.things.length}+${pic.more}, step names ${named.length}`);
    }
  }
});

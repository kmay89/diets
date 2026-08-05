/**
 * cook-moments.test.mjs — the table advice, placed inside the method.
 *
 * The failure this guards against is the one the feature exists to fix: a pile
 * of instructions landing on one step, which is the chore list it replaced with
 * a new address. Everything here is about placement and restraint rather than
 * content.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { momentsFor, momentLede } from '../js/cook-moments.js';
import { timeline } from '../js/timeline.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const table = read('data/table.json');
const recipes = read('data/recipes.index.json').parts
  .map(p => read(p.file)).flatMap(p => p.recipes);

const momentsOf = (recipe) => momentsFor(recipe, table);

/* ------------------------------------------------------------------ *
 * The data this rests on
 * ------------------------------------------------------------------ */

test('every mark says which part of the evening it belongs to', () => {
  for (const mark of table.timeline.marks) {
    assert.ok(['ahead', 'end', 'plan'].includes(mark.phase),
      `${mark.id} has phase ${JSON.stringify(mark.phase)}`);
  }
});

test('something is offered ahead and something at the end', () => {
  const phases = new Set(table.timeline.marks.map(m => m.phase));
  assert.ok(phases.has('ahead') && phases.has('end') && phases.has('plan'));
});

/* ------------------------------------------------------------------ *
 * Restraint
 * ------------------------------------------------------------------ */

test('no step is given more than two things to do', () => {
  // The first version put set-the-table, warm-the-plates, taste-it,
  // the-last-thirty-seconds and sit-down all on one thirty-minute simmer.
  for (const recipe of recipes) {
    for (const moment of momentsOf(recipe)) {
      assert.ok(moment.marks.length <= 2,
        `${recipe.id} step ${moment.step + 1}: ${moment.marks.map(m => m.title).join(', ')}`);
    }
  }
});

test('a mark is never offered twice in the same recipe', () => {
  for (const recipe of recipes) {
    const seen = momentsOf(recipe).flatMap(m => m.marks.map(x => x.id));
    assert.equal(new Set(seen).size, seen.length, recipe.id);
  }
});

test('nothing that describes the whole evening is pinned to a step', () => {
  // "Start here" and "Sit down" are facts about the shape of the night. Clipped
  // to a step in the middle of a sauce they are nonsense — and the countdown
  // still shows them, which is where they belong.
  for (const recipe of recipes) {
    for (const moment of momentsOf(recipe)) {
      for (const mark of moment.marks) {
        assert.notEqual(mark.phase, 'plan', `${recipe.id}: ${mark.id} landed on step ${moment.step + 1}`);
      }
    }
  }
});

/* ------------------------------------------------------------------ *
 * Placement
 * ------------------------------------------------------------------ */

test('advice to leave the pot only lands where there is time to', () => {
  // "You have 3 free minutes, go and lay the table" is not help, it is a
  // stopwatch. Anything offered during the cooking sits in a real window.
  for (const recipe of recipes) {
    for (const moment of momentsOf(recipe)) {
      if (!moment.window) continue;
      assert.ok(moment.freeMin >= 8,
        `${recipe.id} offers ${moment.marks.length} things in a ${moment.freeMin} minute gap`);
    }
  }
});

test('what happens to the food happens at the end of the method', () => {
  for (const recipe of recipes) {
    const tl = timeline(recipe);
    for (const moment of momentsOf(recipe)) {
      if (moment.window) continue;
      assert.equal(moment.step, tl.blocks.length - 1,
        `${recipe.id}: an off-the-heat note on step ${moment.step + 1} of ${tl.blocks.length}`);
    }
  }
});

test('every placement points at a step the recipe actually has', () => {
  for (const recipe of recipes) {
    for (const moment of momentsOf(recipe)) {
      assert.ok(moment.step >= 0 && moment.step < recipe.steps.length,
        `${recipe.id}: step ${moment.step} of ${recipe.steps.length}`);
    }
  }
});

test('moments come out in the order they happen', () => {
  for (const recipe of recipes) {
    const steps = momentsOf(recipe).map(m => m.step);
    assert.deepEqual(steps, [...steps].sort((a, b) => a - b), recipe.id);
  }
});

/* ------------------------------------------------------------------ *
 * Tone
 * ------------------------------------------------------------------ */

test('the lede states the fact before it suggests anything', () => {
  // This is the whole difference between an observation and an order. "Set the
  // table now" is a chore; "you have about 30 minutes here" is a reason.
  const said = new Set();
  for (const recipe of recipes) {
    for (const moment of momentsOf(recipe)) said.add(momentLede(moment));
  }
  assert.ok(said.size > 1, 'every moment says the same thing');
  for (const line of said) {
    assert.doesNotMatch(line, /\byou (?:should|must|need to)\b|\bdon't forget\b|\bremember to\b/i, line);
    assert.ok(line.length > 12, line);
  }
});

/* ------------------------------------------------------------------ *
 * Reach
 * ------------------------------------------------------------------ */

test('most of the collection gets something', () => {
  const withAny = recipes.filter(r => momentsOf(r).length).length;
  assert.ok(withAny >= 150, `only ${withAny} of ${recipes.length} recipes place anything`);
});

test('a recipe with no schedule is left alone rather than guessed at', () => {
  assert.deepEqual(momentsFor({ steps: ['Mix it.', 'Eat it.'], totalMin: 2 }, table), []);
  assert.deepEqual(momentsFor({ steps: [] }, table), []);
  assert.deepEqual(momentsFor({ steps: ['Bake 40 minutes.'] }, null), []);
});

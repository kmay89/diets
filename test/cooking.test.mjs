/**
 * Tests for the three things cook mode has to get right: how much of what,
 * where you are, and timers that outlive the screen.
 *
 * The dangerous failure is the confident wrong amount. If the parser decides a
 * step wants all of the olive oil when the sentence said half, nothing errors —
 * a cook pours twice what they should and the dish is worse for a reason nobody
 * can name. So the words that carry a portion are pinned down by name, and the
 * cases where the app does not know are required to say so rather than guess.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RECIPE_FILES } from '../tools/recipe-files.mjs';
import { stepsWithAmounts, progressAt } from '../js/cook-steps.js';
import { recipeTable, labelFor } from '../js/recipe-table.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const items = read('data/ingredients.json').items;
const index = new Map(items.map(i => [i.id, i]));
const recipes = RECIPE_FILES.flatMap(f => read(f).recipes);

const fake = (steps, ingredients) => ({ id: 'rec.test', servings: 4, steps, ingredients });

/* ------------------------------------------------------------------ *
 * How much
 * ------------------------------------------------------------------ */

test('a step that says half gets half', () => {
  const recipe = fake(
    ['Heat half the oil in a skillet.', 'Stir in the rest of the oil off the heat.'],
    [{ ing: 'ing.oil.olive', qty: 2, unit: 'tbsp' }]
  );
  const [first, second] = stepsWithAmounts(recipe, index);
  assert.equal(first.wants[0].kind, 'fraction');
  assert.equal(first.wants[0].share, 0.5);
  assert.equal(first.wants[0].amount, '1 tbsp');
  assert.equal(second.wants[0].kind, 'rest');
});

test('a modifier belongs to its own ingredient and to nothing else', () => {
  // "Add onion, carrot, celery and a pinch of salt" was pinching the onion.
  const recipe = fake(
    ['Add onion, carrot, celery and a pinch of salt.'],
    [
      { ing: 'ing.onion.yellow', qty: 1, unit: 'each' },
      { ing: 'ing.carrot', qty: 2, unit: 'each' },
      { ing: 'ing.celery', qty: 2, unit: 'stalk' },
      { ing: 'ing.salt.kosher', qty: 1, unit: 'tsp' }
    ]
  );
  const wants = stepsWithAmounts(recipe, index)[0].wants;
  const by = (id) => wants.find(w => w.line.ing === id);
  assert.equal(by('ing.onion.yellow').kind, 'all', 'the onion was given a pinch');
  assert.equal(by('ing.carrot').kind, 'all', 'the carrot was given a pinch');
  assert.equal(by('ing.celery').kind, 'all', 'the celery was given a pinch');
  assert.equal(by('ing.salt.kosher').label, 'a pinch');
});

test('two ingredients answering to the same word do not both claim it', () => {
  // Tomato paste and crushed tomatoes both answer to "tomato".
  const recipe = fake(
    ['Fry the tomato paste until it darkens.', 'Add the crushed tomatoes.'],
    [
      { ing: 'ing.tomatopaste', qty: 3, unit: 'tbsp' },
      { ing: 'ing.tomato.canned.crushed', qty: 1, unit: 'can' }
    ]
  );
  const [paste, canned] = stepsWithAmounts(recipe, index);
  assert.deepEqual(paste.wants.map(w => w.line.ing), ['ing.tomatopaste']);
  assert.deepEqual(canned.wants.map(w => w.line.ing), ['ing.tomato.canned.crushed']);
  // And each is used once, so each gets its whole amount rather than a share.
  assert.equal(paste.wants[0].amount, '3 tbsp');
  assert.equal(canned.wants[0].amount, '1 can');
});

test('a descriptive tail in a name never identifies another ingredient', () => {
  // "Crushed tomatoes, no salt added" contains the word salt.
  const recipe = fake(
    ['Season with a pinch of salt.'],
    [
      { ing: 'ing.salt.kosher', qty: 1, unit: 'tsp' },
      { ing: 'ing.tomato.canned.crushed', qty: 1, unit: 'can' }
    ]
  );
  const wants = stepsWithAmounts(recipe, index)[0].wants;
  assert.deepEqual(wants.map(w => w.line.ing), ['ing.salt.kosher'],
    'a can of tomatoes was pulled in by the word salt in its own label');
});

test('amounts follow the number of servings actually being cooked', () => {
  const recipe = fake(['Add the lentils.'], [{ ing: 'ing.lentil.brown', qty: 1, unit: 'cup' }]);
  assert.equal(stepsWithAmounts(recipe, index, { scale: 1 })[0].wants[0].amount, '1 cup');
  assert.equal(stepsWithAmounts(recipe, index, { scale: 2 })[0].wants[0].amount, '2 cups');
  assert.equal(stepsWithAmounts(recipe, index, { scale: 0.5 })[0].wants[0].amount, '½ cup');
});

test('an ingredient used more than once never gets an invented fraction', () => {
  // The app does not know how the salt is split, so it must not print a number.
  const recipe = fake(
    ['Season the onions with salt.', 'Taste and add more salt.'],
    [{ ing: 'ing.salt.kosher', qty: 1, unit: 'tsp' }, { ing: 'ing.onion.yellow', qty: 1, unit: 'each' }]
  );
  const salt = stepsWithAmounts(recipe, index).map(s => s.wants.find(w => w.line.ing === 'ing.salt.kosher'));
  for (const w of salt) {
    assert.equal(w.kind, 'split');
    assert.equal(w.amount, null, 'a split amount was printed as a specific quantity');
    assert.equal(w.sure, false, 'a guess was presented as certain');
    assert.ok(w.detail, 'a split amount does not explain itself');
  }
});

test('every printed amount is either certain or flagged', () => {
  // Across the whole collection: an amount in large type must be one the app
  // can defend. Anything else has to be a label, not a quantity.
  for (const recipe of recipes) {
    for (const step of stepsWithAmounts(recipe, index)) {
      for (const w of step.wants) {
        if (w.amount != null) {
          assert.ok(w.sure, `${recipe.id}: printed "${w.amount}" for ${w.line.ing} without being sure`);
        }
        assert.ok(w.label, `${recipe.id}: ${w.line.ing} has no label`);
      }
    }
  }
});

test('a step never asks for an ingredient the recipe does not have', () => {
  for (const recipe of recipes) {
    const have = new Set(recipe.ingredients.map(l => l.ing));
    for (const step of stepsWithAmounts(recipe, index)) {
      for (const w of step.wants) {
        assert.ok(have.has(w.line.ing), `${recipe.id}: step wants ${w.line.ing}, which is not in it`);
      }
    }
  }
});

test('most ingredients are claimed by some step', () => {
  // If this collapses, the amounts panel is empty and the minimap is gray.
  let claimed = 0;
  let total = 0;
  for (const recipe of recipes) {
    const seen = new Set();
    for (const step of stepsWithAmounts(recipe, index)) for (const w of step.wants) seen.add(w.line.ing);
    claimed += seen.size;
    total += recipe.ingredients.length;
  }
  assert.ok(claimed / total > 0.7, `only ${Math.round(claimed / total * 100)}% of ingredients are named by a step`);
});

/* ------------------------------------------------------------------ *
 * Where you are
 * ------------------------------------------------------------------ */

test('the minimap moves forward and never backward', () => {
  // What has been called for by now only ever grows. The "already in" set
  // alone can shrink, because something going in again this step is shown as
  // going in now rather than as done.
  const recipe = recipes.find(r => r.id === 'rec.lentil-bolognese');
  let previous = 0;
  for (let i = 0; i < recipe.steps.length; i++) {
    const { done, now } = progressAt(recipe, index, i);
    const reached = new Set([...done, ...now]).size;
    assert.ok(reached >= previous, `step ${i}: the recipe went backward`);
    previous = reached;
  }
});

test('what is going in now is never also already in', () => {
  for (const recipe of recipes.slice(0, 60)) {
    for (let i = 0; i < recipe.steps.length; i++) {
      const { done, now } = progressAt(recipe, index, i);
      for (const id of now) {
        assert.ok(!done.has(id), `${recipe.id} step ${i}: ${id} is both going in and already in`);
      }
    }
  }
});

/* ------------------------------------------------------------------ *
 * The diagram
 * ------------------------------------------------------------------ */

test('a verb is a whole word', () => {
  // "Brownies" contains "brown", and a pan of brownies labeled Brown is the
  // kind of small wrongness that makes a diagram untrustworthy everywhere.
  assert.equal(labelFor('Cool the brownies in the pan.').verb, 'Cool');
  assert.equal(labelFor('Brown the turkey in a dry skillet.').verb, 'Brown');
  assert.equal(labelFor('Browning the edges takes 4 minutes.').verb, 'Brown');
  assert.equal(labelFor('Bake 25-28 minutes.').time, '25–28 min');
});

test('most of the collection can be drawn, and the rest says so', () => {
  const drawable = recipes.filter(r => recipeTable(r, index));
  assert.ok(drawable.length > recipes.length * 0.8,
    `only ${drawable.length} of ${recipes.length} recipes produce a diagram`);
  assert.ok(drawable.length < recipes.length,
    'every recipe drew a diagram, which means the confidence floor is not doing anything');
});

test('a diagram covers every ingredient line exactly once', () => {
  // Lines, not ingredients: a recipe may legitimately call for a lemon twice,
  // once for its juice and once for its zest, and both are rows.
  for (const recipe of recipes) {
    const table = recipeTable(recipe, index);
    if (!table) continue;
    const drawn = table.rows.map(r => r.line);
    const expected = recipe.ingredients.filter(l => index.has(l.ing));
    assert.equal(drawn.length, expected.length, `${recipe.id}: the diagram lost or repeated a row`);
    assert.equal(new Set(drawn).size, drawn.length, `${recipe.id}: a line is drawn twice`);
    for (const line of expected) {
      assert.ok(drawn.includes(line), `${recipe.id}: ${line.ing} is missing from the diagram`);
    }
  }
});

test('no two brackets in a column overlap', () => {
  // Two cells at the same depth covering the same rows would render on top of
  // each other, which is the one way this view can be visibly broken.
  for (const recipe of recipes) {
    const table = recipeTable(recipe, index);
    if (!table) continue;
    for (const a of table.cells) {
      for (const b of table.cells) {
        if (a === b || a.col !== b.col) continue;
        assert.ok(a.hi < b.lo || b.hi < a.lo,
          `${recipe.id}: two brackets collide in column ${a.col}`);
      }
    }
  }
});

test('every bracket sits inside the table it is drawn on', () => {
  for (const recipe of recipes) {
    const table = recipeTable(recipe, index);
    if (!table) continue;
    for (const cell of table.cells) {
      assert.ok(cell.lo >= 0 && cell.hi < table.rows.length,
        `${recipe.id}: a bracket runs off the end of the table`);
      assert.ok(cell.lo <= cell.hi, `${recipe.id}: a bracket is inside out`);
      assert.ok(cell.col < table.columns, `${recipe.id}: a bracket is past the last column`);
      assert.ok(cell.verb, `${recipe.id}: a bracket has no label`);
    }
  }
});

test('the last bracket gathers the whole recipe', () => {
  // Every thread has to end up in one dish. A final bracket that does not cover
  // every row means the diagram shows something that was never finished.
  for (const recipe of recipes) {
    const table = recipeTable(recipe, index);
    if (!table) continue;
    const last = table.cells.reduce((a, b) => (b.col > a.col ? b : a));
    assert.equal(last.lo, 0, `${recipe.id}: the last step does not reach the first ingredient`);
    assert.equal(last.hi, table.rows.length - 1, `${recipe.id}: the last step leaves an ingredient out`);
  }
});

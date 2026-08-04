/**
 * Tests for the flavor model.
 *
 * The failure that matters here is a confident wrong answer. The panel tells
 * people to add half a teaspoon of vinegar to a dish, and if the arithmetic
 * behind that is wrong nothing anywhere says so — it just quietly gives bad
 * cooking advice at scale.
 *
 * So three things are checked: that the model's own data is coherent, that the
 * numbers it produces land in a believable range across all 242 recipes, and
 * that the handful of dishes whose balance everybody already agrees on come out
 * the way everybody agrees they should.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeBalance, balanceDelta, axisPotency } from '../js/balance.js';
import { RECIPE_FILES } from '../tools/recipe-files.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const model = read('data/balance.json');
const items = read('data/ingredients.json').items;
const index = new Map(items.map(i => [i.id, i]));
const recipes = RECIPE_FILES.flatMap(f => read(f).recipes);
const ids = new Set(items.map(i => i.id));

const profiles = recipes.map(r => ({ recipe: r, profile: computeBalance(r, index, model) }));

/* ---------- the model's own shape ---------- */

test('every dial has the words it needs to be worth showing', () => {
  for (const axis of model.axes) {
    for (const field of ['id', 'name', 'icon', 'short', 'does', 'taste', 'when', 'bands']) {
      assert.ok(axis[field], `${axis.id} is missing ${field}`);
    }
    assert.ok(axis.whenLow?.say && axis.whenHigh?.say, `${axis.id} has no verdict text`);
    assert.ok(axis.whenLow.fixes?.length, `${axis.id} says it is low and offers no way to fix it`);
  }
  for (const f of model.finishers) {
    assert.ok(f.whenMissing?.fixes?.length, `${f.id} has no fixes`);
  }
});

test('every band is a real range, low below high', () => {
  for (const axis of model.axes) {
    for (const [course, band] of Object.entries(axis.bands)) {
      assert.equal(band.length, 2, `${axis.id}/${course} is not a pair`);
      assert.ok(band[0] >= 0, `${axis.id}/${course} has a negative floor`);
      assert.ok(band[0] < band[1], `${axis.id}/${course} floor is not below its ceiling`);
    }
  }
});

test('every fix points at an ingredient that exists and says why', () => {
  const sources = [
    ...model.axes.flatMap(a => [...(a.whenLow?.fixes || []), ...(a.whenHigh?.fixes || [])]),
    ...model.finishers.flatMap(f => f.whenMissing?.fixes || [])
  ];
  for (const fix of sources) {
    assert.ok(ids.has(fix.ing), `fix points at unknown ingredient ${fix.ing}`);
    assert.ok(fix.amount && fix.how, `fix for ${fix.ing} has no amount or method`);
    assert.ok(fix.why && fix.why.length > 30, `fix for ${fix.ing} does not explain itself`);
  }
});

test('every potency entry points at an ingredient that exists', () => {
  const bad = [];
  for (const [axis, table] of Object.entries(model.potency)) {
    if (typeof table !== 'object') continue;
    for (const key of Object.keys(table)) {
      if (key === 'note' || key === 'unitNote') continue;
      if (!ids.has(key)) bad.push(`${axis}: ${key}`);
    }
  }
  assert.deepEqual(bad, [], `potency for ingredients that do not exist: ${bad.join(', ')}`);
});

/* ---------- what it produces on the real collection ---------- */

test('every recipe gets a profile with every dial', () => {
  for (const { recipe, profile } of profiles) {
    assert.ok(profile, `${recipe.id} produced no profile`);
    assert.equal(profile.axes.length, model.axes.length, `${recipe.id} is missing a dial`);
    for (const axis of profile.axes) {
      assert.ok(Number.isFinite(axis.value), `${recipe.id}/${axis.id} is not a number`);
      assert.ok(axis.value >= 0, `${recipe.id}/${axis.id} is negative`);
      assert.ok(['low', 'ok', 'high', 'off'].includes(axis.state), `${recipe.id}/${axis.id} state ${axis.state}`);
    }
  }
});

test('the bar never draws outside its track', () => {
  for (const { recipe, profile } of profiles) {
    for (const a of profile.axes) {
      for (const k of ['fill', 'bandStart', 'bandEnd']) {
        assert.ok(a[k] >= 0 && a[k] <= 1, `${recipe.id}/${a.id} ${k} is ${a[k]}`);
      }
      assert.ok(a.bandStart <= a.bandEnd, `${recipe.id}/${a.id} band is inverted`);
    }
  }
});

test('most of the collection is in balance', () => {
  // A smell test rather than a target. A dial below its band is a prompt, and
  // prompts are the feature — but if the model started calling half the
  // collection flat, the model would be the thing that was wrong.
  const clean = profiles.filter(p => p.profile.axes.every(a => a.state !== 'low' || a.carried));
  const share = clean.length / profiles.length;
  assert.ok(share > 0.6,
    `only ${clean.length} of ${profiles.length} recipes have no unexplained low dial`);
  assert.ok(share < 0.98,
    'nothing in the collection has anything to suggest, which means the dials are not doing any work');
});

test('a dish that is low on salt and has acid and depth is treated as carried', () => {
  // The whole point of cooking heart-forward: a lightly salted pot with lemon
  // and miso in it does not taste under-seasoned, and telling somebody to add
  // salt to it would make the dish worse.
  const carried = profiles.filter(p => p.profile.axes.some(a => a.id === 'salt' && a.carried));
  assert.ok(carried.length > 0, 'nothing in the collection is a lightly-salted dish carried by acid');
  for (const { recipe, profile } of carried) {
    const salt = profile.axes.find(a => a.id === 'salt');
    assert.ok(salt.carriedByNames.length, `${recipe.id} is carried by nothing in particular`);
    assert.ok(!profile.notes.low.some(a => a.id === 'salt'),
      `${recipe.id} is carried and still being told to add salt`);
  }
});

/* ---------- dishes everybody already agrees about ---------- */

test('the dishes built on acid read as having acid', () => {
  for (const id of ['rec.pico-de-gallo', 'rec.tabbouleh', 'rec.house-vinaigrette', 'rec.guacamole']) {
    const p = profiles.find(x => x.recipe.id === id);
    assert.ok(p, `${id} is missing from the collection`);
    const acid = p.profile.axes.find(a => a.id === 'acid');
    assert.notEqual(acid.state, 'low', `${id} came out low on acid`);
  }
});

test('the dishes built on chile read as hot, and a plain roast does not', () => {
  const heatOf = (id) => profiles.find(x => x.recipe.id === id).profile.axes.find(a => a.id === 'heat').value;
  assert.ok(heatOf('rec.chile-crisp-noodles') > 10, 'chile crisp noodles are not hot');
  // A plain roast has black pepper in it, which is a kind of heat and counted
  // as one. What it should not be is anywhere near a dish built on chile.
  assert.ok(heatOf('rec.any-vegetable-roast') < heatOf('rec.chile-crisp-noodles') / 8,
    'a plain vegetable roast is reading as nearly as hot as chile crisp noodles');
});

test('a dessert is allowed to be sweet and a dinner is not', () => {
  const dessert = profiles.filter(x => x.recipe.course === 'dessert');
  const overSweetDinners = profiles.filter(x => x.recipe.course === 'dinner'
    && x.profile.axes.find(a => a.id === 'sweet').state === 'high');
  assert.ok(dessert.some(d => d.profile.axes.find(a => a.id === 'sweet').state !== 'low'),
    'no dessert reads as sweet');
  assert.ok(overSweetDinners.length < recipes.length * 0.06,
    `${overSweetDinners.length} dinners read as sweet, which suggests the sweet dial is miscalibrated`);
});

test('nothing crunchy is claimed for a dish that cooks it', () => {
  // A carrot is crisp in a slaw and soft in a soffritto. The difference is not
  // the ingredient, it is what the recipe does to it — and getting that wrong
  // is how the app tells somebody their stew has a crunchy element in it.
  const stew = profiles.find(x => x.recipe.id === 'rec.lentil-bolognese');
  assert.equal(stew.profile.finishers.find(f => f.id === 'crunch').present, false,
    'a long-simmered sauce is being credited with crunch');
  const slaw = profiles.find(x => x.recipe.id === 'rec.picnic-slaw');
  assert.equal(slaw.profile.finishers.find(f => f.id === 'crunch').present, true,
    'a raw slaw is not being credited with crunch');
});

/* ---------- what a swap does ---------- */

test('taking the acid out of a main is reported as taking the acid out', () => {
  const acidic = Object.keys(model.potency.acid).filter(k => k.startsWith('ing.'));
  const recipe = profiles.find(p =>
    p.recipe.course === 'dinner'
    && p.profile.axes.find(a => a.id === 'acid').state === 'ok'
    && p.recipe.ingredients.some(l => acidic.includes(l.ing))).recipe;

  const before = computeBalance(recipe, index, model);
  const stripped = { ...recipe, ingredients: recipe.ingredients.filter(l => !acidic.includes(l.ing)) };
  const after = computeBalance(stripped, index, model);

  assert.ok(balanceDelta(before, after).some(c => c.lost && c.axis?.id === 'acid'),
    `removing every acid from ${recipe.id} did not report the acid as lost`);
});

test('a swap that changes nothing reports nothing', () => {
  const recipe = recipes.find(r => r.id === 'rec.lentil-bolognese');
  const p = computeBalance(recipe, index, model);
  assert.deepEqual(balanceDelta(p, p), [], 'a profile compared with itself reported a change');
});

/* ---------- the potency table other modules read ---------- */

test('the potency lookup knows that a unit can change the answer', () => {
  // A lemon weighs 84 g and yields about 30 g of juice, so "1 lemon" and
  // "2 tbsp lemon juice" cannot be scored off the same number.
  const whole = axisPotency('acid', 'ing.lemon', 'each', model);
  const juice = axisPotency('acid', 'ing.lemon', 'tbsp_juice', model);
  assert.ok(juice > whole * 2, `juice ${juice} should be far more acidic per gram than whole fruit ${whole}`);
});

test('cayenne is hotter than pepper flakes, which are hotter than a poblano', () => {
  const heat = (id) => axisPotency('heat', id, null, model);
  assert.ok(heat('ing.spice.cayenne') > heat('ing.spice.pepperflakes'), 'cayenne is not hotter than flakes');
  assert.ok(heat('ing.spice.pepperflakes') > heat('ing.pepper.jalapeno'), 'flakes are not hotter than a jalapeño');
  assert.ok(heat('ing.pepper.jalapeno') > heat('ing.pepper.poblano'), 'a jalapeño is not hotter than a poblano');
});

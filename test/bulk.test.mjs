/**
 * Tests for the warehouse-club logic.
 *
 * The whole feature rests on one claim — that the app can tell what survives a
 * club pack and what rots in it — so that claim is what gets tested, against
 * the real ingredient data rather than fixtures. A rule that quietly starts
 * calling baby spinach a good bulk buy is the failure mode worth catching.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  keepability, clubAdvice, packMultiple, suggestForClub, isWarehouse,
  KEEPS, FREEZES, PERISHES
} from '../js/bulk.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const items = read('data/ingredients.json').items;
const byId = new Map(items.map(i => [i.id, i]));
const { storeLayouts } = read('data/aisles.json');
const get = (id) => {
  const item = byId.get(id);
  assert.ok(item, `${id} is not in the ingredient data`);
  return item;
};

test('both warehouse clubs are offered, and marked as clubs', () => {
  for (const id of ['costco', 'sams-club']) {
    const layout = storeLayouts[id];
    assert.ok(layout, `${id} missing from storeLayouts`);
    assert.ok(isWarehouse(layout), `${id} is not flagged as a warehouse`);
    assert.ok(layout.note?.length > 40, `${id} needs a note explaining the trip`);
  }
  // And an ordinary supermarket must not be mistaken for one.
  assert.equal(isWarehouse(storeLayouts.default), false);
  assert.equal(isWarehouse(storeLayouts.kroger), false);
});

test('a club layout covers every aisle the app can file an item into', () => {
  const aisles = read('data/aisles.json').aisles.map(a => a.id);
  for (const id of ['costco', 'sams-club']) {
    const missing = aisles.filter(a => !storeLayouts[id].order.includes(a));
    assert.deepEqual(missing, [], `${id} has nowhere to put: ${missing.join(', ')}`);
  }
});

test('the chicken case: buy it big, but freeze it the day you get home', () => {
  // The example the whole feature was asked for.
  for (const id of ['ing.chicken.thigh', 'ing.chicken.breast', 'ing.turkey.ground93']) {
    assert.equal(keepability(get(id)), FREEZES, id);
  }
  const advice = clubAdvice(get('ing.chicken.thigh'), 600);
  assert.equal(advice.verdict, FREEZES);
  assert.match(advice.headline, /freeze/i);
  assert.match(advice.note, /portion/i);
});

test('shelf-stable things are simply worth the big pack', () => {
  for (const id of ['ing.rice.brown', 'ing.lentil.brown', 'ing.oil.olive', 'ing.beans.black']) {
    assert.equal(keepability(get(id)), KEEPS, id);
  }
});

test('delicate produce is flagged, not quietly recommended', () => {
  for (const id of ['ing.spinach.baby', 'ing.cilantro', 'ing.basil']) {
    const item = byId.get(id);
    if (!item) continue;                       // the collection may rename these
    assert.equal(keepability(item), PERISHES, id);
    assert.match(clubAdvice(item, 60).note, /regular store|finishes in time/i);
  }
});

test('produce that genuinely keeps is not lumped in with the lettuce', () => {
  // Onions and carrots carry the `storage` tag already; the rest are listed.
  for (const id of ['ing.onion.yellow', 'ing.carrot', 'ing.garlic', 'ing.sweetpotato']) {
    const item = byId.get(id);
    if (!item) continue;
    assert.equal(keepability(item), KEEPS, id);
  }
});

test('dairy is split by what actually survives a freezer', () => {
  assert.equal(keepability(get('ing.cheese.parmesan')), FREEZES);
  assert.equal(keepability(get('ing.cheese.cheddar')), FREEZES);
  // Fresh dairy does not come back from it.
  assert.equal(keepability(get('ing.yogurt.greek.nonfat')), PERISHES);
  assert.equal(keepability(get('ing.milk.1pct')), PERISHES);
  // Eggs hold for weeks, which is why they are the exception.
  assert.equal(keepability(get('ing.egg')), KEEPS);
});

test('the pack estimate is a multiple, and says so', () => {
  const item = get('ing.chicken.thigh');
  assert.ok(packMultiple(item) >= 2 && packMultiple(item) <= 4);
  // A plan needing a fraction of a pack must say what happens to the rest.
  const small = clubAdvice(item, item.shop.grams * 0.5);
  assert.ok(small.usedPct < 30, `expected a small share, got ${small.usedPct}%`);
  assert.match(small.note, /rest/i);
});

test('no ingredient falls through without a verdict', () => {
  const verdicts = new Set([KEEPS, FREEZES, PERISHES]);
  const bad = items.filter(i => !verdicts.has(keepability(i)));
  assert.deepEqual(bad.map(i => i.id), []);
});

test('a missing ingredient is treated as perishable, not as a bargain', () => {
  // Failing safe matters here: the wrong default sends someone home with six
  // pounds of something the app knows nothing about.
  assert.equal(keepability(null), PERISHES);
  assert.equal(keepability(undefined), PERISHES);
  assert.equal(keepability({ id: 'ing.unknown', aisle: 'nowhere', tags: [] }), PERISHES);
});

test('the picker leads with what keeps and ends with what does not', () => {
  const rows = suggestForClub([
    { kind: 'ingredient', ingredientId: 'ing.spinach.baby', name: 'Baby spinach', grams: 100, item: get('ing.spinach.baby') },
    { kind: 'ingredient', ingredientId: 'ing.rice.brown', name: 'Brown rice', grams: 400, item: get('ing.rice.brown') },
    { kind: 'ingredient', ingredientId: 'ing.chicken.thigh', name: 'Chicken thighs', grams: 600, item: get('ing.chicken.thigh') },
    { kind: 'custom', name: 'Paper towels' }
  ]);
  assert.deepEqual(rows.map(r => r.advice.verdict), [KEEPS, FREEZES, PERISHES]);
  // Custom items have no ingredient record, so they are left out rather than guessed at.
  assert.equal(rows.length, 3);
});

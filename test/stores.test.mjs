/**
 * Tests for multi-store shopping.
 *
 * The feature has no setup screen by design — the app learns where things come
 * from by watching somebody sort a list once. That makes two things worth
 * pinning down: that the resolution order is what it claims (this item, then
 * this aisle, then home), and that a household who configured the older
 * two-store version does not lose it.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isWarehouse } from '../js/bulk.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const aislesFile = JSON.parse(readFileSync(join(root, 'data/aisles.json'), 'utf8'));
const { storeLayouts, aisles } = aislesFile;

/**
 * The resolution rule, mirrored from buildList so it can be checked without a
 * browser. If these ever disagree the browser run catches it — this pins the
 * intent.
 */
function storeFor(item, { stores, assignments = {}, aisleRules = {} }) {
  const live = new Set(stores);
  const home = stores[0];
  const pinned = assignments[item.ingredientId];
  if (pinned && live.has(pinned)) return pinned;
  const rule = aisleRules[item.aisle];
  if (rule && live.has(rule)) return rule;
  return home;
}

test('every store the user asked for is on the list', () => {
  const wanted = {
    kroger: 'Kroger', meijer: 'Meijer', marcs: "Marc's", aldi: 'Aldi',
    costco: 'Costco', 'sams-club': "Sam's Club", walmart: 'Walmart',
    target: 'Target', 'whole-foods': 'Whole Foods', 'trader-joes': "Trader Joe's",
    amazon: 'Amazon Grocery'
  };
  for (const [id, name] of Object.entries(wanted)) {
    assert.ok(storeLayouts[id], `${id} missing`);
    assert.equal(storeLayouts[id].name, name);
  }
});

test('every layout is a real walking order with a note', () => {
  const known = new Set(aisles.map(a => a.id));
  for (const [id, l] of Object.entries(storeLayouts)) {
    assert.ok(Array.isArray(l.order) && l.order.length, `${id} has no order`);
    const bogus = l.order.filter(a => !known.has(a));
    assert.deepEqual(bogus, [], `${id} orders aisles that do not exist: ${bogus.join(', ')}`);
    assert.equal(new Set(l.order).size, l.order.length, `${id} lists an aisle twice`);
    if (id !== 'default') assert.ok(l.note?.length > 30, `${id} needs a note worth reading`);
  }
});

test('the clubs are clubs and the supermarkets are not', () => {
  assert.ok(isWarehouse(storeLayouts.costco));
  assert.ok(isWarehouse(storeLayouts['sams-club']));
  for (const id of ['kroger', 'meijer', 'marcs', 'aldi', 'walmart', 'target', 'whole-foods', 'trader-joes']) {
    assert.equal(isWarehouse(storeLayouts[id]), false, `${id} is not a warehouse club`);
  }
  // Delivery is its own thing: no walking order to optimize.
  assert.equal(storeLayouts.amazon.kind, 'delivery');
});

test('with one store, everything goes to it', () => {
  const cfg = { stores: ['kroger'] };
  assert.equal(storeFor({ ingredientId: 'ing.chicken.thigh', aisle: 'meat-seafood' }, cfg), 'kroger');
  assert.equal(storeFor({ ingredientId: 'ing.rice.brown', aisle: 'dry-goods' }, cfg), 'kroger');
});

test('a pinned item beats the aisle rule beats home', () => {
  const cfg = {
    stores: ['kroger', 'costco'],
    assignments: { 'ing.salmon': 'kroger' },
    aisleRules: { 'meat-seafood': 'costco' }
  };
  // The rule sends meat to Costco...
  assert.equal(storeFor({ ingredientId: 'ing.chicken.thigh', aisle: 'meat-seafood' }, cfg), 'costco');
  // ...but this one thing was pinned back, and the pin wins.
  assert.equal(storeFor({ ingredientId: 'ing.salmon', aisle: 'meat-seafood' }, cfg), 'kroger');
  // Everything with no opinion attached goes home.
  assert.equal(storeFor({ ingredientId: 'ing.spinach.baby', aisle: 'produce' }, cfg), 'kroger');
});

test('dropping a store releases what was filed there rather than stranding it', () => {
  // Somebody stops shopping at Costco but the pins survive in storage.
  const cfg = {
    stores: ['meijer'],
    assignments: { 'ing.chicken.thigh': 'costco' },
    aisleRules: { 'dry-goods': 'costco' }
  };
  assert.equal(storeFor({ ingredientId: 'ing.chicken.thigh', aisle: 'meat-seafood' }, cfg), 'meijer');
  assert.equal(storeFor({ ingredientId: 'ing.rice.brown', aisle: 'dry-goods' }, cfg), 'meijer');
});

test("the user's own combinations resolve", () => {
  for (const stores of [['kroger', 'costco'], ['meijer', 'costco'], ['marcs', 'aldi', 'costco']]) {
    for (const id of stores) assert.ok(storeLayouts[id], `${id} missing`);
    const cfg = { stores, aisleRules: { 'meat-seafood': 'costco' } };
    assert.equal(storeFor({ ingredientId: 'ing.chicken.thigh', aisle: 'meat-seafood' }, cfg), 'costco');
    assert.equal(storeFor({ ingredientId: 'ing.spinach.baby', aisle: 'produce' }, cfg), stores[0]);
  }
});

test('the old two-store setup migrates instead of being lost', async () => {
  // Mirrors migrateStores in store.js: bulkStore becomes the second stop and
  // every bulkPick becomes an assignment to it.
  const saved = {
    prefs: { store: 'kroger', bulkStore: 'costco' },
    bulkPicks: { 'ing.chicken.thigh': true, 'ing.rice.brown': true }
  };
  const src = readFileSync(join(root, 'js/store.js'), 'utf8');
  assert.match(src, /function migrateStores/, 'the migration is gone');
  assert.match(src, /prefs\.stores = \[prefs\.store, prefs\.bulkStore\]/);
  assert.match(src, /assignments\[id\] = prefs\.bulkStore/);

  // And the resolution that migration feeds must place them at the club.
  const cfg = {
    stores: [saved.prefs.store, saved.prefs.bulkStore],
    assignments: Object.fromEntries(Object.keys(saved.bulkPicks).map(k => [k, saved.prefs.bulkStore]))
  };
  assert.equal(storeFor({ ingredientId: 'ing.chicken.thigh', aisle: 'meat-seafood' }, cfg), 'costco');
  assert.equal(storeFor({ ingredientId: 'ing.egg', aisle: 'dairy-eggs' }, cfg), 'kroger');
});

test('the rule offer is asked once and remembers a no', () => {
  const src = readFileSync(join(root, 'js/views/list.js'), 'utf8');
  // Three of a kind before asking, and a decline is as durable as an accept.
  assert.match(src, /RULE_THRESHOLD = 3/);
  assert.match(src, /state\.declinedRules\?\.\[aisleId\]\) return null/);
  assert.match(src, /declineAisleRule\(aisleId\)/);
});

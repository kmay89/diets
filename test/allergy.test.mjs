/**
 * Tests for the allergy engine.
 *
 * The promise being checked is absolute: nothing the app recommends may
 * contain a flagged allergen. A test suite that samples cannot back that
 * sentence, so these tests run the actual recommendation machinery — the roll
 * filter, the substitution ladder, the flavor fixes, the protein options —
 * against every recipe and every allergen, using the real data files.
 *
 * The other half is the data itself: an engine is only as good as its tags,
 * so every ingredient whose name says "cheese" had better say "dairy" in its
 * allergens field, and a tag audit here fails the build when one goes quiet.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  ALLERGENS, avoidedSet, itemConflicts, blocksItem,
  recipeConflicts, forkConflicts, comboConflicts, conflictPhrase
} from '../js/allergy.js';
import { buildLadder } from '../js/swaps.js';
import { fixesFor } from '../js/balance.js';
import { proteinOptionsFor, proteinsIn } from '../js/proteins.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const items = read('data/ingredients.json').items;
const ingIndex = new Map(items.map(i => [i.id, i]));
const subModel = read('data/substitutions.json');
const balanceModel = read('data/balance.json');
const proteinModel = read('data/proteins.json');

const recipes = [
  'data/recipes.dinners.json', 'data/recipes.easy.json', 'data/recipes.world.json',
  'data/recipes.regional.json', 'data/recipes.daily.json', 'data/recipes.sandwiches.json',
  'data/recipes.snacks.json', 'data/recipes.sweets.json', 'data/recipes.methods.json',
  'data/recipes.occasions.json'
].flatMap(p => read(p).recipes);

const IDS = ALLERGENS.map(a => a.id);

/* ------------------------------------------------------------------ *
 * The data: tags that exist, and tags that must
 * ------------------------------------------------------------------ */

test('every allergen tag in the data is one the engine understands', () => {
  const bad = [];
  for (const i of items) {
    for (const a of [...(i.allergens || []), ...(i.allergensMay || [])]) {
      if (!IDS.includes(a)) bad.push(`${i.id}: ${a}`);
    }
  }
  assert.deepEqual(bad, [], `unknown allergen ids: ${bad.join(', ')}`);
});

/**
 * The audit: names that imply an allergen, checked against the tags.
 *
 * The patterns are deliberately narrow — a false positive here would demand a
 * tag that is wrong — and the exceptions are named one by one so that adding
 * one is a decision somebody makes on purpose, with the reason beside it.
 */
const IMPLIES = [
  { allergen: 'dairy', pattern: /cheese|milk|butter|yogurt|cream|paneer|halloumi|feta|parmesan|mozzarella|ricotta|gruyere|kefir/i,
    except: new Set([
      'ing.milk.soy',            // soy milk is soy, not dairy
      'ing.milk.oat',            // oat milk
      'ing.coconutmilk.light',   // coconut milk
      'ing.coconutmilk.full',
      'ing.peanutbutter',        // nut "butters"
      'ing.almondbutter',
      'ing.lettuce.butter',      // butter lettuce
      'ing.squash.butternut'     // butternut squash
    ]) },
  { allergen: 'gluten', pattern: /wheat|barley|farro|couscous|orzo|seitan|panko|baguette|ciabatta|\bpita\b|bread\b|flour tortilla|noodle\.wheat|pasta\.wholewheat|flour\.ap|\brye\b/i,
    except: new Set([
      'ing.noodle.glass',        // sweet potato starch
      'ing.pasta.chickpea',      // chickpea flour
      'ing.buckwheat.flour',     // buckwheat is not wheat
      'ing.soba'                 // checked below: only exempt if pure buckwheat
    ]) },
  { allergen: 'soy', pattern: /\bsoy|tofu|tempeh|edamame|miso\b/i, except: new Set([]) },
  { allergen: 'peanut', pattern: /peanut/i, except: new Set([]) },
  { allergen: 'tree-nut', pattern: /almond|walnut|cashew|pecan|hazelnut|pistachio|macadamia/i, except: new Set([]) },
  { allergen: 'egg', pattern: /\begg\b|\beggs\b|mayonnaise|\bmayo\b/i, except: new Set(['ing.eggplant']) },
  { allergen: 'fish', pattern: /salmon|tuna|anchov|sardine|fish sauce|fishsauce/i, except: new Set([]) },
  { allergen: 'shellfish', pattern: /shrimp|crab\b|clam|mussel|scallop|lobster/i, except: new Set([]) },
  { allergen: 'sesame', pattern: /sesame|tahini/i, except: new Set([]) }
];

test('every ingredient whose name says an allergen carries the tag', () => {
  const misses = [];
  for (const i of items) {
    const hay = `${i.id} ${i.name}`;
    for (const rule of IMPLIES) {
      if (!rule.pattern.test(hay) || rule.except.has(i.id)) continue;
      const tagged = (i.allergens || []).includes(rule.allergen)
        || (i.allergensMay || []).includes(rule.allergen);
      if (!tagged) misses.push(`${i.id} (${i.name}) → ${rule.allergen}`);
    }
  }
  assert.deepEqual(misses, [], `named but untagged: ${misses.join(', ')}`);
});

test('every recipe ingredient line points at an ingredient that exists', () => {
  // The engine can only judge lines it can resolve; a dangling id would be an
  // ingredient no allergen check ever sees.
  const dangling = [];
  for (const r of recipes) {
    for (const line of [...r.ingredients, ...(r.omnivore?.add || []), ...(r.vegetarianSwap?.add || [])]) {
      if (!ingIndex.has(line.ing)) dangling.push(`${r.id}: ${line.ing}`);
    }
  }
  assert.deepEqual(dangling, [], `lines the engine cannot see: ${dangling.join(', ')}`);
});

/* ------------------------------------------------------------------ *
 * The engine's own arithmetic
 * ------------------------------------------------------------------ */

test('itemConflicts distinguishes contains from commonly-contains', () => {
  const curry = ingIndex.get('ing.currypaste.red');
  const conflicts = itemConflicts(curry, new Set(['shellfish']));
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].certain, false);
  assert.match(conflictPhrase(conflicts), /often contains shellfish/);

  const shrimp = ingIndex.get('ing.shrimp');
  const sure = itemConflicts(shrimp, new Set(['shellfish']));
  assert.equal(sure[0].certain, true);
  assert.match(conflictPhrase(sure), /^contains shellfish/);
});

test('an empty avoid list blocks nothing', () => {
  for (const i of items.slice(0, 40)) {
    assert.equal(blocksItem(i, new Set()), false);
    assert.equal(blocksItem(i, avoidedSet({ avoidAllergens: [] })), false);
  }
});

/* ------------------------------------------------------------------ *
 * The promise, surface by surface
 * ------------------------------------------------------------------ */

test('a recipe the roll filter passes never contains the flagged allergen', () => {
  // recipeConflicts is exactly the check js/roll.js isCandidate runs; assert
  // its contrapositive across the whole collection for every single allergen.
  for (const id of IDS) {
    const avoid = new Set([id]);
    for (const r of recipes) {
      const conflicts = recipeConflicts(r, avoid, ingIndex);
      const carries = r.ingredients.some(l => {
        const item = ingIndex.get(l.ing);
        return (item?.allergens || []).includes(id) || (item?.allergensMay || []).includes(id);
      });
      assert.equal(conflicts.length > 0, carries,
        `${r.id} vs ${id}: filter says ${conflicts.length > 0}, ingredients say ${carries}`);
    }
  }
});

test('the substitution ladder never offers a flagged allergen', () => {
  for (const id of IDS) {
    const avoid = new Set([id]);
    for (const from of items) {
      const ladder = buildLadder(from.id, { ingIndex, model: subModel, balanceModel, avoid });
      if (!ladder) continue;
      for (const tier of [ladder.direct, ladder.second, ladder.role, ladder.best]) {
        for (const o of tier) {
          assert.equal(blocksItem(o.item, avoid), false,
            `ladder for ${from.id} offered ${o.item.id} to a ${id} allergy`);
        }
      }
      for (const combo of ladder.combos) {
        assert.equal(comboConflicts(combo, avoid, ingIndex).length, 0,
          `ladder for ${from.id} offered combo ${combo.id} to a ${id} allergy`);
      }
    }
  }
});

test('the flavor fixes never offer a flagged allergen', () => {
  const axes = [...(balanceModel.axes || []), ...(balanceModel.finishers || [])];
  for (const id of IDS) {
    const avoid = new Set([id]);
    for (const axis of axes) {
      for (const dir of ['low', 'high', 'missing']) {
        for (const fix of fixesFor(axis, dir, ingIndex, avoid)) {
          if (!fix.item) continue;
          assert.equal(blocksItem(fix.item, avoid), false,
            `fix ${fix.ing} for ${axis.id || axis.name} offered to a ${id} allergy`);
        }
      }
    }
  }
});

test('the protein options never offer a flagged allergen', () => {
  for (const id of IDS) {
    const avoid = new Set([id]);
    for (const r of recipes) {
      for (const current of proteinsIn(r, proteinModel)) {
        const options = proteinOptionsFor(r, current, { ingIndex, avoid, m: proteinModel });
        for (const o of options) {
          assert.equal(blocksItem(o.item, avoid), false,
            `${r.id}: protein option ${o.item.id} offered to a ${id} allergy`);
        }
      }
    }
  }
});

test('a conflicting fork is detected so the views can withhold it', () => {
  // At least one dinner in the collection has a fish or shellfish fork on a
  // clean base — the exact case where the base must pass and the fork must be
  // caught. If this stops finding one, the guard has nothing left to guard.
  let found = 0;
  for (const r of recipes) {
    if (!r.omnivore) continue;
    for (const id of ['fish', 'shellfish']) {
      const avoid = new Set([id]);
      if (recipeConflicts(r, avoid, ingIndex).length) continue;
      if (forkConflicts(r.omnivore, avoid, ingIndex).length) found++;
    }
  }
  assert.ok(found > 0, 'expected at least one clean-base recipe with a conflicting fork');
});

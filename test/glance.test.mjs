/**
 * Tests for the at-a-glance nutrition reading.
 *
 * The panel paints verdicts on food, so the thresholds behind those verdicts
 * are worth pinning down. The one that matters most: a meal must not be
 * flagged for carrying its own share of the day. The first version judged
 * every nutrient on the FDA's absolute 5/20 rule and called a 384 mg dinner
 * "high sodium" on the same screen where the app's own flag said "low sodium
 * for a meal" — two true numbers, one of them arguing with the other.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyValue, dayShare, NUTRIENT_DIRECTION, heartFlags } from '../js/nutrition.js';

test('nutrients worth getting use the FDA source thresholds', () => {
  // 21 CFR 101.54: 10-19% of a day is a "good source", 20%+ "excellent".
  assert.equal(dailyValue('fiber_g', 14, 28).note, 'excellent source'); // 50%
  assert.equal(dailyValue('fiber_g', 5.6, 28).note, 'excellent source'); // exactly 20%
  assert.equal(dailyValue('fiber_g', 3.5, 28).note, 'good source');      // 12.5%
  assert.equal(dailyValue('fiber_g', 1, 28).note, 'a little');           // 4%
  assert.equal(dailyValue('fiber_g', 14, 28).tone, 'good');
});

test('a meal is not punished for being a meal', () => {
  // 384 mg against a 1,500 mg heart-mode day is 26% — but the plate is 28% of
  // the day's calories, so the sodium is running behind its own plate.
  const dv = dailyValue('sodium_mg', 384, 1500, { pace: 28 });
  assert.equal(dv.pct, 26);
  assert.equal(dv.tone, 'good');
  assert.equal(dv.note, 'on pace for the day');

  // And the app's older flag agrees, which is the point.
  const flags = heartFlags({ kcal: 666, satfat_g: 7, sodium_mg: 384, fiber_g: 17, potassium_mg: 1310, cholesterol_mg: 20 });
  assert.ok(flags.some(f => f.kind === 'good' && /low sodium/i.test(f.text)));
});

test('a nutrient outrunning its plate is flagged', () => {
  // Same 28% plate, but 44% of the day's saturated fat.
  const dv = dailyValue('satfat_g', 7, 16, { pace: 28 });
  assert.equal(dv.tone, 'watch');
  assert.equal(dv.note, 'heavy for this plate');
});

test('a nutrient a little ahead of its plate is amber, not red', () => {
  const dv = dailyValue('sodium_mg', 525, 1500, { pace: 28 });  // 35% vs 28%
  assert.equal(dv.pct, 35);
  assert.equal(dv.note, 'a little heavy here');
  assert.equal(dv.tone, 'ok');
});

test('eating at this rate all day lands on the target, so it is green', () => {
  // The definition of on-pace: nutrient share equals calorie share.
  const dv = dailyValue('sodium_mg', 420, 1500, { pace: 28 });
  assert.equal(dv.pct, 28);
  assert.equal(dv.tone, 'good');
});

test('with no plate to compare against, the FDA 5/20 rule stands in', () => {
  assert.equal(dailyValue('sodium_mg', 60, 1500).note, 'low');       // 4%
  assert.equal(dailyValue('sodium_mg', 200, 1500).note, 'moderate'); // 13%
  assert.equal(dailyValue('sodium_mg', 600, 1500).note, 'high');     // 40%
});

test('every nutrient the panel shows declares a direction', () => {
  for (const k of ['fiber_g', 'protein_g', 'potassium_mg', 'sodium_mg', 'satfat_g']) {
    assert.ok(NUTRIENT_DIRECTION[k], `${k} has no direction`);
  }
  assert.equal(NUTRIENT_DIRECTION.sodium_mg, 'limit');
  assert.equal(NUTRIENT_DIRECTION.fiber_g, 'encourage');
});

test('missing targets degrade to no verdict rather than a wrong one', () => {
  const dv = dailyValue('sodium_mg', 400, 0);
  assert.equal(dv.pct, null);
  assert.equal(dv.tone, 'neutral');
  assert.equal(dv.band, null);
});

test('the day dial describes the plate without grading it', () => {
  const light = dayShare(400, 2400, 'dinner');  // 17% against a typical 35%
  assert.equal(light.pct, 17);
  assert.equal(light.typicalPct, 35);
  assert.equal(light.verdict, 'lighter than usual');

  assert.equal(dayShare(840, 2400, 'dinner').verdict, 'about right');
  assert.equal(dayShare(1400, 2400, 'dinner').verdict, 'bigger than usual');

  // Breakfast is held to breakfast's share, not dinner's.
  assert.equal(dayShare(600, 2400, 'breakfast').typicalPct, 25);
  assert.equal(dayShare(0, 0, 'dinner'), null);
});

/**
 * Unit tests for the portion and nutrient math.
 * Run: npm test
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  gramsFor, expandPer100g, recipeNutrition, heartScore, gradeFor,
  energyNeeds, dailyTargets, servingEquivalents, formatQty, roundQty,
  topContributors, NUTRIENT_KEYS
} from '../js/nutrition.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const ingredients = read('data/ingredients.json').items;
const index = new Map(ingredients.map(i => [i.id, i]));
const recipes = [
  ...read('data/recipes.dinners.json').recipes,
  ...read('data/recipes.daily.json').recipes
];

test('gramsFor converts recipe units to grams', () => {
  const onion = index.get('ing.onion.yellow');
  assert.equal(gramsFor(onion, 2, 'each'), 220);
  assert.equal(gramsFor(onion, 1, 'cup'), 160);
  assert.equal(gramsFor(onion, 1, 'furlong'), null);
});

test('expandPer100g maps the compact array onto keys', () => {
  const oil = expandPer100g(index.get('ing.oil.olive').per100g);
  assert.equal(oil.kcal, 884);
  assert.equal(oil.fat_g, 100);
  assert.equal(oil.sodium_mg, 2);
  assert.deepEqual(Object.keys(oil), NUTRIENT_KEYS);
});

test('recipe nutrition scales with servings', () => {
  const r = recipes.find(x => x.id === 'rec.lentil-bolognese');
  const four = recipeNutrition(r, index, { servings: 4 });
  const eight = recipeNutrition(r, index, { servings: 8 });
  assert.ok(Math.abs(four.perServing.kcal - eight.perServing.kcal * 2) < 0.001);
  assert.equal(four.missing.length, 0);
  assert.ok(four.perServing.protein_g > 15, 'a lentil bolognese should clear 15 g protein a serving');
  assert.ok(four.perServing.fiber_g > 10);
});

test('the omnivore add-on only changes the numbers when included', () => {
  const r = recipes.find(x => x.id === 'rec.three-bean-chili');
  const base = recipeNutrition(r, index);
  const withMeat = recipeNutrition(r, index, { withOmnivore: true });
  assert.ok(withMeat.perServing.protein_g > base.perServing.protein_g);
  assert.ok(withMeat.perServing.cholesterol_mg > base.perServing.cholesterol_mg,
    'adding meat must add cholesterol');

  // A vegan base carries no cholesterol at all.
  const dal = recipes.find(x => x.id === 'rec.red-lentil-dal');
  assert.equal(recipeNutrition(dal, index).perServing.cholesterol_mg, 0);
});

test('every recipe resolves all of its ingredients', () => {
  for (const r of recipes) {
    const { missing } = recipeNutrition(r, index, { withOmnivore: true });
    assert.equal(missing.length, 0, `${r.id} has unresolved ingredients: ${missing.join(', ')}`);
  }
});

test('heart score rewards fiber and punishes sodium', () => {
  const lean = { kcal: 600, protein_g: 25, fat_g: 15, satfat_g: 2, carb_g: 80, fiber_g: 16, sugar_g: 8, sodium_mg: 300, potassium_mg: 1100, cholesterol_mg: 0, calcium_mg: 150, iron_mg: 5 };
  const salty = { ...lean, sodium_mg: 1400 };
  const a = heartScore(lean);
  const b = heartScore(salty);
  assert.ok(a.score > b.score, 'a salty version of the same plate must score lower');
  assert.equal(a.grade, gradeFor(a.score));
  assert.ok(a.score >= 85, `expected an A for a low-sodium high-fiber plate, got ${a.score}`);
});

test('components are not graded against a meal budget', () => {
  const vinaigrette = recipes.find(r => r.id === 'rec.house-vinaigrette');
  const { perServing } = recipeNutrition(vinaigrette, index);
  const scored = heartScore(perServing, { course: vinaigrette.course });
  assert.equal(scored.score, null);
  assert.equal(scored.contextual, true);
});

test('energy needs use Mifflin-St Jeor for adults', () => {
  // A 40-year-old woman, 165 cm, 68 kg, moderately active.
  const e = energyNeeds({ sex: 'female', age: 40, heightCm: 165, weightKg: 68, activity: 'moderate' });
  // BMR = 10*68 + 6.25*165 - 5*40 - 161 = 1350.25
  assert.equal(e.bmr, 1350);
  assert.equal(e.method, 'Mifflin-St Jeor');
  assert.ok(Math.abs(e.tdee - 1350.25 * 1.55) < 1);
});

test('children use the Dietary Guidelines reference tables', () => {
  const kid = energyNeeds({ sex: 'female', age: 10, activity: 'active' });
  assert.equal(kid.method, 'DGA reference (child)');
  assert.equal(kid.tdee, 2200);
  assert.equal(kid.bmr, null);
});

test('a weight-loss goal never drops below the clinical floor', () => {
  const e = energyNeeds({ sex: 'female', age: 60, heightCm: 150, weightKg: 50, activity: 'sedentary', goal: 'lose' });
  assert.ok(e.target >= 1200, `got ${e.target}`);
});

test('heart mode tightens the sodium target', () => {
  const adult = { sex: 'male', age: 45, heightCm: 178, weightKg: 84, activity: 'light' };
  assert.equal(dailyTargets(adult, { heartMode: true }).sodium_mg, 1500);
  assert.equal(dailyTargets(adult, { heartMode: false }).sodium_mg, 2300);
  // Children get age-banded limits regardless of the mode.
  assert.equal(dailyTargets({ sex: 'female', age: 7 }, { heartMode: false }).sodium_mg, 1500);
  assert.equal(dailyTargets({ sex: 'male', age: 12 }, { heartMode: true }).sodium_mg, 1800);
});

test('serving equivalents scale with who is actually eating', () => {
  const household = [
    { id: 'a', name: 'Adult', sex: 'female', age: 42, heightCm: 165, weightKg: 68, activity: 'moderate' },
    { id: 'b', name: 'Adult2', sex: 'male', age: 44, heightCm: 180, weightKg: 86, activity: 'moderate' },
    { id: 'c', name: 'Kid', sex: 'female', age: 8, activity: 'active' },
    { id: 'd', name: 'Teen', sex: 'male', age: 15, activity: 'active' }
  ];
  const eq = servingEquivalents(household, 'dinner');
  assert.equal(eq.per.length, 4);
  assert.ok(eq.total > 3 && eq.total < 6, `4 people should be 3-6 servings, got ${eq.total}`);
  const teen = eq.per.find(p => p.name === 'Teen');
  const kid = eq.per.find(p => p.name === 'Kid');
  assert.ok(teen.equiv > kid.equiv, 'a 15-year-old boy eats more than an 8-year-old');
});

test('someone who does not eat here counts for nothing', () => {
  const eq = servingEquivalents([{ id: 'x', name: 'Away', sex: 'male', age: 20, eats: false }], 'dinner');
  assert.equal(eq.total, 0);
});

test('quantities round to something a cook can measure', () => {
  assert.equal(formatQty(1.875, 'cup'), '2 cups');
  assert.equal(formatQty(0.875, 'cup'), '⅞ cup');
  assert.equal(formatQty(1.25, 'lb'), '1 ¼ lb');
  assert.equal(formatQty(5, 'clove'), '5 cloves');
  assert.equal(formatQty(1, 'clove'), '1 clove');
  assert.equal(formatQty(2, 'each'), '2');
  assert.equal(roundQty(0.31, 'cup'), 0.25);
  assert.equal(roundQty(0.1, 'lb'), 0.25);
});

test('top contributors explain where the sodium comes from', () => {
  const r = recipes.find(x => x.id === 'rec.white-bean-kale-soup');
  const top = topContributors(r.ingredients, index, 'sodium_mg', 3);
  assert.equal(top.length, 3);
  assert.ok(top[0].amount >= top[1].amount);
  assert.ok(top[0].pct > 0 && top[0].pct <= 100);
});

test('no dinner is a sodium bomb once scaled per serving', () => {
  const dinners = recipes.filter(r => r.course === 'dinner');
  for (const r of dinners) {
    const { perServing } = recipeNutrition(r, index);
    assert.ok(perServing.sodium_mg < 1200, `${r.id} is ${Math.round(perServing.sodium_mg)} mg sodium a serving`);
    assert.ok(perServing.kcal > 200 && perServing.kcal < 1000, `${r.id} is ${Math.round(perServing.kcal)} kcal a serving`);
  }
});

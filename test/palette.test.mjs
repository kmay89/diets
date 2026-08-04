/**
 * Tests for the color of a dish.
 *
 * The failure here is quiet and it is the whole point of the feature: if every
 * card drifts toward the same beige, nothing is broken, no error is thrown, and
 * the grid goes back to being unscannable. So what is checked is the spread —
 * that no one color swallows the collection, that every texture is used, and
 * that the dishes everybody can already picture come out the color they are.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RECIPE_FILES } from '../tools/recipe-files.mjs';
import { recipeLook, textureFor, lookStyle, groupById } from '../js/palette.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const model = read('data/palette.json');
const items = read('data/ingredients.json').items;
const index = new Map(items.map(i => [i.id, i]));
const ids = new Set(items.map(i => i.id));
const recipes = RECIPE_FILES.flatMap(f => read(f).recipes);
const groupIds = new Set(model.groups.map(g => g.id));

const looks = recipes.map(r => ({ recipe: r, look: recipeLook(r, index, model) }));

/* ---------- the model's own shape ---------- */

test('every color group is a real color with real ingredients in it', () => {
  for (const g of model.groups) {
    assert.ok(g.hue >= 0 && g.hue < 360, `${g.id} hue ${g.hue}`);
    assert.ok(g.sat > 0 && g.sat <= 100, `${g.id} saturation ${g.sat}`);
    assert.ok(Object.keys(g.members).length >= 5, `${g.id} has too few members to ever win`);
    for (const [ing, strength] of Object.entries(g.members)) {
      assert.ok(ids.has(ing), `${g.id} names unknown ingredient ${ing}`);
      assert.ok(strength > 0 && strength <= 20, `${g.id}/${ing} strength ${strength}`);
    }
  }
});

test('nothing sits in two color groups at once', () => {
  // An ingredient in two groups is voting twice, and the group it belongs to
  // stops being a claim about what the thing looks like.
  const seen = new Map();
  const clashes = [];
  for (const g of model.groups) {
    for (const ing of Object.keys(g.members)) {
      if (seen.has(ing)) clashes.push(`${ing}: ${seen.get(ing)} and ${g.id}`);
      else seen.set(ing, g.id);
    }
  }
  assert.deepEqual(clashes, [], `ingredients in more than one color group: ${clashes.join(', ')}`);
});

test('every fallback points at a group that exists', () => {
  for (const [key, id] of Object.entries(model.byCuisine)) {
    if (key === 'note') continue;
    assert.ok(groupIds.has(id), `cuisine ${key} maps to unknown group ${id}`);
  }
  for (const [key, id] of Object.entries(model.byCourse)) {
    if (key === 'note') continue;
    assert.ok(groupIds.has(id), `course ${key} maps to unknown group ${id}`);
  }
});

test('every cuisine in the collection has somewhere to fall back to', () => {
  const missing = [...new Set(recipes.map(r => r.cuisine))].filter(c => !model.byCuisine[c]);
  assert.deepEqual(missing, [], `cuisines with no color fallback: ${missing.join(', ')}`);
});

/* ---------- what it produces ---------- */

test('every recipe gets a usable look', () => {
  for (const { recipe, look } of looks) {
    assert.ok(look, `${recipe.id} has no look`);
    assert.ok(look.hue >= 0 && look.hue < 360, `${recipe.id} hue ${look.hue}`);
    assert.ok(look.hue2 >= 0 && look.hue2 < 360, `${recipe.id} hue2 ${look.hue2}`);
    assert.ok(look.sat >= model.render.minSat && look.sat <= model.render.maxSat,
      `${recipe.id} saturation ${look.sat} is outside the allowed range`);
    assert.ok(look.texture, `${recipe.id} has no texture`);
    assert.match(lookStyle(look), /--card-h:\d+/, `${recipe.id} produced no custom properties`);
  }
});

test('the same recipe always looks the same', () => {
  // A card that changes color between visits is a card nobody can learn.
  for (const recipe of recipes.slice(0, 40)) {
    const a = recipeLook(recipe, index, model);
    const b = recipeLook(recipe, index, model);
    assert.deepEqual([a.hue, a.sat, a.angle, a.texture.id], [b.hue, b.sat, b.angle, b.texture.id],
      `${recipe.id} is not deterministic`);
  }
});

test('no single color swallows the collection', () => {
  const counts = {};
  for (const { look } of looks) counts[look.group.id] = (counts[look.group.id] || 0) + 1;
  const biggest = Math.max(...Object.values(counts));
  assert.ok(biggest / looks.length < 0.3,
    `one color is ${Math.round(biggest / looks.length * 100)}% of the collection, which is back to a wall of sameness`);
  assert.ok(Object.keys(counts).length >= 8,
    `only ${Object.keys(counts).length} of ${model.groups.length} colors are ever used`);
});

test('every texture is used and none of them dominates', () => {
  const counts = {};
  for (const { look } of looks) counts[look.texture.id] = (counts[look.texture.id] || 0) + 1;
  for (const rule of model.textures.rules) {
    assert.ok(counts[rule.id] > 0, `the ${rule.id} pattern never appears on any recipe`);
  }
  const biggest = Math.max(...Object.values(counts));
  assert.ok(biggest / looks.length < 0.55,
    `one pattern is on ${Math.round(biggest / looks.length * 100)}% of cards`);
});

test('two cards side by side rarely look identical', () => {
  // Same hue and same pattern is the case the whole feature exists to avoid.
  const seen = new Map();
  for (const { look } of looks) {
    const key = `${look.hue}/${look.texture.id}/${look.angle}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const worst = Math.max(...seen.values());
  assert.ok(worst / looks.length < 0.12,
    `${worst} recipes share exactly the same color, pattern and angle`);
});

/* ---------- dishes everybody can already picture ---------- */

test('the dishes whose color everybody knows come out that color', () => {
  const colorOf = (id) => looks.find(x => x.recipe.id === id)?.look.group.id;
  for (const [id, expected] of [
    ['rec.lentil-bolognese', 'color.tomato'],
    ['rec.chickpea-shakshuka', 'color.tomato'],
    ['rec.creamy-tomato-rigatoni', 'color.tomato'],
    ['rec.red-lentil-dal', 'color.gold'],
    ['rec.garlicky-greens', 'color.green'],
    ['rec.olive-oil-brownies', 'color.cocoa'],
    ['rec.mushroom-bourguignon', 'color.earth']
  ]) {
    assert.equal(colorOf(id), expected, `${id} came out ${colorOf(id)} rather than ${expected}`);
  }
});

test('a recipe may name its own color, and it wins', () => {
  const recipe = recipes.find(r => r.color);
  assert.ok(recipe, 'nothing in the collection overrides its color, so the escape hatch is untested');
  assert.ok(groupIds.has(recipe.color), `${recipe.id} names unknown color ${recipe.color}`);
  assert.equal(recipeLook(recipe, index, model).group.id, recipe.color,
    `${recipe.id} sets a color and the arithmetic overrode it`);
});

test('every recipe that overrides its color names a real one', () => {
  for (const r of recipes.filter(x => x.color)) {
    assert.ok(groupById(r.color, model), `${r.id} names unknown color group "${r.color}"`);
  }
});

test('a grill recipe gets the crosshatch and a no-cook one does not', () => {
  const grilled = recipes.find(r => (r.tags || []).includes('grill'));
  assert.equal(textureFor(grilled, model).id, 'grill', `${grilled.id} is grilled and got another pattern`);
  const raw = recipes.find(r => (r.tags || []).includes('no-cook'));
  assert.notEqual(textureFor(raw, model).id, 'grill', `${raw.id} is not cooked and got grill marks`);
});

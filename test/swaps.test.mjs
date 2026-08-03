/**
 * Tests for ingredient substitutions.
 *
 * The dangerous failure here is quiet: the app changes an amount, the amount is
 * wrong, and nothing anywhere says so. A clove of garlic is not three grams of
 * garlic powder, and a cup of dry lentils is not a can of beans. So the shape
 * of the data and the arithmetic that acts on it are both checked.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gramsFor } from '../js/nutrition.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const items = JSON.parse(readFileSync(join(root, 'data/ingredients.json'), 'utf8')).items;
const index = new Map(items.map(i => [i.id, i]));

/** The same normalisation js/swaps.js does, without pulling in the browser DOM. */
const pairs = items.flatMap(i => (i.subs || []).map(s => ({
  from: i,
  to: index.get(typeof s === 'string' ? s : s.id),
  ratio: (typeof s === 'object' && s.ratio) || 1,
  note: (typeof s === 'object' && s.note) || null,
  explicit: typeof s === 'object'
})));

test('every substitution points at an ingredient that exists', () => {
  const broken = pairs.filter(p => !p.to);
  assert.equal(broken.length, 0, `${broken.length} substitutions point nowhere`);
});

test('nothing is its own substitute', () => {
  const self = pairs.filter(p => p.to && p.from.id === p.to.id).map(p => p.from.id);
  assert.deepEqual(self, [], `listed as their own substitute: ${self.join(', ')}`);
});

test('every substitution can be converted', () => {
  // Grams are the currency of the conversion, so both sides need a gram weight
  // for at least one real unit or the swap has nothing to work from.
  const stuck = pairs.filter(p => {
    const usable = (item) => Object.entries(item.units || {}).some(([u, g]) => u !== 'g' && g > 0);
    return !usable(p.from) || !usable(p.to);
  }).map(p => `${p.from.id} -> ${p.to.id}`);
  assert.deepEqual(stuck, [], `no convertible unit: ${stuck.join(', ')}`);
});

test('a ratio far from one always carries a note', () => {
  // This is the pairing that would let the app change an amount by a factor of
  // eight and offer no explanation for it.
  const silent = pairs
    .filter(p => (p.ratio < 0.5 || p.ratio > 2) && !p.note)
    .map(p => `${p.from.id} -> ${p.to.id} (${p.ratio}x)`);
  assert.deepEqual(silent, [], `big change, no note: ${silent.join(', ')}`);
});

test('ratios stay inside a plausible range', () => {
  const wild = pairs.filter(p => !(p.ratio > 0.01 && p.ratio < 50))
    .map(p => `${p.from.id} -> ${p.to.id} (${p.ratio}x)`);
  assert.deepEqual(wild, [], `implausible multiplier: ${wild.join(', ')}`);
});

test('the pairs that are famously not one-for-one are not one-for-one here', () => {
  // Named explicitly, because "we default to 1" is exactly the assumption that
  // would make these wrong, and defaults do not announce themselves.
  const mustDiffer = [
    ['ing.garlic', 'ing.spice.garlicpowder'],
    ['ing.ginger', 'ing.spice.ginger.ground'],
    ['ing.basil', 'ing.spice.basil.dried'],
    ['ing.thyme.fresh', 'ing.spice.thyme.dried'],
    ['ing.turkey.ground93', 'ing.lentil.brown'],
    ['ing.chocolate.dark70', 'ing.cocoa'],
    ['ing.butter.unsalted', 'ing.oil.olive'],
    ['ing.pepper.jalapeno', 'ing.spice.pepperflakes']
  ];
  const flat = [];
  for (const [from, to] of mustDiffer) {
    const p = pairs.find(x => x.from.id === from && x.to?.id === to);
    assert.ok(p, `${from} -> ${to} is missing from the data`);
    if (p.ratio === 1) flat.push(`${from} -> ${to}`);
  }
  assert.deepEqual(flat, [], `still one-for-one: ${flat.join(', ')}`);
});

test('a clove of garlic converts to about an eighth of a teaspoon of powder', () => {
  const p = pairs.find(x => x.from.id === 'ing.garlic' && x.to.id === 'ing.spice.garlicpowder');
  const grams = gramsFor(p.from, 1, 'clove') * p.ratio;
  const tsp = grams / p.to.units.tsp;
  assert.ok(tsp > 0.08 && tsp < 0.2, `got ${tsp.toFixed(3)} tsp for one clove`);
});

test('a tablespoon of fresh herb converts to about a teaspoon of dried', () => {
  for (const [fresh, dried] of [['ing.basil', 'ing.spice.basil.dried'], ['ing.thyme.fresh', 'ing.spice.thyme.dried']]) {
    const p = pairs.find(x => x.from.id === fresh && x.to.id === dried);
    const grams = gramsFor(p.from, 1, 'tbsp') * p.ratio;
    const tsp = grams / p.to.units.tsp;
    assert.ok(tsp > 0.7 && tsp < 1.4, `${fresh}: 1 tbsp fresh came out as ${tsp.toFixed(2)} tsp dried`);
  }
});

test('a pound of ground turkey converts to about a cup of dry lentils', () => {
  const p = pairs.find(x => x.from.id === 'ing.turkey.ground93' && x.to.id === 'ing.lentil.brown');
  const cups = (gramsFor(p.from, 1, 'lb') * p.ratio) / p.to.units.cup;
  assert.ok(cups > 0.8 && cups < 1.3, `got ${cups.toFixed(2)} cups`);
});

test('a meat-free ingredient never offers a substitute that contains meat', () => {
  // This app's whole premise is one dinner everybody at the table can eat, so a
  // swap that quietly puts chicken stock in a vegetarian pot is a real defect
  // rather than a labelling nit. "vegetarian-check" counts as meat-free: those
  // are the cheeses that may be set with animal rennet, which is a question for
  // the label, not a reason to treat cheddar as meat.
  const meatFree = (item) => !(item.diet || []).some(d => d === 'omnivore' || d === 'pescatarian');
  const bad = pairs
    .filter(p => meatFree(p.from) && !meatFree(p.to))
    .map(p => `${p.from.id} -> ${p.to.id}`);
  assert.deepEqual(bad, [], `meat-free ingredient with a meat substitute: ${bad.join(', ')}`);
});

test('a note is a sentence, not a fragment', () => {
  const thin = pairs
    .filter(p => p.note && (p.note.length < 20 || !/[.!]$/.test(p.note.trim())))
    .map(p => `${p.from.id} -> ${p.to.id}`);
  assert.deepEqual(thin, [], `note is too short or unpunctuated: ${thin.join(', ')}`);
});

test('the graph carries the same substitutions the data does', () => {
  // The graph builder read only the string form of a substitution, so adding
  // the object form silently dropped 188 edges — a rebuild that "succeeded"
  // and lost a third of the relationships. Only CI noticed. Now this does.
  const graph = JSON.parse(readFileSync(join(root, 'data/graph.json'), 'utf8'));
  const inGraph = new Set(graph.edges
    .filter(e => e.p === 'SUBSTITUTES_WITH')
    .map(e => `${e.s} -> ${e.o}`));
  const inData = pairs.filter(p => p.to).map(p => `${p.from.id} -> ${p.to.id}`);

  const missing = inData.filter(k => !inGraph.has(k));
  const extra = [...inGraph].filter(k => !inData.includes(k));
  assert.deepEqual(missing, [], `in the data but not the graph — rebuild it: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` (+${missing.length - 5})` : ''}`);
  assert.deepEqual(extra, [], `in the graph but not the data — rebuild it: ${extra.slice(0, 5).join(', ')}`);
});

test('the graph carries the ratios too, not just the pairs', () => {
  const graph = JSON.parse(readFileSync(join(root, 'data/graph.json'), 'utf8'));
  const byKey = new Map(graph.edges
    .filter(e => e.p === 'SUBSTITUTES_WITH')
    .map(e => [`${e.s} -> ${e.o}`, e]));
  const wrong = pairs.filter(p => p.to).filter(p => {
    const e = byKey.get(`${p.from.id} -> ${p.to.id}`);
    return e && (e.ratio || 1) !== p.ratio;
  }).map(p => `${p.from.id} -> ${p.to.id}`);
  assert.deepEqual(wrong, [], `ratio differs between data and graph: ${wrong.join(', ')}`);
});

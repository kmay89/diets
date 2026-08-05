/**
 * read-aloud.test.mjs — saying a recipe out loud.
 *
 * All of this is about the normalizer, which is the part that decides whether
 * the voice can be trusted with the numbers. A synthesizer that reads "10-12
 * minutes" as "ten dash twelve" is not merely inelegant: it is wrong about the
 * one thing somebody with their hands in a bowl asked it for.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forSpeech, canSpeak } from '../js/read-aloud.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const recipes = read('data/recipes.index.json').parts
  .map(p => read(p.file)).flatMap(p => p.recipes);

test('a range is read as a range', () => {
  assert.equal(forSpeech('Roast 20-25 minutes.'), 'Roast 20 to 25 minutes.');
});

test('a temperature is degrees, not a punctuation mark', () => {
  assert.match(forSpeech('Heat the oven to 425°F.'), /425 degrees/);
});

test('a pan size is not a multiplication', () => {
  assert.match(forSpeech('Spread in a 9x13 dish.'), /9 by 13/);
});

test('a mixed number keeps its whole part and its plural', () => {
  // "1½ cups" became "1 a half cup" — wrong twice in four words.
  assert.match(forSpeech('Add 1½ cups of stock.'), /1 and a half cups/);
});

test('a fraction on its own takes a singular unit', () => {
  assert.match(forSpeech('Add 1/2 tsp salt.'), /a half teaspoon\b/);
  assert.doesNotMatch(forSpeech('Add 1/2 tsp salt.'), /teaspoons/);
});

test('one of something is not one somethings', () => {
  assert.match(forSpeech('Simmer 1 hr with 1 tbsp oil.'), /1 hour\b/);
  assert.doesNotMatch(forSpeech('Simmer 1 hr with 1 tbsp oil.'), /hours|tablespoons/);
});

test('an abbreviation loses its period but a sentence keeps its full stop', () => {
  // "bake 40 min." became "bake 40 minutes" with the full stop gone, which runs
  // the next instruction straight onto the end of this one.
  assert.equal(forSpeech('Bake 40 min.'), 'Bake 40 minutes.');
  assert.equal(forSpeech('Use 2 tbsp. oil now.'), 'Use 2 tablespoons oil now.');
});

test('a dash between clauses becomes a breath', () => {
  const said = forSpeech('until golden — not translucent, golden.');
  assert.match(said, /golden, not translucent/);
  assert.doesNotMatch(said, /—/);
});

test('nothing survives that a synthesizer would spell out', () => {
  for (const r of recipes) {
    for (const s of r.steps || []) {
      const said = forSpeech(s);
      assert.doesNotMatch(said, /[—–°×]|\*/, `${r.id}: "${said.slice(0, 80)}"`);
      assert.doesNotMatch(said, /\d\s*-\s*\d/, `${r.id}: unconverted range in "${said.slice(0, 80)}"`);
      assert.doesNotMatch(said, /\btbsp\b|\btsp\b|\boz\b/, `${r.id}: "${said.slice(0, 80)}"`);
    }
  }
});

test('every step still says something after normalizing', () => {
  for (const r of recipes) {
    for (const s of r.steps || []) {
      const said = forSpeech(s);
      assert.ok(said.length >= s.length * 0.6,
        `${r.id}: normalizing ate the step — "${s.slice(0, 50)}" became "${said.slice(0, 50)}"`);
    }
  }
});

test('empty and rubbish input is handled rather than thrown at', () => {
  for (const input of ['', null, undefined, 0, '   ']) {
    assert.equal(typeof forSpeech(input), 'string');
  }
});

test('there is no synthesizer in node, and asking is safe', () => {
  // The point is that canSpeak() answers rather than throwing where there is no
  // window — the module is imported by views that render server-side in tests.
  assert.equal(canSpeak(), false);
});

test('nothing in this module reaches for the network', () => {
  // The voice is a system service on this device. A cloud voice would sound
  // better and would be the first network call this app has ever made.
  const src = readFileSync(new URL('../js/read-aloud.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/,
    'read-aloud.js has grown a network call');
});

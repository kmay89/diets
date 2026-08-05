/**
 * Tests for importing somebody else's recipe.
 *
 * A parser has two ways to fail and only one of them is visible. Failing to
 * read a line is obvious — it shows up as a line the person has to finish, ten
 * seconds of work. Reading it *wrong* is invisible: the recipe looks complete,
 * the shopping list looks right, and the nutrition, the flavor panel and the
 * sodium score are all quietly built on a number nobody typed.
 *
 * So most of what is checked here is the second kind. "Salt and pepper to
 * taste" matched *Serrano pepper* at 0.39 in the first version — a confident,
 * plausible, completely wrong answer that would have put a chili into a dish
 * and never appeared on screen. That case is the reason for the confidence
 * floor and for the two-things guard, and it is pinned below.
 *
 * The other pinned case is the mixed number. "1 1/2 cups" read as one cup is a
 * third of the flour missing from a cake, with nothing to explain it.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseAmount, parseIngredientLine, matchIngredient, parseRecipe,
  fromText, fromJsonLd, parseDuration
} from '../js/recipe-parse.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const items = JSON.parse(readFileSync(join(root, 'data/ingredients.json'), 'utf8')).items;

/* ------------------------------------------------------------------ *
 * Amounts
 * ------------------------------------------------------------------ */

test('a mixed number is the whole of it, not the first half', () => {
  // "1 1/2 cups" read as one cup is a third of the flour missing from a cake,
  // and nothing on screen to explain the result.
  assert.equal(parseAmount('1 1/2'), 1.5);
  assert.equal(parseAmount('1½'), 1.5);
  assert.equal(parseAmount('2 3/4'), 2.75);
  assert.equal(parseAmount('½'), 0.5);
  assert.equal(parseAmount('1.5'), 1.5);
});

test('a written amount is still an amount', () => {
  assert.equal(parseAmount('one'), 1);
  assert.equal(parseAmount('a'), 1);
  assert.equal(parseAmount('half'), 0.5);
});

test('nothing is not something', () => {
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('a pinch'), null, 'a pinch is not a number');
  assert.equal(parseAmount('some'), null);
  assert.equal(parseAmount('0'), null, 'zero of a thing is not an amount');
});

/* ------------------------------------------------------------------ *
 * Lines
 * ------------------------------------------------------------------ */

test('a range takes its lower bound', () => {
  // "2-3 cloves" is two cloves and a suggestion. Rounding somebody's garlic up
  // without asking is the kind of quiet change that makes an import
  // untrustworthy for everything else it did.
  const p = parseIngredientLine('2-3 cloves garlic, minced');
  assert.equal(p.qty, 2);
  assert.equal(p.unit, 'clove');
  assert.equal(p.name, 'garlic');
  assert.equal(p.prep, 'minced');
});

test('what comes after the comma is preparation, not identity', () => {
  const p = parseIngredientLine('1 yellow onion, finely diced');
  assert.equal(p.name, 'yellow onion');
  assert.equal(p.prep, 'finely diced');
});

test('the noise recipe writers add is dropped from the name', () => {
  assert.equal(parseIngredientLine('2 tablespoons olive oil, divided').name, 'olive oil');
  assert.equal(parseIngredientLine('1 (15-ounce) can black beans, drained').name, 'black beans');
  assert.equal(parseIngredientLine('1 cup parsley, optional').optional, true);
});

test('a line with no number still becomes a line, and says it was a guess', () => {
  // Dropping it would lose an ingredient; inventing a confident "1" would put a
  // number in the nutrition nobody wrote. It gets a one and admits to it.
  const p = parseIngredientLine('Salt and pepper');
  assert.equal(p.qty, 1);
  assert.equal(p.sure, false);
  assert.equal(parseIngredientLine('2 eggs').sure, true);
});

test('a bare count is "each", the unit the database counts in', () => {
  const p = parseIngredientLine('4 red bell peppers');
  assert.equal(p.unit, 'each');
  assert.equal(p.qty, 4);
});

/* ------------------------------------------------------------------ *
 * Matching — where a wrong answer is invisible
 * ------------------------------------------------------------------ */

test('a line naming two things never becomes one of them', () => {
  // The regression this file exists for. "Salt and pepper to taste" scored 0.39
  // against Serrano pepper — a confident, plausible, completely wrong answer
  // that puts a chili in the dish, moves the heat axis on the flavor panel, and
  // never appears anywhere a person would look.
  assert.equal(matchIngredient('Salt and pepper', items), null);
  assert.equal(matchIngredient('oil and butter', items), null);
});

test('but a real name containing "and" is left alone', () => {
  // Only lines where both halves are separately ingredients are refused.
  const p = parseIngredientLine('1 cup black beans and corn');
  assert.equal(matchIngredient(p.name, items), null, 'two ingredients, correctly refused');
  assert.ok(matchIngredient('sharp cheddar', items), 'a plain name still matches');
});

test('the obvious ones are certain', () => {
  const sure = (name) => {
    const m = matchIngredient(name, items);
    assert.ok(m, `${name} matched nothing`);
    return m;
  };
  assert.equal(sure('olive oil').item.id, 'ing.oil.olive');
  assert.equal(sure('garlic').item.id, 'ing.garlic');
  assert.ok(sure('smoked paprika').score >= 0.9);
  assert.ok(sure('red bell peppers').item.name.toLowerCase().includes('bell pepper'));
});

test('a word that means nothing on its own matches nothing', () => {
  // "sauce" is a dozen things and "fresh" is nine. Guessing one of them is
  // worse than handing the line back.
  for (const vague of ['sauce', 'seasoning', 'fresh', 'stuff', 'topping']) {
    const m = matchIngredient(vague, items);
    assert.ok(!m || m.score >= 0.45, `${vague} matched ${m?.item.name} at ${m?.score}`);
  }
});

test('every match carries how sure it is', () => {
  const m = matchIngredient('black beans', items);
  assert.ok(m.score > 0 && m.score <= 1, 'a match with no confidence is a match nobody can check');
});

/* ------------------------------------------------------------------ *
 * A whole paste
 * ------------------------------------------------------------------ */

const PASTE = `Stuffed Peppers

Ingredients
1 cup quinoa, rinsed
2 tablespoons olive oil
1 yellow onion, diced
3 cloves garlic, minced
1 can black beans, drained
Salt and pepper to taste

Instructions
1. Heat oven to 375F. Cook the quinoa in 2 cups water for 15 minutes.
2. Cook onion in oil 6 minutes; add garlic for 45 seconds until fragrant.`;

test('a pasted recipe comes out in the shape the app thinks in', () => {
  const r = parseRecipe(PASTE, items);
  assert.equal(r.from, 'text');
  assert.equal(r.title, 'Stuffed Peppers');
  assert.equal(r.steps.length, 2);
  assert.ok(r.lines.length >= 5);
  for (const line of r.lines) {
    assert.ok(line.ing?.startsWith('ing.'), 'a line without an ingredient id is not importable');
    assert.ok(line.qty > 0);
    assert.ok(line.unit);
  }
});

test('what could not be read is handed back, never dropped', () => {
  // The whole design. A parser that silently loses two lines produces a recipe
  // with wrong nutrition and a short shopping list, and nothing says so.
  const r = parseRecipe(PASTE, items);
  assert.ok(r.needsYou.length >= 1, 'the salt-and-pepper line vanished');
  assert.ok(r.needsYou.some(n => /salt/i.test(n.name)));
  const total = r.lines.length + r.needsYou.length;
  assert.equal(total, 6, `${total} lines out of 6 pasted — the rest went nowhere`);
});

test('a numbered instruction is a step, not an ingredient', () => {
  // Both start with a digit. The one that runs to a sentence is the step.
  const t = fromText(PASTE);
  assert.ok(t.steps.every(s => !/^\d+[.)]/.test(s)), 'a step kept its list number');
  assert.ok(t.ingredients.every(i => i.length < 90));
  assert.ok(t.steps[0].startsWith('Heat oven'));
});

test('an empty paste is nothing rather than an empty recipe', () => {
  assert.equal(parseRecipe('', items), null);
  assert.equal(parseRecipe('   \n  \n', items), null);
});

/* ------------------------------------------------------------------ *
 * The accurate route
 * ------------------------------------------------------------------ */

const PAGE = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
 {"@type":"WebSite","name":"Some Blog"},
 {"@type":"Recipe","name":"Weeknight Dal","description":"Fast and good.",
  "recipeYield":"6 servings","prepTime":"PT10M","totalTime":"PT1H5M",
  "recipeIngredient":["1 cup red lentils","2 tablespoons olive oil","3 cloves garlic, minced"],
  "recipeInstructions":[{"@type":"HowToStep","text":"Rinse the lentils."},
                        {"@type":"HowToStep","text":"Simmer 25 minutes until soft."}]}
]}
</script></head><body>…</body></html>`;

test('a pasted page gives the site\'s own numbers rather than a guess', () => {
  const r = parseRecipe(PAGE, items);
  assert.equal(r.from, 'page');
  assert.equal(r.title, 'Weeknight Dal');
  assert.equal(r.servings, 6);
  assert.equal(r.activeMin, 10);
  assert.equal(r.totalMin, 65);
  assert.deepEqual(r.steps, ['Rinse the lentils.', 'Simmer 25 minutes until soft.']);
  assert.equal(r.lines.length, 3);
});

test('the recipe is found however the page nested it', () => {
  assert.ok(fromJsonLd(PAGE), 'not found inside @graph');
  const flat = PAGE.replace('"@graph":[\n {"@type":"WebSite","name":"Some Blog"},\n ', '"@graph":[');
  assert.ok(fromJsonLd(flat));
});

test('ISO durations become minutes, and nonsense becomes nothing', () => {
  assert.equal(parseDuration('PT30M'), 30);
  assert.equal(parseDuration('PT1H30M'), 90);
  assert.equal(parseDuration('PT2H'), 120);
  assert.equal(parseDuration('later'), 0);
  assert.equal(parseDuration(undefined), 0);
});

test('a page with no recipe in it falls back rather than throwing', () => {
  const junk = '<html><script type="application/ld+json">{"@type":"Article"}</script></html>';
  assert.equal(fromJsonLd(junk), null);
  assert.doesNotThrow(() => parseRecipe(junk, items));
});

test('malformed JSON-LD does not take the import down with it', () => {
  const broken = '<script type="application/ld+json">{ not json at all </script>';
  assert.equal(fromJsonLd(broken), null);
});

/* ------------------------------------------------------------------ *
 * Never the network
 * ------------------------------------------------------------------ */

test('nothing here fetches anything', () => {
  // The site's content policy allows no other origin, and a meal planner that
  // has never made a network call of its own is worth more than saving somebody
  // one copy and paste. If this module ever grows a fetch, the app stops being
  // able to make that claim.
  const source = readFileSync(join(root, 'js/recipe-parse.js'), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/);
});

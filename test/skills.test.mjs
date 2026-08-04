/**
 * Tests for the technique map.
 *
 * The failure this screen dies of is not missing a skill. It is crediting one
 * nobody used — "you have made an emulsion" on a dish that says "reduced-sodium
 * broth", because "reduce" was matched as a substring. A cook who catches one
 * wrong entry stops believing every other entry on the page, and the whole
 * thing becomes decoration. So the matching is tested for what it must *not*
 * match at least as hard as for what it must.
 *
 * The second failure is quieter: a screen that says the same thing forever.
 * A technique the collection cannot teach is a reproach rather than a
 * suggestion, and a technique every recipe matches is not information. Both are
 * measured here against all 242 rather than against an example.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RECIPE_FILES } from '../tools/recipe-files.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

globalThis.fetch = async (u) => ({ ok: true, json: async () => read(String(u).replace(/^\.?\//, '')) });

const {
  loadSkills, allSkills, skillGroups, saysIt, recipeShows, skillsIn,
  recipesShowing, skillsFor, nextSkills, craftLine
} = await import('../js/skills.js');

await loadSkills();

const recipes = RECIPE_FILES.flatMap(f => read(f).recipes);
const recipeIndex = new Map(recipes.map(r => [r.id, r]));
const tips = read('data/tips.json').tips;

const dish = (over = {}) => ({
  id: 'rec.test', title: 'Test', blurb: '', cuisine: 'italian',
  steps: [], ingredients: [], ...over
});

/* ------------------------------------------------------------------ *
 * Not crediting things that did not happen
 * ------------------------------------------------------------------ */

test('a technique word is a whole word, not a substring', () => {
  // "reduced-sodium broth" is in a great many recipes and is not a reduction.
  assert.ok(saysIt('reduce the sauce by half', 'reduce'));
  assert.ok(!saysIt('use reduced-sodium broth', 'reduce'));
  assert.ok(!saysIt('research the topic', 'sear'));
  assert.ok(!saysIt('the searing pain', 'sear'));
  assert.ok(saysIt('sear the tofu on one side', 'sear'));
});

test('a multi-word phrase is matched whole', () => {
  assert.ok(saysIt('take it off the heat and stir in the parsley', 'off the heat'));
  assert.ok(!saysIt('turn the heat down', 'off the heat'));
});

test('a dish that does none of it is credited with none of it', () => {
  assert.deepEqual(skillsIn(dish({ steps: ['Put everything in a bowl and stir.'] })), []);
});

test('breadth skills are never credited from a recipe', () => {
  // They are counted from the whole log — how many cuisines, how many families
  // — and a single dish saying the word "range" must not award one.
  for (const skill of allSkills().filter(s => s.kind === 'breadth')) {
    assert.equal(recipeShows(dish({ blurb: skill.name, steps: [skill.short] }), skill), false,
      `${skill.id} was credited from one recipe's text`);
  }
});

/* ------------------------------------------------------------------ *
 * Crediting the things that did
 * ------------------------------------------------------------------ */

test('the obvious cases are caught', () => {
  const has = (steps, id) => skillsIn(dish({ steps })).some(s => s.id === id);
  assert.ok(has(['Deglaze with the wine, scraping up the brown bits.'], 'skill.fond'));
  assert.ok(has(['Simmer until reduced by half.'], 'skill.reduce'));
  assert.ok(has(['Cook the spices in the oil until fragrant.'], 'skill.bloom'));
  assert.ok(has(['Reserve a cup of pasta water before draining.'], 'skill.starch-water'));
  assert.ok(has(['Stir until just combined; a few lumps are fine.'], 'skill.dough'));
});

/* ------------------------------------------------------------------ *
 * The shape of the model against the whole collection
 * ------------------------------------------------------------------ */

test('every technique is one the collection can actually teach', () => {
  // A skill nothing here teaches is not a suggestion, it is a reproach: the app
  // telling somebody to learn a thing and offering no way to do it.
  for (const skill of allSkills()) {
    if (skill.kind === 'breadth') continue;
    const n = recipesShowing(skill, recipes).length;
    assert.ok(n > 0, `${skill.id} is taught by nothing in the collection`);
  }
});

test('no technique matches so much of the collection that it says nothing', () => {
  for (const skill of allSkills()) {
    if (skill.kind === 'breadth') continue;
    const share = recipesShowing(skill, recipes).length / recipes.length;
    assert.ok(share < 0.5,
      `${skill.id} matches ${Math.round(share * 100)}% of the collection — that is not a technique, that is a coincidence`);
  }
});

test('a technique the collection barely teaches is not asked for many times over', () => {
  // Requiring four goes at something only three dishes teach means it can only
  // ever be reached by cooking the same dish repeatedly, which is not what the
  // number is measuring.
  for (const skill of allSkills()) {
    if (skill.kind === 'breadth') continue;
    const n = recipesShowing(skill, recipes).length;
    assert.ok((skill.at || 1) <= n,
      `${skill.id} wants ${skill.at} goes but only ${n} dishes teach it`);
  }
});

test('every technique says what it is, why it matters and what it opens up', () => {
  const groups = new Set(skillGroups().map(g => g.id));
  const seen = new Set();
  for (const skill of allSkills()) {
    assert.ok(!seen.has(skill.id), `duplicate skill id ${skill.id}`);
    seen.add(skill.id);
    assert.ok(groups.has(skill.group), `${skill.id} is in no group`);
    assert.ok(skill.name?.length > 2, `${skill.id} has no name`);
    for (const key of ['short', 'what', 'unlocks']) {
      assert.ok(skill[key]?.length > 20, `${skill.id} has no ${key}`);
    }
    if (skill.tip) {
      assert.ok(tips.some(t => t.id === skill.tip), `${skill.id} points at a note that is not there`);
    }
    if (skill.kind === 'breadth') {
      assert.ok(['cuisine', 'technique', 'repeat'].includes(skill.of), `${skill.id} counts nothing`);
    } else {
      assert.ok(skill.words?.length, `${skill.id} has no way to be recognized`);
    }
  }
});

test('nothing on this screen congratulates anybody', () => {
  // The progress screen has said since it was written that it is not a
  // scoreboard. A trophy vocabulary here would be the app arguing with itself.
  // Narrow on purpose: "the point is the edges" is ordinary English about
  // roasting, and a test that flags it would push the prose around for nothing.
  const words = /\b(unlocked|achievement|badge|congratulat|well done|level up|earn(ed)? points|xp)\b/i;
  for (const skill of allSkills()) {
    const prose = `${skill.name} ${skill.short} ${skill.what} ${skill.unlocks}`;
    assert.doesNotMatch(prose, words, `${skill.id} reads like a video game`);
  }
});

/* ------------------------------------------------------------------ *
 * Counting a kitchen
 * ------------------------------------------------------------------ */

const cooked = (ids) => ({
  history: ids.map((id, i) => ({ id, at: new Date(2026, 0, 1 + i).toISOString() })),
  recipeLikes: {}
});

test('a kitchen that has cooked nothing is told nothing', () => {
  // An app announcing that somebody has learned nothing yet is an app being
  // unpleasant about a blank slate.
  const picture = skillsFor(cooked([]), recipeIndex);
  assert.equal(picture.cooks, 0);
  assert.equal(picture.have.length, 0);
  assert.equal(craftLine(picture), null);
});

test('repetition counts, because that is how a technique is actually learned', () => {
  const braise = recipes.find(r => skillsIn(r).some(s => s.id === 'skill.lowslow'));
  assert.ok(braise, 'no braise in the collection to test with');
  const once = skillsFor(cooked([braise.id]), recipeIndex);
  const thrice = skillsFor(cooked([braise.id, braise.id, braise.id]), recipeIndex);
  const of = (p) => p.all.find(s => s.skill.id === 'skill.lowslow').count;
  assert.equal(of(once), 1);
  assert.equal(of(thrice), 3, 'making the same braise three times was counted once');
});

test('a cook of a recipe that is no longer in the collection is skipped, not crashed on', () => {
  const picture = skillsFor(cooked(['rec.deleted-long-ago']), recipeIndex);
  assert.equal(picture.cooks, 0);
});

test('breadth is counted across the log rather than within a dish', () => {
  const byCuisine = new Map();
  for (const r of recipes) if (!byCuisine.has(r.cuisine)) byCuisine.set(r.cuisine, r);
  const ten = [...byCuisine.values()].slice(0, 10);
  const picture = skillsFor(cooked(ten.map(r => r.id)), recipeIndex);
  assert.equal(picture.breadth.cuisine, 10);
  assert.equal(picture.breadth.repeat, 1, 'ten different dishes read as a repeat');
});

test('what to try next is always something the collection can teach', () => {
  const picture = skillsFor(cooked([recipes[0].id]), recipeIndex);
  const next = nextSkills(picture, recipes, { limit: 5 });
  assert.ok(next.length, 'a kitchen one dish in was offered nothing to learn');
  for (const entry of next) {
    assert.ok(entry.recipes.length > 0, `${entry.skill.id} was offered with no dish behind it`);
    assert.notEqual(entry.skill.kind, 'breadth', 'a breadth count was offered as a thing to go and do');
  }
});

test('a technique already picked up is never offered as something to try', () => {
  const picture = skillsFor(cooked(recipes.slice(0, 40).map(r => r.id)), recipeIndex);
  const haveIds = new Set(picture.have.map(s => s.skill.id));
  for (const entry of nextSkills(picture, recipes, { limit: 8 })) {
    assert.ok(!haveIds.has(entry.skill.id), `${entry.skill.id} was suggested after being learned`);
  }
});

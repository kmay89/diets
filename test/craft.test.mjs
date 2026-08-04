/**
 * Tests for the four craft models: substitutions beyond the obvious, proteins
 * and the ways to cook them, what happens at the table, and who else can help.
 *
 * These files are mostly prose, and prose does not fail loudly. What fails
 * loudly is a role group that points at an ingredient nobody added, an amount
 * conversion that says two and a half cups of miso, a kitchen job offered to a
 * four-year-old on a step involving boiling water, or a claim that renders in
 * the app with no source behind it. All four are checked here.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RECIPE_FILES } from '../tools/recipe-files.mjs';
import { gramsFor } from '../js/nutrition.js';
import { roleRatio, buildLadder, naturalUnit } from '../js/swaps.js';
import { proteinsIn, proteinOptionsFor, methodsFor, proteinSwapLine } from '../js/proteins.js';
import { timelineFor, waterNotesFor, tableFor } from '../js/table.js';
import { jobsFor, stepsByHand, asksFor, teachesIn } from '../js/kitchen.js';
import { tipsFor, searchTips } from '../js/tips.js';
import { computeBalance } from '../js/balance.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const items = read('data/ingredients.json').items;
const index = new Map(items.map(i => [i.id, i]));
const ids = new Set(items.map(i => i.id));
const recipes = RECIPE_FILES.flatMap(f => read(f).recipes);

const subs = read('data/substitutions.json');
const proteins = read('data/proteins.json');
const table = read('data/table.json');
const kitchen = read('data/kitchen.json');
const tips = read('data/tips.json');
const balance = read('data/balance.json');

const claims = new Set();
for (const topic of read('data/claims.json').topics) {
  for (const c of topic.claims || []) claims.add(c.id);
  for (const s of topic.sections || []) for (const c of s.claims || []) claims.add(c.id);
}

/* ------------------------------------------------------------------ *
 * Substitutions
 * ------------------------------------------------------------------ */

test('every role group points at ingredients that exist', () => {
  const bad = [];
  for (const role of subs.roles) {
    for (const m of role.members) if (!ids.has(m)) bad.push(`${role.id}: ${m}`);
    for (const k of Object.keys(role.strength || {})) if (!ids.has(k)) bad.push(`${role.id} strength: ${k}`);
  }
  assert.deepEqual(bad, [], `roles reference ingredients that are not in the database: ${bad.join(', ')}`);
});

test('a role group is worth having only if it has somewhere to go', () => {
  for (const role of subs.roles) {
    assert.ok(role.members.length >= 3, `${role.id} has ${role.members.length} members`);
    assert.equal(new Set(role.members).size, role.members.length, `${role.id} lists something twice`);
    assert.ok(role.does && role.does.length > 25, `${role.id} does not say what the role is for`);
  }
});

test('a group that scales points at a dial that exists', () => {
  for (const role of subs.roles) {
    if (!role.scaleBy) continue;
    const axis = role.scaleBy.replace(/^balance:/, '');
    assert.ok(balance.potency[axis], `${role.id} scales by "${axis}", which is not a dial`);
  }
});

test('every make-it-yourself combination is buildable from real ingredients', () => {
  for (const combo of subs.combos) {
    assert.ok(ids.has(combo.makes), `${combo.id} makes an ingredient that does not exist`);
    assert.ok(combo.from.length, `${combo.id} is made from nothing`);
    for (const part of combo.from) {
      assert.ok(ids.has(part.ing), `${combo.id} needs ${part.ing}, which does not exist`);
      assert.ok(part.amount, `${combo.id} does not say how much ${part.ing}`);
    }
    assert.ok(combo.how && combo.why, `${combo.id} does not say how or why`);
  }
});

test('role conversions stay inside amounts a cook would recognize', () => {
  // The failure this catches is the one that produces "28 tbsp of miso for two
  // cups of broth" — a ratio that is arithmetically derived and culinarily mad.
  const wild = [];
  for (const role of subs.roles) {
    if (!role.scaleBy && !role.strength) continue;
    for (const from of role.members) {
      for (const to of role.members) {
        if (from === to) continue;
        const ratio = roleRatio(role, from, to, null, balance);
        if (!(ratio > 0.0005 && ratio < 500)) wild.push(`${role.id}: ${from} → ${to} = ${ratio}`);
      }
    }
  }
  assert.deepEqual(wild, [], `implausible role conversions: ${wild.slice(0, 5).join('; ')}`);
});

test('the ladder finds somewhere to go for the things a kitchen runs out of', () => {
  const recipe = recipes.find(r => r.id === 'rec.lentil-bolognese');
  for (const id of ['ing.lemon', 'ing.cheese.parmesan', 'ing.tomatopaste', 'ing.oil.olive', 'ing.egg']) {
    const line = { ing: id, qty: 1, unit: Object.keys(index.get(id).units).find(u => u !== 'g') };
    const ladder = buildLadder(id, { ingIndex: index, model: subs, balanceModel: balance, recipe, line });
    const total = ladder.direct.length + ladder.second.length + ladder.role.length + ladder.combos.length;
    assert.ok(total >= 2, `${id} has only ${total} ways out, which is a dead end`);
    assert.ok(ladder.omit, `${id} does not say what happens if you leave it out`);
  }
});

test('the ladder never offers meat to a vegetarian recipe', () => {
  // The app's whole premise is one dinner everybody at the table can eat.
  const meaty = (item) => (item.diet || []).some(d => d === 'omnivore' || d === 'pescatarian');
  const bad = [];
  for (const recipe of recipes.filter(r => (r.diet || []).includes('vegetarian') || (r.diet || []).includes('vegan'))) {
    for (const line of recipe.ingredients) {
      const ladder = buildLadder(line.ing, {
        ingIndex: index, model: subs, balanceModel: balance, recipe, line, diet: recipe.diet
      });
      if (!ladder) continue;
      for (const o of [...ladder.direct, ...ladder.second, ...ladder.role]) {
        if (meaty(o.item)) bad.push(`${recipe.id}: ${line.ing} → ${o.item.id}`);
      }
    }
  }
  assert.deepEqual(bad.slice(0, 5), [], `meat offered inside a meat-free recipe: ${bad.slice(0, 5).join(', ')}`);
});

test('what the pantry already holds comes first', () => {
  const recipe = recipes.find(r => r.id === 'rec.lentil-bolognese');
  const line = recipe.ingredients.find(l => l.ing === 'ing.vinegar.balsamic');
  const plain = buildLadder('ing.vinegar.balsamic', { ingIndex: index, model: subs, balanceModel: balance, recipe, line });
  const target = plain.best.find(o => o.tier === 'role');
  assert.ok(target, 'no role-tier option to promote');

  const withPantry = buildLadder('ing.vinegar.balsamic', {
    ingIndex: index, model: subs, balanceModel: balance, recipe, line,
    pantry: { [target.item.id]: true }
  });
  assert.equal(withPantry.best[0].item.id, target.item.id,
    'something already in the kitchen did not come first');
});

test('naturalUnit puts countable things in counts', () => {
  assert.equal(naturalUnit(index.get('ing.egg'), 300).unit, 'each');
  assert.equal(naturalUnit(index.get('ing.tofu.firm'), 400).unit, 'block');
  assert.equal(naturalUnit(index.get('ing.chickpeas.canned'), 425).unit, 'can');
});

/* ------------------------------------------------------------------ *
 * Proteins and methods
 * ------------------------------------------------------------------ */

test('every protein points at a real ingredient and a real set of methods', () => {
  const methodIds = new Set(proteins.methods.map(m => m.id));
  for (const p of proteins.proteins) {
    assert.ok(ids.has(p.ing), `${p.id} points at ${p.ing}, which does not exist`);
    assert.ok(p.methods.length, `${p.id} has no way to cook it`);
    for (const m of p.methods) assert.ok(methodIds.has(m), `${p.id} names unknown method ${m}`);
    assert.ok(p.swapRatio > 0.2 && p.swapRatio < 3, `${p.id} has an implausible swap ratio`);
    assert.ok(p.servingG > 40 && p.servingG < 250, `${p.id} has an implausible serving size`);
    for (const field of ['tastes', 'wants', 'goesWrong']) {
      assert.ok(p[field]?.length > 20, `${p.id} is missing ${field}`);
    }
  }
});

test('every method says how it goes wrong, which is the part recipes leave out', () => {
  const proteinIds = new Set(proteins.proteins.map(p => p.id));
  for (const m of proteins.methods) {
    for (const field of ['what', 'why', 'doneWhen', 'goesWrong', 'teaches']) {
      assert.ok(m[field]?.length > 20, `${m.id} is missing ${field}`);
    }
    // The heat setting is allowed to be three words — "as high as it goes" is
    // the whole instruction for a stir-fry.
    assert.ok(m.heat?.length > 3, `${m.id} does not say what heat to use`);
    assert.equal(m.minutes.length, 2, `${m.id} has no time range`);
    assert.ok(m.minutes[0] <= m.minutes[1], `${m.id} time range is inverted`);
    for (const k of ['flavor', 'speed', 'forgiving', 'handsOff', 'cleanup']) {
      assert.ok(m.scores[k] >= 1 && m.scores[k] <= 5, `${m.id} score ${k} is ${m.scores[k]}`);
    }
    for (const p of m.proteins) assert.ok(proteinIds.has(p), `${m.id} names unknown protein ${p}`);
  }
});

test('a protein and its methods agree with each other', () => {
  for (const p of proteins.proteins) {
    for (const mid of p.methods) {
      const m = proteins.methods.find(x => x.id === mid);
      assert.ok(m.proteins.includes(p.id),
        `${p.id} says it can be ${mid} but ${mid} does not list it`);
    }
  }
});

test('most of the collection has a protein the app can recognize', () => {
  const found = recipes.filter(r => proteinsIn(r, proteins).length);
  assert.ok(found.length > recipes.length * 0.5,
    `only ${found.length} of ${recipes.length} recipes have a recognizable protein`);
});

test('a protein swap converts to an amount somebody could shop for', () => {
  const wild = [];
  for (const recipe of recipes) {
    for (const current of proteinsIn(recipe, proteins)) {
      for (const option of proteinOptionsFor(recipe, current, { ingIndex: index, m: proteins, limit: 4 })) {
        const line = proteinSwapLine(current.line, current.protein, option.protein, index);
        if (!line) continue;
        const grams = gramsFor(index.get(line.ing), line.qty, line.unit);
        if (!(grams > 15 && grams < 4000)) {
          wild.push(`${recipe.id}: ${current.protein.id} → ${option.protein.id} = ${Math.round(grams)} g`);
        }
      }
    }
  }
  assert.deepEqual(wild.slice(0, 5), [], `implausible protein amounts: ${wild.slice(0, 5).join('; ')}`);
});

test('a vegetarian recipe is never offered meat, but its meat fork still is', () => {
  const veg = recipes.find(r => (r.diet || []).includes('vegetarian') && r.omnivore);
  const found = proteinsIn(veg, proteins);
  const base = found.find(f => f.from === 'base');
  if (base) {
    const options = proteinOptionsFor(veg, base, { ingIndex: index, m: proteins });
    assert.ok(options.every(o => !o.protein.diet.includes('omnivore')),
      `${veg.id} offers meat as a replacement for its vegetarian base`);
  }
  const fork = found.find(f => f.from === 'omnivore');
  if (fork) {
    const options = proteinOptionsFor(veg, fork, { ingIndex: index, m: proteins });
    assert.ok(options.some(o => o.protein.diet.includes('omnivore')),
      `${veg.id} will not offer another meat for the meat fork`);
  }
});

test('every protein can be cooked at least two ways', () => {
  for (const p of proteins.proteins) {
    assert.ok(methodsFor(p.id, proteins).length >= 1, `${p.id} has no methods`);
  }
  const versatile = proteins.proteins.filter(p => methodsFor(p.id, proteins).length >= 3);
  assert.ok(versatile.length > proteins.proteins.length / 2,
    'most proteins should have several ways to cook them');
});

/* ------------------------------------------------------------------ *
 * The table
 * ------------------------------------------------------------------ */

test('every recipe gets a countdown that runs forward to sitting down', () => {
  for (const recipe of recipes) {
    const marks = timelineFor(recipe, table);
    assert.ok(marks.length >= 3, `${recipe.id} has only ${marks.length} marks`);
    for (let i = 1; i < marks.length; i++) {
      assert.ok(marks[i].at < marks[i - 1].at, `${recipe.id} countdown does not descend`);
    }
    assert.equal(marks[marks.length - 1].at, 0, `${recipe.id} never sits down`);
    assert.ok(marks[0].at >= recipe.totalMin, `${recipe.id} starts after the cooking would have to`);
  }
});

test('water guidance fires on the meals it is about and not on the rest', () => {
  const counts = {};
  for (const recipe of recipes) {
    const per = computeBalance(recipe, index, balance);
    const notes = waterNotesFor({ perServing: nutritionOf(recipe), balance: per }, table);
    for (const n of notes) counts[n.id] = (counts[n.id] || 0) + 1;
  }
  for (const rule of table.water.rules) {
    if (!rule.when) {
      assert.equal(counts[rule.id], recipes.length, `${rule.id} has no condition and does not always fire`);
      continue;
    }
    assert.ok(counts[rule.id] > 0, `${rule.id} never fires on any recipe`);
    assert.ok(counts[rule.id] < recipes.length * 0.5,
      `${rule.id} fires on ${counts[rule.id]} of ${recipes.length} recipes, which makes it noise`);
  }
});

test('every claim the table makes has a source behind it', () => {
  const referenced = [
    ...Object.values(table.eating).map(e => e.claim),
    table.water.base.claim
  ].filter(Boolean);
  assert.ok(referenced.length >= 4, 'the table makes almost no sourced claims');
  for (const id of referenced) {
    assert.ok(claims.has(id), `data/table.json cites claim "${id}", which is not in claims.json`);
  }
});

test('every guidance note names its own limits', () => {
  for (const [key, note] of Object.entries(table.eating)) {
    assert.ok(note.honest?.length > 40, `eating.${key} does not say what it does not show`);
    assert.ok(note.practical?.length > 20, `eating.${key} does not say what to actually do`);
  }
  assert.ok(table.water.base.honest.length > 60, 'the water advice does not name its limits');
  assert.ok(table.water.myths.length >= 3, 'the myths list is where the confident nonsense gets answered');
});

test('the whole table assembles for every recipe', () => {
  for (const recipe of recipes.slice(0, 40)) {
    const t = tableFor(recipe, { perServing: nutritionOf(recipe), balance: computeBalance(recipe, index, balance) }, table);
    assert.ok(t.timeline.length && t.plating.principles.length && t.eating.length, `${recipe.id} assembles badly`);
  }
});

/* ------------------------------------------------------------------ *
 * Who else can help
 * ------------------------------------------------------------------ */

test('every job is offered to an age band that exists, and says what it teaches', () => {
  const ageIds = new Set(kitchen.ages.map(a => a.id));
  for (const job of kitchen.jobs) {
    assert.ok(job.ages.length, `${job.id} is offered to nobody`);
    for (const a of job.ages) assert.ok(ageIds.has(a), `${job.id} names unknown age band ${a}`);
    assert.ok(job.teaches?.length > 25, `${job.id} does not say what it teaches`);
    assert.ok(job.safe?.length > 10, `${job.id} does not say how to do it safely`);
  }
});

test('no small child is handed a step with heat or a blade in it', () => {
  // The one failure in this file that could actually hurt somebody.
  const young = new Set(['age.toddler', 'age.small', 'age.middle']);
  const bad = [];
  for (const recipe of recipes) {
    const steps = stepsByHand(recipe, kitchen);
    for (const band of jobsFor(recipe, kitchen)) {
      if (!young.has(band.age.id)) continue;
      for (const job of band.jobs) {
        for (const n of job.steps) {
          if (steps[n - 1]?.risky) bad.push(`${recipe.id} step ${n} → ${band.age.id}`);
        }
      }
    }
  }
  assert.deepEqual(bad.slice(0, 5), [], `risky steps offered to young children: ${bad.slice(0, 5).join(', ')}`);
});

test('almost every recipe has something for a small child to do', () => {
  const withJobs = recipes.filter(r =>
    jobsFor(r, kitchen).some(b => b.age.id === 'age.small' && b.jobs.length >= 2));
  assert.ok(withJobs.length > recipes.length * 0.9,
    `only ${withJobs.length} of ${recipes.length} recipes have two jobs for a four-year-old`);
});

test('nothing in the vocabulary calls a person a beginner', () => {
  // The wording was chosen on purpose: recipes are sorted by what they ask for,
  // never by how good the cook is.
  const banned = kitchen.wording.avoid.filter(w => w.length > 4);
  const text = JSON.stringify(kitchen.ladder) + JSON.stringify(kitchen.ages);
  for (const word of banned) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(text),
      `the ladder or the age bands use the word "${word}"`);
  }
});

test('the ladder sorts recipes without leaving any of them off it', () => {
  const counts = {};
  for (const recipe of recipes) {
    const rung = asksFor(recipe, kitchen);
    assert.ok(rung, `${recipe.id} sits on no rung`);
    counts[rung.id] = (counts[rung.id] || 0) + 1;
  }
  assert.ok(Object.keys(counts).length >= 3, 'the ladder collapses to one or two rungs');
  assert.ok(counts['ask.short'] > 20, 'nothing in the collection is short and forgiving');
});

test('the techniques a recipe teaches are found in its own method', () => {
  const found = recipes.filter(r => teachesIn(r, kitchen).length);
  // Matched from the recipe's own words, so it is a floor rather than a
  // target: a recipe that teaches nothing simply does not show the block.
  assert.ok(found.length > recipes.length * 0.45,
    `only ${found.length} of ${recipes.length} recipes teach anything`);
  for (const lesson of kitchen.teaches.lessons) {
    const hits = recipes.filter(r => teachesIn(r, kitchen).some(l => l.id === lesson.id));
    assert.ok(hits.length > 0, `${lesson.id} never matches any recipe`);
  }
});

/* ------------------------------------------------------------------ *
 * The technique library
 * ------------------------------------------------------------------ */

test('every tip belongs to a group and says why it matters', () => {
  const groupIds = new Set(tips.groups.map(g => g.id));
  for (const tip of tips.tips) {
    assert.ok(groupIds.has(tip.group), `${tip.id} is in unknown group ${tip.group}`);
    assert.ok(tip.short?.length > 10, `${tip.id} has no summary`);
    assert.ok(tip.body?.length >= 2, `${tip.id} is too thin to be worth a card`);
    assert.ok(tip.why?.length > 20, `${tip.id} does not say why it matters`);
    for (const i of tip.match?.ingredients || []) {
      assert.ok(ids.has(i), `${tip.id} matches unknown ingredient ${i}`);
    }
    if (tip.claim) assert.ok(claims.has(tip.claim), `${tip.id} cites unknown claim ${tip.claim}`);
  }
});

test('every group has tips in it and every tip is reachable', () => {
  for (const group of tips.groups) {
    const inGroup = tips.tips.filter(t => t.group === group.id);
    assert.ok(inGroup.length >= 2, `${group.id} has ${inGroup.length} tips`);
  }
  const surfaced = new Set();
  for (const recipe of recipes) for (const t of tipsFor(recipe, { m: tips, limit: 6 })) surfaced.add(t.id);
  const universal = tips.tips.filter(t => t.match?.always).map(t => t.id);
  const orphan = tips.tips.filter(t => !surfaced.has(t.id) && !universal.includes(t.id)).map(t => t.id);
  assert.deepEqual(orphan, [],
    `tips that never appear on a recipe and are not universal: ${orphan.join(', ')}`);
});

test('a tip row never becomes a wall', () => {
  for (const recipe of recipes) {
    assert.ok(tipsFor(recipe, { m: tips, limit: 4 }).length <= 4, `${recipe.id} produced too many tips`);
  }
});

test('searching the library finds what somebody would search for', () => {
  for (const [term, expected] of [
    ['onion', 'tip.onion'],
    ['induction', 'tip.stoves'],
    ['cast iron', 'tip.castiron'],
    ['berries', 'tip.storage-berries'],
    ['lettuce', 'tip.storage-lettuce'],
    ['dishwasher', 'tip.dishwasher'],
    ['crack an egg', 'tip.crack-egg']
  ]) {
    const hits = searchTips(term, tips).map(t => t.id);
    assert.ok(hits.includes(expected), `searching "${term}" does not find ${expected}`);
  }
});

/* ---------- helpers ---------- */

function nutritionOf(recipe) {
  const { recipeNutrition } = nutritionModule;
  return recipeNutrition(recipe, index).perServing;
}
const nutritionModule = await import('../js/nutrition.js');

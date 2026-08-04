#!/usr/bin/env node
/**
 * verify-data.mjs — data integrity and plausibility checks.
 *
 * Errors fail the build. Warnings are printed but tolerated: they are the
 * "look at this again" pile, usually a recipe whose numbers are unusual for a
 * defensible reason.
 *
 * Run: npm run verify
 *
 * ERRERLabs — MIT licensed.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { recipeNutrition, heartScore, gramsFor, NUTRIENT_KEYS } from '../js/nutrition.js';
import { RECIPE_FILES } from './recipe-files.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const ingredientsFile = read('data/ingredients.json');
const aislesFile = read('data/aisles.json');
const gardenFile = read('data/garden.json');
const recipeFiles = RECIPE_FILES.map(read);

const ingredients = ingredientsFile.items;
const recipes = recipeFiles.flatMap(f => f.recipes);
const index = new Map(ingredients.map(i => [i.id, i]));
const aisleIds = new Set(aislesFile.aisles.map(a => a.id));

/* ---------- ingredients ---------- */

const seenIng = new Set();
for (const i of ingredients) {
  if (seenIng.has(i.id)) err(`duplicate ingredient id: ${i.id}`);
  seenIng.add(i.id);

  if (!/^ing\./.test(i.id)) err(`${i.id}: ingredient ids must start with "ing."`);
  if (!i.name) err(`${i.id}: missing name`);
  if (!aisleIds.has(i.aisle)) err(`${i.id}: unknown aisle "${i.aisle}"`);
  if (!Array.isArray(i.per100g) || i.per100g.length !== NUTRIENT_KEYS.length) {
    err(`${i.id}: per100g must have ${NUTRIENT_KEYS.length} values`);
    continue;
  }
  if (i.per100g.some(v => typeof v !== 'number' || v < 0)) err(`${i.id}: per100g has a negative or non-numeric value`);

  const [kcal, protein, fat, satfat, carb, fiber, sugar] = i.per100g;
  if (satfat > fat + 0.01) err(`${i.id}: saturated fat (${satfat}) exceeds total fat (${fat})`);
  if (fiber > carb + 0.01) err(`${i.id}: fiber (${fiber}) exceeds total carbohydrate (${carb})`);
  if (sugar > carb + 0.01) err(`${i.id}: sugar (${sugar}) exceeds total carbohydrate (${carb})`);
  if (protein + fat + carb > 101) err(`${i.id}: macros sum over 100 g`);

  // Atwater cross-check: 4/9/4 should land near the stated calories.
  const atwater = protein * 4 + fat * 9 + (carb - fiber * 0.55) * 4;
  if (kcal > 20 && Math.abs(atwater - kcal) > Math.max(45, kcal * 0.28)) {
    warn(`${i.id}: stated ${kcal} kcal vs ~${Math.round(atwater)} kcal from macros`);
  }

  if (!i.units || !Object.keys(i.units).length) err(`${i.id}: no units defined`);
  for (const [u, g] of Object.entries(i.units || {})) {
    if (typeof g !== 'number' || g <= 0) err(`${i.id}: unit "${u}" has a bad gram weight`);
  }
  if (i.shop) {
    if (i.shop.unit !== 'lb' && !i.shop.grams) err(`${i.id}: shop needs grams for unit "${i.shop.unit}"`);
    if (!i.shop.label) warn(`${i.id}: no shop label — the shopping list will use the full name`);
  } else {
    warn(`${i.id}: no shop info; the list will show grams`);
  }
  // A substitution is either a bare id (one for one) or an object carrying the
  // ratio and the caveat. Both shapes are valid; a wrong one is not.
  for (const s of i.subs || []) {
    const sid = typeof s === 'string' ? s : s?.id;
    if (!sid || !index.has(sid)) { err(`${i.id}: substitute "${JSON.stringify(s)}" does not exist`); continue; }
    if (sid === i.id) err(`${i.id}: listed as its own substitute`);
    if (typeof s === 'object') {
      if (s.ratio != null && !(s.ratio > 0 && s.ratio < 100)) err(`${i.id} -> ${sid}: ratio ${s.ratio} is not a plausible multiplier`);
      if (s.note != null && (typeof s.note !== 'string' || s.note.length < 12)) err(`${i.id} -> ${sid}: note is too short to be worth showing`);
      const extra = Object.keys(s).filter(k => !['id', 'ratio', 'note'].includes(k));
      if (extra.length) err(`${i.id} -> ${sid}: unknown substitution field(s) ${extra.join(', ')}`);
    }
    // A ratio far from 1 with no note is the dangerous combination: the app
    // will confidently change the amount and say nothing about why.
    if (typeof s === 'object' && s.ratio && (s.ratio < 0.5 || s.ratio > 2) && !s.note) {
      warn(`${i.id} -> ${sid}: ratio ${s.ratio} is a big change with no note explaining it`);
    }
  }
}

/* ---------- recipes ---------- */

const seenRec = new Set();
const COURSES = new Set(['breakfast', 'lunch', 'dinner', 'side', 'snack', 'dessert', 'component']);

for (const r of recipes) {
  if (seenRec.has(r.id)) err(`duplicate recipe id: ${r.id}`);
  seenRec.add(r.id);

  if (!/^rec\./.test(r.id)) err(`${r.id}: recipe ids must start with "rec."`);
  for (const key of ['title', 'blurb', 'course', 'servings', 'activeMin', 'totalMin', 'ingredients', 'steps']) {
    if (r[key] == null) err(`${r.id}: missing "${key}"`);
  }
  if (!COURSES.has(r.course)) err(`${r.id}: unknown course "${r.course}"`);
  if (r.servings < 1) err(`${r.id}: servings must be at least 1`);
  if (r.totalMin < r.activeMin) err(`${r.id}: total time is less than active time`);
  if (!r.steps?.length) err(`${r.id}: no method steps`);
  if (r.steps?.some(s => typeof s !== 'string' || s.length < 12)) warn(`${r.id}: a step looks too short to be useful`);

  const lines = [...(r.ingredients || []), ...(r.omnivore?.add || []), ...(r.vegetarianSwap?.add || [])];
  for (const line of lines) {
    const item = index.get(line.ing);
    if (!item) { err(`${r.id}: unknown ingredient "${line.ing}"`); continue; }
    if (gramsFor(item, line.qty, line.unit) == null) {
      err(`${r.id}: ${line.ing} has no gram weight for unit "${line.unit}" (has ${Object.keys(item.units).join(', ')})`);
    }
    if (!(line.qty > 0)) err(`${r.id}: ${line.ing} has quantity ${line.qty}`);
  }

  // A vegetarian-labeled recipe must not contain meat or fish in its base.
  if ((r.diet || []).includes('vegetarian') || (r.diet || []).includes('vegan')) {
    for (const line of r.ingredients || []) {
      const d = index.get(line.ing)?.diet || [];
      if (d.includes('omnivore') || d.includes('pescatarian')) {
        err(`${r.id}: labeled vegetarian but the base contains ${line.ing}`);
      }
      if ((r.diet || []).includes('vegan') && !d.includes('vegan') && !line.optional) {
        err(`${r.id}: labeled vegan but contains non-vegan ${line.ing}`);
      }
    }
  }

  // A recipe whose base is not vegetarian should offer a swap, so that a table
  // with a vegetarian at it never needs a second dinner cooked.
  const veg = (r.diet || []).some(d => d === 'vegetarian' || d === 'vegan');
  if (!veg && !r.vegetarianSwap && r.course !== 'component') {
    warn(`${r.id}: not vegetarian and has no vegetarianSwap`);
  }

  const nut = recipeNutrition(r, index);
  if (nut.missing.length) err(`${r.id}: unresolved ingredients ${nut.missing.join(', ')}`);

  const per = nut.perServing;
  if (['breakfast', 'lunch', 'dinner'].includes(r.course)) {
    if (per.kcal < 180) warn(`${r.id}: only ${Math.round(per.kcal)} kcal a serving for a ${r.course}`);
    if (per.kcal > 950) warn(`${r.id}: ${Math.round(per.kcal)} kcal a serving is a big plate`);
    if (per.sodium_mg > 1000) warn(`${r.id}: ${Math.round(per.sodium_mg)} mg sodium a serving`);
    if (per.protein_g < 8) warn(`${r.id}: only ${Math.round(per.protein_g)} g protein a serving`);
  }

  const hs = heartScore(per, { course: r.course });
  if (hs.score != null && hs.score < 35) warn(`${r.id}: heart score ${hs.score} (${hs.grade})`);

  for (const link of r.serveWith || []) if (!seenRec.has(link) && !recipes.some(x => x.id === link)) {
    err(`${r.id}: serveWith points at unknown recipe "${link}"`);
  }
}

/* ---------- the craft models ---------- */

/**
 * balance.json, substitutions.json, proteins.json, tips.json and kitchen.json
 * all point at ingredient ids, and a dangling one is invisible in the app: the
 * fix simply does not render, or the role group quietly gets shorter. The test
 * suite checks these in depth; this is the build-blocking subset.
 */
const craft = {
  balance: read('data/balance.json'),
  subs: read('data/substitutions.json'),
  proteins: read('data/proteins.json'),
  table: read('data/table.json'),
  kitchen: read('data/kitchen.json'),
  tips: read('data/tips.json'),
  palette: read('data/palette.json')
};

const ingRef = (id, where) => { if (!index.has(id)) err(`${where}: unknown ingredient "${id}"`); };

// A fix has to be addable, not only readable: the panel puts it into the dish,
// so an amount that cannot be converted to a weight is a button that does
// nothing.
const checkFix = (fix, where) => {
  ingRef(fix.ing, where);
  const item = index.get(fix.ing);
  if (!item) return;
  if (!(fix.qty > 0) || !fix.unit) err(`${where}: fix for ${fix.ing} has no addable amount`);
  else if (gramsFor(item, fix.qty, fix.unit) == null) {
    err(`${where}: fix for ${fix.ing} has no gram weight for unit "${fix.unit}"`);
  }
  if (!['dish', 'serving'].includes(fix.per)) err(`${where}: fix for ${fix.ing} has per="${fix.per}"`);
};

for (const axis of craft.balance.axes) {
  for (const fix of [...(axis.whenLow?.fixes || []), ...(axis.whenHigh?.fixes || [])]) {
    checkFix(fix, `balance ${axis.id}`);
  }
  for (const [course, band] of Object.entries(axis.bands || {})) {
    if (!(band[0] < band[1])) err(`balance ${axis.id}/${course}: band ${band.join('–')} is not a range`);
  }
}
for (const f of craft.balance.finishers) {
  for (const fix of f.whenMissing?.fixes || []) checkFix(fix, `balance ${f.id}`);
}
for (const [axis, tableOf] of Object.entries(craft.balance.potency)) {
  if (typeof tableOf !== 'object') continue;
  for (const key of Object.keys(tableOf)) {
    if (key === 'note' || key === 'unitNote') continue;
    ingRef(key, `balance potency ${axis}`);
  }
}

for (const role of craft.subs.roles) {
  for (const m of role.members) ingRef(m, `role ${role.id}`);
  if (role.members.length < 3) warn(`role ${role.id} has only ${role.members.length} members`);
  const axis = role.scaleBy?.replace(/^balance:/, '');
  if (axis && !craft.balance.potency[axis]) err(`role ${role.id}: scaleBy names no dial "${axis}"`);
}
for (const combo of craft.subs.combos) {
  ingRef(combo.makes, `combo ${combo.id}`);
  for (const part of combo.from) ingRef(part.ing, `combo ${combo.id}`);
}

const methodIds = new Set(craft.proteins.methods.map(m => m.id));
const proteinIds = new Set(craft.proteins.proteins.map(p => p.id));
for (const p of craft.proteins.proteins) {
  ingRef(p.ing, `protein ${p.id}`);
  for (const m of p.methods) {
    if (!methodIds.has(m)) err(`protein ${p.id}: unknown method "${m}"`);
    else if (!craft.proteins.methods.find(x => x.id === m).proteins.includes(p.id)) {
      err(`protein ${p.id} claims method ${m}, which does not list it back`);
    }
  }
  if (!(p.swapRatio > 0.2 && p.swapRatio < 3)) err(`protein ${p.id}: swapRatio ${p.swapRatio} is implausible`);
}
for (const m of craft.proteins.methods) {
  for (const p of m.proteins) if (!proteinIds.has(p)) err(`method ${m.id}: unknown protein "${p}"`);
}
for (const b of craft.proteins.before) {
  for (const p of b.worksOn) if (!proteinIds.has(p)) err(`prep ${b.id}: unknown protein "${p}"`);
}

// Anything the app says about health or resources has to be a claim with a
// source behind it, the same as everywhere else.
const claimIds = new Set();
for (const topic of read('data/claims.json').topics) {
  for (const c of topic.claims || []) claimIds.add(c.id);
  for (const s of topic.sections || []) for (const c of s.claims || []) claimIds.add(c.id);
}
for (const note of Object.values(craft.table.eating)) {
  if (note.claim && !claimIds.has(note.claim)) err(`table: claim "${note.claim}" is not in claims.json`);
}
if (craft.table.water.base.claim && !claimIds.has(craft.table.water.base.claim)) {
  err(`table: water claim "${craft.table.water.base.claim}" is not in claims.json`);
}

const ageIds = new Set(craft.kitchen.ages.map(a => a.id));
for (const job of craft.kitchen.jobs) {
  for (const a of job.ages) if (!ageIds.has(a)) err(`job ${job.id}: unknown age band "${a}"`);
}

const tipGroups = new Set(craft.tips.groups.map(g => g.id));
for (const tip of craft.tips.tips) {
  if (!tipGroups.has(tip.group)) err(`tip ${tip.id}: unknown group "${tip.group}"`);
  if (tip.claim && !claimIds.has(tip.claim)) err(`tip ${tip.id}: claim "${tip.claim}" is not in claims.json`);
  for (const i of tip.match?.ingredients || []) ingRef(i, `tip ${tip.id}`);
  for (const a of tip.ages || []) if (!ageIds.has(a)) err(`tip ${tip.id}: unknown age band "${a}"`);
}

// The color of a card comes out of its ingredients, so a dangling reference
// here is a card that quietly goes back to looking like every other card.
const colorIds = new Set(craft.palette.groups.map(g => g.id));
const inGroup = new Map();
for (const g of craft.palette.groups) {
  for (const [ing, strength] of Object.entries(g.members)) {
    ingRef(ing, `color ${g.id}`);
    if (!(strength > 0 && strength <= 20)) err(`color ${g.id}: ${ing} has strength ${strength}`);
    if (inGroup.has(ing)) err(`${ing} is in two color groups: ${inGroup.get(ing)} and ${g.id}`);
    inGroup.set(ing, g.id);
  }
}
for (const [key, id] of Object.entries(craft.palette.byCuisine)) {
  if (key !== 'note' && !colorIds.has(id)) err(`palette: cuisine "${key}" maps to unknown color "${id}"`);
}
for (const [key, id] of Object.entries(craft.palette.byCourse)) {
  if (key !== 'note' && !colorIds.has(id)) err(`palette: course "${key}" maps to unknown color "${id}"`);
}
for (const c of [...new Set(recipes.map(r => r.cuisine))]) {
  if (!craft.palette.byCuisine[c]) warn(`palette: cuisine "${c}" has no color fallback`);
}
for (const r of recipes) {
  if (r.color && !colorIds.has(r.color)) err(`${r.id}: names unknown color group "${r.color}"`);
}

/* ---------- garden ---------- */

for (const m of gardenFile.calendar) {
  for (const rid of m.recipeTie || []) {
    if (!recipes.some(r => r.id === rid)) err(`garden ${m.month}: recipeTie "${rid}" does not exist`);
  }
}
for (const item of gardenFile.startHere.items) {
  if (!index.has(item.ing)) err(`garden startHere: unknown ingredient "${item.ing}"`);
}
for (const id of gardenFile.containerOnly.items) {
  if (!index.has(id)) err(`garden containerOnly: unknown ingredient "${id}"`);
}
if (gardenFile.calendar.length !== 12) err('garden calendar must have 12 months');

/* ---------- store layouts ---------- */

for (const [id, layout] of Object.entries(aislesFile.storeLayouts)) {
  for (const a of layout.order) if (!aisleIds.has(a)) err(`store layout "${id}": unknown aisle "${a}"`);
  const missing = [...aisleIds].filter(a => !layout.order.includes(a));
  if (missing.length) warn(`store layout "${id}" does not place: ${missing.join(', ')} (they fall through to "Everything Else")`);
}

/* ---------- coverage ---------- */

const used = new Set(recipes.flatMap(r => [...r.ingredients, ...(r.omnivore?.add || []), ...(r.vegetarianSwap?.add || [])]).map(l => l.ing));
const unused = ingredients.filter(i => !used.has(i.id));
if (unused.length) warn(`${unused.length} ingredients are in the database but no recipe uses them (fine — they are there for the pantry and substitutions)`);

/* ---------- the public identity stays consistent ---------- */

const site = read('site.config.json');
const origin = site.url.replace(/\/$/, '');

if (!/^https:\/\/[a-z0-9.-]+$/i.test(origin)) {
  err(`site.config.json url should be an https origin with no trailing slash, got "${site.url}"`);
}

const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
const robots = readFileSync(join(root, 'robots.txt'), 'utf8');
const sitemapXml = readFileSync(join(root, 'sitemap.xml'), 'utf8');

// A canonical or og:url pointing at a host that is not the live one is how a
// rebrand ships with broken link previews, so it is worth an actual check.
for (const [label, pattern] of [
  ['canonical', /<link rel="canonical" href="([^"]+)"/],
  ['og:url', /<meta property="og:url" content="([^"]+)"/],
  ['og:image', /<meta property="og:image" content="([^"]+)"/]
]) {
  const found = indexHtml.match(pattern)?.[1];
  if (!found) err(`index.html has no ${label}`);
  else if (!found.startsWith(origin)) err(`index.html ${label} is "${found}", but site.config.json says ${origin}`);
}

if (!robots.includes(`${origin}/sitemap.xml`)) err(`robots.txt does not point at ${origin}/sitemap.xml`);
if (!sitemapXml.includes(`<loc>${origin}/</loc>`)) err(`sitemap.xml does not list ${origin}/`);

// Every recipe needs a share page and a preview card, or a shared link 404s
// and the iMessage preview falls back to a bare URL.
for (const r of recipes) {
  const slug = r.id.replace(/^rec\./, '');
  const page = join(root, 'r', slug, 'index.html');
  const card = join(root, 'icons/cards', `${slug}.jpg`);
  if (!existsSync(page)) err(`missing share page for ${r.id} — run npm run build:share`);
  else {
    const html = readFileSync(page, 'utf8');
    if (!html.includes(`${origin}/r/${slug}/`)) err(`share page for ${r.id} does not carry the canonical origin`);
    if (!html.includes('og:image')) err(`share page for ${r.id} has no og:image`);
  }
  if (!existsSync(card)) warn(`no preview card for ${r.id} — run npm run build:cards (needs a headless browser)`);
  if (!sitemapXml.includes(`${origin}/r/${slug}/`)) err(`sitemap.xml is missing ${r.id} — run npm run build:share`);
}

/* ---------- report ---------- */

console.log(`checked ${ingredients.length} ingredients and ${recipes.length} recipes`);
const dinners = recipes.filter(r => r.course === 'dinner');
console.log(`  ${dinners.length} dinners, ${dinners.filter(r => r.omnivore).length} with an omnivore fork, ${recipes.filter(r => r.kidFriendly).length} kid-friendly`);

if (warnings.length) {
  console.log(`\n${warnings.length} warnings:`);
  for (const w of warnings) console.log('  ! ' + w);
}
if (errors.length) {
  console.log(`\n${errors.length} ERRORS:`);
  for (const e of errors) console.log('  ✗ ' + e);
  process.exit(1);
}
console.log('\n✓ data is valid');

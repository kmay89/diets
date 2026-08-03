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

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const ingredientsFile = read('data/ingredients.json');
const aislesFile = read('data/aisles.json');
const gardenFile = read('data/garden.json');
const recipeFiles = ['data/recipes.dinners.json', 'data/recipes.daily.json', 'data/recipes.occasions.json'].map(read);

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
  for (const s of i.subs || []) if (!index.has(s)) err(`${i.id}: substitute "${s}" does not exist`);
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

  // A vegetarian-labelled recipe must not contain meat or fish in its base.
  if ((r.diet || []).includes('vegetarian') || (r.diet || []).includes('vegan')) {
    for (const line of r.ingredients || []) {
      const d = index.get(line.ing)?.diet || [];
      if (d.includes('omnivore') || d.includes('pescatarian')) {
        err(`${r.id}: labelled vegetarian but the base contains ${line.ing}`);
      }
      if ((r.diet || []).includes('vegan') && !d.includes('vegan') && !line.optional) {
        err(`${r.id}: labelled vegan but contains non-vegan ${line.ing}`);
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

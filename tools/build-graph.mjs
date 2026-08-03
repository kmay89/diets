#!/usr/bin/env node
/**
 * build-graph.mjs — compiles the source data files into data/graph.json.
 *
 * The graph is the "what is in what" layer: a plain JSON property graph of
 * nodes (recipes, ingredients, tags, aisles, diets, allergens, garden crops)
 * and typed edges between them. The app loads it to answer questions that are
 * awkward against flat lists:
 *
 *   - what can I cook from what is already in the pantry
 *   - what do I swap when someone dislikes an ingredient
 *   - which recipes share ingredients, so a week's shopping list stays small
 *   - what is in season in the garden right now, and what does it unlock
 *
 * Run: npm run build:graph   (or: node tools/build-graph.mjs)
 *
 * ERRERLabs — MIT licensed.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RECIPE_FILES } from './recipe-files.mjs';
import { recipeNutrition, heartScore, gramsFor } from '../js/nutrition.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const ingredientsFile = read('data/ingredients.json');
const aislesFile = read('data/aisles.json');
const gardenFile = read('data/garden.json');
const recipeFiles = RECIPE_FILES.map(read);

const ingredients = ingredientsFile.items;
const recipes = recipeFiles.flatMap(f => f.recipes);
const index = new Map(ingredients.map(i => [i.id, i]));

const nodes = [];
const edges = [];
const seenNodes = new Set();

function node(id, type, label, props = {}) {
  if (seenNodes.has(id)) return id;
  seenNodes.add(id);
  nodes.push({ id, type, label, ...props });
  return id;
}
function edge(s, p, o, props = {}) {
  edges.push({ s, p, o, ...props });
}

/* ---------- aisles, diets, allergens, tags ---------- */

for (const a of aislesFile.aisles) {
  node(`aisle.${a.id}`, 'aisle', a.name, { order: a.order, icon: a.icon });
}

const DIET_LABELS = {
  vegan: 'Vegan', vegetarian: 'Vegetarian', 'vegetarian-check': 'Vegetarian (check rennet)',
  pescatarian: 'Pescatarian', omnivore: 'Omnivore', 'gluten-free': 'Gluten-free'
};
for (const [id, label] of Object.entries(DIET_LABELS)) node(`diet.${id}`, 'diet', label);

/* ---------- ingredient nodes ---------- */

for (const ing of ingredients) {
  node(ing.id, 'ingredient', ing.name, {
    aisle: ing.aisle,
    units: ing.units,
    shop: ing.shop,
    per100g: ing.per100g,
    tags: ing.tags || [],
    diet: ing.diet || [],
    allergens: ing.allergens || [],
    growable: !!(ing.garden && ing.garden.grow),
    tips: ing.tips || null,
    heartNote: ing.heartNote || null,
    dietNote: ing.dietNote || null
  });

  edge(ing.id, 'IN_AISLE', `aisle.${ing.aisle}`);
  for (const d of ing.diet || []) if (DIET_LABELS[d]) edge(ing.id, 'SUITS_DIET', `diet.${d}`);
  for (const a of ing.allergens || []) {
    node(`allergen.${a}`, 'allergen', a.replace(/(^|-)(\w)/g, (m, p, c) => (p ? ' ' : '') + c.toUpperCase()));
    edge(ing.id, 'CONTAINS_ALLERGEN', `allergen.${a}`);
  }
  for (const t of ing.tags || []) {
    node(`tag.${t}`, 'tag', t.replace(/-/g, ' '));
    edge(ing.id, 'HAS_TAG', `tag.${t}`);
  }
  // A substitution is a bare id when it is one-for-one, and an object when it
  // carries a ratio or a caveat. Reading only the string form does not fail —
  // it silently drops every annotated pair out of the graph.
  for (const s of ing.subs || []) {
    const sid = typeof s === 'string' ? s : s?.id;
    if (!sid || !index.has(sid)) continue;
    edge(ing.id, 'SUBSTITUTES_WITH', sid, {
      ratio: (typeof s === 'object' && s.ratio) || 1,
      note: (typeof s === 'object' && s.note) || null
    });
  }
  if (ing.garden?.grow) {
    node(`crop.${ing.id}`, 'crop', ing.name, {
      difficulty: ing.garden.difficulty || null,
      sow: ing.garden.sow || null,
      harvest: ing.garden.harvest || null,
      note: ing.garden.note || null
    });
    edge(`crop.${ing.id}`, 'YIELDS', ing.id);
  }
}

/* ---------- garden calendar ---------- */

for (const m of gardenFile.calendar) {
  node(`month.${m.month.toLowerCase()}`, 'month', m.month, { tasks: m.tasks, harvest: m.harvest });
  for (const rid of m.recipeTie || []) edge(`month.${m.month.toLowerCase()}`, 'SUGGESTS', rid);
}

/* ---------- recipe nodes ---------- */

const warnings = [];

for (const r of recipes) {
  const base = recipeNutrition(r, index);
  const withOmni = r.omnivore?.add ? recipeNutrition(r, index, { withOmnivore: true }) : null;
  if (base.missing.length) warnings.push(`${r.id}: unresolved ${base.missing.join(', ')}`);

  const hs = heartScore(base.perServing, { course: r.course });

  node(r.id, 'recipe', r.title, {
    blurb: r.blurb,
    course: r.course,
    cuisine: r.cuisine,
    servings: r.servings,
    activeMin: r.activeMin,
    totalMin: r.totalMin,
    difficulty: r.difficulty,
    diet: r.diet || [],
    kidFriendly: !!r.kidFriendly,
    tags: r.tags || [],
    season: r.season || ['all'],
    hasOmnivore: !!r.omnivore,
    hasVegSwap: !!r.vegetarianSwap,
    nutrition: round(base.perServing),
    nutritionOmnivore: withOmni ? round(withOmni.perServing) : null,
    heart: { score: hs.score, grade: hs.grade, contextual: !!hs.contextual },
    ingredientCount: (r.ingredients || []).length
  });

  for (const d of r.diet || []) if (DIET_LABELS[d]) edge(r.id, 'SUITS_DIET', `diet.${d}`);
  for (const t of r.tags || []) {
    node(`tag.${t}`, 'tag', t.replace(/-/g, ' '));
    edge(r.id, 'HAS_TAG', `tag.${t}`);
  }

  for (const line of r.ingredients || []) {
    const item = index.get(line.ing);
    if (!item) continue;
    edge(r.id, 'CONTAINS', line.ing, {
      qty: line.qty,
      unit: line.unit,
      grams: round1(gramsFor(item, line.qty, line.unit) ?? 0),
      optional: !!line.optional
    });
  }
  for (const line of r.omnivore?.add || []) {
    const item = index.get(line.ing);
    if (!item) continue;
    edge(r.id, 'OMNIVORE_ADD', line.ing, {
      qty: line.qty, unit: line.unit, grams: round1(gramsFor(item, line.qty, line.unit) ?? 0)
    });
  }
  for (const line of r.vegetarianSwap?.add || []) {
    const item = index.get(line.ing);
    if (!item) continue;
    edge(r.id, 'VEG_SWAP_ADD', line.ing, {
      qty: line.qty, unit: line.unit, grams: round1(gramsFor(item, line.qty, line.unit) ?? 0)
    });
  }
  for (const other of r.serveWith || []) edge(r.id, 'SERVE_WITH', other);
}

/* ---------- derived: recipes that share pantry load ---------- */

const recipeIngredients = new Map();
for (const r of recipes) {
  recipeIngredients.set(r.id, new Set((r.ingredients || []).filter(l => !l.optional).map(l => l.ing)));
}
const staples = new Set(['ing.oil.olive', 'ing.salt.kosher', 'ing.spice.blackpepper', 'ing.garlic', 'ing.onion.yellow', 'ing.lemon']);
const recipeIds = [...recipeIngredients.keys()];
for (let i = 0; i < recipeIds.length; i++) {
  for (let j = i + 1; j < recipeIds.length; j++) {
    const a = recipeIngredients.get(recipeIds[i]);
    const b = recipeIngredients.get(recipeIds[j]);
    let shared = 0;
    for (const x of a) if (b.has(x) && !staples.has(x)) shared++;
    const union = new Set([...a, ...b]);
    let unionNonStaple = 0;
    for (const x of union) if (!staples.has(x)) unionNonStaple++;
    const overlap = unionNonStaple ? shared / unionNonStaple : 0;
    if (shared >= 4 && overlap >= 0.3) {
      edge(recipeIds[i], 'SHARES_SHOPPING', recipeIds[j], { shared, overlap: round2(overlap) });
    }
  }
}

/* ---------- indexes the app uses directly ---------- */

const byIngredient = {};
for (const [rid, set] of recipeIngredients) {
  for (const ing of set) (byIngredient[ing] ||= []).push(rid);
}

const graph = {
  schema: 'errerlabs.diets.graph/1',
  generated: 'run `npm run build:graph` to regenerate',
  sourceVersions: {
    ingredients: ingredientsFile.version,
    recipeFiles: recipeFiles.map(f => f.part)
  },
  counts: {
    nodes: nodes.length,
    edges: edges.length,
    ingredients: ingredients.length,
    recipes: recipes.length
  },
  predicates: [
    'CONTAINS', 'OMNIVORE_ADD', 'VEG_SWAP_ADD', 'IN_AISLE', 'HAS_TAG', 'SUITS_DIET',
    'CONTAINS_ALLERGEN', 'SUBSTITUTES_WITH', 'YIELDS', 'SUGGESTS', 'SERVE_WITH', 'SHARES_SHOPPING'
  ],
  nodes,
  edges,
  indexes: { recipesByIngredient: byIngredient }
};

writeFileSync(join(root, 'data/graph.json'), JSON.stringify(graph, null, 1) + '\n');

console.log(`graph: ${nodes.length} nodes, ${edges.length} edges`);
console.log(`  ${ingredients.length} ingredients, ${recipes.length} recipes`);
if (warnings.length) {
  console.log('\nwarnings:');
  for (const w of warnings) console.log('  ' + w);
  process.exitCode = 1;
}

function round(n) {
  const o = {};
  for (const [k, v] of Object.entries(n)) o[k] = Math.round(v * 10) / 10;
  return o;
}
function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }

/**
 * data.js — loads the data files, builds indexes, and answers graph questions.
 *
 * All six files are cached by the service worker, so every query here works
 * offline after the first visit.
 *
 * ERRERLabs — MIT licensed.
 */

import { recipeNutrition, heartScore, gramsFor } from './nutrition.js';

const FILES = {
  ingredients: 'data/ingredients.json',
  aisles: 'data/aisles.json',
  garden: 'data/garden.json',
  graph: 'data/graph.json',
  dinners: 'data/recipes.dinners.json',
  occasions: 'data/recipes.occasions.json',
  daily: 'data/recipes.daily.json'
};

let db = null;

export async function loadAll() {
  if (db) return db;

  const [ingredients, aisles, garden, graph, dinners, occasions, daily] = await Promise.all(
    Object.values(FILES).map(async (path) => {
      const res = await fetch(path, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
      return res.json();
    })
  );

  const items = ingredients.items;
  const ingIndex = new Map(items.map(i => [i.id, i]));
  const recipes = [...dinners.recipes, ...occasions.recipes, ...daily.recipes];
  const recipeIndex = new Map(recipes.map(r => [r.id, r]));
  const graphNodes = new Map(graph.nodes.map(n => [n.id, n]));

  // Ingredient -> recipes that use it (non-optional only), from the built graph.
  const recipesByIngredient = graph.indexes?.recipesByIngredient || {};

  db = {
    ingredients: items,
    ingIndex,
    recipes,
    recipeIndex,
    aisles: aisles.aisles,
    aisleIndex: new Map(aisles.aisles.map(a => [a.id, a])),
    storeLayouts: aisles.storeLayouts,
    garden,
    graph,
    graphNodes,
    recipesByIngredient,
    nutrientNote: ingredients.per100gNote
  };
  return db;
}

export function getDb() {
  if (!db) throw new Error('Data not loaded yet — call loadAll() first.');
  return db;
}

/* ------------------------------------------------------------------ *
 * Graph queries
 * ------------------------------------------------------------------ */

export function recipesUsing(ingredientId) {
  const { recipesByIngredient, recipeIndex } = getDb();
  return (recipesByIngredient[ingredientId] || []).map(id => recipeIndex.get(id)).filter(Boolean);
}

export function substitutesFor(ingredientId) {
  const { ingIndex } = getDb();
  const item = ingIndex.get(ingredientId);
  return (item?.subs || []).map(id => ingIndex.get(id)).filter(Boolean);
}

export function ingredientsInAisle(aisleId) {
  return getDb().ingredients.filter(i => i.aisle === aisleId);
}

/** Every allergen referenced by a recipe's ingredients. */
export function allergensOf(recipe, { withOmnivore = false } = {}) {
  const { ingIndex } = getDb();
  const lines = [...recipe.ingredients, ...(withOmnivore ? (recipe.omnivore?.add || []) : [])];
  const set = new Set();
  for (const l of lines) {
    for (const a of ingIndex.get(l.ing)?.allergens || []) set.add(a);
  }
  return [...set];
}

/** Ingredients in a recipe that the user marked "never". */
export function dislikedIn(recipe, likes) {
  return recipe.ingredients
    .filter(l => likes[l.ing] === -1)
    .map(l => getDb().ingIndex.get(l.ing))
    .filter(Boolean);
}

/** Ingredients in a recipe that the user marked "love". */
export function lovedIn(recipe, likes) {
  return recipe.ingredients.filter(l => likes[l.ing] === 1).map(l => getDb().ingIndex.get(l.ing)).filter(Boolean);
}

/**
 * How much of a recipe is already in the pantry, ignoring the handful of
 * staples everybody has. Returns 0..1 plus the missing ingredient records.
 */
export function pantryCoverage(recipe, pantry) {
  const { ingIndex } = getDb();
  const lines = recipe.ingredients.filter(l => !l.optional);
  let have = 0;
  const missing = [];
  for (const l of lines) {
    if (pantry[l.ing]) have++;
    else missing.push(ingIndex.get(l.ing));
  }
  return { ratio: lines.length ? have / lines.length : 0, have, total: lines.length, missing: missing.filter(Boolean) };
}

export const SEASONS = ['winter', 'spring', 'summer', 'fall'];

export function seasonNow(date = new Date()) {
  const m = date.getMonth();
  if (m <= 1 || m === 11) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'fall';
}

export function inSeason(recipe, season = seasonNow()) {
  const s = recipe.season || ['all'];
  return s.includes('all') || s.includes(season);
}

/** The garden calendar entry for a month index (0-11). */
export function gardenMonth(monthIndex = new Date().getMonth()) {
  return getDb().garden.calendar[monthIndex];
}

/** Recipes that share enough shopping with the given ones to save a trip. */
export function sharesShoppingWith(recipeIds) {
  const { graph, recipeIndex } = getDb();
  const set = new Set(recipeIds);
  const scores = new Map();
  for (const e of graph.edges) {
    if (e.p !== 'SHARES_SHOPPING') continue;
    if (set.has(e.s) && !set.has(e.o)) scores.set(e.o, Math.max(scores.get(e.o) || 0, e.overlap));
    else if (set.has(e.o) && !set.has(e.s)) scores.set(e.s, Math.max(scores.get(e.s) || 0, e.overlap));
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, overlap]) => ({ recipe: recipeIndex.get(id), overlap }))
    .filter(x => x.recipe);
}

/* ------------------------------------------------------------------ *
 * Nutrition wrappers that know about the loaded index
 * ------------------------------------------------------------------ */

export function nutritionFor(recipe, opts = {}) {
  return recipeNutrition(recipe, getDb().ingIndex, opts);
}

export function heartFor(recipe, opts = {}) {
  const { perServing } = nutritionFor(recipe, opts);
  return heartScore(perServing, { course: recipe.course });
}

export function gramsForLine(line) {
  const item = getDb().ingIndex.get(line.ing);
  return item ? gramsFor(item, line.qty, line.unit) : null;
}

/** Diet compatibility: does this recipe work for someone eating `diet`? */
export function suitsDiet(recipe, diet, { withOmnivore = false } = {}) {
  if (diet === 'omnivore') return true;
  const d = recipe.diet || [];
  if (withOmnivore && recipe.omnivore) {
    // The omnivore add-on is served separately; the base dish is unchanged.
  }
  if (diet === 'vegan') return d.includes('vegan');
  if (diet === 'vegetarian') return d.includes('vegetarian') || d.includes('vegan');
  if (diet === 'pescatarian') return d.includes('vegetarian') || d.includes('vegan') || d.includes('pescatarian');
  return true;
}

/** Text search across titles, blurbs, tags and ingredient names. */
export function searchRecipes(query) {
  const { recipes, ingIndex } = getDb();
  const q = query.trim().toLowerCase();
  if (!q) return recipes;
  const terms = q.split(/\s+/);
  return recipes.filter(r => {
    const hay = [
      r.title, r.blurb, r.cuisine, r.course, ...(r.tags || []),
      ...r.ingredients.map(l => ingIndex.get(l.ing)?.name || '')
    ].join(' ').toLowerCase();
    return terms.every(t => hay.includes(t));
  });
}

/**
 * myrecipes.js — the recipes you wrote, living alongside the 242 that came with the app.
 *
 * The important decision here is that a recipe you made is not a second-class
 * kind of recipe. It goes into the same index under the same shape, which means
 * it gets the flavor panel, cook mode with per-step amounts, the method diagram,
 * the substitutions, the shopping list, the nutrition and the heart score — all
 * of it, for free, because every one of those reads a recipe rather than
 * reading the collection.
 *
 * That is only true if what comes out of the builder is genuinely the same
 * shape. A "user recipe" stored as a title and a blob of text would need every
 * one of those features special-cased to skip it, and would quietly become the
 * kind of second-class thing this file exists to avoid. So `toRecipe` is strict
 * about the shape and honest about what is missing.
 *
 * Stored in the same place as everything else: this device, and nowhere else.
 *
 * ERRERLabs — MIT licensed.
 */

import { getState, update } from './store.js';

/** Yours are namespaced, so nothing can collide with the collection's ids. */
export const MINE = 'rec.my.';

export const isMine = (id) => String(id || '').startsWith(MINE);

/**
 * A stable id from the title, with a counter only when it is genuinely taken.
 *
 * Reusing the id of a recipe already saved would silently overwrite it, and
 * "Chili" is a title two different people in one household will both reach for.
 */
export function idFor(title, taken = new Set()) {
  const slug = String(title || 'recipe')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'recipe';

  let id = MINE + slug;
  let n = 2;
  while (taken.has(id)) id = `${MINE}${slug}-${n++}`;
  return id;
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

export const myRecipes = (state = getState()) => state.myRecipes || [];

export const myRecipe = (id, state = getState()) =>
  myRecipes(state).find(r => r.id === id) || null;

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/**
 * Save, replacing any earlier version of the same id.
 *
 * Newest first, because the thing you just wrote is the thing you are about to
 * cook, and a list that appends puts it at the bottom of a screen you then have
 * to scroll.
 */
export function saveMyRecipe(draft) {
  const recipe = toRecipe(draft);
  if (!recipe) return null;
  update(s => {
    const rest = (s.myRecipes || []).filter(r => r.id !== recipe.id);
    s.myRecipes = [recipe, ...rest];
  });
  return recipe;
}

export function deleteMyRecipe(id) {
  update(s => {
    s.myRecipes = (s.myRecipes || []).filter(r => r.id !== id);
    // A recipe that is gone must not linger on the plan pointing at nothing.
    s.plan = (s.plan || []).filter(e => e.recipeId !== id);
  });
}

/* ------------------------------------------------------------------ *
 * The shape
 * ------------------------------------------------------------------ */

const COURSES = new Set(['dinner', 'breakfast', 'lunch', 'snack', 'dessert', 'side', 'component']);
const DIFFICULTY = new Set(['easy', 'medium', 'hard']);

const clampInt = (n, lo, hi, fallback) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
};

const clean = (s, max = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * A draft, turned into a recipe the rest of the app can read — or null.
 *
 * Everything the collection's recipes carry is either filled in or given a
 * defensible default, because a missing field is not a blank on a screen, it is
 * a `.length` on undefined somewhere three views away. What is *not* invented is
 * anything a person would notice being wrong: no guessed cuisine, no invented
 * cooking times beyond a floor, and no tags that would put a dish in a
 * collection it does not belong to.
 */
export function toRecipe(draft, { taken = new Set() } = {}) {
  if (!draft) return null;

  const title = clean(draft.title, 90);
  const ingredients = (draft.ingredients || [])
    .filter(l => l && l.ing && Number(l.qty) > 0)
    .map(l => ({
      ing: l.ing,
      qty: Math.round(Number(l.qty) * 1000) / 1000,
      unit: clean(l.unit, 16) || 'each',
      ...(l.prep ? { prep: clean(l.prep, 60) } : {}),
      ...(l.optional ? { optional: true } : {})
    }));
  const steps = (draft.steps || []).map(s => clean(s, 600)).filter(Boolean);

  // The floor for being a recipe at all: a name, something to put in, and
  // something to do. Anything less is a note, and saving it as a recipe would
  // put an empty page into the collection.
  if (!title || !ingredients.length || !steps.length) return null;

  const activeMin = clampInt(draft.activeMin, 1, 720, 20);
  const totalMin = Math.max(activeMin, clampInt(draft.totalMin, 1, 2880, activeMin));

  return {
    id: draft.id && isMine(draft.id) ? draft.id : idFor(title, taken),
    title,
    blurb: clean(draft.blurb, 240) || `${title}, in your own kitchen.`,
    course: COURSES.has(draft.course) ? draft.course : 'dinner',
    cuisine: clean(draft.cuisine, 40) || 'home',
    difficulty: DIFFICULTY.has(draft.difficulty) ? draft.difficulty : 'easy',
    servings: clampInt(draft.servings, 1, 40, 4),
    activeMin,
    totalMin,
    diet: Array.isArray(draft.diet) ? draft.diet.filter(d => typeof d === 'string').slice(0, 4) : [],
    tags: Array.isArray(draft.tags) ? draft.tags.map(t => clean(t, 24)).filter(Boolean).slice(0, 6) : [],
    kidFriendly: !!draft.kidFriendly,
    ingredients,
    steps,
    // Kept so the recipe screen can say where it came from, and so a re-import
    // of the same page can recognize it later.
    mine: true,
    source: clean(draft.source, 300) || null,
    savedAt: draft.savedAt || new Date().toISOString()
  };
}

/**
 * What is still missing, in words, for the builder to show.
 *
 * Not validation errors — a list of what the app cannot do yet with what has
 * been entered. "No steps" is not a scolding, it is the reason cook mode is
 * grayed out, and saying which is the difference between a form and a tool.
 */
export function whatIsMissing(draft) {
  const gaps = [];
  if (!clean(draft?.title)) gaps.push({ field: 'title', says: 'It needs a name to be findable.' });
  if (!(draft?.ingredients || []).some(l => l?.ing)) {
    gaps.push({ field: 'ingredients', says: 'Nothing to put in yet — so no shopping list and no nutrition.' });
  }
  if (!(draft?.steps || []).filter(Boolean).length) {
    gaps.push({ field: 'steps', says: 'No steps yet, so there is nothing for cook mode to walk through.' });
  }
  const unmatched = (draft?.ingredients || []).filter(l => l && !l.ing).length;
  if (unmatched) {
    gaps.push({
      field: 'unmatched',
      says: `${unmatched} ${unmatched === 1 ? 'line is' : 'lines are'} not matched to an ingredient yet, so ${unmatched === 1 ? 'it is' : 'they are'} left out of the nutrition and the list.`
    });
  }
  return gaps;
}

/** Ready to save at all. */
export const canSave = (draft) => !!toRecipe(draft);

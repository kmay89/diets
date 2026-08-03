/**
 * collections.js — the ways into 230 recipes that are not "everything, A-Z".
 *
 * A collection is a saved filter, not a second copy of the data: data/collections.json
 * names courses, tags or cuisines, and any recipe matching any one of them belongs.
 * That means a recipe joins a collection by being tagged honestly, and no list has
 * to be kept in sync by hand.
 *
 * ERRERLabs — MIT licensed.
 */

import { getDb } from './data.js';

/** Does this recipe belong in this collection? Any rule matching is enough. */
export function matchesCollection(recipe, collection) {
  const m = collection?.match || {};
  if ((m.ids || []).includes(recipe.id)) return true;
  if ((m.course || []).includes(recipe.course)) return true;
  if ((m.cuisine || []).includes(recipe.cuisine)) return true;
  if ((m.tags || []).some(t => (recipe.tags || []).includes(t))) return true;
  return false;
}

export const allCollections = () => getDb().collections || [];

export const collectionGroups = () => getDb().collectionGroups || [];

export const collectionById = (id) => allCollections().find(c => c.id === id) || null;

export function recipesInCollection(id) {
  const collection = collectionById(id);
  if (!collection) return [];
  return getDb().recipes.filter(r => matchesCollection(r, collection));
}

/** [{ group, collections: [{ ...collection, count }] }], empty collections dropped. */
export function collectionsByGroup() {
  const { recipes } = getDb();
  return collectionGroups().map(group => ({
    group,
    collections: allCollections()
      .filter(c => c.group === group.id)
      .map(c => ({ ...c, count: recipes.filter(r => matchesCollection(r, c)).length }))
      .filter(c => c.count > 0)
  })).filter(g => g.collections.length);
}

/** Every collection a single recipe appears in — shown on the recipe page. */
export function collectionsFor(recipe) {
  return allCollections().filter(c => matchesCollection(recipe, c));
}

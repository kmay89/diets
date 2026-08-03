/**
 * recipe-files.mjs — the recipe part files, for everything that runs in Node.
 *
 * data/recipes.index.json is the single list. The build scripts and the tests
 * import it through here so that adding a part file never means hunting through
 * eight copies of the same three-line array.
 *
 * ERRERLabs — MIT licensed.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export const readJson = (relPath) => JSON.parse(readFileSync(join(repoRoot, relPath), 'utf8'));

/** [{ file, title, blurb }] in the order the collection is meant to be read. */
export const RECIPE_PARTS = readJson('data/recipes.index.json').parts;

/** ['data/recipes.dinners.json', …] */
export const RECIPE_FILES = RECIPE_PARTS.map(p => p.file);

/** Every recipe in the collection, in part order. */
export function allRecipes() {
  return RECIPE_FILES.flatMap(f => readJson(f).recipes);
}

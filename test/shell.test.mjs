/**
 * Tests for the offline shell.
 *
 * A module that exists on disk but is missing from the service worker's
 * precache list works perfectly online and fails only for the person on a
 * plane. Nothing in normal development surfaces it, so it is a test.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

/** Every path inside the PRECACHE array literal. */
const precache = new Set(
  (sw.match(/const PRECACHE = \[([\s\S]*?)\];/)?.[1] || '')
    .split('\n')
    .map(l => l.match(/'\.\/(.*?)'/)?.[1])
    .filter(Boolean)
);

/** Every .js file under js/, recursively. */
function jsFiles(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? jsFiles(join(dir, e.name))
      : e.name.endsWith('.js') ? [relative(root, join(root, dir, e.name))]
        : []);
}

test('every app module is precached', () => {
  const missing = jsFiles('js').filter(f => !precache.has(f));
  assert.deepEqual(missing, [], `not in sw.js PRECACHE: ${missing.join(', ')}`);
});

test('every data file is precached, listed or derived', () => {
  // The recipe part files are not listed in PRECACHE. There are nine of them
  // and the list would go stale the first time one was added, so the service
  // worker reads data/recipes.index.json at install time and precaches what it
  // names — the same trick it uses for the food icons. What is asserted here is
  // that the derivation exists and that the index covers every part file.
  assert.match(sw, /recipes\.index\.json/, 'sw.js does not derive the recipe part files');

  const parts = new Set(
    JSON.parse(readFileSync(join(root, 'data/recipes.index.json'), 'utf8')).parts.map(p => p.file)
  );
  const missing = readdirSync(join(root, 'data'))
    .filter(f => f.endsWith('.json'))
    .map(f => `data/${f}`)
    .filter(f => !precache.has(f) && !parts.has(f));
  assert.deepEqual(missing, [], `neither precached nor in the recipe index: ${missing.join(', ')}`);

  const orphans = [...parts].filter(f => { try { readFileSync(join(root, f)); return false; } catch { return true; } });
  assert.deepEqual(orphans, [], `recipes.index.json names files that do not exist: ${orphans.join(', ')}`);
});

test('nothing precached has since been deleted', () => {
  const gone = [...precache].filter(p => {
    if (p === '' || p.endsWith('/')) return false;
    try { readFileSync(join(root, p)); return false; } catch { return true; }
  });
  assert.deepEqual(gone, [], `precached but missing from disk: ${gone.join(', ')}`);
});

test('the cache version changes when the shell does', () => {
  // Not a check that it was bumped this commit — only that it is a real,
  // parseable version, so a stale cache can always be superseded.
  const version = sw.match(/const VERSION = '(.*?)'/)?.[1];
  assert.match(version || '', /^v\d+\.\d+\.\d+$/, 'sw.js VERSION should look like v1.2.3');
});

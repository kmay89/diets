/**
 * Tests for the hash router.
 *
 * The occasion card on the roll screen linked to #/browse?occasion=picnic while
 * the route table only matched #/browse exactly, so the one place in the app
 * that advertised fifteen picnic recipes led to "That page does not exist."
 * Nothing failed, nothing logged; it just quietly did not work. So every link
 * the app builds is checked against the router here.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { matchRoute, routePath, ROUTE_PATTERNS } from '../js/routes.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function jsFiles(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? jsFiles(join(dir, e.name))
      : e.name.endsWith('.js') ? [relative(root, join(root, dir, e.name))]
        : []);
}

/**
 * Every '#/...' string literal in the app, with template holes filled in so
 * `#/recipe/${id}` is checked as a concrete link rather than skipped.
 */
function appLinks() {
  const found = new Map(); // link -> file it came from
  for (const file of jsFiles('js')) {
    const src = readFileSync(join(root, file), 'utf8');
    for (const m of src.matchAll(/['"`](#\/[^'"`\s]*)['"`]/g)) {
      const link = m[1].replace(/\$\{[^}]*\}/g, 'sample');
      if (!found.has(link)) found.set(link, file);
    }
  }
  return found;
}

test('the query on a link does not decide the route', () => {
  assert.equal(matchRoute('#/browse?occasion=picnic')?.id, 'browse');
  assert.equal(matchRoute('#/browse')?.id, 'browse');
  assert.equal(routePath('#/browse?occasion=picnic'), '#/browse');
});

test('a route with a parameter still captures it', () => {
  assert.equal(matchRoute('#/recipe/rec.picnic-slaw')?.match[1], 'rec.picnic-slaw');
});

test('nonsense still misses every route', () => {
  assert.equal(matchRoute('#/nowhere'), null);
  assert.equal(matchRoute('#/browse/extra'), null);
});

test('every link the app builds resolves to a screen', () => {
  const dead = [...appLinks()]
    .filter(([link]) => !matchRoute(link))
    .map(([link, file]) => `${link} (${file})`);
  assert.deepEqual(dead, [], `links that go nowhere: ${dead.join(', ')}`);
});

test('every occasion the roll screen can surface has somewhere to land', () => {
  const occasions = JSON.parse(readFileSync(join(root, 'data/occasions.json'), 'utf8')).occasions;
  assert.ok(occasions.length, 'expected occasions in the data');
  for (const o of occasions) {
    assert.equal(matchRoute(`#/browse?occasion=${o.id}`)?.id, 'browse', `#/browse?occasion=${o.id}`);
  }
});

test('route ids are unique and all wired up in app.js', () => {
  const ids = ROUTE_PATTERNS.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate route id');

  const app = readFileSync(join(root, 'js/app.js'), 'utf8');
  const views = app.match(/const VIEWS = \{([\s\S]*?)\n\};/)?.[1] || '';
  const missing = ids.filter(id => !new RegExp(`^\\s*${id}:`, 'm').test(views));
  assert.deepEqual(missing, [], `routes with no view in app.js: ${missing.join(', ')}`);
});

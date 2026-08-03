/**
 * Tests for the food icon set.
 *
 * These files are art, not code, so nothing about them fails loudly. A
 * truncated icon is served as a clean 200 and simply draws nothing; one that
 * references a gradient left behind in the contact sheet renders as a solid
 * black blob, which at 24 pixels is not obviously wrong. Both slipped through
 * a first pass of this exact set, so both are tests.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'icons/food');

const ingredients = JSON.parse(readFileSync(join(root, 'data/ingredients.json'), 'utf8')).items;
const slugFor = (id) => id.replace(/^ing\./, '').replace(/\./g, '-');

const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.svg')) : [];
const read = (f) => readFileSync(join(dir, f), 'utf8');

test('every ingredient has an icon', () => {
  const missing = ingredients.map(i => slugFor(i.id)).filter(s => !files.includes(`${s}.svg`));
  assert.deepEqual(missing, [], `no icon for: ${missing.join(', ')}`);
});

test('no icon is left behind for an ingredient that no longer exists', () => {
  const known = new Set(ingredients.map(i => slugFor(i.id)));
  const orphan = files.map(f => f.replace(/\.svg$/, '')).filter(s => !known.has(s));
  assert.deepEqual(orphan, [], `orphaned icons: ${orphan.join(', ')}`);
});

test('every icon has balanced tags', () => {
  // The split from the contact sheet is a text operation, and the failure it
  // produces is a file that ends mid-group. Counting <g> against </g> catches
  // that without pulling in an XML parser.
  const bad = files.filter(f => {
    const svg = read(f);
    const open = (svg.match(/<g[\s>]/g) || []).length;
    const close = (svg.match(/<\/g>/g) || []).length;
    return open !== close || !svg.trimEnd().endsWith('</svg>');
  });
  assert.deepEqual(bad, [], `truncated or unbalanced: ${bad.join(', ')}`);
});

test('every icon resolves its own gradients and filters', () => {
  const bad = [];
  for (const f of files) {
    const svg = read(f);
    const declared = new Set([...svg.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
    const dangling = [...new Set([...svg.matchAll(/url\(#([^)]+)\)/g)].map(m => m[1]))]
      .filter(id => !declared.has(id));
    if (dangling.length) bad.push(`${f} -> ${dangling.join(', ')}`);
  }
  assert.deepEqual(bad, [], `dangling references:\n  ${bad.join('\n  ')}`);
});

test('every icon is on the 64-unit grid and named for a screen reader', () => {
  const bad = files.filter(f => {
    const svg = read(f);
    return !/viewBox="0 0 64 64"/.test(svg) || !/<title[^>]*>[^<]+<\/title>/.test(svg);
  });
  assert.deepEqual(bad, [], `wrong viewBox or missing title: ${bad.join(', ')}`);
});

test('an icon title matches the ingredient name the app shows', () => {
  const nameBySlug = new Map(ingredients.map(i => [slugFor(i.id), i.name]));
  const wrong = [];
  for (const f of files) {
    const title = read(f).match(/<title[^>]*>([^<]+)<\/title>/)?.[1];
    const expected = nameBySlug.get(f.replace(/\.svg$/, ''));
    // The generator escapes for XML; compare on the decoded form.
    const decoded = title?.replace(/&amp;/g, '&').replace(/&lt;/g, '<');
    if (expected && decoded !== expected) wrong.push(`${f}: "${decoded}" vs "${expected}"`);
  }
  assert.deepEqual(wrong, [], `title drifted from the ingredient name:\n  ${wrong.join('\n  ')}`);
});

test('every icon carries the dark-mode swap', () => {
  // Charcoal outlines vanish and cream marks glare on a dark background. Any
  // icon using either color has to be able to flip it.
  const bad = files.filter(f => {
    const svg = read(f);
    const usesTone = /ink-[sf]|paper-[sf]/.test(svg);
    return usesTone && !/prefers-color-scheme:\s*dark/.test(svg);
  });
  assert.deepEqual(bad, [], `no dark-mode rule: ${bad.join(', ')}`);
});

test('no icon carries a script or an external reference', () => {
  // They are rendered through <img>, which already neuters scripts — but these
  // files came from outside the repo, so the check is worth having in writing.
  const bad = files.filter(f => {
    const svg = read(f);
    return /<script|\bon[a-z]+\s*=|href\s*=\s*"https?:|xlink:href\s*=\s*"https?:|<image/i.test(svg);
  });
  assert.deepEqual(bad, [], `script or external reference: ${bad.join(', ')}`);
});

test('the set stays small enough to precache', () => {
  const bytes = files.reduce((n, f) => n + readFileSync(join(dir, f)).length, 0);
  // The service worker takes all of these on install. Well under a megabyte is
  // fine; a jump past it means something got embedded that should not have.
  assert.ok(bytes < 1_000_000, `icons total ${(bytes / 1024).toFixed(0)} KB`);
});

test('the service worker precaches the icons', () => {
  // They are derived from ingredients.json rather than listed, so what is
  // asserted here is that the derivation exists and uses the same slug rule.
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  assert.match(sw, /icons\/food\//, 'sw.js does not reference the food icons at all');
  assert.match(sw, /replace\(\/\^ing\\\.\/, ''\)/, 'sw.js does not use the app\'s id-to-slug rule');
});

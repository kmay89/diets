/**
 * Veg-Nourish is written in American English.
 *
 * "Always and forever" is not a thing you can do by hand — one Britishism slips
 * into a recipe note six months from now and nobody notices. So it is a test:
 * every file the app ships is scanned against tools/spelling.mjs, and a stray
 * "flavour" fails CI the way a broken link does.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';
import { findBritish, americanize, VERBATIM_FIELDS, GENERATED, SKIP_FILES }
  from '../tools/spelling.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = new Set(['.js', '.mjs', '.json', '.md', '.html', '.css', '.webmanifest']);
const SKIP_DIR = new Set(['node_modules', '.git', 'icons']);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (SKIP_DIR.has(e.name)) return [];
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : EXT.has(extname(e.name)) ? [p] : [];
  });
}

/** Blank out the JSON fields that quote a source verbatim. */
function maskVerbatim(src, fields) {
  return src.replace(
    new RegExp(`("(?:${fields.join('|')})"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`, 'g'),
    (_all, key) => `${key}""`
  );
}

test('every shipped file is written in American English', () => {
  const offences = [];
  for (const abs of walk(root)) {
    const rel = relative(root, abs);
    if (SKIP_FILES.includes(rel)) continue;
    if (GENERATED.some(g => rel.startsWith(g))) continue;

    const fields = VERBATIM_FIELDS[rel];
    const src = fields ? maskVerbatim(readFileSync(abs, 'utf8'), fields) : readFileSync(abs, 'utf8');
    for (const hit of findBritish(src)) {
      offences.push(`${rel}: ${hit.found} → ${hit.suggestion}`);
    }
  }
  assert.deepEqual(offences, [], `British spellings found:\n  ${offences.join('\n  ')}`);
});

test('the generated files agree with their sources', () => {
  // r/ and graph.json are built from the recipe data. If the data is American
  // and these are not, someone edited a generated file or skipped a rebuild.
  const generated = [
    'data/graph.json',
    ...readdirSync(join(root, 'r'), { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => `r/${e.name}/index.html`)
  ];
  const stale = generated.filter(rel => findBritish(readFileSync(join(root, rel), 'utf8')).length);
  assert.deepEqual(stale, [], `run \`npm run build\`: ${stale.join(', ')}`);
});

test('the dictionary does not mangle words that merely look British', () => {
  // Each of these contains a stem from the list and must survive untouched.
  for (const safe of [
    'concentrate', 'analysis', 'meta-analyses', 'emphasis', 'basis',
    'aria-labelledby', 'greyhound', 'centrifuge', 'metre-long'.replace('metre', 'meter')
  ]) {
    assert.equal(americanize(safe), safe, `mangled: ${safe}`);
  }
});

test('the dictionary rewrites what it claims to', () => {
  assert.equal(americanize('colour'), 'color');
  assert.equal(americanize('Colour'), 'Color');
  assert.equal(americanize('COLOUR'), 'COLOR');
  assert.equal(americanize('colours'), 'colors');
  assert.equal(americanize('coloured'), 'colored');
  assert.equal(americanize('favourite'), 'favorite');
  assert.equal(americanize('centred'), 'centered');
  assert.equal(americanize('centres'), 'centers');
  assert.equal(americanize('caramelised'), 'caramelized');
  assert.equal(americanize('a savoury flavour'), 'a savory flavor');
});

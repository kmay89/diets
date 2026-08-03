/**
 * Tests for the citation engine. A claim without a working source is the one
 * failure mode that would make this app dishonest, so it is a test.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RECIPE_FILES } from '../tools/recipe-files.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const citations = read('data/citations.json');
const claims = read('data/claims.json');
const occasions = read('data/occasions.json');
const recipes = RECIPE_FILES.flatMap(f => read(f).recipes);

const sources = new Map(citations.sources.map(s => [s.id, s]));

function allClaims() {
  const out = [];
  for (const topic of claims.topics) {
    out.push(...(topic.claims || []));
    for (const section of topic.sections || []) out.push(...(section.claims || []));
  }
  return out;
}

test('every source has the fields needed to find it again', () => {
  for (const s of citations.sources) {
    for (const field of ['id', 'type', 'authors', 'year', 'title', 'publication', 'url', 'checked']) {
      assert.ok(s[field], `${s.id} is missing ${field}`);
    }
    assert.ok(citations.evidenceLevels[s.type], `${s.id} has an undeclared evidence type "${s.type}"`);
    assert.match(String(s.url), /^https:\/\//, `${s.id} url should be https`);
    assert.match(String(s.checked), /^\d{4}-\d{2}-\d{2}$/, `${s.id} needs a checked date`);
    assert.ok(s.year >= 1980 && s.year <= 2030, `${s.id} has an implausible year`);
  }
});

test('every source states what it does not show', () => {
  // A citation showing only the flattering half of a study is worse than none.
  for (const s of citations.sources) {
    assert.ok(s.summary, `${s.id} has no summary`);
    assert.ok(s.caveat && s.caveat.length > 30, `${s.id} has no meaningful caveat`);
  }
});

test('every claim points at sources that exist', () => {
  for (const c of allClaims()) {
    assert.ok(c.id && c.text && c.strength, `a claim is missing id, text or strength`);
    for (const id of c.cites || []) {
      assert.ok(sources.has(id), `claim ${c.id} cites unknown source "${id}"`);
    }
  }
});

test('only editorial claims are allowed to have no source', () => {
  for (const c of allClaims()) {
    if (!(c.cites || []).length) {
      assert.equal(c.strength, 'editorial',
        `claim ${c.id} has no citation but is presented as "${c.strength}"`);
    }
  }
});

test('claim ids are unique', () => {
  const ids = allClaims().map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('the heart topic is honest about limits', () => {
  const heart = claims.topics.find(t => t.id === 'heart');
  assert.ok(heart, 'no heart topic');
  const limits = (heart.sections || []).find(s => s.id === 'heart.limits');
  assert.ok(limits, 'the heart topic must carry a section on what diet cannot do');
  assert.ok(limits.claims.some(c => c.id === 'heart.fh'), 'must cover inherited high cholesterol');
  // The wording can change; the disclaimer being present cannot.
  assert.ok(limits.claims.some(c => c.text.toLowerCase().includes('medical advice')),
    'the limits section must say plainly that this is not medical advice');
});

test('every occasion on a recipe is a declared occasion', () => {
  const ids = new Set(occasions.occasions.map(o => o.id));
  for (const r of recipes) {
    for (const o of r.occasions || []) {
      assert.ok(ids.has(o), `${r.id} claims unknown occasion "${o}"`);
    }
  }
});

test('every occasion has recipes to show for it', () => {
  for (const o of occasions.occasions) {
    const count = recipes.filter(r => (r.occasions || []).includes(o.id)).length;
    assert.ok(count >= 3, `occasion "${o.id}" only has ${count} recipes — too thin to offer`);
  }
});

test('dated occasions parse as real dates', () => {
  for (const o of occasions.occasions) {
    if (!o.peak) continue;
    const [m, d] = o.peak.split('-').map(Number);
    assert.ok(m >= 1 && m <= 12 && d >= 1 && d <= 31, `${o.id} has a bad peak date`);
    assert.ok((o.months || []).includes(m), `${o.id} peaks in a month it does not claim`);
  }
});

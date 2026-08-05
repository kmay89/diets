/**
 * Tests for the shareable recipe pages — the thing that makes an iMessage link
 * expand into a real preview instead of a bare URL.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RECIPE_FILES } from '../tools/recipe-files.mjs';
import { recipeShareUrl } from '../js/shopping.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const site = read('site.config.json');
const recipes = RECIPE_FILES.flatMap(f => read(f).recipes);
const origin = site.url.replace(/\/$/, '');
const slugOf = (id) => id.replace(/^rec\./, '');
const pageFor = (id) => readFileSync(join(root, 'r', slugOf(id), 'index.html'), 'utf8');

const decodeEntities = (s) => s
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('share URLs are built from the current origin, not a hardcoded host', () => {
  assert.equal(
    recipeShareUrl('rec.lentil-bolognese', { origin: 'https://veg-nourish.com' }),
    'https://veg-nourish.com/r/lentil-bolognese/'
  );
  // A deploy preview or a laptop must produce a link that works there.
  assert.equal(
    recipeShareUrl('rec.lentil-bolognese', { origin: 'http://localhost:8080' }),
    'http://localhost:8080/r/lentil-bolognese/'
  );
  // A trailing slash on the origin must not double up.
  assert.equal(
    recipeShareUrl('rec.pasta-e-ceci', { origin: 'https://veg-nourish.com/' }),
    'https://veg-nourish.com/r/pasta-e-ceci/'
  );
});

test('slugs are unique across every recipe', () => {
  const slugs = recipes.map(r => slugOf(r.id));
  assert.equal(new Set(slugs).size, slugs.length);
  for (const s of slugs) {
    assert.match(s, /^[a-z0-9-]+$/, `"${s}" is not URL-safe`);
  }
});

test('every recipe has a share page and a preview card', () => {
  for (const r of recipes) {
    const slug = slugOf(r.id);
    assert.ok(existsSync(join(root, 'r', slug, 'index.html')), `no share page for ${r.id}`);
    assert.ok(existsSync(join(root, 'icons/cards', `${slug}.jpg`)), `no preview card for ${r.id}`);
  }
});

test('each share page carries its own preview metadata', () => {
  for (const r of recipes) {
    const html = pageFor(r.id);
    const slug = slugOf(r.id);

    // Distinct per recipe — a shared link that previews like every other one
    // is the exact failure this feature exists to prevent. Compare the decoded
    // value so the test checks the meaning, not the escaping style.
    const ogTitle = decodeEntities(html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? '');
    assert.equal(ogTitle, r.title, `${r.id} og:title is not its own title`);
    assert.ok(html.includes(`<meta property="og:url" content="${origin}/r/${slug}/">`), `${r.id} og:url is wrong`);
    assert.ok(html.includes(`${origin}/icons/cards/${slug}.jpg`), `${r.id} og:image is not its own card`);

    // Absolute https URLs — relative ones silently fail in link unfurlers.
    for (const prop of ['og:image', 'og:image:secure_url', 'og:url']) {
      const value = html.match(new RegExp(`<meta property="${prop}" content="([^"]+)"`))?.[1];
      assert.ok(value, `${r.id} has no ${prop}`);
      assert.match(value, /^https:\/\//, `${r.id} ${prop} is not an absolute https URL`);
    }
    const twitterImage = html.match(/<meta name="twitter:image" content="([^"]+)"/)?.[1];
    assert.match(twitterImage ?? '', /^https:\/\//, `${r.id} twitter:image is not absolute`);

    assert.ok(html.includes('twitter:card" content="summary_large_image"'), `${r.id} has no large card`);
    assert.ok(html.includes(`<link rel="canonical" href="${origin}/r/${slug}/">`), `${r.id} has no canonical`);
  }
});

test('share pages render the recipe without JavaScript', () => {
  const r = recipes.find(x => x.id === 'rec.lentil-bolognese');
  const html = pageFor(r.id);
  assert.ok(html.includes(r.title));
  assert.ok(html.includes('Ingredients'));
  assert.ok(html.includes('Method'));
  // Every method step must actually be in the markup, not fetched later.
  for (const step of r.steps) {
    const needle = step.slice(0, 40).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    assert.ok(html.includes(needle), `step missing from static HTML: ${step.slice(0, 40)}`);
  }
});

test('share pages deep-link into the app', () => {
  for (const r of recipes.slice(0, 8)) {
    const html = pageFor(r.id);
    assert.ok(html.includes(`href="/#/recipe/${r.id}"`), `${r.id} has no app deep link`);
  }
});

test('share pages carry valid schema.org Recipe data', () => {
  const html = pageFor('rec.crispy-tofu-broccoli');
  const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(raw, 'no JSON-LD block');
  const data = JSON.parse(raw);
  assert.equal(data['@type'], 'Recipe');
  assert.ok(data.recipeIngredient.length > 5);
  assert.equal(data.recipeInstructions[0]['@type'], 'HowToStep');
  assert.match(data.totalTime, /^PT/);
  assert.match(data.nutrition.sodiumContent, /mg$/);
});

test('the JSON-LD block cannot break out of its script tag', () => {
  for (const r of recipes) {
    const raw = pageFor(r.id).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(raw, `${r.id} has no JSON-LD`);
    assert.ok(!raw.includes('</script'), `${r.id} JSON-LD contains a raw closing tag`);
    JSON.parse(raw);   // must still be valid JSON after escaping
  }
});

test('the sitemap lists the home page and every recipe', () => {
  const xml = readFileSync(join(root, 'sitemap.xml'), 'utf8');
  assert.ok(xml.includes(`<loc>${origin}/</loc>`));
  for (const r of recipes) {
    assert.ok(xml.includes(`<loc>${origin}/r/${slugOf(r.id)}/</loc>`), `sitemap missing ${r.id}`);
  }
});

/* ------------------------------------------------------------------ *
 * The generator against the clock
 * ------------------------------------------------------------------ */

test('nothing generated here changes because the date changed', () => {
  // CI regenerates the share pages and the sitemap and fails if the result
  // differs from what is committed. That check is only meaningful if the
  // output is a function of the recipes — the moment anything is stamped with
  // the time of the build, the file goes stale at midnight and every pull
  // request opened on a new day fails on a diff nobody wrote.
  //
  // That is exactly what happened: <lastmod> carried the build date, so a
  // perfectly good change failed on 243 lines that were all the same date bump.
  // A check that fails for reasons unrelated to the change is one people learn
  // to re-run rather than read, which costs more than the check is worth.
  const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  const thisYear = String(new Date().getFullYear());

  assert.doesNotMatch(sitemap, new RegExp(today), 'the sitemap carries the date it was built');
  assert.doesNotMatch(sitemap, /<lastmod>/, 'lastmod is back, and it will go stale tonight');

  for (const recipe of recipes.slice(0, 12)) {
    const page = join(root, 'r', recipe.id.replace(/^rec\./, ''), 'index.html');
    if (!existsSync(page)) continue;
    const html = readFileSync(page, 'utf8');
    assert.doesNotMatch(html, new RegExp(today),
      `${recipe.id}'s share page carries the date it was built`);
    // A year on its own is fine in prose; a full ISO date is the tell.
    assert.doesNotMatch(html, new RegExp(`${thisYear}-\\d\\d-\\d\\d`),
      `${recipe.id}'s share page carries a build timestamp`);
  }
});

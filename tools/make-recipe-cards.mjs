#!/usr/bin/env node
/**
 * make-recipe-cards.mjs — a 1200x630 preview image for every recipe.
 *
 * These are what iMessage, Slack, WhatsApp and Twitter show when someone shares
 * a recipe link. One generic image across 44 recipes makes every share look
 * identical, so each recipe gets its own card with its title, its timings and
 * its numbers.
 *
 * Rendered with whatever headless Chromium is on the machine and committed as
 * JPEGs, so deploying never needs a browser.
 *
 *   npm i -D playwright && npm run build:cards
 *
 * ERRERLabs — MIT licensed.
 */

import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { recipeNutrition, heartScore } from '../js/nutrition.js';
import { slugFor } from './build-share-pages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const site = read('site.config.json');
const ingredients = read('data/ingredients.json').items;
const index = new Map(ingredients.map(i => [i.id, i]));
const recipes = [
  ...read('data/recipes.dinners.json').recipes,
  ...read('data/recipes.daily.json').recipes,
  ...read('data/recipes.occasions.json').recipes
];

const OUT = join(root, 'icons/cards');

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MARK = `<svg class="mark" viewBox="0 0 512 512" aria-hidden="true">
  <g stroke="#f5faf7" fill="none" stroke-linecap="round">
    <path d="M132 130 V214" stroke-width="24"/><path d="M162 130 V214" stroke-width="24"/>
    <path d="M192 130 V214" stroke-width="24"/><path d="M120 214 H204" stroke-width="27"/>
    <path d="M162 208 V286" stroke-width="37"/><path d="M162 280 V386" stroke-width="26"/>
  </g>
  <g transform="translate(330 290) rotate(-35)">
    <path d="M-98 0 A135 135 0 0 1 98 0 A135 135 0 0 1 -98 0" fill="#c8ecd8"/>
    <path d="M-88 0 H88" stroke="#1f6f4a" stroke-width="9" stroke-linecap="round"/>
  </g>
</svg>`;

/** Long titles need to shrink or they wrap into four lines and look broken. */
function titleSize(title) {
  const n = title.length;
  if (n <= 24) return 88;
  if (n <= 34) return 76;
  if (n <= 46) return 66;
  return 56;
}

function cardHtml(recipe) {
  const nut = recipeNutrition(recipe, index);
  const heart = heartScore(nut.perServing, { course: recipe.course });
  const per = nut.perServing;

  const facts = [
    `${recipe.activeMin} min active`,
    `${Math.round(per.kcal)} kcal`,
    Math.round(per.protein_g) > 0 ? `${Math.round(per.protein_g)} g protein` : null,
    Math.round(per.fiber_g) > 0 ? `${Math.round(per.fiber_g)} g fiber` : null
  ].filter(Boolean);

  // The heart score is an internal sorting heuristic with a page of caveats
  // attached. A letter on a public card would read as a verdict to someone who
  // never sees that page, so only a genuinely good one is worth showing — and
  // a middling recipe simply gets no badge rather than a scarlet letter.
  const showGrade = heart.grade === 'A' || heart.grade === 'B';

  const badges = [
    (recipe.diet || []).includes('vegan') ? 'Vegan' : (recipe.diet || []).includes('vegetarian') ? 'Vegetarian' : null,
    recipe.omnivore ? 'Omnivore add-on' : null,
    recipe.vegetarianSwap ? 'Vegetarian swap' : null,
    recipe.kidFriendly ? 'Kids eat it' : null
  ].filter(Boolean).slice(0, 3);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1200px; height: 630px; }
  body {
    position: relative; overflow: hidden;
    padding: 64px 72px;
    display: flex; flex-direction: column; justify-content: space-between;
    background:
      radial-gradient(110% 80% at 18% 12%, rgba(255,255,255,.12), rgba(255,255,255,0) 60%),
      linear-gradient(158deg, #1f6f4a 0%, #14513a 48%, #0f2e21 100%);
    color: #eef7f1;
    font-family: "Liberation Sans", "DejaVu Sans", system-ui, sans-serif;
  }
  body::after {
    content: ""; position: absolute; inset: -20% -30%;
    background: linear-gradient(104deg, rgba(255,255,255,0) 45%, rgba(255,255,255,.05) 50%, rgba(255,255,255,0) 55%);
  }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 24px; position: relative; z-index: 1; }
  .brand { display: flex; align-items: center; gap: 14px; font-size: 27px; letter-spacing: .3px; color: #bfe3ce; }
  .mark { width: 58px; height: 58px; flex: none; }
  .grade {
    width: 72px; height: 72px; flex: none; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 38px; font-weight: 700; color: #0f2e21; background: #7fcaa4;
  }
  .grade[data-g="B"] { background: #9ad7b6; }
  .middle { position: relative; z-index: 1; }
  h1 {
    font-family: "Liberation Serif", "DejaVu Serif", Georgia, serif;
    font-size: ${titleSize(recipe.title)}px; line-height: 1.06; letter-spacing: -1.6px;
    font-weight: 700; max-width: 1010px;
  }
  p.blurb {
    margin-top: 20px; font-size: 28px; line-height: 1.4; color: #cbe6d9; max-width: 900px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .bottom { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; position: relative; z-index: 1; }
  ul.facts { display: flex; gap: 26px; list-style: none; font-size: 25px; color: #dceee4; flex-wrap: wrap; }
  ul.facts li { display: flex; align-items: center; gap: 26px; }
  ul.facts li + li::before { content: "•"; color: #6ba888; }
  ul.badges { display: flex; gap: 10px; list-style: none; margin-top: 22px; flex-wrap: wrap; }
  ul.badges li {
    font-size: 21px; padding: 7px 16px; border-radius: 999px;
    border: 1.5px solid rgba(169,220,192,.42); color: #d9efe3;
  }
  .url { font-size: 24px; color: rgba(198,228,213,.8); white-space: nowrap; }
</style></head><body>
  <div class="top">
    <div class="brand">${MARK}<span>${esc(site.name)}</span></div>
    ${showGrade ? `<div class="grade" data-g="${heart.grade}" title="heart-forward score">${heart.grade}</div>` : ''}
  </div>

  <div class="middle">
    <h1>${esc(recipe.title)}</h1>
    <p class="blurb">${esc(recipe.blurb)}</p>
    <ul class="badges">${badges.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
  </div>

  <div class="bottom">
    <ul class="facts">${facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
    <span class="url">${esc(site.url.replace(/^https?:\/\//, ''))}</span>
  </div>
</body></html>`;
}

async function launch() {
  for (const [name, launcher] of [
    ['playwright', async (m) => m.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })],
    ['puppeteer', async (m) => m.default.launch()]
  ]) {
    try {
      const mod = await import(name);
      return { browser: await launcher(mod), name };
    } catch (err) {
      if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
    }
  }
  return null;
}

const launched = await launch();
if (!launched) {
  console.error(
    'No headless browser found.\n' +
    'Install one first:  npm i -D playwright\n' +
    'The committed cards in icons/cards/ are still valid — this only regenerates them.'
  );
  process.exit(1);
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

const { browser } = launched;
const page = await browser.newPage();
await page.setViewportSize?.({ width: 1200, height: 630 });
await page.setViewport?.({ width: 1200, height: 630 });

let total = 0;
for (const recipe of recipes) {
  const slug = slugFor(recipe.id);
  await page.setContent(cardHtml(recipe), { waitUntil: 'load' });
  const file = join(OUT, `${slug}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  total += statSync(file).size;
}

await browser.close();

console.log(`recipe cards: ${recipes.length} written to icons/cards/`);
console.log(`  ${(total / 1024 / 1024).toFixed(2)} MB total, ${Math.round(total / recipes.length / 1024)} KB average`);

#!/usr/bin/env node
/**
 * art-manifest.mjs — writes docs/ART.md: every piece of artwork the app uses,
 * what state it is in, and the exact brief for the ones still to be drawn.
 *
 * The list is derived, never hand-kept. An ingredient added today shows up in
 * the "needs hand art" column tomorrow without anyone remembering to add it,
 * because the manifest is built from data/ingredients.json and from what is
 * actually on disk in icons/.
 *
 * Run: npm run build:art
 *
 * ERRERLabs — MIT licensed.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot, readJson, RECIPE_PARTS, allRecipes } from './recipe-files.mjs';
import { GENERATED_MARK, slugFor } from './make-food-icons.mjs';

const ingredients = readJson('data/ingredients.json').items;
const aisles = readJson('data/aisles.json').aisles;
const collections = readJson('data/collections.json');
const recipes = allRecipes();

const iconDir = join(repoRoot, 'icons/food');
const cardDir = join(repoRoot, 'icons/cards');

const aisleName = new Map(aisles.map(a => [a.id, a.name]));

/* ---------- what exists, and how it was made ---------- */

const icons = ingredients.map(item => {
  const slug = slugFor(item.id);
  const file = join(iconDir, `${slug}.svg`);
  if (!existsSync(file)) return { item, slug, state: 'missing' };
  const svg = readFileSync(file, 'utf8');
  return { item, slug, state: svg.includes(GENERATED_MARK) ? 'generated' : 'drawn', bytes: svg.length };
});

const generated = icons.filter(i => i.state === 'generated');
const drawn = icons.filter(i => i.state === 'drawn');
const missing = icons.filter(i => i.state === 'missing');

const cards = recipes.map(r => {
  const slug = r.id.replace(/^rec\./, '');
  return { recipe: r, slug, exists: existsSync(join(cardDir, `${slug}.jpg`)) };
});

const kb = (n) => `${Math.round(n / 1024)} KB`;
const dirBytes = (dir) => existsSync(dir)
  ? readdirSync(dir).reduce((n, f) => n + statSync(join(dir, f)).size, 0)
  : 0;

/* ---------- group the to-do list the way an illustrator would work ---------- */

const byAisle = new Map();
for (const icon of [...generated, ...missing]) {
  const key = icon.item.aisle;
  if (!byAisle.has(key)) byAisle.set(key, []);
  byAisle.get(key).push(icon);
}

const STYLE = `**Style brief — match the existing set exactly.**

- 64 × 64 grid, \`viewBox="0 0 64 64"\`, one object centered with a little air around it.
- Charcoal \`#303532\` outline at 2.05 stroke width, round caps and joins. No outline anywhere else in the drawing.
- One soft drop shadow: \`dx 0.35, dy 0.8, stdDeviation 0.6, #111815 at 27%\`.
- Fills are three-stop radial gradients, light at 27%/20%, mid at 48%, dark at the edge — never flat color.
- Interior marks are cream \`#F3E8CF\`.
- Dark mode: the charcoal and the cream swap. Every icon carries
  \`@media(prefers-color-scheme:dark)\` rules on the \`.ink-*\` and \`.paper-*\` classes.
- One \`<title>\` element, and it must read exactly as the ingredient name in the app.
- No text, no script, no external references, no \`<image>\`. Under about 3 KB each.
- It has to read at 24 px. If the object needs detail to be recognizable at that size, simplify the object instead of adding detail.`;

const PROMPT = `**Prompt to hand to an image model, one ingredient at a time**

> Draw a single \`<INGREDIENT NAME>\` as a flat vector food icon on a 64×64 grid.
> Charcoal (#303532) outline, 2 px, rounded joins. Fill with a soft three-stop
> radial gradient in the ingredient's natural color, lightest at the upper left.
> One subtle drop shadow. Cream (#F3E8CF) for any interior marks. No text, no
> background, no plate, no hands, no shadow on the ground. Centered, with a
> little breathing room at the edges. It must be recognizable at 24 pixels.
> Return SVG only.

Then run it through \`node tools/split-food-icons.mjs\` (for a contact sheet) or
drop the file straight in at \`icons/food/<slug>.svg\` and run \`npm test\` — the
icon tests check the grid, the title, the dark-mode rule, dangling gradient
references and the total size of the set.`;

/* ---------- write it ---------- */

const lines = [];
const p = (...s) => lines.push(...s);

p('# Art manifest');
p('');
p('Everything visual in Veg-Nourish, what state it is in, and the brief for whatever is still to be drawn.');
p('');
p('**This file is generated.** Run `npm run build:art` after adding ingredients, recipes or collections; do not edit it by hand.');
p('');
p('## At a glance');
p('');
p('| Asset | Count | State |');
p('| --- | --- | --- |');
p(`| Food icons, hand-drawn | ${drawn.length} | done — the original contact sheet |`);
p(`| Food icons, script-drawn | ${generated.length} | usable, worth replacing by hand |`);
p(`| Food icons, missing | ${missing.length} | ${missing.length ? '**needed — the app falls back to an aisle emoji**' : 'none'} |`);
p(`| Recipe preview cards | ${cards.filter(c => c.exists).length} / ${cards.length} | generated by \`npm run build:cards\`, no hand art needed |`);
p(`| Collection artwork | 0 / ${collections.collections.length} | optional — collections use an emoji today |`);
p(`| App icon, maskable icons, social card | 6 | done |`);
p('');
p(`Icon set weight: ${kb(dirBytes(iconDir))} (the service worker precaches all of it; the test fails past 1,000 KB).`);
p(`Preview cards: ${kb(dirBytes(cardDir))} across ${cards.length} files.`);
p('');
p('---');
p('');
p('## 1. Food icons');
p('');
p('One SVG per ingredient at `icons/food/<slug>.svg`, where the slug is the ingredient id with `ing.` dropped and dots turned into dashes. There is no manifest and no lookup table: drop a correctly named file in and it appears everywhere that ingredient does.');
p('');
p(STYLE);
p('');
p(PROMPT);
p('');
p(`### Still worth hand-drawing (${generated.length + missing.length})`);
p('');
p('These are drawn by `tools/make-food-icons.mjs` from a small vocabulary of shapes. They are consistent and they read at 24 px, but they are generic — a jar is a jar whether it holds gochujang or tamarind. Replacing them with real drawings is the single biggest visual upgrade left in the app.');
p('');

for (const aisle of aisles) {
  const list = byAisle.get(aisle.id);
  if (!list?.length) continue;
  p(`#### ${aisleName.get(aisle.id) || aisle.id} (${list.length})`);
  p('');
  p('| Slug | Name | What it should show |');
  p('| --- | --- | --- |');
  for (const { item, slug, state } of list.sort((a, b) => a.slug.localeCompare(b.slug))) {
    const hint = item.shop?.label || item.name;
    p(`| \`${slug}\` | ${item.name}${state === 'missing' ? ' **(missing)**' : ''} | ${hint} |`);
  }
  p('');
}

p('### Already hand-drawn — leave alone');
p('');
p(`${drawn.length} icons came from the original contact sheet and are the reference for everything above. They are listed in \`icons/food/\` and none of them carry the \`${GENERATED_MARK}\` marker.`);
p('');
p('---');
p('');
p('## 2. Recipe preview cards');
p('');
p('1200×630 JPEGs at `icons/cards/<slug>.jpg`, one per recipe, used as the `og:image` when a recipe link is shared. **No hand art needed** — `npm run build:cards` renders them from the recipe data with a headless browser, so they can never go stale against a renamed recipe.');
p('');
if (cards.some(c => !c.exists)) {
  p('Missing right now (run `npm run build:cards`):');
  p('');
  for (const c of cards.filter(c => !c.exists)) p(`- \`${c.slug}.jpg\` — ${c.recipe.title}`);
} else {
  p('All present.');
}
p('');
p('---');
p('');
p('## 3. Collection artwork (optional, not blocking)');
p('');
p(`The ${collections.collections.length} collections are represented by an emoji each. A small illustrated badge per collection — same charcoal-and-cream language as the food icons, 96×96 — would lift the browse screen considerably. Listed here so the option is written down rather than remembered.`);
p('');
p('| Collection | Group | Emoji today | Suggested subject |');
p('| --- | --- | --- | --- |');
for (const c of collections.collections) {
  const group = collections.groups.find(g => g.id === c.group)?.name || c.group;
  p(`| ${c.name} | ${group} | ${c.icon} | ${c.blurb.replace(/\|/g, '\\|')} |`);
}
p('');
p('---');
p('');
p('## 4. Everything else');
p('');
p('| Asset | Path | How it is made |');
p('| --- | --- | --- |');
p('| App icon | `icons/icon.svg` | hand-drawn, source of truth for the PNGs |');
p('| PWA icons, maskable | `icons/icon-192.png`, `icon-512.png`, `maskable-*.png` | `npm run build:icons` |');
p('| Apple touch icon, favicon | `icons/apple-touch-icon.png`, `favicon-32.png` | `npm run build:icons` |');
p('| Social card | `icons/social-card.png` | `npm run build:social` |');
p('');
p('## The recipe files this was built from');
p('');
for (const part of RECIPE_PARTS) {
  const count = readJson(part.file).recipes.length;
  p(`- \`${part.file}\` — ${count} recipes · ${part.title}`);
}
p('');

writeFileSync(join(repoRoot, 'docs/ART.md'), lines.join('\n'));
console.log(`docs/ART.md: ${drawn.length} drawn, ${generated.length} generated, ${missing.length} missing, ${cards.length} cards`);

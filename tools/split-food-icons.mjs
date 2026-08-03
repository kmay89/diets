#!/usr/bin/env node
/**
 * split-food-icons.mjs — cut the food icon contact sheet into 227 standalone SVGs.
 *
 * The icon set arrived as a single contact sheet: every icon laid out in a
 * grid, with its gradients and drop-shadow filter in one shared <defs> block,
 * each id prefixed with the ingredient slug. That prefixing is what makes this
 * possible — for any slug we can pull out exactly the definitions it uses.
 *
 * Each icon is written to icons/food/<slug>.svg on its native 0 0 64 64 grid,
 * with the sheet's layout transform stripped off.
 *
 * Two things are added on the way out, because the sheet does not carry them:
 *
 *   - a <title>, taken from the app's own ingredient name rather than the
 *     sheet's label, so the accessible name and the visible name never drift
 *   - a dark-mode rule. The artwork is drawn in charcoal outlines with cream
 *     interior marks, which is right on a light background and wrong on a dark
 *     one — the outline disappears and the marks glare. Those two colours are
 *     lifted into classes and swapped under prefers-color-scheme: dark.
 *
 * The file is rendered through <img>, so it is its own document: no script in
 * it can run whatever it contains, and its media query still follows the OS.
 *
 * Run: node tools/split-food-icons.mjs <contact-sheet.svg>
 *
 * ERRERLabs — MIT licensed.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sheetPath = process.argv[2];
if (!sheetPath) {
  console.error('usage: node tools/split-food-icons.mjs <contact-sheet.svg>');
  process.exit(1);
}

const sheet = readFileSync(sheetPath, 'utf8');
const ingredients = JSON.parse(readFileSync(join(root, 'data/ingredients.json'), 'utf8')).items;

const slugFor = (id) => id.replace(/^ing\./, '').replace(/\./g, '-');
const nameBySlug = new Map(ingredients.map(i => [slugFor(i.id), i.name]));

/* ---------- the shared defs, indexed by the slug that owns them ---------- */

const defsBlock = sheet.match(/<defs>([\s\S]*)<\/defs>/)?.[1] || '';

/** Every top-level definition in the sheet, keyed by its id. */
const defById = new Map();
for (const m of defsBlock.matchAll(/<(radialGradient|linearGradient|filter|clipPath|mask|pattern) id="([^"]+)"[\s\S]*?<\/\1>/g)) {
  defById.set(m[2], m[0]);
}

/* ---------- the artwork, one group per icon ---------- */

// Each cell holds the icon in a group carrying its own drop-shadow filter,
// under a layout transform that positions and shrinks it for the sheet.
const ICON_OPEN = /<g transform="translate\([\d.\s-]+\) scale\([\d.]+\)"([^>]*?)filter="url\(#([a-z0-9_-]+)-depth\)"([^>]*)>/g;

/**
 * The body of the group that starts at `from`, matched by balancing <g> pairs.
 *
 * Roughly half these icons nest a group inside — every tin, pouch and jar does,
 * to clip a label onto the container. A non-greedy scan to the first </g> cuts
 * those in half and produces a file that still parses as far as the browser's
 * first error and then renders nothing, which is a genuinely hard failure to
 * notice: the request is a clean 200 and the image is simply blank.
 */
function balancedGroup(source, from) {
  let depth = 1;
  let i = from;
  while (depth > 0) {
    const next = source.slice(i).search(/<\/?g[\s>]/);
    if (next === -1) return null;
    i += next;
    depth += source.startsWith('</g', i) ? -1 : 1;
    i += 3;
  }
  return { body: source.slice(from, i - 4 + 1), end: i };
}

const CHARCOAL = '#303532';
const CREAM = '#F3E8CF';

/**
 * Swap the two structural colours for classes the stylesheet can flip.
 * Presentation attributes cannot take a custom property, so classes it is.
 */
function themeable(markup) {
  return markup.replace(/(fill|stroke)="(#303532|#F3E8CF)"/gi, (_, prop, colour) => {
    const tone = colour.toUpperCase() === CHARCOAL.toUpperCase() ? 'ink' : 'paper';
    return `class="${tone}-${prop[0]}"`;
  });
}

/** Merge the classes an element picked up from the swap above into one attribute. */
function mergeClasses(markup) {
  return markup.replace(/<(\w+)([^>]*)>/g, (whole, tag, attrs) => {
    const classes = [...attrs.matchAll(/class="([^"]*)"/g)].map(m => m[1]);
    if (classes.length < 2) return whole;
    const merged = [...new Set(classes.join(' ').split(/\s+/).filter(Boolean))].join(' ');
    let first = true;
    const cleaned = attrs.replace(/\s*class="[^"]*"/g, () => (first ? (first = false, ` class="${merged}"`) : ''));
    return `<${tag}${cleaned}>`;
  });
}

const STYLE = [
  '<style>',
  `.ink-s{stroke:${CHARCOAL}}.ink-f{fill:${CHARCOAL}}`,
  `.paper-s{stroke:${CREAM}}.paper-f{fill:${CREAM}}`,
  '@media(prefers-color-scheme:dark){',
  `.ink-s{stroke:${CREAM}}.ink-f{fill:${CREAM}}`,
  `.paper-s{stroke:${CHARCOAL}}.paper-f{fill:${CHARCOAL}}}`,
  '</style>'
].join('');

const outDir = join(root, 'icons/food');
mkdirSync(outDir, { recursive: true });

const written = [];
const unknown = [];
const unresolved = [];

for (const m of sheet.matchAll(ICON_OPEN)) {
  const [, before, slug, after] = m;
  const name = nameBySlug.get(slug);
  if (!name) { unknown.push(slug); continue; }

  const group = balancedGroup(sheet, m.index + m[0].length);
  if (!group) { unknown.push(`${slug} (unbalanced)`); continue; }
  const body = group.body;

  // Everything this icon references: its own gradients and its own filter.
  const used = new Set([...(m[0] + body).matchAll(/url\(#([^)]+)\)/g)].map(u => u[1]));
  const defs = [...used].map(id => defById.get(id)).filter(Boolean).join('\n    ');

  const groupAttrs = themeable(`${before}${after}`.replace(/\s+/g, ' ').trim());
  const artwork = mergeClasses(themeable(body));

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-labelledby="t">`,
    `  <title id="t">${name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>`,
    `  ${STYLE}`,
    defs ? `  <defs>\n    ${defs}\n  </defs>` : '',
    `  <g ${groupAttrs} filter="url(#${slug}-depth)">${artwork}</g>`,
    `</svg>`,
    ''
  ].filter(Boolean).join('\n');

  // A gradient left behind in the sheet's shared defs renders as solid black,
  // which is not obviously wrong at 24px. Check every reference resolves before
  // the file is written rather than discovering it on a shopping list.
  const declared = new Set([...svg.matchAll(/ id="([^"]+)"/g)].map(d => d[1]));
  const dangling = [...new Set([...svg.matchAll(/url\(#([^)]+)\)/g)].map(u => u[1]))]
    .filter(id => !declared.has(id));
  if (dangling.length) { unresolved.push(`${slug}: ${dangling.join(', ')}`); continue; }

  writeFileSync(join(outDir, `${slug}.svg`), svg);
  written.push(slug);
}

/* ---------- report honestly on what is and is not covered ---------- */

const have = new Set(written);
const missing = ingredients.map(i => slugFor(i.id)).filter(s => !have.has(s));
const orphan = readdirSync(outDir)
  .filter(f => f.endsWith('.svg'))
  .map(f => f.replace(/\.svg$/, ''))
  .filter(s => !nameBySlug.has(s));

for (const s of orphan) rmSync(join(outDir, `${s}.svg`));

const bytes = readdirSync(outDir).reduce((n, f) => n + readFileSync(join(outDir, f)).length, 0);

console.log(`food icons: ${written.length} written to icons/food/`);
console.log(`  ${(bytes / 1024).toFixed(0)} KB total, ${Math.round(bytes / written.length)} bytes average`);
if (unresolved.length) {
  console.log(`  ! ${unresolved.length} icon(s) reference a definition that is not in their file:`);
  for (const u of unresolved) console.log(`      ${u}`);
}
if (unknown.length) console.log(`  ! ${unknown.length} in the sheet with no matching ingredient: ${unknown.join(', ')}`);
if (orphan.length) console.log(`  · removed ${orphan.length} stale file(s) for ingredients that no longer exist`);
if (missing.length) {
  console.log(`  ! ${missing.length} ingredient(s) still have no icon:`);
  for (const s of missing) console.log(`      ${s}`);
}

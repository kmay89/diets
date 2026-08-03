#!/usr/bin/env node
/**
 * build-share-pages.mjs — one real, crawlable page per recipe, plus the sitemap.
 *
 * Why this exists: the app routes on the hash (#/recipe/rec.lentil-bolognese),
 * and a fragment is never sent to the server. Every shared link would therefore
 * hit the same index.html and every iMessage, Slack or WhatsApp preview would
 * show the same generic card. So each recipe gets a static page at
 * /r/<slug>/ carrying its own Open Graph tags, its own preview image, and
 * schema.org Recipe data — with the full recipe rendered into the HTML so the
 * page is worth reading on its own, with no JavaScript at all.
 *
 * People who already use the app are forwarded straight into it; everyone else
 * gets the readable page and an invitation.
 *
 * Run: npm run build:share
 *
 * ERRERLabs — MIT licensed.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { recipeNutrition, heartScore, formatQty } from '../js/nutrition.js';

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

export const slugFor = (recipeId) => recipeId.replace(/^rec\./, '');

const OUT_DIR = join(root, 'r');
const ISO_DATE = new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ *
 * Escaping. Recipe text is ours, but a generator that cannot be trusted
 * with an apostrophe is a generator that will bite someone later.
 * ------------------------------------------------------------------ */

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const escJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e');

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

function isoDuration(minutes) {
  if (!minutes) return undefined;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `PT${h ? h + 'H' : ''}${m ? m + 'M' : ''}` || 'PT0M';
}

function jsonLd(recipe, nut, slug) {
  const per = nut.perServing;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.title,
    description: recipe.blurb,
    url: `${site.url}${site.sharePath}/${slug}/`,
    image: [`${site.url}${site.cardPath}/${slug}.jpg`],
    author: { '@type': 'Organization', name: site.publisher },
    publisher: { '@type': 'Organization', name: site.name },
    recipeCategory: recipe.course,
    recipeCuisine: recipe.cuisine,
    recipeYield: `${recipe.servings} servings`,
    prepTime: isoDuration(recipe.activeMin),
    totalTime: isoDuration(recipe.totalMin),
    keywords: (recipe.tags || []).join(', '),
    recipeIngredient: recipe.ingredients.map(l => {
      const item = index.get(l.ing);
      if (!item) return null;
      return `${formatQty(l.qty, l.unit)} ${item.name}${l.prep ? ', ' + l.prep : ''}`.trim();
    }).filter(Boolean),
    recipeInstructions: recipe.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: s })),
    nutrition: {
      '@type': 'NutritionInformation',
      servingSize: '1 serving',
      calories: `${Math.round(per.kcal)} kcal`,
      proteinContent: `${Math.round(per.protein_g)} g`,
      fatContent: `${Math.round(per.fat_g)} g`,
      saturatedFatContent: `${Math.round(per.satfat_g)} g`,
      carbohydrateContent: `${Math.round(per.carb_g)} g`,
      fiberContent: `${Math.round(per.fiber_g)} g`,
      sugarContent: `${Math.round(per.sugar_g)} g`,
      sodiumContent: `${Math.round(per.sodium_mg)} mg`,
      cholesterolContent: `${Math.round(per.cholesterol_mg)} mg`
    }
  };
  const diets = [];
  if ((recipe.diet || []).includes('vegan')) diets.push('https://schema.org/VeganDiet');
  if ((recipe.diet || []).includes('vegetarian')) diets.push('https://schema.org/VegetarianDiet');
  if (diets.length) data.suitableForDiet = diets;
  return data;
}

/** The one-line summary a link preview shows under the title. */
function previewDescription(recipe, nut) {
  const per = nut.perServing;
  const bits = [
    `${recipe.activeMin} min active`,
    `${Math.round(per.kcal)} kcal`,
    `${Math.round(per.protein_g)} g protein`,
    `${Math.round(per.sodium_mg)} mg sodium`
  ];
  // Trim the blurb so the whole thing survives a preview card's two lines.
  const blurb = recipe.blurb.length > 118 ? recipe.blurb.slice(0, 115).replace(/[,;:\s]+\S*$/, '') + '…' : recipe.blurb;
  return `${blurb} · ${bits.join(' · ')}`;
}

function page(recipe) {
  const slug = slugFor(recipe.id);
  const nut = recipeNutrition(recipe, index);
  const heart = heartScore(nut.perServing, { course: recipe.course });
  const per = nut.perServing;
  const url = `${site.url}${site.sharePath}/${slug}/`;
  const card = `${site.url}${site.cardPath}/${slug}.jpg`;
  const description = previewDescription(recipe, nut);
  const appUrl = `/#/recipe/${recipe.id}`;

  const ingredientRows = recipe.ingredients.map(l => {
    const item = index.get(l.ing);
    if (!item) return '';
    return `        <li><span class="ing__qty">${esc(formatQty(l.qty, l.unit))}</span> ${esc(item.name)}${l.prep ? `<span class="ing__prep">, ${esc(l.prep)}</span>` : ''}${l.optional ? '<span class="ing__opt"> (optional)</span>' : ''}</li>`;
  }).join('\n');

  const omnivore = recipe.omnivore ? `
      <section class="card block fork-block">
        <h2 class="block__title">🍽 Fork in the road — for the omnivores</h2>
        <p class="fork-block__label">${esc(recipe.omnivore.label)}</p>
        <p class="muted">${esc(recipe.omnivore.note)}</p>
      </section>` : '';

  const vegSwap = recipe.vegetarianSwap ? `
      <section class="card block fork-block fork-block--veg">
        <h2 class="block__title">🌱 Fork in the road — for the vegetarian</h2>
        <p class="fork-block__label">${esc(recipe.vegetarianSwap.label)}</p>
        <p class="muted">${esc(recipe.vegetarianSwap.note)}</p>
      </section>` : '';

  const notes = [
    recipe.restaurantTouch && ['✨ The restaurant touch', recipe.restaurantTouch],
    recipe.kidTweak && ['🧒 For the kids', recipe.kidTweak],
    recipe.garden && ['🌿 From the garden', recipe.garden],
    recipe.leftovers && ['🥡 Leftovers', recipe.leftovers]
  ].filter(Boolean);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(recipe.title)} — ${esc(site.name)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">

<meta name="theme-color" content="${esc(site.themeColor)}">
<meta name="color-scheme" content="light dark">

<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:locale" content="${esc(site.locale)}">
<meta property="og:title" content="${esc(recipe.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(card)}">
<meta property="og:image:secure_url" content="${esc(card)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(recipe.title)} — ${esc(site.name)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(recipe.title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(card)}">

<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="apple-mobile-web-app-title" content="${esc(site.shortName)}">
<link rel="stylesheet" href="/css/app.css">
<script type="application/ld+json">${escJson(jsonLd(recipe, nut, slug))}</script>
</head>
<body class="share-page">
  <header class="appbar">
    <a class="appbar__brand" href="/">
      <span class="appbar__mark" aria-hidden="true">🌿</span>
      <span>${esc(site.name)}<span class="appbar__by"> · ${esc(site.publisher)}</span></span>
    </a>
    <a class="btn btn--primary btn--small" href="${esc(appUrl)}" data-app-link>Open in the app</a>
  </header>

  <main class="main">
    <article class="view recipe">
      <header class="recipe__head">
        <div>
          <h1 class="view__title">${esc(recipe.title)}</h1>
          <p class="lede">${esc(recipe.blurb)}</p>
        </div>
        ${heart.score != null ? `<span class="score score--${heart.grade}" title="Heart-forward score ${heart.score}/100 — a sorting heuristic, not medical advice">${heart.grade}</span>` : ''}
      </header>

      <div class="pill-row">
        <span class="pill">${recipe.activeMin} min active</span>
        <span class="pill">${recipe.totalMin} min total</span>
        <span class="pill">serves ${recipe.servings}</span>
        ${(recipe.diet || []).map(d => `<span class="pill pill--green">${esc(d)}</span>`).join('')}
        ${recipe.kidFriendly ? '<span class="pill">kids eat it</span>' : ''}
      </div>

      <section class="card block">
        <h2 class="block__title">Ingredients</h2>
        <ul class="ing-list ing-list--static">
${ingredientRows}
        </ul>
      </section>
${omnivore}${vegSwap}
      <section class="card block">
        <h2 class="block__title">Method</h2>
        <ol class="steps">
${recipe.steps.map(s => `          <li>${esc(s)}</li>`).join('\n')}
        </ol>
      </section>
${notes.length ? `
      <section class="card block">
        <h2 class="block__title">Notes</h2>
        <dl class="notes">
${notes.map(([t, v]) => `          <dt>${esc(t)}</dt>\n          <dd>${esc(v)}</dd>`).join('\n')}
        </dl>
      </section>` : ''}
      <section class="card block">
        <h2 class="block__title">Per serving</h2>
        <div class="nutri-grid">
          ${[['kcal', 'Calories', ''], ['protein_g', 'Protein', 'g'], ['fiber_g', 'Fiber', 'g'],
             ['satfat_g', 'Saturated fat', 'g'], ['sodium_mg', 'Sodium', 'mg'], ['potassium_mg', 'Potassium', 'mg']]
            .map(([k, label, unit]) => `<div class="nutri"><span class="nutri__value">${Math.round(per[k])}<span class="nutri__unit">${unit}</span></span><span class="nutri__label">${label}</span></div>`).join('\n          ')}
        </div>
        <p class="fine-print">Computed from USDA FoodData Central values. A planning tool, not medical advice.</p>
      </section>

      <section class="card block share-cta">
        <h2 class="block__title">Cook it properly</h2>
        <p class="muted">${esc(site.name)} scales this recipe to the size of your table, ticks off what is already in your kitchen, and builds a shopping list in the order you walk the store. It is free, it works offline, and nothing you enter leaves your device.</p>
        <div class="row-actions">
          <a class="btn btn--primary" href="${esc(appUrl)}" data-app-link>Open this recipe in the app</a>
          <a class="btn" href="/#/roll">🎲 Roll a week of dinners</a>
        </div>
      </section>
    </article>
  </main>

  <script src="/js/share-page.js" type="module"></script>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ *
 * Sitemap
 * ------------------------------------------------------------------ */

function sitemap() {
  const urls = [
    { loc: `${site.url}/`, priority: '1.0', changefreq: 'monthly' },
    ...recipes.map(r => ({
      loc: `${site.url}${site.sharePath}/${slugFor(r.id)}/`,
      priority: '0.8',
      changefreq: 'yearly'
    }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${ISO_DATE}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
}

/* ------------------------------------------------------------------ *
 * Write
 * ------------------------------------------------------------------ */

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

for (const recipe of recipes) {
  const slug = slugFor(recipe.id);
  mkdirSync(join(OUT_DIR, slug), { recursive: true });
  writeFileSync(join(OUT_DIR, slug, 'index.html'), page(recipe));
}

writeFileSync(join(root, 'sitemap.xml'), sitemap());

console.log(`share pages: ${recipes.length} written to /r/`);
console.log(`sitemap.xml: ${recipes.length + 1} urls at ${site.url}`);

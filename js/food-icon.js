/**
 * food-icon.js — the little picture next to an ingredient.
 *
 * Icons live at icons/food/<slug>.svg, where the slug is the ingredient id
 * with "ing." dropped and dots turned into dashes. That is the whole mapping,
 * deliberately: no lookup table to keep in sync, no manifest to regenerate.
 * Drop a correctly-named file into the directory and it appears.
 *
 * Anything without an icon falls back to its aisle's emoji, so a partial set
 * looks intentional rather than broken. A missing file also gets remembered
 * for the session, so the browser is not asked for it once per render.
 *
 * ERRERLabs — MIT licensed.
 */

import { h } from './ui.js';

/** ing.spice.smokedpaprika -> spice-smokedpaprika */
export function slugFor(ingredientId) {
  return String(ingredientId).replace(/^ing\./, '').replace(/\./g, '-');
}

export function iconPath(ingredientId) {
  return `icons/food/${slugFor(ingredientId)}.svg`;
}

/** Aisle emoji, used until a real icon exists for that ingredient. */
const AISLE_FALLBACK = {
  produce: '🥬',
  bakery: '🍞',
  deli: '🧀',
  'meat-seafood': '🐟',
  'dairy-eggs': '🥛',
  frozen: '❄️',
  'canned-jarred': '🥫',
  'dry-goods': '🌾',
  'nuts-seeds': '🥜',
  baking: '🧁',
  condiments: '🍯',
  'oils-vinegars': '🫒',
  spices: '🧂',
  international: '🍜',
  beverages: '🧃',
  household: '🧽',
  other: '🍽'
};

/**
 * Slugs already known to 404. Populated at runtime by the img error handler,
 * so a half-finished icon set costs one failed request per ingredient per
 * session rather than one per render.
 */
const missing = new Set();

/**
 * @param item a full ingredient record (needs id and aisle)
 * @param size px; the icons are drawn on a 64-unit grid and hold up at 24
 */
export function foodIcon(item, { size = 24 } = {}) {
  if (!item) return null;
  const fallback = () => h('span.food-icon.food-icon--fallback', {
    'aria-hidden': 'true',
    style: `--food-icon-size:${size}px`
  }, AISLE_FALLBACK[item.aisle] || AISLE_FALLBACK.other);

  if (missing.has(item.id)) return fallback();

  // An <img>-loaded SVG is its own document: no script runs in it whatever the
  // file contains, and its internal prefers-color-scheme rules still follow
  // the OS setting. That is the safe way to render art we did not author.
  const img = h('img.food-icon', {
    src: iconPath(item.id),
    alt: '',
    'aria-hidden': 'true',
    loading: 'lazy',
    decoding: 'async',
    width: size,
    height: size,
    style: `--food-icon-size:${size}px`
  });

  img.addEventListener('error', () => {
    missing.add(item.id);
    img.replaceWith(fallback());
  }, { once: true });

  return img;
}

/* ------------------------------------------------------------------ *
 * Picking which ingredients to draw
 * ------------------------------------------------------------------ */

/** Words too common to identify anything — every recipe has salt and oil. */
const TOO_GENERIC = new Set([
  'salt', 'water', 'oil', 'pepper', 'spice', 'broth', 'stock', 'sugar', 'flour', 'kosher'
]);

/**
 * Aisles that are the medium rather than the subject.
 *
 * Blocking the word "olive" would take the olives with the olive oil, so the
 * distinction is drawn at the aisle instead: a step is about the broccoli, not
 * about the fat it was tossed in, even though it names both. These still get
 * drawn when nothing else in the step matched — "heat the oil in a dutch oven"
 * is genuinely about the oil.
 */
const BACKGROUND_AISLES = new Set(['oils-vinegars', 'spices', 'baking']);

/** The words that would let you point at this ingredient across a kitchen. */
function matchKeys(item) {
  const fromId = String(item.id).replace(/^ing\./, '').split('.');
  const fromName = String(item.name).toLowerCase().match(/[a-z]+/g) || [];
  const keys = new Set();
  for (const w of [...fromId, ...fromName]) {
    if (w.length >= 4 && !TOO_GENERIC.has(w)) keys.add(w);
  }
  return [...keys].sort((a, b) => b.length - a.length);
}

/**
 * The ingredients a piece of text actually names, in the order it names them.
 *
 * Used to illustrate a cooking step from its own instruction, and to work out
 * which ingredients a recipe title is about — "Weeknight Lentil Bolognese"
 * should be drawn with lentils, not with whichever tin happens to weigh most.
 * Returns nothing rather than something arbitrary when there is no match.
 */
export function ingredientsNamedIn(text, lines, ingIndex, limit = 3) {
  const hay = ` ${String(text).toLowerCase()} `;
  const hits = [];
  const seen = new Set();

  for (const line of lines || []) {
    const item = ingIndex.get(line.ing);
    if (!item || seen.has(item.id)) continue;
    for (const key of matchKeys(item)) {
      const at = hay.indexOf(key);
      if (at === -1) continue;
      hits.push({ item, at });
      seen.add(item.id);
      break;
    }
  }

  hits.sort((a, b) => a.at - b.at);

  const foreground = hits.filter(x => !BACKGROUND_AISLES.has(x.item.aisle));
  const chosen = foreground.length ? foreground : hits;
  return chosen.slice(0, limit).map(x => x.item);
}

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

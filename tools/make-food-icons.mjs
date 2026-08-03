#!/usr/bin/env node
/**
 * make-food-icons.mjs — draw a food icon for any ingredient that does not have one.
 *
 * The original 227-icon set arrived as a hand-drawn contact sheet (see
 * split-food-icons.mjs). Every ingredient added since then still needs a file
 * at icons/food/<slug>.svg, because the app maps ids to filenames with no
 * lookup table and the test suite fails on a gap.
 *
 * So this draws one, from a small vocabulary of shapes and a fixed palette,
 * matched to the original set's conventions: a 64-unit grid, charcoal outlines
 * that flip to cream in dark mode, a radial-gradient fill, and one soft drop
 * shadow. The result reads correctly at 24 pixels and sits beside the
 * hand-drawn icons without looking like a different app — but it is generated
 * art, and docs/ART.md lists every slug drawn this way so an illustrator (or
 * ChatGPT) knows exactly what is still worth replacing by hand.
 *
 * Icons drawn here join the set's shared optical alignment: every file wraps its
 * artwork in the transform recorded in scripts/food-icon-alignment.json, so a
 * tall bottle and a wide platter carry the same visual weight at 24 px. The
 * entries for generated icons are written from each shape's measured bounding
 * box rather than guessed, and the test compares the file against the JSON.
 *
 * Nothing here overwrites an existing file. Delete an icon to have it redrawn,
 * or pass slugs to redraw explicitly:
 *
 *   node tools/make-food-icons.mjs                 # fill the gaps
 *   node tools/make-food-icons.mjs mango naan      # redraw these two
 *   node tools/make-food-icons.mjs --all           # redraw every generated icon
 *
 * ERRERLabs — MIT licensed.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'icons/food');

export const slugFor = (id) => String(id).replace(/^ing\./, '').replace(/\./g, '-');

/** The marker for an aisle-fallback drawing that still needs an art pass. */
export const GENERATED_MARK = 'data-drawn="generated"';

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ------------------------------------------------------------------ *
 * Palette. Three stops each, light to dark, matching the tone the
 * original sheet used for its clay, green, cream and charcoal fills.
 * ------------------------------------------------------------------ */

const PALETTE = {
  clay: ['#F1A176', '#C66B3D', '#813A26'],
  green: ['#79A18A', '#244C3F', '#142F28'],
  leaf: ['#B2D28C', '#5E8C3F', '#33541F'],
  cream: ['#FFFDF2', '#F3E8CF', '#C6B184'],
  charcoal: ['#758078', '#303532', '#151917'],
  red: ['#F08C7A', '#C0392B', '#7B1E14'],
  gold: ['#FFDCA0', '#E8B44A', '#A87420'],
  purple: ['#C7A8D8', '#7B4B95', '#452857'],
  teal: ['#8FD0C8', '#2E8B84', '#155650'],
  pink: ['#F7BFCF', '#D9738F', '#8E3B54'],
  brown: ['#C9A57E', '#8A5A33', '#4E2F17'],
  white: ['#FFFFFF', '#EDEDE4', '#BFBFB2'],
  orange: ['#FFC98A', '#EE8B2D', '#A85410'],
  blue: ['#A9C8E8', '#4A7BB0', '#22436B'],
  yellow: ['#FFEFA8', '#F2CE3E', '#B08F12'],
  wine: ['#D79BB4', '#8E2F52', '#4E1428']
};

/* ------------------------------------------------------------------ *
 * Shapes. Each takes (a, b) — the two gradient url()s it may fill with —
 * and returns the drawing, on the same 0..64 grid the hand-drawn set uses.
 * ------------------------------------------------------------------ */

const SHAPES = {
  jar: (a, b) => `
  <rect x="18" y="12" width="28" height="6" rx="2" fill="${b}"/>
  <path d="M20 18H44L46 25V53H18V25Z" fill="${a}"/>
  <rect x="21" y="30" width="22" height="15" rx="3" fill="${b}" stroke="none" opacity="0.9"/>`,

  bottle: (a, b) => `
  <path d="M27 12h10v7l6 9v25H21V28l6-9Z" fill="${a}"/>
  <rect x="26" y="8" width="12" height="5" rx="1.5" fill="${b}"/>
  <rect x="24" y="33" width="16" height="12" rx="2" fill="${b}" stroke="none" opacity="0.9"/>`,

  can: (a, b) => `
  <path d="M15 19h34v26a17 6 0 0 1-34 0Z" fill="${a}"/>
  <ellipse cx="32" cy="19" rx="17" ry="6" fill="${b}"/>
  <path d="M15 30h34" fill="none" stroke-width="1.4" opacity="0.6"/>`,

  bag: (a, b) => `
  <path d="M18 21q14-9 28 0v27q-14 7-28 0Z" fill="${a}"/>
  <path d="M18 21q14 9 28 0" fill="none"/>
  <rect x="24" y="31" width="16" height="11" rx="2.5" fill="${b}" stroke="none" opacity="0.9"/>`,

  box: (a, b) => `
  <path d="M17 24h30v29H17Z" fill="${a}"/>
  <path d="M17 24l15-11 15 11" fill="${b}"/>
  <path d="M32 13v11" fill="none" stroke-width="1.6"/>`,

  round: (a, b) => `
  <circle cx="32" cy="37" r="19" fill="${a}"/>
  <path d="M32 18V11" fill="none" stroke-width="2.8"/>
  <path d="M33 13q8-4 13 0q-6 4-13 0Z" fill="${b}"/>`,

  berry: (a, b) => `
  <circle cx="24" cy="40" r="11" fill="${a}"/>
  <circle cx="41" cy="41" r="9" fill="${a}"/>
  <circle cx="33" cy="27" r="10" fill="${a}"/>
  <path d="M33 17q7-5 12-1q-6 5-12 1Z" fill="${b}"/>`,

  leafy: (a, b) => `
  <path d="M32 54V32" fill="none" stroke-width="2.6"/>
  <path d="M32 36q-17-3-19-19q17-2 19 19Z" fill="${a}"/>
  <path d="M32 36q17-3 19-19q-17-2-19 19Z" fill="${a}"/>
  <path d="M32 24q-4-10 0-16q4 6 0 16Z" fill="${b}"/>`,

  root: (a, b) => `
  <path d="M26 22h12l-3 26q-3 8-6 0Z" fill="${a}"/>
  <path d="M32 22V12" fill="none" stroke-width="2.4"/>
  <path d="M32 16q-8-6-13-2q5 7 13 2Z" fill="${b}"/>
  <path d="M32 16q8-6 13-2q-5 7-13 2Z" fill="${b}"/>`,

  chile: (a, b) => `
  <path d="M41 19q9 13 1 27q-9 15-22 8q11-5 14-18q3-13 7-17Z" fill="${a}"/>
  <path d="M41 19l-4-7" fill="none" stroke-width="2.6"/>
  <path d="M33 13q6-4 10-1q-5 4-10 1Z" fill="${b}"/>`,

  wedge: (a, b) => `
  <path d="M9 46q23-31 46 0Z" fill="${a}"/>
  <path d="M32 24v22" fill="none" stroke-width="1.6"/>
  <path d="M20 35q12-8 24 0" fill="none" stroke-width="1.6"/>
  <path d="M9 46h46" fill="none" stroke="${b === 'none' ? 'none' : 'none'}"/>`,

  block: (a, b) => `
  <path d="M13 26h32a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H13Z" fill="${a}"/>
  <path d="M13 26l7-9h32l-7 9" fill="${b}"/>
  <path d="M49 30l7-9v18l-7 9" fill="${b}"/>`,

  slab: (a, b) => `
  <path d="M9 39q11-17 27-17t19 11q-7 14-25 14T9 39Z" fill="${a}"/>
  <path d="M20 30q9 5 9 15M29 26q9 5 9 16" fill="none" stroke-width="1.5" opacity="0.75"/>
  <path d="M55 33q-4 3 0 8" fill="${b}" stroke="none"/>`,

  loaf: (a, b) => `
  <path d="M11 45q0-21 21-21t21 21q0 7-7 7H18q-7 0-7-7Z" fill="${a}"/>
  <path d="M21 30q3 6 2 12M32 27q2 7 1 15M43 30q-3 6-2 12" fill="none" stroke-width="1.6" opacity="0.7"/>
  <path d="M11 45h42" fill="none" stroke="${b === 'none' ? 'none' : 'none'}"/>`,

  disc: (a, b) => `
  <ellipse cx="32" cy="36" rx="23" ry="16" fill="${a}"/>
  <ellipse cx="32" cy="36" rx="14" ry="9" fill="${b}" stroke="none" opacity="0.55"/>`,

  noodles: (a, b) => `
  <path d="M10 34h44a22 21 0 0 1-44 0Z" fill="${a}"/>
  <path d="M16 30q6-12 16-8M28 28q4-13 14-9M38 27q5-10 12-6" fill="none" stroke-width="2.4"/>
  <path d="M10 34h44" fill="none" stroke-width="2.4"/>
  <path d="M22 40h20" fill="${b}" stroke="none"/>`,

  grain: (a, b) => `
  <path d="M11 43q21-17 42 0Z" fill="${a}"/>
  <path d="M11 43h42" fill="none" stroke-width="2.4"/>
  <path d="M24 36h3M31 32h3M38 36h3M28 40h3M35 40h3" fill="none" stroke="${b}" stroke-width="2.6"/>`,

  pod: (a, b) => `
  <path d="M22 11q3 27 20 44q-19-4-25-25Z" fill="${a}"/>
  <path d="M24 20q6 18 16 28" fill="none" stroke-width="1.5" opacity="0.7"/>
  <path d="M22 11q-6-3-9 1q5 4 9-1Z" fill="${b}"/>`,

  mushroom: (a, b) => `
  <path d="M11 33a21 15 0 0 1 42 0Z" fill="${a}"/>
  <path d="M25 33h14v15q-7 5-14 0Z" fill="${b}"/>
  <path d="M11 33h42" fill="none" stroke-width="2.2"/>`,

  bowl: (a, b) => `
  <path d="M9 31h46a23 21 0 0 1-46 0Z" fill="${a}"/>
  <ellipse cx="32" cy="31" rx="23" ry="6" fill="${b}"/>
  <path d="M24 28q8-5 16 0" fill="none" stroke-width="1.6" opacity="0.7"/>`,

  nut: (a, b) => `
  <path d="M32 12q17 9 13 27q-4 16-13 14t-13-14q-4-18 13-27Z" fill="${a}"/>
  <path d="M32 14v37" fill="none" stroke-width="1.6" opacity="0.75"/>
  <path d="M25 24q7 6 14 0" fill="none" stroke="${b}" stroke-width="1.6"/>`,

  tuber: (a, b) => `
  <ellipse cx="32" cy="35" rx="21" ry="14" fill="${a}"/>
  <path d="M23 31h.5M32 38h.5M40 30h.5M36 43h.5M24 41h.5" fill="none" stroke="${b}" stroke-width="3" stroke-linecap="round"/>`,

  sprig: (a, b) => `
  <path d="M32 54q0-24 0-42" fill="none" stroke-width="2.6"/>
  <path d="M32 20q-10-6-13 2q9 5 13-2ZM32 30q10-6 13 2q-9 5-13-2ZM32 40q-10-6-13 2q9 5 13-2Z" fill="${a}"/>
  <path d="M32 12q5 4 0 8q-5-4 0-8Z" fill="${b}"/>`,

  cup: (a, b) => `
  <path d="M13 24h30v15a15 15 0 0 1-30 0Z" fill="${a}"/>
  <path d="M43 28h5a6 6 0 0 1 0 12h-5" fill="none"/>
  <ellipse cx="28" cy="24" rx="15" ry="5" fill="${b}"/>`,

  sheet: (a, b) => `
  <path d="M14 20h30v28H14Z" fill="${a}" transform="rotate(-7 32 34)"/>
  <path d="M20 18h30v28H20Z" fill="${b}" transform="rotate(6 32 34)"/>`,

  stalks: (a, b) => `
  <path d="M22 52q-3-24 2-40M32 53q-1-26 0-41M42 52q3-24-2-40" fill="none" stroke-width="6" stroke="${a}" stroke-linecap="round"/>
  <path d="M24 14q-5-5-10-2q5 6 10 2ZM40 14q5-5 10-2q-5 6-10 2Z" fill="${b}"/>`,

  cheese: (a, b) => `
  <path d="M10 45 53 21v24Z" fill="${a}"/>
  <circle cx="34" cy="38" r="3.5" fill="${b}" stroke="none"/>
  <circle cx="44" cy="33" r="2.5" fill="${b}" stroke="none"/>`,

  carton: (a, b) => `
  <path d="M19 24h26v29H19Z" fill="${a}"/>
  <path d="M19 24l13-11 13 11" fill="${b}"/>
  <path d="M26 18h12" fill="none" stroke-width="2"/>`,

  fruitcluster: (a, b) => `
  <circle cx="26" cy="36" r="8"/>
  <circle cx="26" cy="36" r="8" fill="${a}"/>
  <circle cx="40" cy="38" r="10" fill="${a}"/>
  <path d="M40 28V16" fill="none" stroke-width="2.4"/>
  <path d="M41 18q8-4 12 0q-6 4-12 0Z" fill="${b}"/>`
};

/* ------------------------------------------------------------------ *
 * Optical alignment
 *
 * The hand-drawn set centers every silhouette on the 64-unit grid and scales
 * it to a common visual weight, recorded in scripts/food-icon-alignment.json.
 * Generated icons have to play by the same rule or they sit noticeably larger
 * or smaller than their neighbors in a list.
 *
 * Every icon using a given shape has an identical bounding box — the geometry
 * is fixed and only the colors change — so one measurement per shape is enough.
 * These were measured by rendering each shape and reading getBBox(), not
 * estimated from the path data.
 * ------------------------------------------------------------------ */

/** shape -> [x, y, width, height] of the drawn artwork, before alignment. */
const BOX = {
  bag: [18, 16.5, 28, 35],
  berry: [13, 14.222, 37, 36.778],
  block: [13, 17, 43, 35],
  bottle: [21, 8, 22, 45],
  bowl: [9, 25, 46, 27],
  box: [17, 13, 30, 40],
  can: [15, 13, 34, 38],
  carton: [19, 13, 26, 40],
  cheese: [10, 21, 43, 24],
  chile: [20, 10.714, 25.765, 45.513],
  cup: [13, 19, 41, 35],
  disc: [9, 20, 46, 32],
  fruitcluster: [18, 16, 35, 32],
  grain: [11, 32, 42, 11],
  jar: [18, 12, 28, 41],
  leafy: [13, 8, 38, 46],
  loaf: [11, 24, 42, 28],
  mushroom: [11, 18, 42, 32.5],
  noodles: [10, 18.059, 44, 36.941],
  nut: [18.238, 12, 27.524, 41.222],
  pod: [13, 9.714, 29, 45.286],
  root: [19, 12, 26, 40],
  round: [13, 11, 38, 45],
  sheet: [12.428, 16.833, 39.146, 33.256],
  slab: [9, 22, 46, 25],
  sprig: [19, 12, 26, 42],
  stalks: [14, 10.875, 36, 42.125],
  tuber: [11, 21, 42, 28],
  wedge: [9, 24, 46, 22]
};

/**
 * The size the aligned artwork is scaled to fill, in grid units.
 *
 * 45 rather than the 48 the grid would allow: measured against the hand-drawn
 * icons, whose alignment was computed from path control hulls and so runs a
 * few percent smaller than a rendered bounding box, this lands a generated
 * icon within a percent or two of its neighbors.
 */
const TARGET = 45;

const round = (n, places) => Number(n.toFixed(places));

/** The translate/scale/translate the set uses to center and weight a silhouette. */
export function alignmentFor(shape) {
  const [x, y, w, h] = BOX[shape] || BOX.bowl;
  return {
    scale: round(TARGET / Math.max(w, h), 5),
    cx: round(x + w / 2, 4),
    cy: round(y + h / 2, 4)
  };
}

/* ------------------------------------------------------------------ *
 * Which shape and colors each ingredient gets.
 *
 * Anything not named here falls back to its aisle's default, which is
 * why a new ingredient always gets *something* rather than a 404.
 * ------------------------------------------------------------------ */

const AISLE_DEFAULT = {
  produce: ['round', 'leaf', 'green'],
  bakery: ['loaf', 'brown', 'cream'],
  deli: ['slab', 'pink', 'cream'],
  'meat-seafood': ['slab', 'pink', 'cream'],
  'dairy-eggs': ['carton', 'white', 'blue'],
  frozen: ['bag', 'blue', 'white'],
  'canned-jarred': ['can', 'red', 'cream'],
  'dry-goods': ['bag', 'gold', 'brown'],
  'nuts-seeds': ['nut', 'brown', 'cream'],
  baking: ['bag', 'cream', 'brown'],
  condiments: ['bottle', 'red', 'cream'],
  'oils-vinegars': ['bottle', 'gold', 'green'],
  spices: ['jar', 'cream', 'clay'],
  international: ['jar', 'clay', 'cream'],
  beverages: ['bottle', 'wine', 'cream'],
  household: ['box', 'blue', 'white'],
  other: ['bowl', 'cream', 'clay']
};

/** slug -> [shape, primary palette, secondary palette] */
const SPEC = {
  /* produce */
  'cabbage-napa': ['leafy', 'lime', 'leaf'],
  'cabbage-red': ['round', 'purple', 'leaf'],
  beansprouts: ['sprig', 'white', 'leaf'],
  daikon: ['root', 'white', 'leaf'],
  'pepper-poblano': ['chile', 'green', 'leaf'],
  'pepper-serrano': ['chile', 'lime', 'leaf'],
  tomatillo: ['round', 'lime', 'leaf'],
  'chile-thai': ['chile', 'red', 'leaf'],
  plantain: ['pod', 'yellow', 'leaf'],
  mango: ['round', 'orange', 'leaf'],
  pineapple: ['round', 'gold', 'leaf'],
  cantaloupe: ['wedge', 'orange', 'leaf'],
  'cherries-sweet': ['fruitcluster', 'red', 'leaf'],
  raspberries: ['berry', 'pink', 'leaf'],
  blackberries: ['berry', 'purple', 'leaf'],
  radish: ['root', 'pink', 'leaf'],
  parsnip: ['root', 'cream', 'leaf'],
  collards: ['leafy', 'green', 'leaf'],
  okra: ['pod', 'lime', 'leaf'],
  lemongrass: ['stalks', 'lime', 'leaf'],
  'squash-spaghetti': ['tuber', 'yellow', 'leaf'],
  rhubarb: ['stalks', 'red', 'leaf'],
  'lettuce-butter': ['leafy', 'lime', 'leaf'],
  jicama: ['tuber', 'cream', 'leaf'],
  'onion-sweet': ['round', 'gold', 'leaf'],
  'mushroom-oyster': ['mushroom', 'cream', 'brown'],
  /* dairy */
  buttermilk: ['carton', 'white', 'blue'],
  'cheese-monterey': ['cheese', 'cream', 'gold'],
  'cheese-swiss': ['cheese', 'gold', 'cream'],
  'cheese-halloumi': ['block', 'white', 'cream'],
  'cheese-quesofresco': ['block', 'white', 'cream'],
  'sourcream-light': ['bowl', 'white', 'blue'],
  'milk-oat': ['carton', 'cream', 'gold'],
  mascarpone: ['bowl', 'white', 'cream'],
  /* meat & seafood */
  'beef-ground90': ['slab', 'red', 'cream'],
  'beef-chuck': ['slab', 'red', 'cream'],
  'pork-shoulder': ['slab', 'pink', 'cream'],
  bacon: ['slab', 'pink', 'cream'],
  'ham-deli': ['slab', 'pink', 'cream'],
  'sausage-andouille-chicken': ['pod', 'clay', 'cream'],
  'clams-canned': ['can', 'blue', 'cream'],
  'crab-lump': ['bowl', 'clay', 'cream'],
  'tuna-ahi': ['slab', 'red', 'cream'],
  /* bakery */
  'bread-sourdough': ['loaf', 'gold', 'cream'],
  'bread-rye': ['loaf', 'brown', 'cream'],
  'roll-hoagie': ['loaf', 'gold', 'cream'],
  englishmuffin: ['disc', 'gold', 'cream'],
  naan: ['disc', 'gold', 'brown'],
  'tortilla-flour': ['disc', 'cream', 'gold'],
  phyllo: ['sheet', 'cream', 'gold'],
  puffpastry: ['sheet', 'gold', 'cream'],
  ladyfingers: ['stalks', 'gold', 'cream'],
  /* grains & dry goods */
  'rice-arborio': ['grain', 'cream', 'gold'],
  'rice-sushi': ['grain', 'white', 'cream'],
  'rice-basmati': ['grain', 'cream', 'gold'],
  'noodle-soba': ['noodles', 'brown', 'cream'],
  'noodle-udon': ['noodles', 'cream', 'gold'],
  'noodle-ramen': ['noodles', 'gold', 'cream'],
  'noodle-glass': ['noodles', 'white', 'cream'],
  grits: ['bowl', 'yellow', 'cream'],
  'barley-pearl': ['grain', 'cream', 'brown'],
  bulgur: ['grain', 'brown', 'gold'],
  'chickpeas-dried': ['grain', 'gold', 'cream'],
  'popcorn-kernels': ['grain', 'yellow', 'cream'],
  'flour-bread': ['bag', 'cream', 'brown'],
  semolina: ['bag', 'yellow', 'brown'],
  masa: ['bag', 'yellow', 'brown'],
  ricepaper: ['sheet', 'white', 'cream'],
  'wonton-wrappers': ['sheet', 'cream', 'gold'],
  /* canned & frozen */
  'beans-kidney': ['can', 'wine', 'cream'],
  hominy: ['can', 'cream', 'gold'],
  'pumpkin-canned': ['can', 'orange', 'cream'],
  'coconutmilk-full': ['can', 'white', 'teal'],
  'milk-condensed': ['can', 'cream', 'gold'],
  'chile-ancho': ['chile', 'brown', 'clay'],
  'artichoke-canned': ['can', 'lime', 'cream'],
  bamboo: ['can', 'cream', 'lime'],
  'frozen-mango': ['bag', 'orange', 'white'],
  'frozen-cherries': ['bag', 'wine', 'white'],
  'frozen-pineapple': ['bag', 'gold', 'white'],
  'frozen-riced-cauliflower': ['bag', 'white', 'lime'],
  'tots-frozen': ['bag', 'gold', 'white'],
  /* international pantry */
  doubanjiang: ['jar', 'red', 'cream'],
  blackvinegar: ['bottle', 'charcoal', 'cream'],
  shaoxing: ['bottle', 'brown', 'gold'],
  hoisin: ['jar', 'brown', 'cream'],
  'stirfrysauce-mushroom': ['bottle', 'brown', 'cream'],
  mirin: ['bottle', 'gold', 'cream'],
  'miso-red': ['jar', 'clay', 'cream'],
  nori: ['sheet', 'green', 'charcoal'],
  kombu: ['sheet', 'green', 'teal'],
  fishsauce: ['bottle', 'gold', 'cream'],
  'currypaste-green': ['jar', 'lime', 'cream'],
  tamarind: ['jar', 'brown', 'cream'],
  'pomegranate-molasses': ['bottle', 'wine', 'cream'],
  sauerkraut: ['jar', 'cream', 'lime'],
  ghee: ['jar', 'gold', 'cream'],
  /* spices */
  'spice-allspice': ['jar', 'brown', 'cream'],
  'spice-cardamom': ['jar', 'lime', 'cream'],
  'spice-cloves': ['jar', 'brown', 'cream'],
  'spice-nutmeg': ['jar', 'clay', 'cream'],
  'spice-cayenne': ['jar', 'red', 'cream'],
  'spice-sichuanpeppercorn': ['jar', 'wine', 'cream'],
  'spice-fivespice': ['jar', 'brown', 'gold'],
  'spice-mustardseed': ['jar', 'gold', 'cream'],
  'spice-saffron': ['jar', 'orange', 'gold'],
  'spice-sumac': ['jar', 'wine', 'cream'],
  'spice-berbere': ['jar', 'red', 'gold'],
  'spice-oldbay': ['jar', 'yellow', 'red'],
  'spice-gochugaru': ['jar', 'red', 'gold'],
  /* baking, oils, condiments */
  'yeast-instant': ['jar', 'cream', 'brown'],
  molasses: ['bottle', 'charcoal', 'gold'],
  'coffee-espresso': ['cup', 'brown', 'cream'],
  'oil-coconut': ['jar', 'white', 'cream'],
  'oil-avocado': ['bottle', 'lime', 'green'],
  'vinegar-apple': ['bottle', 'gold', 'cream'],
  ketchup: ['bottle', 'red', 'cream'],
  'mustard-yellow': ['bottle', 'yellow', 'cream'],
  bbqsauce: ['bottle', 'brown', 'red'],
  hotsauce: ['bottle', 'red', 'gold'],
  worcestershire: ['bottle', 'charcoal', 'gold'],
  horseradish: ['jar', 'white', 'leaf'],
  /* nuts & seeds */
  pinenuts: ['nut', 'cream', 'brown'],
  hazelnuts: ['nut', 'brown', 'cream'],
  macadamia: ['nut', 'cream', 'brown'],
  'apricots-dried': ['round', 'orange', 'brown']
};

/* ------------------------------------------------------------------ *
 * Draw
 * ------------------------------------------------------------------ */

function stops(name) {
  const [a, b, c] = PALETTE[name] || PALETTE.cream;
  return `<stop offset="0" stop-color="${a}"/><stop offset="0.48" stop-color="${b}"/><stop offset="1" stop-color="${c}"/>`;
}

export function shapeFor(item) {
  return (SPEC[slugFor(item.id)] || AISLE_DEFAULT[item.aisle] || AISLE_DEFAULT.other)[0];
}

export function drawIcon(item) {
  const slug = slugFor(item.id);
  const commissioned = Object.hasOwn(SPEC, slug);
  const [shape, primary, secondary] = SPEC[slug] || AISLE_DEFAULT[item.aisle] || AISLE_DEFAULT.other;
  const body = SHAPES[shape] || SHAPES.bowl;
  const { scale, cx, cy } = alignmentFor(shape);

  const gradA = `${slug}-a`;
  const gradB = `${slug}-b`;
  const depth = `${slug}-depth`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-labelledby="t"${commissioned ? '' : ` ${GENERATED_MARK}`}>
  <title id="t">${xml(item.name)}</title>
  <style>.ink-s{stroke:#303532}.ink-f{fill:#303532}.paper-s{stroke:#F3E8CF}.paper-f{fill:#F3E8CF}@media(prefers-color-scheme:dark){.ink-s{stroke:#F3E8CF}.ink-f{fill:#F3E8CF}.paper-s{stroke:#303532}.paper-f{fill:#303532}}</style>
  <defs>
    <filter id="${depth}" x="-18%" y="-18%" width="136%" height="140%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0.35" dy="0.8" stdDeviation="0.6" flood-color="#111815" flood-opacity="0.27"/>
    </filter>
    <radialGradient id="${gradA}" cx="27%" cy="20%" r="88%">${stops(primary)}</radialGradient>
    <radialGradient id="${gradB}" cx="27%" cy="20%" r="88%">${stops(secondary)}</radialGradient>
  </defs>
  <g class="ink-s" stroke-width="2.05" stroke-linecap="round" stroke-linejoin="round" filter="url(#${depth})"><g class="optical-alignment" transform="translate(32 32) scale(${scale}) translate(${-cx} ${-cy})">${body(`url(#${gradA})`, `url(#${gradB})`).replace(/\n\s+/g, '')}</g></g>
</svg>
`;
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const ingredients = JSON.parse(readFileSync(join(root, 'data/ingredients.json'), 'utf8')).items;
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const named = new Set(args.filter(a => !a.startsWith('--')));

  mkdirSync(OUT, { recursive: true });

  // The alignment file is shared with the hand-drawn set, so entries are added
  // and never rewritten wholesale — a hand-tuned number must survive this tool.
  const alignPath = join(root, 'scripts/food-icon-alignment.json');
  const alignment = existsSync(alignPath) ? JSON.parse(readFileSync(alignPath, 'utf8')) : {};
  const known = new Set(ingredients.map(i => slugFor(i.id)));

  const written = [];
  const kept = [];
  for (const item of ingredients) {
    const slug = slugFor(item.id);
    const file = join(OUT, `${slug}.svg`);
    const exists = existsSync(file);
    const generated = exists && readFileSync(file, 'utf8').includes(GENERATED_MARK);

    const wanted = named.size ? named.has(slug) : (!exists || (all && generated));
    if (!wanted) { kept.push(slug); continue; }
    // Never paint over a hand-drawn icon unless it was named explicitly.
    if (exists && !generated && !named.has(slug)) { kept.push(slug); continue; }

    writeFileSync(file, drawIcon(item));
    alignment[slug] = alignmentFor(shapeFor(item));
    written.push(slug);
  }

  // An ingredient that has been removed leaves an entry behind, and the test
  // fails on orphans — so the sweep happens here rather than being remembered.
  const orphans = Object.keys(alignment).filter(slug => !known.has(slug));
  for (const slug of orphans) delete alignment[slug];

  const ordered = Object.fromEntries(Object.keys(alignment).sort().map(k => [k, alignment[k]]));
  writeFileSync(alignPath, JSON.stringify(ordered, null, 2) + '\n');

  console.log(`drew ${written.length} icons, left ${kept.length} alone`);
  if (orphans.length) console.log(`  dropped ${orphans.length} stale alignment entries: ${orphans.join(' ')}`);
  if (written.length) console.log('  ' + written.join(' '));
}

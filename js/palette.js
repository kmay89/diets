/**
 * palette.js — what color a dish is, and what its surface looks like.
 *
 * A grid of identical cards is a grid nobody scans. Every one of them is the
 * same warm rectangle, so the eye has nothing to hold onto and the only way to
 * find a dish is to read every title in turn.
 *
 * The fix is not to assign each card a random color — random is noise, it
 * changes between visits, and it means nothing. The app already knows exactly
 * what is in every dish, so the color can come from there: a pot full of
 * tomatoes is red, a dal is gold, a mushroom braise is brown. Open the same
 * recipe tomorrow and it is the same color, because it is made of the same
 * things.
 *
 * Two axes, both derived:
 *
 *   color    — the ingredient group with the strongest claim on the dish,
 *              weighted by weight and by how hard each thing actually stains
 *              what it is in. The runner-up tints the far corner, so two red
 *              dishes are still told apart.
 *   texture  — a pattern from how the dish is cooked. A crosshatch is a grill
 *              mark, a stipple is browning, a ripple is a pot at a simmer.
 *
 * Everything here returns numbers for CSS custom properties rather than colors.
 * The stylesheet mixes them into the surface at a low percentage, in whichever
 * theme is running, so the tint never lands behind body text and contrast stays
 * the theme's decision rather than the tomato's.
 *
 * ERRERLabs — MIT licensed.
 */

import { gramsFor } from './nutrition.js';

let model = null;

export async function loadPalette(path = 'data/palette.json') {
  if (model) return model;
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  model = await res.json();
  return model;
}

export function getPaletteModel() { return model; }
export const colorGroups = (m = model) => m?.groups || [];
export const groupById = (id, m = model) => (m?.groups || []).find(g => g.id === id) || null;

/**
 * How strongly each color group is present in a dish.
 *
 * Grams times strength, summed per group. An ingredient with no entry anywhere
 * contributes nothing at all — most of them do not decide what a dish looks
 * like, and pretending otherwise would turn every card beige.
 */
function scores(recipe, ingIndex, m) {
  const totals = new Map();
  for (const line of recipe.ingredients || []) {
    const item = ingIndex.get(line.ing);
    if (!item) continue;
    const grams = gramsFor(item, line.qty, line.unit);
    if (grams == null) continue;
    for (const group of m.groups) {
      const strength = group.members[line.ing];
      if (!strength) continue;
      totals.set(group.id, (totals.get(group.id) || 0) + grams * strength);
    }
  }
  // A pot is described by its most vivid thing — people say "the red one",
  // never "the beige one with red in it". So a saturated group gets a thumb on
  // the scale against a pale one, which is both how a cook would name the dish
  // and what makes a grid of cards scannable.
  const bonus = m.render?.vividBonus ?? 1;
  const vividFrom = m.render?.vividFrom ?? 40;
  const weight = (id) => ((m.groups.find(g => g.id === id)?.sat ?? 0) >= vividFrom ? bonus : 1);

  return [...totals.entries()]
    .map(([id, v]) => [id, v * weight(id)])
    .sort((a, b) => b[1] - a[1]);
}

/**
 * A stable small number from a recipe id.
 *
 * Used only for the things that have no meaning to derive — which of six
 * gradient angles a card uses. Stable because a card that reshuffles its own
 * geometry between visits is a card you cannot learn.
 */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Which pattern this dish gets, from what the recipe actually does. */
export function textureFor(recipe, m = model) {
  const rules = m?.textures?.rules || [];
  const tags = new Set([...(recipe.tags || []), recipe.course]);
  const text = (recipe.steps || []).join(' ').toLowerCase();
  for (const rule of rules) {
    if ((rule.tags || []).some(t => tags.has(t))) return rule;
    if ((rule.words || []).some(w => text.includes(w))) return rule;
  }
  return rules.find(r => r.id === (m?.textures?.fallback || 'stipple')) || rules[0] || null;
}

/**
 * The whole look for one recipe: two hues, a saturation, an angle, a texture.
 *
 * Returned as plain numbers so the caller can hand them straight to CSS. The
 * second hue is the runner-up group where there is one, and a small rotation
 * off the first where there is not — a gradient between a color and itself is
 * a flat rectangle.
 */
export function recipeLook(recipe, ingIndex, m = model) {
  if (!m || !recipe) return null;

  const ranked = scores(recipe, ingIndex, m);
  // A recipe can name its own color. Almost none need to — the arithmetic is
  // right far more often than not — but a few dishes have an identity the
  // ingredient list cannot see, like a white chili or a green curry that is
  // mostly coconut milk by weight. An override is a claim the recipe makes
  // about itself, so it wins.
  const primaryId = (recipe.color && groupById(recipe.color, m) ? recipe.color : null)
    || ranked[0]?.[0]
    || m.byCuisine?.[recipe.cuisine]
    || m.byCourse?.[recipe.course]
    || m.groups[0].id;
  const primary = groupById(primaryId, m) || m.groups[0];

  const secondaryId = ranked[1]?.[0];
  const secondary = secondaryId ? groupById(secondaryId, m) : null;

  const render = m.render || {};
  const angles = render.angles || [140];
  const angle = angles[hash(recipe.id) % angles.length];

  // How lopsided the dish is toward its main color. A pot that is nothing but
  // tomatoes gets a fuller tint than one where tomato barely won, which means
  // the intensity carries information rather than being decoration.
  const total = ranked.reduce((s, [, v]) => s + v, 0);
  const share = total ? (ranked[0]?.[1] || 0) / total : 0.5;
  const sat = clamp(
    Math.round(primary.sat * (0.72 + share * 0.42)),
    render.minSat ?? 16,
    render.maxSat ?? 68
  );

  return {
    group: primary,
    hue: primary.hue,
    hue2: secondary ? secondary.hue : (primary.hue + 26) % 360,
    sat,
    sat2: secondary ? secondary.sat : Math.round(sat * 0.7),
    angle,
    share: Math.round(share * 100) / 100,
    texture: textureFor(recipe, m),
    from: ranked.slice(0, 2).map(([id]) => groupById(id, m)?.name).filter(Boolean)
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * The custom properties a card needs, ready to spread into an element's style.
 *
 * The stylesheet decides what to do with them — how much to mix in, and
 * differently in light and dark — so this file never emits a color and can
 * never break the contrast of either theme.
 */
export function lookStyle(look) {
  if (!look) return '';
  return [
    `--card-h:${look.hue}`,
    `--card-s:${look.sat}%`,
    `--card-h2:${look.hue2}`,
    `--card-s2:${look.sat2}%`,
    `--card-angle:${look.angle}deg`
  ].join(';');
}

/** The class that draws the pattern, or nothing when there is no texture. */
export const textureClass = (look) => (look?.texture ? `tex tex--${look.texture.id}` : '');

/** Everything a card element needs in one call. */
export function cardLook(recipe, ingIndex, m = model) {
  const look = recipeLook(recipe, ingIndex, m);
  if (!look) return { style: '', className: '', look: null };
  return { style: lookStyle(look), className: textureClass(look), look };
}

/**
 * tips.js — the things a recipe assumes you already know.
 *
 * How to hold a knife. Why the pan matters. What medium heat means on your
 * particular stove. Which fat to reach for. Why two ovens set to 375°F are
 * rarely both at 375°F. Whether the dishwasher or the sink uses less water.
 *
 * None of it belongs inside a recipe — a recipe that explained the pinch grip
 * every time would be unreadable, and a cook who has heard it once does not
 * need it again. So tips are matched to the recipe in front of you and offered
 * rather than inserted: the onion tip appears on recipes with an onion in them,
 * the slow-cooker tip on recipes that use one, and the whole library is
 * browsable on its own screen for anybody who wants to read it straight through.
 *
 * The matcher is deliberately narrow. A tip that fires on everything is a tip
 * nobody reads, so "always" is reserved for the handful that genuinely apply to
 * every dish, and those are shown only on the browse screen and in the shuffle.
 *
 * ERRERLabs — MIT licensed.
 */

let model = null;

export async function loadTips(path = 'data/tips.json') {
  if (model) return model;
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  model = await res.json();
  return model;
}

export function getTipModel() { return model; }
export function tipGroups(m = model) { return m?.groups || []; }
export function allTips(m = model) { return m?.tips || []; }
export const tipById = (id, m = model) => (m?.tips || []).find(t => t.id === id) || null;
export const groupById = (id, m = model) => (m?.groups || []).find(g => g.id === id) || null;

/** Tips grouped for the browse screen, empty groups dropped. */
export function tipsByGroup(m = model) {
  return (m?.groups || [])
    .map(group => ({ group, tips: (m?.tips || []).filter(t => t.group === group.id) }))
    .filter(g => g.tips.length);
}

/**
 * Whole-word matching, for the same reason the kitchen jobs use it: "reserve"
 * contains "serve" and a dutch oven contains "oven".
 */
const boundary = (word) => new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i');
const hasWord = (text, words) => (words || []).some(w => boundary(w).test(text));

/**
 * The tips this particular recipe earns, most specific first.
 *
 * Specific beats general on purpose: on a recipe with an onion and a slow
 * cooker in it, the onion tip and the slow-cooker tip are worth more than a
 * general note about medium heat, and only a few fit on the page.
 */
export function tipsFor(recipe, { limit = 4, seen = {}, m = model } = {}) {
  if (!m) return [];
  const text = [...(recipe.steps || []), ...(recipe.omnivore?.steps || [])].join(' ').toLowerCase();
  const equipment = (recipe.equipment || []).join(' ').toLowerCase();
  const tags = new Set(recipe.tags || []);
  const ingredients = new Set((recipe.ingredients || []).map(l => l.ing));

  return (m.tips || [])
    .map(tip => {
      const match = tip.match || {};
      let score = 0;
      if ((match.ingredients || []).some(i => ingredients.has(i))) score += 40;
      if ((match.equipment || []).some(e => equipment.includes(e))) score += 35;
      if ((match.tags || []).some(t => tags.has(t))) score += 25;
      if ((match.course || []).includes(recipe.course)) score += 15;
      if (hasWord(text, match.words)) score += 20;
      // The universal ones are true of every dish, which is exactly why they
      // should not push a specific one off a recipe page.
      if (match.always) score += 3;
      // Something already read this session is worth less than something new.
      if (seen[tip.id]) score -= 25;
      return { tip, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.tip);
}

/** The tips that apply to any dish — the ones worth reading once, early. */
export function foundationTips(m = model) {
  return (m?.tips || []).filter(t => t.match?.always);
}

/** A tip for a child of a given age, when one is offered. */
export function tipsForAge(ageId, m = model) {
  return (m?.tips || []).filter(t => (t.ages || []).includes(ageId));
}

/**
 * One tip, chosen so it is stable for a given day and recipe.
 *
 * Deliberately not random: a tip that changes on every re-render is noise, and
 * a card people learn to ignore. The same recipe on the same day offers the
 * same thing.
 */
export function tipOfTheDay(recipe = null, date = new Date(), m = model) {
  const pool = recipe ? tipsFor(recipe, { limit: 6, m }) : foundationTips(m);
  if (!pool.length) return null;
  const day = Math.floor(date.getTime() / 86400000);
  const salt = recipe ? [...recipe.id].reduce((n, c) => n + c.charCodeAt(0), 0) : 0;
  return pool[(day + salt) % pool.length];
}

/** Text search across titles and bodies, for the browse screen. */
export function searchTips(query, m = model) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return m?.tips || [];
  const terms = q.split(/\s+/);
  return (m?.tips || []).filter(t => {
    const hay = [t.title, t.short, t.why, ...(t.body || [])].join(' ').toLowerCase();
    return terms.every(term => hay.includes(term));
  });
}

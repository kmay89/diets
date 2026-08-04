/**
 * skills.js — the techniques a kitchen has actually picked up.
 *
 * Explicitly not achievements. The progress screen has said since it was
 * written that it is "deliberately not a scoreboard — no streaks, no points, no
 * red numbers", and bolting a trophy shelf onto that would be the app arguing
 * with itself. Nothing here is awarded, nothing expires, there is no total to
 * complete, and a kitchen that cooks six dishes forever has genuinely picked up
 * whatever those six teach.
 *
 * What it is for is naming things. Most people who can already brown an onion
 * properly have never been told what the stuck brown layer is called or that it
 * is the best-tasting thing in the pan — and a technique you can name is one you
 * can carry into a recipe that does not spell it out. That is the difference
 * between following recipes and cooking, and it is the whole stated goal.
 *
 * Everything is derived from the cook log and the recipes' own words, so it
 * works across all 242 rather than the eight somebody had time to tag. The
 * matching is deliberately conservative: crediting a technique nobody used is
 * the one failure that makes the screen worthless, because a cook who catches
 * one wrong entry stops believing any of them.
 *
 * ERRERLabs — MIT licensed.
 */

let model = null;

export async function loadSkills(url = './data/skills.json') {
  if (model) return model;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  model = await res.json();
  return model;
}

export const getSkills = () => model;
export const skillGroups = () => model?.groups || [];
export const allSkills = () => model?.skills || [];
export const skillById = (id) => allSkills().find(s => s.id === id) || null;

/* ------------------------------------------------------------------ *
 * Does this dish involve this technique?
 * ------------------------------------------------------------------ */

/**
 * Everything a recipe says, lowercased, with the ingredient list included.
 *
 * The ingredients matter as much as the steps: a dish teaches "savory depth
 * without meat" by containing miso, not by mentioning it in a sentence.
 */
export function recipeText(recipe) {
  return [
    recipe.title,
    recipe.blurb,
    ...(recipe.steps || []),
    ...(recipe.omnivore?.steps || []),
    ...(recipe.ingredients || []).map(l => `${l.ing} ${l.prep || ''}`)
  ].join(' ').toLowerCase();
}

/**
 * Whether a phrase appears as a phrase.
 *
 * Substring matching would credit "sear" to a recipe that says "research" and
 * "reduce" to one that says "reduced-sodium broth", which is precisely the kind
 * of small confident wrongness the whole screen dies of. A needle is required to
 * start and end at a word boundary; a needle that is itself several words is
 * matched whole, so "off the heat" does not fire on "the heat".
 */
export function saysIt(text, needle) {
  const escaped = String(needle).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(text);
}

/** Does this recipe plainly involve this skill? */
export function recipeShows(recipe, skill) {
  if (skill.kind === 'breadth') return false;
  const text = recipeText(recipe);
  return (skill.words || []).some(w => saysIt(text, w));
}

/** Every skill a single dish would teach. */
export function skillsIn(recipe, skills = allSkills()) {
  return skills.filter(s => s.kind !== 'breadth' && recipeShows(recipe, s));
}

/** How many recipes in the collection would teach this — used for "next". */
export function recipesShowing(skill, recipes) {
  return recipes.filter(r => recipeShows(r, skill));
}

/* ------------------------------------------------------------------ *
 * What this kitchen has done
 * ------------------------------------------------------------------ */

/**
 * The whole picture, from the cook log.
 *
 * A skill is counted once per cook, not once per recipe: making the same braise
 * four times is four goes at low and slow, because it is. Repetition is how a
 * technique actually gets learned and pretending otherwise would reward novelty,
 * which is not the same thing as skill and is in some ways its opposite.
 */
export function skillsFor(state, recipeIndex, skills = allSkills()) {
  const history = (state?.history || []).filter(e => e && recipeIndex.has(e.id));

  // Cache per recipe: a kitchen with 400 cooks of 60 dishes should test 60.
  const shownBy = new Map();
  const showsFor = (id) => {
    if (!shownBy.has(id)) {
      shownBy.set(id, new Set(skillsIn(recipeIndex.get(id), skills).map(s => s.id)));
    }
    return shownBy.get(id);
  };

  const times = new Map();
  const dishes = new Map();
  const cuisines = new Set();
  const perRecipe = new Map();

  for (const entry of history) {
    const recipe = recipeIndex.get(entry.id);
    if (recipe.cuisine) cuisines.add(recipe.cuisine);
    perRecipe.set(entry.id, (perRecipe.get(entry.id) || 0) + 1);
    for (const id of showsFor(entry.id)) {
      times.set(id, (times.get(id) || 0) + 1);
      if (!dishes.has(id)) dishes.set(id, new Set());
      dishes.get(id).add(entry.id);
    }
  }

  const breadth = {
    cuisine: cuisines.size,
    // How many groups of technique have been touched at all. A kitchen that
    // roasts and braises has a wider rack than one that has roasted twelve
    // times, and this is the number that says so.
    technique: new Set(
      [...times.keys()].map(id => skills.find(s => s.id === id)?.group).filter(Boolean)
    ).size,
    repeat: Math.max(0, ...perRecipe.values())
  };

  const scored = skills.map(skill => {
    const count = skill.kind === 'breadth'
      ? (breadth[skill.of] || 0)
      : (times.get(skill.id) || 0);
    const need = skill.at || 1;
    return {
      skill,
      count,
      need,
      dishes: dishes.get(skill.id) ? [...dishes.get(skill.id)] : [],
      have: count >= need,
      started: count > 0 && count < need
    };
  });

  return {
    all: scored,
    have: scored.filter(s => s.have),
    started: scored.filter(s => s.started),
    next: scored.filter(s => !s.have && !s.started),
    cooks: history.length,
    breadth
  };
}

/**
 * What to try next, and it has to be answerable.
 *
 * A skill nobody can practice without buying a pressure cooker is not a
 * suggestion, it is a reproach — so a skill only appears here if the collection
 * actually contains dishes that would teach it, and the count is shown so the
 * offer is checkable.
 */
export function nextSkills(picture, recipes, { limit = 3 } = {}) {
  return picture.next
    .filter(s => s.skill.kind !== 'breadth')
    .map(s => ({ ...s, recipes: recipesShowing(s.skill, recipes) }))
    .filter(s => s.recipes.length > 0)
    .sort((a, b) => b.recipes.length - a.recipes.length)
    .slice(0, limit);
}

/**
 * The one line worth saying about a kitchen's craft, or null.
 *
 * Null for a kitchen that has not cooked anything: an app telling somebody they
 * have learned nothing yet is an app being unpleasant about a blank slate.
 */
export function craftLine(picture) {
  if (!picture.cooks) return null;
  const n = picture.have.length;
  if (!n) return 'Cook a few more and the techniques behind them start showing up here.';
  const total = picture.all.length;
  return `${n} of ${total} techniques, picked up by cooking.`;
}

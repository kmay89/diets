/**
 * recipe-parse.js — turning somebody else's recipe into one this app can think about.
 *
 * The app does a lot with a recipe that a block of text cannot support: it
 * scales amounts per step in cook mode, reads the flavor balance, draws the
 * method diagram, finds substitutions, offers the protein swaps, counts the
 * plants, scores the sodium. Every one of those needs structure — ingredients
 * as `{ing, qty, unit}` pointing at the ingredient database, not as the string
 * "2 tablespoons olive oil, divided".
 *
 * So importing is not "keep the text". It is a best-effort translation into the
 * same shape the 242 built-in recipes have, with everything that could not be
 * translated handed back so a person can finish it. That second half matters
 * more than the first: a parser that quietly drops the two lines it did not
 * understand produces a recipe whose nutrition is wrong and whose shopping list
 * is short, and nothing on screen says so.
 *
 * Two ways in, and neither needs a network.
 *
 *   JSON-LD    Nearly every recipe site on the web embeds schema.org/Recipe in
 *              a <script type="application/ld+json">. Paste the page source and
 *              the ingredients, steps, times and yield come out exactly.
 *
 *   Plain text Paste what you copied off the page, or out of a note, or typed.
 *              Lines that look like ingredients are parsed as ingredients and
 *              the rest becomes steps.
 *
 * There is deliberately no fetch. The site's own content policy allows no other
 * origin, and a meal planner that has never made a network call of its own is a
 * property worth more than saving somebody a copy and paste.
 *
 * ERRERLabs — MIT licensed.
 */

/* ------------------------------------------------------------------ *
 * Amounts
 * ------------------------------------------------------------------ */

/** The units the ingredient database actually knows how to weigh. */
const UNITS = new Map([
  ['tablespoon', 'tbsp'], ['tablespoons', 'tbsp'], ['tbsp', 'tbsp'], ['tbs', 'tbsp'], ['tb', 'tbsp'],
  ['teaspoon', 'tsp'], ['teaspoons', 'tsp'], ['tsp', 'tsp'], ['ts', 'tsp'],
  ['cup', 'cup'], ['cups', 'cup'], ['c', 'cup'],
  ['ounce', 'oz'], ['ounces', 'oz'], ['oz', 'oz'],
  ['pound', 'lb'], ['pounds', 'lb'], ['lb', 'lb'], ['lbs', 'lb'],
  ['gram', 'g'], ['grams', 'g'], ['g', 'g'],
  ['clove', 'clove'], ['cloves', 'clove'],
  ['can', 'can'], ['cans', 'can'],
  ['head', 'head'], ['heads', 'head'],
  ['stalk', 'stalk'], ['stalks', 'stalk'],
  ['slice', 'slice'], ['slices', 'slice'],
  ['bunch', 'bunch'], ['bunches', 'bunch'],
  ['block', 'block'], ['blocks', 'block'],
  ['jar', 'jar'], ['jars', 'jar'],
  ['package', 'package'], ['packages', 'package'], ['pkg', 'package'],
  ['pint', 'pint'], ['pints', 'pint'],
  ['sprig', 'sprig'], ['sprigs', 'sprig'],
  ['ball', 'ball'], ['balls', 'ball']
]);

const VULGAR = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125,
  '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
};

/**
 * "1 1/2", "1½", "½", "1.5", "one" -> a number.
 *
 * Mixed numbers are the common case and the easy one to get wrong: "1 1/2 cups"
 * parsed naively is one cup, which is a third of the flour missing from a cake
 * and nothing on screen to say why it failed.
 */
export function parseAmount(text) {
  const s = String(text).trim();
  if (!s) return null;

  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
    nine: 9, ten: 10, a: 1, an: 1, half: 0.5, quarter: 0.25 };
  const asWord = words[s.toLowerCase()];
  if (asWord != null) return asWord;

  let total = 0;
  let matched = false;
  // Whole part, vulgar fraction, and "a/b" in any combination.
  const m = s.match(/^(\d+(?:\.\d+)?)?\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])?\s*(?:(\d+)\s*\/\s*(\d+))?/);
  if (m) {
    if (m[1] != null) { total += Number(m[1]); matched = true; }
    if (m[2]) { total += VULGAR[m[2]]; matched = true; }
    if (m[3] && m[4] && Number(m[4]) !== 0) { total += Number(m[3]) / Number(m[4]); matched = true; }
  }
  return matched && total > 0 ? Math.round(total * 1000) / 1000 : null;
}

/**
 * One ingredient line, pulled apart.
 *
 * A range takes its lower bound — "2-3 cloves garlic" is two cloves and a
 * suggestion, and rounding somebody's garlic up without asking is the kind of
 * quiet change that makes an import untrustworthy.
 */
export function parseIngredientLine(raw) {
  const text = String(raw).replace(/\s+/g, ' ').trim().replace(/^[-–—*•]\s*/, '');
  if (!text) return null;

  const optional = /\boptional\b/i.test(text);
  // "divided", "or to taste", parentheticals — notes, not part of the name.
  let rest = text
    .replace(/\((.*?)\)/g, ' ')
    .replace(/,?\s*\b(divided|optional|to taste|for serving|plus more[^,]*)\b/gi, '')
    .trim();

  // Amount, possibly a range. The lower bound wins.
  const amountMatch = rest.match(/^((?:\d+(?:\.\d+)?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])(?:\s*\d+\s*\/\s*\d+)?(?:\s*[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])?)\s*(?:[-–—]|\s+to\s+)\s*(?:\d+(?:\.\d+)?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])?\s*/);
  let qty = null;
  if (amountMatch) {
    qty = parseAmount(amountMatch[1]);
    rest = rest.slice(amountMatch[0].length).trim();
  } else {
    const plain = rest.match(/^((?:\d+(?:\.\d+)?\s*)?(?:\d+\s*\/\s*\d+|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])?|\d+(?:\.\d+)?)\s*/);
    if (plain && plain[1].trim()) {
      qty = parseAmount(plain[1]);
      if (qty != null) rest = rest.slice(plain[0].length).trim();
    }
  }

  // Unit, if the next word is one the database can weigh.
  let unit = null;
  const unitMatch = rest.match(/^([a-z]+)\.?\s+/i);
  if (unitMatch) {
    const found = UNITS.get(unitMatch[1].toLowerCase());
    if (found) { unit = found; rest = rest.slice(unitMatch[0].length).trim(); }
  }

  // Anything after a comma is preparation, not identity: "onion, finely diced".
  let prep = null;
  const comma = rest.indexOf(',');
  if (comma > 0) {
    prep = rest.slice(comma + 1).trim() || null;
    rest = rest.slice(0, comma).trim();
  }

  const name = rest.replace(/^of\s+/i, '').trim();
  if (!name) return null;

  return {
    raw: text,
    qty: qty ?? 1,
    // A bare count — "2 eggs", "1 onion" — is the database's "each".
    unit: unit || 'each',
    name,
    prep,
    optional,
    // True only when the line actually said a number. Everything else is the
    // parser's guess, and the builder shows guesses differently.
    sure: qty != null
  };
}

/* ------------------------------------------------------------------ *
 * Matching what was written to what the app knows
 * ------------------------------------------------------------------ */

const STOP = new Set(['fresh', 'freshly', 'large', 'small', 'medium', 'whole', 'ground',
  'chopped', 'diced', 'minced', 'sliced', 'grated', 'shredded', 'dried', 'frozen',
  'canned', 'organic', 'raw', 'ripe', 'plain', 'low', 'reduced', 'sodium', 'free',
  'extra', 'virgin', 'unsalted', 'salted', 'boneless', 'skinless', 'toasted', 'roasted']);

const words = (s) => String(s).toLowerCase().match(/[a-z]+/g) || [];

/**
 * The closest ingredient in the database, with how sure we are.
 *
 * Scored rather than matched, and the score is handed back, because the whole
 * design of the importer is that a guess is shown as a guess. "Olive oil" is
 * certain; "sauce" is not, and a line that quietly became `ing.soy` would put
 * 900 mg of sodium into somebody's dinner without ever appearing on screen.
 */
export function matchIngredient(name, items) {
  const want = words(name).filter(w => w.length > 2);
  if (!want.length) return null;
  const meaningful = want.filter(w => !STOP.has(w));
  const core = meaningful.length ? meaningful : want;

  // A line naming two things — "salt and pepper", "oil and butter" — cannot
  // become one ingredient, and the closest single match is worse than no match:
  // "Salt and pepper to taste" scored 0.39 against *Serrano pepper*, which is a
  // confident, invisible, and completely wrong answer of exactly the kind this
  // module exists to refuse. Handed to the person instead.
  if (namesTwoThings(name, items)) return null;

  let best = null;
  for (const item of items) {
    const have = words(item.name);
    const haveSet = new Set(have);
    let hits = 0;
    for (const w of core) if (haveSet.has(w)) hits++;
    if (!hits) continue;

    // How much of each side the overlap covers. Both matter: "oil" inside
    // "Extra-virgin olive oil" is one word of four, and "Extra-virgin olive
    // oil" against a line reading "oil" is four words for one.
    const coverWant = hits / core.length;
    const coverHave = hits / Math.max(1, have.filter(w => !STOP.has(w)).length || have.length);
    const score = (coverWant * 0.65) + (coverHave * 0.35);
    if (!best || score > best.score) best = { item, score: Math.round(score * 100) / 100 };
  }

  // The floor is set where a plausible-looking wrong answer stops being
  // possible rather than where the most matches survive. Anything below it goes
  // to the person, who can pick in two taps and will trust the rest of the
  // import because of it.
  return best && best.score >= 0.45 ? best : null;
}

/** Does this line name two ingredients joined by "and"? */
function namesTwoThings(name, items) {
  const halves = String(name).split(/\s+(?:and|&|\+)\s+/i).map(h => h.trim()).filter(Boolean);
  if (halves.length < 2) return false;
  // Both halves have to look like ingredients on their own. "Black beans and
  // corn" is two; "sweet and sour sauce" and "salt and pepper seasoning" are
  // one thing whose name happens to contain the word.
  const named = halves.filter(half => {
    const w = words(half).filter(x => x.length > 2 && !STOP.has(x));
    if (!w.length) return false;
    return items.some(item => {
      const have = new Set(words(item.name));
      return w.some(x => have.has(x));
    });
  });
  return named.length >= 2;
}

/* ------------------------------------------------------------------ *
 * Getting a recipe out of what was pasted
 * ------------------------------------------------------------------ */

/**
 * schema.org/Recipe, out of a pasted page source.
 *
 * Nearly every recipe site embeds one, which makes it by far the most accurate
 * route: the amounts, the steps, the yield and the times come out as the site
 * itself recorded them rather than as something guessed from prose.
 */
export function fromJsonLd(source) {
  const blocks = [...String(source).matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )].map(m => m[1]);

  for (const block of blocks) {
    let parsed;
    try { parsed = JSON.parse(block); } catch { continue; }
    const recipe = findRecipe(parsed);
    if (recipe) return recipe;
  }
  return null;
}

/** schema.org nests recipes inside @graph, arrays and single objects alike. */
function findRecipe(node, depth = 0) {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findRecipe(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;

  const type = node['@type'];
  const isRecipe = type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
  if (isRecipe) return node;

  for (const key of ['@graph', 'mainEntity', 'itemListElement']) {
    const found = findRecipe(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

/** "PT1H30M" -> 90 minutes. Anything unparseable is nothing, not a guess. */
export function parseDuration(iso) {
  const m = String(iso || '').match(/^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return 0;
  return (Number(m[1] || 0) * 60) + Number(m[2] || 0);
}

const asLines = (value) => {
  if (!value) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    return value.flatMap(v => {
      if (typeof v === 'string') return [v];
      if (v && typeof v === 'object') {
        if (v.text) return [v.text];
        if (v.itemListElement) return asLines(v.itemListElement);
        if (v.name) return [v.name];
      }
      return [];
    });
  }
  if (typeof value === 'object' && value.itemListElement) return asLines(value.itemListElement);
  return [];
};

/**
 * Plain text: whatever somebody pasted.
 *
 * Ingredients are the lines that start with a number or a fraction, which is
 * how a recipe is written everywhere. Everything long enough to be a sentence
 * becomes a step. A blank line between the two blocks is respected when it is
 * there, because that is the usual shape and the heuristic does better with it.
 */
export function fromText(text) {
  // Past this many characters a line is prose, not a shopping item. The longest
  // ingredient line in the built-in collection is well under it.
  const SENTENCE = 60;

  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const looksLikeHeading = (l) =>
    /^(ingredients?|for the .*|method|instructions?|directions?|steps?|you will need)\s*:?$/i.test(l);

  const title = looksLikeHeading(lines[0]) ? null : lines[0];
  const body = title ? lines.slice(1) : lines;

  const ingredients = [];
  const steps = [];
  let inSteps = false;

  for (const line of body) {
    if (looksLikeHeading(line)) {
      inSteps = /method|instruction|direction|step/i.test(line);
      continue;
    }
    if (inSteps) { steps.push(line.replace(/^\d+[.)]\s*/, '')); continue; }

    // A numbered instruction — "1. Heat the oil until it shimmers" — is a step
    // wearing a number, and it is the length that gives it away.
    const numberedStep = /^\d+[.)]\s+\S/.test(line) && line.length > 40;

    // Everything short before the steps begin is an ingredient, whether or not
    // it starts with a number. Plenty do not: "Salt and pepper to taste",
    // "Olive oil", "Zest of one lemon".
    //
    // An earlier version required a leading digit here and had no home for the
    // rest, so those lines were dropped on the floor — the exact failure this
    // module is written to refuse, since a lost line shows up later as wrong
    // nutrition and a short shopping list with nothing on screen to explain it.
    // Sweeping the odd stray line in is the cheaper mistake by a mile: it
    // appears in the list of things to finish, and deleting it takes a tap.
    if (numberedStep || line.length > SENTENCE) steps.push(line.replace(/^\d+[.)]\s*/, ''));
    else ingredients.push(line);
  }

  if (!ingredients.length && !steps.length) return null;
  return { title, ingredients, steps };
}

/**
 * Whatever was pasted, in the app's shape, with everything uncertain marked.
 *
 * `needsYou` is the point of the whole module. A parser that silently drops what
 * it could not read produces a recipe with wrong nutrition and a short shopping
 * list and no sign on screen that anything is missing; one that hands the
 * leftovers back produces ten seconds of work and a recipe that is actually
 * right.
 */
export function parseRecipe(input, items = []) {
  const source = String(input || '').trim();
  if (!source) return null;

  const ld = source.includes('application/ld+json') ? fromJsonLd(source) : null;
  const rough = ld
    ? {
        title: typeof ld.name === 'string' ? ld.name : null,
        blurb: typeof ld.description === 'string' ? ld.description : '',
        ingredients: asLines(ld.recipeIngredient),
        steps: asLines(ld.recipeInstructions),
        servings: Number(String(ld.recipeYield ?? '').match(/\d+/)?.[0]) || null,
        activeMin: parseDuration(ld.prepTime) || null,
        totalMin: parseDuration(ld.totalTime) || parseDuration(ld.cookTime) || null
      }
    : (() => {
        const t = fromText(source);
        return t && { ...t, blurb: '', servings: null, activeMin: null, totalMin: null };
      })();

  if (!rough) return null;

  const lines = [];
  const needsYou = [];
  for (const raw of rough.ingredients) {
    const parsed = parseIngredientLine(raw);
    if (!parsed) continue;
    const match = matchIngredient(parsed.name, items);
    if (match) {
      lines.push({ ...parsed, ing: match.item.id, item: match.item, confidence: match.score });
    } else {
      needsYou.push(parsed);
    }
  }

  return {
    from: ld ? 'page' : 'text',
    title: rough.title || 'Untitled',
    blurb: rough.blurb || '',
    servings: rough.servings || 4,
    activeMin: rough.activeMin || null,
    totalMin: rough.totalMin || null,
    steps: rough.steps,
    lines,
    // Every ingredient line that did not land on something the app knows. Shown,
    // never dropped.
    needsYou
  };
}

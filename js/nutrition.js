/**
 * nutrition.js — portion math, nutrient roll-up, and the heart-forward scoring heuristic.
 *
 * Pure ES module with no DOM access, so the build scripts in tools/ and the app in the
 * browser use exactly the same math. Nothing here is medical advice; see docs/DATA-SOURCES.md
 * and PRIVACY.md for what the numbers are and are not.
 *
 * ERRERLabs — MIT licensed.
 */

/** Order of the compact per-100g arrays in data/ingredients.json. */
export const NUTRIENT_KEYS = [
  'kcal', 'protein_g', 'fat_g', 'satfat_g', 'carb_g', 'fiber_g',
  'sugar_g', 'sodium_mg', 'potassium_mg', 'cholesterol_mg', 'calcium_mg', 'iron_mg'
];

export const NUTRIENT_LABELS = {
  kcal: 'Calories', protein_g: 'Protein', fat_g: 'Total fat', satfat_g: 'Saturated fat',
  carb_g: 'Carbs', fiber_g: 'Fiber', sugar_g: 'Sugars', sodium_mg: 'Sodium',
  potassium_mg: 'Potassium', cholesterol_mg: 'Cholesterol', calcium_mg: 'Calcium', iron_mg: 'Iron'
};

export const NUTRIENT_UNITS = {
  kcal: '', protein_g: 'g', fat_g: 'g', satfat_g: 'g', carb_g: 'g', fiber_g: 'g',
  sugar_g: 'g', sodium_mg: 'mg', potassium_mg: 'mg', cholesterol_mg: 'mg', calcium_mg: 'mg', iron_mg: 'mg'
};

export function emptyNutrients() {
  const n = {};
  for (const k of NUTRIENT_KEYS) n[k] = 0;
  return n;
}

/** Expand a compact per-100g array into a keyed object. */
export function expandPer100g(arr) {
  const n = {};
  NUTRIENT_KEYS.forEach((k, i) => { n[k] = arr[i] ?? 0; });
  return n;
}

/** Grams of `item` for `qty` of `unit`. Returns null when the unit is unknown. */
export function gramsFor(item, qty, unit) {
  if (!item || !item.units) return null;
  const per = item.units[unit];
  if (per == null) return null;
  return qty * per;
}

export function addNutrients(target, source, factor = 1) {
  for (const k of NUTRIENT_KEYS) target[k] += (source[k] || 0) * factor;
  return target;
}

/**
 * Total nutrients for a list of recipe ingredient lines.
 * `index` is a Map of ingredient id -> ingredient record.
 * Optional lines are included unless includeOptional is false.
 */
export function lineNutrients(lines, index, { includeOptional = true } = {}) {
  const total = emptyNutrients();
  const missing = [];
  for (const line of lines || []) {
    if (line.optional && !includeOptional) continue;
    const item = index.get(line.ing);
    if (!item) { missing.push(line.ing); continue; }
    const grams = gramsFor(item, line.qty, line.unit);
    if (grams == null) { missing.push(`${line.ing}:${line.unit}`); continue; }
    addNutrients(total, expandPer100g(item.per100g), grams / 100);
  }
  return { total, missing };
}

/** Per-serving nutrients for a recipe, optionally including its omnivore add-on. */
export function recipeNutrition(recipe, index, { withOmnivore = false, servings = null, includeOptional = true } = {}) {
  const lines = [...(recipe.ingredients || [])];
  if (withOmnivore && recipe.omnivore?.add) lines.push(...recipe.omnivore.add);
  const { total, missing } = lineNutrients(lines, index, { includeOptional });
  const n = servings || recipe.servings || 1;
  const per = emptyNutrients();
  for (const k of NUTRIENT_KEYS) per[k] = total[k] / n;
  return { total, perServing: per, servings: n, missing };
}

/* ------------------------------------------------------------------ *
 * Heart-forward score
 * ------------------------------------------------------------------ */

/**
 * A transparent 0-100 heuristic for how well one serving fits the pattern
 * cardiology dietary guidance points at: low sodium, low saturated fat,
 * high fiber, high potassium relative to sodium, low dietary cholesterol.
 *
 * It is a sorting aid for a recipe list, not a clinical measure. The
 * component penalties are returned so the UI can show its work.
 */
export const SCORED_COURSES = new Set(['breakfast', 'lunch', 'dinner']);

export function heartScore(perServing, { course = 'dinner' } = {}) {
  const kcal = Math.max(perServing.kcal, 1);
  const satPct = (perServing.satfat_g * 9) / kcal * 100;
  const fiberPer1000 = (perServing.fiber_g / kcal) * 1000;
  const kRatio = perServing.sodium_mg > 0 ? perServing.potassium_mg / perServing.sodium_mg : 4;

  // A side, sauce or snack is not a meal, and grading it against a meal's
  // budget is misleading — a good olive oil vinaigrette would fail. Those get
  // density flags in the UI instead of a letter.
  if (!SCORED_COURSES.has(course)) {
    return { score: null, grade: null, contextual: true, satPct, fiberPer1000, kRatio, parts: {} };
  }

  // Sodium and cholesterol allowances scale with the size of the serving: 500 mg
  // of sodium is about a third of the AHA's 1,500 mg ideal day and belongs to a
  // ~600 kcal plate, and 150 mg of cholesterol is roughly one egg. A 300 kcal
  // breakfast gets a proportionally smaller budget, not the same one.
  // Cholesterol is not scaled: one egg is one egg whatever size the plate is.
  const scale = clamp(kcal / 600, 0.6, 1.6);
  const parts = {
    sodium: -clamp((perServing.sodium_mg - 500 * scale) / 12, 0, 30),
    satfat: -clamp((satPct - 6) * 2.5, 0, 25),
    cholesterol: -clamp((perServing.cholesterol_mg - 150) / 12, 0, 12),
    fiber: clamp((fiberPer1000 - 14) * 1.0, -15, 15),
    potassium: clamp((kRatio - 1) * 5, -10, 12)
  };

  let score = 70;
  for (const v of Object.values(parts)) score += v;
  score = Math.round(clamp(score, 0, 100));
  return { score, grade: gradeFor(score), contextual: false, parts, satPct, fiberPer1000, kRatio };
}

export function gradeFor(score) {
  if (score >= 85) return 'A';
  if (score >= 72) return 'B';
  if (score >= 58) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

/** Short, plain-language flags for a serving. */
export function heartFlags(perServing) {
  const flags = [];
  const kcal = Math.max(perServing.kcal, 1);
  const satPct = (perServing.satfat_g * 9) / kcal * 100;
  if (perServing.sodium_mg <= 400) flags.push({ kind: 'good', text: 'Low sodium for a meal' });
  else if (perServing.sodium_mg >= 800) flags.push({ kind: 'watch', text: 'Higher sodium — balance the rest of the day' });
  if (satPct <= 6) flags.push({ kind: 'good', text: 'Saturated fat under 6% of calories' });
  else if (satPct >= 12) flags.push({ kind: 'watch', text: 'Saturated fat is high here' });
  if (perServing.fiber_g >= 8) flags.push({ kind: 'good', text: `${Math.round(perServing.fiber_g)} g fiber` });
  if (perServing.potassium_mg >= 700) flags.push({ kind: 'good', text: 'Good potassium' });
  if (perServing.cholesterol_mg >= 150) flags.push({ kind: 'watch', text: 'Higher cholesterol' });
  return flags;
}

/**
 * Which ingredients are driving a nutrient — so a low score is actionable
 * ("the sodium is the bread and the feta") rather than a mystery.
 */
export function topContributors(lines, index, key, limit = 3) {
  const rows = [];
  let total = 0;
  for (const line of lines || []) {
    const item = index.get(line.ing);
    if (!item) continue;
    const grams = gramsFor(item, line.qty, line.unit);
    if (grams == null) continue;
    const amount = expandPer100g(item.per100g)[key] * grams / 100;
    if (amount <= 0) continue;
    total += amount;
    rows.push({ id: item.id, name: item.name, amount });
  }
  rows.sort((a, b) => b.amount - a.amount);
  return rows.slice(0, limit).map(r => ({ ...r, amount: Math.round(r.amount), pct: total ? Math.round(r.amount / total * 100) : 0 }));
}

/* ------------------------------------------------------------------ *
 * Energy needs and portions
 * ------------------------------------------------------------------ */

export const ACTIVITY = {
  sedentary: { factor: 1.2, label: 'Sedentary — desk work, little exercise' },
  light: { factor: 1.375, label: 'Lightly active — walks, 1-3 workouts a week' },
  moderate: { factor: 1.55, label: 'Moderately active — 3-5 workouts a week' },
  active: { factor: 1.725, label: 'Very active — hard exercise 6-7 days' },
  athlete: { factor: 1.9, label: 'Athlete — training twice a day or physical job' }
};

/**
 * Children's estimated daily calories, from the Dietary Guidelines for Americans
 * 2020-2025 reference tables (Appendix 2). Adult needs use Mifflin-St Jeor instead,
 * because we have height and weight for adults and rarely for kids.
 * Columns are [sedentary, moderate, active].
 */
const CHILD_KCAL = {
  female: [
    { maxAge: 3, kcal: [1000, 1200, 1400] },
    { maxAge: 8, kcal: [1200, 1500, 1800] },
    { maxAge: 13, kcal: [1400, 1800, 2200] },
    { maxAge: 18, kcal: [1800, 2000, 2400] }
  ],
  male: [
    { maxAge: 3, kcal: [1000, 1200, 1400] },
    { maxAge: 8, kcal: [1400, 1600, 2000] },
    { maxAge: 13, kcal: [1800, 2000, 2600] },
    { maxAge: 18, kcal: [2200, 2600, 3200] }
  ]
};

function childKcal(sex, age, activity) {
  const table = CHILD_KCAL[sex === 'male' ? 'male' : 'female'];
  const row = table.find(r => age <= r.maxAge) || table[table.length - 1];
  const col = activity === 'sedentary' ? 0 : (activity === 'active' || activity === 'athlete') ? 2 : 1;
  return row.kcal[col];
}

/**
 * Estimated daily energy for a household member.
 * member: { name, sex, age, heightCm, weightKg, activity, goal }
 * goal: 'maintain' | 'lose' | 'gain'
 */
export function energyNeeds(member) {
  const activity = member.activity || 'moderate';
  let bmr = null;
  let tdee;
  let method;

  if (member.age != null && member.age < 18) {
    tdee = childKcal(member.sex, member.age, activity);
    method = 'DGA reference (child)';
  } else if (member.heightCm && member.weightKg && member.age != null) {
    const s = member.sex === 'male' ? 5 : -161;
    bmr = 10 * member.weightKg + 6.25 * member.heightCm - 5 * member.age + s;
    tdee = bmr * (ACTIVITY[activity]?.factor || 1.55);
    method = 'Mifflin-St Jeor';
  } else {
    tdee = member.sex === 'male' ? 2400 : 1900;
    method = 'population average';
  }

  let target = tdee;
  if (member.goal === 'lose') target = tdee - 500;
  if (member.goal === 'gain') target = tdee + 300;
  // Never recommend below widely used clinical floors.
  const floor = member.age != null && member.age < 18 ? tdee * 0.9 : (member.sex === 'male' ? 1500 : 1200);
  target = Math.max(target, floor);

  return { bmr: bmr ? Math.round(bmr) : null, tdee: Math.round(tdee), target: Math.round(target), method };
}

/** How a day's calories tend to split across eating occasions. */
export const MEAL_SHARE = { breakfast: 0.25, lunch: 0.3, dinner: 0.35, snack: 0.1, side: 0.12, component: 0.05 };

/**
 * Serving equivalents: how many "standard servings" of a given course each
 * member eats, relative to a 650 kcal reference dinner plate. This is what
 * turns "a recipe serves 4" into "cook 3.4 servings for this actual family".
 */
export function servingEquivalents(members, course = 'dinner') {
  const share = MEAL_SHARE[course] ?? MEAL_SHARE.dinner;
  const referenceKcal = 2000 * MEAL_SHARE.dinner; // 700 kcal reference plate
  const per = members.map(m => {
    if (m.eats === false) return { id: m.id, name: m.name, equiv: 0 };
    const { target } = energyNeeds(m);
    const equiv = (target * share) / (referenceKcal * (share / MEAL_SHARE.dinner));
    return { id: m.id, name: m.name, equiv: round1(clamp(equiv, 0.3, 2.2)) };
  });
  const total = per.reduce((a, b) => a + b.equiv, 0);
  return { per, total: round1(total) };
}

/**
 * Daily nutrient targets for one member. heartMode applies the tighter
 * AHA figures used for people managing cardiovascular disease.
 */
export function dailyTargets(member, { heartMode = true } = {}) {
  const { target: kcal } = energyNeeds(member);
  const age = member.age ?? 40;

  let sodium;
  if (age <= 8) sodium = 1500;
  else if (age <= 13) sodium = 1800;
  else sodium = heartMode ? 1500 : 2300;

  return {
    kcal,
    protein_g: Math.round((member.weightKg ? member.weightKg * 0.9 : kcal * 0.18 / 4)),
    fiber_g: Math.round((kcal / 1000) * 14),
    sodium_mg: sodium,
    sodiumUpper_mg: age <= 13 ? sodium : 2300,
    satfat_g: Math.round((kcal * (heartMode ? 0.06 : 0.1)) / 9),
    sugar_g: member.sex === 'male' ? 36 : 25,
    potassium_mg: age < 14 ? 2300 : (member.sex === 'male' ? 3400 : 2600),
    cholesterol_mg: heartMode ? 200 : 300,
    calcium_mg: age < 19 ? 1300 : 1000,
    iron_mg: member.sex === 'female' && age >= 19 && age <= 50 ? 18 : 8
  };
}

/** Household-level daily targets — the sum across everyone who eats. */
export function householdTargets(members, opts) {
  const out = {};
  const eaters = members.filter(m => m.eats !== false);
  for (const m of eaters) {
    const t = dailyTargets(m, opts);
    for (const [k, v] of Object.entries(t)) out[k] = (out[k] || 0) + v;
  }
  return out;
}


/**
 * Rough body figures used only when someone taps "use typical values" — a
 * starting point for sizing a pot of food, not a health assessment and not a
 * target. These are round approximations of US adult averages, deliberately
 * unfussy: the activity level moves the estimate far more than either of them.
 */
export function typicalBody(sex = 'female', age = null) {
  const adult = age == null || age >= 18;
  if (!adult) {
    // Children vary far too much by age for a single figure to mean anything,
    // so we only offer an age and let the DGA reference tables do the rest.
    return { age: age ?? 10, heightCm: null, weightKg: null };
  }
  return sex === 'male'
    ? { age: age ?? 40, heightCm: 175, weightKg: 89 }
    : { age: age ?? 40, heightCm: 162, weightKg: 77 };
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

export function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
export function round1(v) { return Math.round(v * 10) / 10; }

const VOLUME_UNITS = new Set(['cup', 'tbsp', 'tsp', 'tbsp_juice', 'tsp_zest']);
const COUNT_UNITS = new Set(['each', 'clove', 'can', 'block', 'bunch', 'head', 'stalk', 'slice', 'pint',
  'jar', 'link', 'fillet', 'ear', 'sprig', 'ball', 'box', 'carton', 'square', 'inch']);

/** Round a scaled quantity to something a cook can actually measure. */
export function roundQty(qty, unit) {
  if (unit === 'g' || unit === 'ml') return Math.max(1, Math.round(qty / 5) * 5);
  if (unit === 'lb') return Math.max(0.25, Math.round(qty * 4) / 4);
  if (unit === 'oz') return Math.max(0.5, Math.round(qty * 2) / 2);
  if (VOLUME_UNITS.has(unit)) {
    const step = qty < 1 ? 8 : 4;                 // eighths under a cup, quarters above
    return Math.max(1 / 8, Math.round(qty * step) / step);
  }
  if (COUNT_UNITS.has(unit)) return Math.max(0.25, Math.round(qty * 4) / 4);
  return Math.round(qty * 100) / 100;
}

const FRACTIONS = [[0.125, '⅛'], [0.25, '¼'], [0.333, '⅓'], [0.375, '⅜'], [0.5, '½'], [0.625, '⅝'], [0.666, '⅔'], [0.75, '¾'], [0.875, '⅞']];

/** Pretty-print a quantity the way a recipe would write it. */
export function formatQty(qty, unit, { round = true } = {}) {
  const q = round ? roundQty(qty, unit) : qty;
  if (unit === 'g' || unit === 'ml') return `${Math.round(q)} ${unit}`;

  let whole = Math.floor(q + 1e-9);
  const frac = q - whole;

  let fracStr = '';
  if (frac > 0.06) {
    let best = FRACTIONS[0];
    let bestDiff = Infinity;
    for (const f of FRACTIONS) {
      const d = Math.abs(f[0] - frac);
      if (d < bestDiff) { bestDiff = d; best = f; }
    }
    // Anything closer to a whole number than to the nearest fraction carries up.
    if (1 - frac < bestDiff) whole += 1;
    else fracStr = best[1];
  }

  const num = whole > 0
    ? `${whole}${fracStr ? ' ' + fracStr : ''}`
    : (fracStr || String(round1(q)));
  return `${num} ${pluralUnit(unit, q)}`.trim();
}

export function pluralUnit(unit, qty) {
  const map = {
    each: '', clove: 'clove', cup: 'cup', tbsp: 'tbsp', tsp: 'tsp', oz: 'oz', lb: 'lb',
    can: 'can', block: 'block', bunch: 'bunch', head: 'head', stalk: 'stalk', slice: 'slice',
    pint: 'pint', jar: 'jar', link: 'link', fillet: 'fillet', ear: 'ear', sprig: 'sprig',
    ball: 'ball', box: 'box', carton: 'carton', g: 'g', tbsp_juice: 'tbsp juice', tsp_zest: 'tsp zest',
    inch: 'inch', square: 'square'
  };
  const base = map[unit] ?? unit;
  if (!base) return '';
  const plural = ['cup', 'clove', 'can', 'block', 'bunch', 'head', 'stalk', 'slice', 'pint', 'jar', 'link', 'fillet', 'ear', 'sprig', 'ball', 'box', 'carton', 'inch', 'square'];
  return qty > 1 && plural.includes(base) ? `${base}s` : base;
}

/**
 * kitchen.js — who else can help, and what this recipe asks of you.
 *
 * Both are read off the recipe's own steps rather than authored per dish. That
 * is the only version that works: annotating 242 recipes by hand produces eight
 * good annotations and a stale file, while matching the text produces something
 * that is right most of the time on all of them and says so when it is not.
 *
 * The safety model is per step, not per recipe. A recipe with one step that
 * involves boiling water is not off limits to a five-year-old — that one step
 * is. Splitting it that way is what turns "children can help with this dish"
 * from a slogan into a list of things a specific child can actually do.
 *
 * A note on the words. Nothing here calls a recipe easy or a person a beginner.
 * Recipes are sorted by what they ask for, not by how good the cook is, and a
 * dish that asks for less is not a lesser dish — it is a Tuesday. The vocabulary
 * lives in the data file so it can be argued with.
 *
 * ERRERLabs — MIT licensed.
 */

let model = null;

export async function loadKitchen(path = 'data/kitchen.json') {
  if (model) return model;
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  model = await res.json();
  return model;
}

export function getKitchenModel() { return model; }
export function ageBands(m = model) { return m?.ages || []; }
export function kitchenWording(m = model) { return m?.wording || null; }

/* ------------------------------------------------------------------ *
 * Jobs for whoever else is in the kitchen
 * ------------------------------------------------------------------ */

/**
 * Whole-word matching, because substrings lie.
 *
 * "Reserve a cup of pasta water" contains "serve", and a dutch oven contains
 * "oven". Both of those quietly handed a child the wrong job, which is a small
 * bug in a job list and a real one in a safety label.
 */
const boundary = (word) => new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i');
const has = (text, words) => (words || []).some(w => boundary(w).test(text));

/** Some jobs are better described by a shape than by a word list. */
const matchesJob = (text, job) =>
  (job.regex ? new RegExp(job.regex, 'i').test(text) : false) || has(text, job.words);

/**
 * Every step of a recipe, labeled with who can do it.
 *
 * A step that trips a hazard word belongs to an adult or to an older child
 * being taught. Everything else is offered to whichever ages have a job that
 * matches what the step actually says.
 */
export function stepsByHand(recipe, m = model) {
  if (!m) return [];
  const hazardWords = m.hazards?.words || [];
  return (recipe.steps || []).map((text, i) => {
    const lower = text.toLowerCase();
    const risky = has(lower, hazardWords);
    const jobs = (m.jobs || []).filter(j => !j.always && matchesJob(lower, j));
    const ages = new Set();
    for (const job of jobs) for (const a of job.ages) ages.add(a);
    // A step with heat or a blade in it is not handed to the youngest bands
    // just because it also contains a word like "stir".
    if (risky) for (const a of ['age.toddler', 'age.small', 'age.middle']) ages.delete(a);
    return { index: i, text, jobs, ages: [...ages], risky };
  });
}

/**
 * The jobs in this recipe, grouped by who can do them.
 *
 * Returned per age band with the step numbers attached, so the panel can say
 * "step 3 and step 6" rather than leaving somebody to find them.
 */
export function jobsFor(recipe, m = model) {
  if (!m) return [];
  const steps = stepsByHand(recipe, m);
  const always = (m.jobs || []).filter(j => j.always);

  return (m.ages || []).map(age => {
    const found = new Map();
    for (const step of steps) {
      if (step.risky && ['age.toddler', 'age.small', 'age.middle'].includes(age.id)) continue;
      for (const job of step.jobs) {
        if (!job.ages.includes(age.id)) continue;
        if (!found.has(job.id)) found.set(job.id, { ...job, steps: [] });
        found.get(job.id).steps.push(step.index + 1);
      }
    }
    for (const job of always) {
      if (job.ages.includes(age.id)) found.set(job.id, { ...job, steps: [] });
    }
    return { age, jobs: [...found.values()] };
  }).filter(band => band.jobs.length);
}

/**
 * The same jobs, turned ninety degrees.
 *
 * `jobsFor` is age-major, which is the shape a form wants and the wrong shape
 * for a reader. It produces one card per age band, and since a job like setting
 * the table suits every age from two to eighteen, that job is printed five
 * times. A recipe with three matching jobs came out as five headed cards and
 * eleven chips, and a parent looking for what their own six-year-old could do
 * had to read all of it and hold the answer in their head.
 *
 * Job-major is one row per job, and because every job's age range turns out to
 * be contiguous — checked across all eighteen — a row is a bar with a start and
 * an end. Three jobs is three rows.
 *
 * The bands are all of them, always, even the ones this recipe has nothing for.
 * A chart whose axis changes between recipes cannot be compared with the one
 * before it, and the empty columns are information: they say plainly that there
 * is nothing here for a toddler.
 *
 * @returns {{bands:Array, rows:Array}|null} each row carrying, per band, whether
 *   the job is offered and whether it is offered for all of its steps or only
 *   the ones without heat or a blade in them.
 */
export function jobsChart(recipe, m = model) {
  const byAge = jobsFor(recipe, m);
  if (!byAge.length) return null;

  const bands = m.ages || [];
  const rows = new Map();

  for (const { age, jobs } of byAge) {
    for (const job of jobs) {
      if (!rows.has(job.id)) rows.set(job.id, { job, byBand: new Map(), steps: new Set() });
      const row = rows.get(job.id);
      row.byBand.set(age.id, job.steps);
      for (const s of job.steps) row.steps.add(s);
    }
  }

  const built = [...rows.values()].map(({ job, byBand, steps }) => {
    const all = [...steps].sort((a, b) => a - b);
    const cells = bands.map(band => {
      const mine = byBand.get(band.id);
      if (!mine) return { on: false, partial: false, steps: [] };
      // Fewer steps than the job has in this recipe means the rest of them trip
      // a hazard word at this age. Drawn differently rather than the same,
      // because "your five-year-old can do this, but not the part over the
      // flame" is the whole reason the model is per step instead of per recipe.
      return { on: true, partial: all.length > 0 && mine.length < all.length, steps: mine };
    });
    const first = cells.findIndex(c => c.on);
    return {
      job,
      cells,
      steps: all,
      anyTime: all.length === 0,
      from: first,
      to: cells.length - 1 - [...cells].reverse().findIndex(c => c.on)
    };
  });

  // Youngest first, so the chart reads as a staircase rather than a scatter —
  // and so the row a parent of a small child needs is at the top.
  built.sort((a, b) => a.from - b.from || b.to - a.to || a.job.name.localeCompare(b.job.name));

  return { bands, rows: built };
}

/**
 * Which band each child in the house falls into.
 *
 * The point of the chart is answering "what can *mine* do", and the app already
 * knows their ages. Without this it is a general-purpose reference table; with
 * it, it is about the people in the room.
 */
export function bandsOfHousehold(members = [], m = model) {
  const bands = m?.ages || [];
  const found = new Map();
  for (const person of members) {
    const age = Number(person?.age);
    if (!Number.isFinite(age) || age < 2 || age >= 18) continue;
    const band = bands.find(b => age >= b.from && age <= b.to);
    if (!band) continue;
    if (!found.has(band.id)) found.set(band.id, []);
    found.get(band.id).push(person.name || 'them');
  }
  return found;
}

/** The steps that belong to a grown-up, with the reason stated once. */
export function grownUpSteps(recipe, m = model) {
  const steps = stepsByHand(recipe, m).filter(s => s.risky);
  return { steps, say: m?.hazards?.say || '' };
}

/* ------------------------------------------------------------------ *
 * What the recipe asks for
 * ------------------------------------------------------------------ */

/**
 * Which rung of the ladder a recipe sits on.
 *
 * Measured from the recipe rather than declared: active time, how many steps,
 * how many things to buy. A dish is on the lowest rung whose limits it fits
 * inside, and the top rung has no limits because that is what it means.
 */
export function asksFor(recipe, m = model) {
  if (!m?.ladder) return null;
  const counts = {
    activeMin: recipe.activeMin || 0,
    steps: (recipe.steps || []).length,
    ingredients: (recipe.ingredients || []).length
  };
  for (const rung of m.ladder) {
    if (!rung.max) return { ...rung, counts };
    if (Object.entries(rung.max).every(([k, v]) => counts[k] <= v)) return { ...rung, counts };
  }
  return { ...m.ladder[m.ladder.length - 1], counts };
}

/** Is this one of the short, forgiving ones? Used by the browse filter. */
export function isShortAndForgiving(recipe, m = model) {
  return asksFor(recipe, m)?.id === 'ask.short';
}

/* ------------------------------------------------------------------ *
 * The technique a recipe quietly teaches
 * ------------------------------------------------------------------ */

/**
 * The lessons hiding in a recipe's own method.
 *
 * Nobody learns to cook by reading a chapter on emulsification. They learn it
 * by being told, while holding a ladle of pasta water, what the pasta water is
 * for. So the lesson is attached to the recipe that happens to contain it, and
 * a cook who works through eighty of these has eighty techniques.
 */
export function teachesIn(recipe, m = model) {
  const text = [...(recipe.steps || []), ...(recipe.omnivore?.steps || [])].join(' ').toLowerCase();
  return (m?.teaches?.lessons || []).filter(l => has(text, l.words));
}

/** The single most useful thing this recipe teaches, for a one-line badge. */
export function headlineLesson(recipe, m = model) {
  return teachesIn(recipe, m)[0] || null;
}

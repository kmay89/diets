/**
 * recipe-table.js — a recipe as a diagram of what meets what, and when.
 *
 * The format is old and it is better than the one everybody uses: ingredients
 * down the left, and cells to the right that bracket them together under the
 * thing you do — melt, mix, fold in, bake — each bracket swallowing the ones
 * before it until the whole recipe has merged into a single last operation.
 *
 * What it shows that a numbered list cannot is structure. You can see at a
 * glance that the dry ingredients never meet the wet ones until step four, that
 * the pasta is cooking in parallel rather than after, and how many separate
 * things are in flight at once. A list has that information too — buried in
 * prose, one sentence at a time, findable only by reading all of it.
 *
 * Nothing here is authored. The table is derived from the recipe's own steps by
 * asking which ingredients each one names, which means it works on all 242
 * rather than the eight somebody had time to annotate. The cost is that it is a
 * guess, so it is measured: a recipe whose ingredients cannot be traced to its
 * steps with enough confidence does not get a table at all, and the method it
 * already had is the one you read.
 *
 * ERRERLabs — MIT licensed.
 */

/**
 * Words too common to identify an ingredient by. "Fresh" matches nine things
 * and "sauce" matches a dozen, so a step saying "stir in the sauce" would drag
 * half the pantry into whichever operation it belongs to.
 */
const TOO_GENERIC = new Set([
  'fresh', 'ground', 'large', 'small', 'whole', 'plain', 'dried', 'frozen',
  'canned', 'sauce', 'powder', 'extra', 'virgin', 'sodium', 'added', 'unsalted',
  'nonfat', 'light', 'sliced', 'chopped', 'style', 'mixed', 'baby', 'wheat',
  'free', 'part', 'skim', 'juice', 'leaves', 'seeds', 'grain', 'seasoning',
  // How a thing was cut, not what it is. "Crushed fennel seed" was pulling in
  // "Crushed tomatoes" — the word describes the knife work, and the same knife
  // work happens to half the pantry. Where a preparation is genuinely part of an
  // identity the recipes carry it in the line's own `prep`, not in the name.
  'crushed', 'minced', 'grated', 'shredded', 'drained', 'rinsed', 'halved',
  'quartered', 'cubed', 'torn'
]);

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
 * Which of a recipe's ingredients a given step actually names.
 *
 * The same reading the diagram does, exposed on its own so the wordless version
 * of a step can draw the right pictures. Order follows the ingredient list
 * rather than the sentence, so "oil, onion, garlic" comes out in the order they
 * are stacked on the counter rather than the order the prose happened to use.
 */
export function ingredientsIn(stepText, recipe, ingIndex) {
  const haystack = ` ${String(stepText).toLowerCase()} `;

  // A key belonging to two of this recipe's own ingredients identifies neither.
  // "Crushed tomatoes, no salt added" carries the key "salt", so every step that
  // said "a pinch of salt" claimed the tomatoes were going in — which put a can
  // of tomatoes in the picture of every step of the bolognese, including the one
  // where you soften the onion. The diagram never showed this because it takes
  // only the first step an ingredient matches; asking about every step exposed it.
  const seen = new Map();
  const lines = [];
  for (const line of recipe?.ingredients || []) {
    const item = ingIndex.get(line.ing);
    if (!item) continue;
    lines.push({ line, item, keys: matchKeys(item) });
    for (const k of matchKeys(item)) seen.set(k, (seen.get(k) || 0) + 1);
  }

  const found = [];
  for (const entry of lines) {
    const own = entry.keys.filter(k => seen.get(k) === 1);
    if (own.some(k => haystack.includes(k))) found.push({ line: entry.line, item: entry.item });
  }
  return found;
}

/**
 * A step that happens alongside the main thread rather than after it.
 *
 * "Meanwhile, cook the pasta" is the single most common branch in home cooking
 * and drawing it in sequence would be a lie about the evening: it says wait for
 * the sauce before you boil the water, which is how dinner arrives late.
 */
const BRANCH_OPENERS = /^(meanwhile|while |in a separate|in another|in a second|at the same time|as (?:it|they|that)\b)/i;

/** The merge back: a step that pulls a parallel thread into the main one. */
const MERGE_WORDS = /\b(toss|combine|add (?:the )?(?:drained|cooked)|fold|stir (?:it|them|the .*) (?:in|into)|return|serve (?:over|on)|top(?: the)?|assemble|pour over|spoon over)\b/i;

/**
 * Both tests, exported, because the timeline needs the same reading of a step.
 *
 * Two modules each deciding for themselves what "meanwhile" means is two modules
 * that will eventually disagree about whether the pasta is cooking in parallel —
 * on the same screen, in front of somebody holding a colander.
 */
export const opensBranch = (text) => BRANCH_OPENERS.test(String(text).trim());
export const mergesBranch = (text) => MERGE_WORDS.test(String(text));

/* ------------------------------------------------------------------ *
 * The label on an operation
 * ------------------------------------------------------------------ */

/**
 * Two or three words for what a step does.
 *
 * The whole point of this view is less text, so a cell that reprints the
 * sentence has defeated it. The full sentence is still one tap away — this is
 * the handle, not the instruction.
 */
const VERBS = [
  ['preheat', 'Preheat'], ['melt', 'Melt'], ['whisk', 'Whisk'], ['blend', 'Blend'],
  ['purée', 'Blend'], ['puree', 'Blend'], ['mash', 'Mash'], ['fold', 'Fold in'],
  ['toss', 'Toss'], ['stir', 'Stir in'], ['mix', 'Mix'], ['combine', 'Combine'],
  ['sear', 'Sear'], ['brown', 'Brown'], ['sauté', 'Sauté'], ['saute', 'Sauté'],
  ['sweat', 'Sweat'], ['cook', 'Cook'], ['soften', 'Soften'], ['bloom', 'Bloom'],
  ['fry', 'Fry'], ['crisp', 'Crisp'], ['roast', 'Roast'], ['bake', 'Bake'],
  ['broil', 'Broil'], ['grill', 'Grill'], ['simmer', 'Simmer'], ['boil', 'Boil'],
  ['steam', 'Steam'], ['poach', 'Poach'], ['braise', 'Braise'], ['reduce', 'Reduce'],
  ['drain', 'Drain'], ['rinse', 'Rinse'], ['chop', 'Chop'], ['slice', 'Slice'],
  ['dice', 'Dice'], ['grate', 'Grate'], ['season', 'Season'], ['taste', 'Taste'],
  ['rest', 'Rest'], ['chill', 'Chill'], ['freeze', 'Freeze'], ['marinate', 'Marinate'],
  ['press', 'Press'], ['toast', 'Toast'], ['scatter', 'Scatter'], ['serve', 'Serve'],
  ['spread', 'Spread'], ['layer', 'Layer'], ['wrap', 'Wrap'], ['cover', 'Cover'],
  ['transfer', 'Transfer'], ['pull', 'Finish'], ['finish', 'Finish'], ['top', 'Top with'],
  ['cool', 'Cool'], ['warm', 'Warm'], ['heat', 'Heat'], ['pour', 'Pour'], ['beat', 'Beat'],
  ['knead', 'Knead'], ['flip', 'Flip'], ['strain', 'Strain'], ['arrange', 'Arrange'],
  ['divide', 'Divide'], ['shape', 'Shape'], ['sprinkle', 'Scatter'], ['garnish', 'Garnish'],
  ['whip', 'Whip'], ['tip', 'Tip in'], ['bring', 'Bring up'], ['wilt', 'Wilt']
];

/** "cook 10-12 minutes" -> "10–12 min". Nothing else in the cell is a number. */
function durationIn(text) {
  const m = String(text).match(/(\d+)\s*(?:[-–—]|\s+to\s+)?\s*(\d+)?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i);
  if (!m) return null;
  const unit = /hour|hr/i.test(m[3]) ? 'hr' : /sec/i.test(m[3]) ? 'sec' : 'min';
  return `${m[1]}${m[2] ? `–${m[2]}` : ''} ${unit}`;
}

export function labelFor(text) {
  const lower = String(text).toLowerCase();
  let verb = null;
  let at = Infinity;
  for (const [needle, label] of VERBS) {
    // Whole words only. "Brownies" contains "brown", and a pan of brownies
    // labeled "Brown" is the kind of small wrongness that makes a diagram
    // untrustworthy everywhere else.
    //
    // The boundaries are letter lookarounds rather than \b, because \b is
    // defined on [A-Za-z0-9_] and an accented letter is not in it — so \bsauté\b
    // could never match "sauté", there being no boundary between "é" and the
    // space after it. Every sautéing step in the collection has been falling
    // through to the diagram's "Then" since the day it was written.
    const m = lower.match(new RegExp(`(?<!\\p{L})${needle}(?:e?[sd]|ing)?(?!\\p{L})`, 'iu'));
    if (m && m.index < at) { at = m.index; verb = label; }
  }
  return { verb: verb || 'Then', time: durationIn(text) };
}

/* ------------------------------------------------------------------ *
 * Building the thing
 * ------------------------------------------------------------------ */

/**
 * Which step first calls for each ingredient.
 *
 * An ingredient nobody names inherits the step of the line above it, because
 * recipe writers list ingredients in the order they get used and the unnamed
 * ones are almost always the salt and the oil that go in with the thing before.
 */
function assignSteps(recipe, ingIndex) {
  const steps = recipe.steps || [];
  const haystacks = steps.map(s => ` ${s.toLowerCase()} `);
  const rows = [];
  let named = 0;

  for (const line of recipe.ingredients || []) {
    const item = ingIndex.get(line.ing);
    if (!item) continue;
    const keys = matchKeys(item);
    let step = -1;
    for (let i = 0; i < haystacks.length && step === -1; i++) {
      if (keys.some(k => haystacks[i].includes(k))) step = i;
    }
    if (step !== -1) named++;
    rows.push({ line, item, step, guessed: step === -1 });
  }

  // Fill the gaps downward, then upward for anything still stranded at the top.
  let last = rows.find(r => r.step !== -1)?.step ?? 0;
  for (const row of rows) {
    if (row.step === -1) row.step = last;
    else last = row.step;
  }

  return { rows, confidence: rows.length ? named / rows.length : 0 };
}

/**
 * The operations, in the order they happen, each knowing what it swallows.
 *
 * A step that opens with "meanwhile" starts a second thread: it takes only its
 * own ingredients, and the first step afterward that reads like a merge pulls
 * both threads together. Everything else is a chain, where each operation
 * consumes the one before it plus whatever new ingredients it names.
 */
function buildOps(recipe, rows) {
  const steps = recipe.steps || [];
  const rowsOfStep = new Map();
  rows.forEach((row, i) => {
    if (!rowsOfStep.has(row.step)) rowsOfStep.set(row.step, []);
    rowsOfStep.get(row.step).push(i);
  });

  const ops = [];
  let mainTip = null;     // the op the main thread has reached
  let branchTip = null;   // the op a parallel thread has reached, if one is open

  for (let i = 0; i < steps.length; i++) {
    const text = steps[i];
    const own = rowsOfStep.get(i) || [];
    const opensBranch = BRANCH_OPENERS.test(text.trim());
    const merges = branchTip !== null && MERGE_WORDS.test(text);

    // A step with no ingredients and nothing to act on yet is preparation —
    // preheating an oven, salting water. It is a fact about the evening rather
    // than a node in the diagram, so it becomes a note above the table.
    if (!own.length && mainTip === null && !opensBranch) {
      ops.push({ id: `op${i}`, step: i, text, rows: [], consumes: [], prep: true, ...labelFor(text) });
      continue;
    }

    const consumes = [];
    if (merges) {
      if (mainTip) consumes.push(mainTip);
      consumes.push(branchTip);
      branchTip = null;
    } else if (opensBranch && branchTip === null && own.length) {
      // nothing: a new thread starts from its own ingredients
    } else if (mainTip) {
      consumes.push(mainTip);
    }

    const op = { id: `op${i}`, step: i, text, rows: own, consumes, prep: false, ...labelFor(text) };
    ops.push(op);

    if (opensBranch && !merges && own.length && mainTip !== null) branchTip = op.id;
    else mainTip = op.id;
  }

  // A thread left open at the end has to be joined to something, or the diagram
  // shows a dish that was never finished.
  if (branchTip && mainTip && ops.length) {
    const last = ops[ops.length - 1];
    if (!last.consumes.includes(branchTip)) last.consumes.push(branchTip);
  }

  return ops.filter(op => op.prep || op.rows.length || op.consumes.length);
}

/**
 * Where every cell sits.
 *
 * An operation covers every row its inputs cover, plus its own. Its column is
 * one past the deepest thing it consumes, which is what makes the brackets nest
 * rather than collide. The row order is then rewritten so that each operation's
 * rows are contiguous — the format only reads if the block it brackets is a
 * block, and a recipe listing its garlic between the pasta and the parmesan
 * would otherwise draw a bracket across a row that has nothing to do with it.
 */
function layout(ops, rows) {
  const byId = new Map(ops.map(o => [o.id, o]));
  const order = [];
  const placed = new Set();

  // Depth first through the graph, so every thread's rows come out together.
  const visit = (op) => {
    if (!op || placed.has(op.id)) return;
    placed.add(op.id);
    for (const id of op.consumes) visit(byId.get(id));
    for (const r of op.rows) if (!order.includes(r)) order.push(r);
  };
  for (const op of ops) visit(op);
  for (let i = 0; i < rows.length; i++) if (!order.includes(i)) order.push(i);

  const newIndex = new Map(order.map((oldIndex, i) => [oldIndex, i]));
  const laidOut = order.map(i => rows[i]);

  // Now the spans, in the new order.
  const span = new Map();
  const col = new Map();
  for (const op of ops) {
    if (op.prep) continue;
    let lo = Infinity;
    let hi = -Infinity;
    let depth = 0;
    for (const r of op.rows) {
      const at = newIndex.get(r);
      lo = Math.min(lo, at);
      hi = Math.max(hi, at);
    }
    for (const id of op.consumes) {
      const s = span.get(id);
      if (!s) continue;
      lo = Math.min(lo, s.lo);
      hi = Math.max(hi, s.hi);
      depth = Math.max(depth, (col.get(id) ?? 0) + 1);
    }
    if (lo === Infinity) continue;
    span.set(op.id, { lo, hi });
    col.set(op.id, depth);
  }

  const cells = ops
    .filter(op => span.has(op.id))
    .map(op => ({ ...op, ...span.get(op.id), col: col.get(op.id) }));

  return { rows: laidOut, cells, columns: cells.length ? Math.max(...cells.map(c => c.col)) + 1 : 0 };
}

/**
 * Is the diagram actually drawable?
 *
 * Two cells in the same column whose row spans overlap would render on top of
 * each other. It should not happen — a column is a depth and two operations at
 * the same depth are on different threads — but "should not" is not a reason to
 * ship a broken table, so it is checked and the recipe falls back to its list.
 */
function isSound(cells) {
  for (const a of cells) {
    for (const b of cells) {
      if (a === b || a.col !== b.col) continue;
      if (a.lo <= b.hi && b.lo <= a.hi) return false;
    }
  }
  return true;
}

/**
 * The whole diagram for one recipe, or null when it cannot be trusted.
 *
 * `minConfidence` is the share of ingredients that had to be found by name in
 * some step. Below it, too much of the table would be guesswork stated as
 * structure, and a confidently wrong diagram is worse than no diagram.
 */
export function recipeTable(recipe, ingIndex, { minConfidence = 0.6 } = {}) {
  if (!recipe?.ingredients?.length || !recipe?.steps?.length) return null;

  const { rows, confidence } = assignSteps(recipe, ingIndex);
  if (confidence < minConfidence || rows.length < 2) return null;

  const ops = buildOps(recipe, rows);
  const prep = ops.filter(o => o.prep);
  const { rows: ordered, cells, columns } = layout(ops, rows);
  if (!cells.length || !isSound(cells)) return null;

  // One operation covering everything is a table with one bracket in it, which
  // is a list with extra lines. Not worth the switch.
  if (columns < 2) return null;

  return {
    rows: ordered,
    cells,
    columns,
    prep,
    confidence: Math.round(confidence * 100) / 100,
    // How many things are on the go at once — the number a list hides and the
    // main reason to draw this at all.
    threads: cells.filter(c => !c.consumes.length).length
  };
}

/** Whether this recipe can be drawn at all — for deciding to show the toggle. */
export const hasTable = (recipe, ingIndex) => recipeTable(recipe, ingIndex) !== null;

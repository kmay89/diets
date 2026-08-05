/**
 * timeline.js — when the cooking happens, and when it doesn't.
 *
 * A recipe answers "what do I do" in exquisite detail and refuses to answer the
 * question everybody actually has at 6pm: *am I standing here for forty minutes,
 * or is most of that the oven?* The two are completely different evenings, and a
 * numbered list makes them look identical — forty minutes of instructions either
 * way, one sentence after another, all apparently demanding your attention.
 *
 * The information is already in there. "Simmer 20 minutes, covered" is the
 * recipe telling you it does not need you for twenty minutes. Nobody adds it up.
 *
 * So this adds it up, and the useful output is not a pretty chart — it is a
 * sentence: "you are hands-on for about 14 of these 40 minutes, and the longest
 * stretch you are free is 20, while the lentils simmer." That is a fact you can
 * plan an evening around, and it is derived entirely from words the recipe
 * already used.
 *
 * WHAT IS NOT INVENTED
 *
 * Only stated times are drawn. 47% of the steps across the collection name a
 * duration; the rest are chopping and stirring and plating, and guessing at how
 * long those take would produce a chart that looks precise and is fiction. They
 * are counted and mentioned in words instead. The chart's axis is "minutes the
 * recipe put a number on", and it says so, because a chart whose axis is half
 * measured and half imagined is worse than no chart.
 *
 * ERRERLabs — MIT licensed.
 */

import { stepTiming } from './step-timing.js';
import { labelFor, opensBranch, mergesBranch } from './recipe-table.js';

/**
 * Work the pot does without you. The test is not whether heat is involved — it
 * is whether walking away costs you anything.
 */
const AWAY = new Set([
  'Bake', 'Roast', 'Braise', 'Simmer', 'Chill', 'Freeze', 'Rest', 'Marinate',
  'Cool', 'Preheat', 'Steam', 'Poach', 'Boil', 'Press', 'Soften'
]);

/**
 * Work that wants you at the pan. Broiling and grilling are in here rather than
 * with the oven on purpose: thirty seconds is the whole margin between golden
 * and carbon, and a chart that tells somebody they are free while something is
 * under a broiler has actively made their dinner worse.
 */
const ATTEND = new Set([
  'Sear', 'Brown', 'Sauté', 'Sweat', 'Fry', 'Crisp', 'Broil', 'Grill', 'Toast',
  'Reduce', 'Whisk', 'Beat', 'Whip', 'Knead', 'Flip', 'Stir in', 'Cook',
  'Warm', 'Heat', 'Melt', 'Bloom', 'Wilt', 'Bring up'
]);

/**
 * The sentence outranks the verb, both ways.
 *
 * "Simmer 20 minutes, stirring often" is not twenty free minutes however
 * strongly the word simmer suggests otherwise, and "cook 25 minutes, covered,
 * undisturbed" is twenty-five free ones however strongly "cook" suggests you are
 * needed. The recipe writer already knew which it was and wrote it down.
 */
const NEEDS_YOU = /\b(?:stirring|whisking|turning|tossing|watching)\b|\bstir\s+(?:often|frequently|constantly|occasionally|now and then)\b|\bdo not (?:walk away|leave)\b|\bwatch (?:it|them|closely|carefully)\b/i;

/*
 * "cover" and not only "covered", because recipes write the instruction as an
 * order — "Bring to a simmer, cover partway, and cook 30-35 minutes" — and
 * matching only the adjective missed the single largest free window in the
 * collection's most-cooked dish. "Uncovered" is safe from this: there is no word
 * boundary between "un" and "covered", so \bcover\b cannot reach inside it.
 */
const LEAVE_IT = /\bcover(?:ed|s|ing)?\b|\b(?:undisturbed|untouched|unattended)\b|\blid on\b|\bwithout stirring\b|\bdo not (?:stir|touch|open|disturb)\b/i;

/** Below this a gap is not a window, it is a pause. Nobody starts a task in 3 minutes. */
const WINDOW_MIN = 4;

/** Past this a wait is not a gap in the evening, it is a constraint on the day. */
const LONG_WAIT = 60;

/** "3 hours", "90 minutes", "1 hour 20 minutes" — the way somebody would say it. */
export function hoursWords(minutes) {
  const m = Math.round(minutes);
  if (m < 90) return `${m} minutes`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const hours = `${h} hour${h === 1 ? '' : 's'}`;
  return rest >= 5 ? `${hours} ${rest} minutes` : hours;
}

/** Whether this dish has to be started well before the meal. */
export const needsAhead = (tl) => !!tl?.longest && tl.longest.minutes >= LONG_WAIT;

/**
 * What one step is, in the only two categories that change your evening.
 *
 * @returns {{kind:'away'|'attend'|'work', verb:string, minutes:number, upto:number, cue:string}}
 *   `work` means the step named no time — hands doing something, of unknown
 *   length, deliberately not guessed at.
 */
export function stepShape(text) {
  const { seconds, upto, cue } = stepTiming(text);
  const { verb } = labelFor(text);
  const minutes = Math.round(seconds / 60);

  if (!seconds || minutes < 1) return { kind: 'work', verb, minutes: 0, upto: 0, cue };

  // The verb that owns the clock, which is not always the verb that opens the
  // sentence. "Preheat the oven. Sauté the onion 8 minutes" opens with a wait
  // and describes eight minutes of standing at a pan, and taking the first verb
  // gets it exactly backwards.
  const owner = verbNearest(text, seconds) || verb;

  let kind;
  if (NEEDS_YOU.test(text)) kind = 'attend';
  else if (LEAVE_IT.test(text)) kind = 'away';
  else if (AWAY.has(owner)) kind = 'away';
  else if (ATTEND.has(owner)) kind = 'attend';
  // An unrecognized verb with a long clock on it is almost always a wait —
  // nothing in a home kitchen asks for twenty unbroken minutes of hands.
  else kind = minutes >= 15 ? 'away' : 'attend';

  return { kind, verb: owner, minutes, upto: Math.round(upto / 60), cue };
}

/**
 * The last verb before the duration that got picked.
 *
 * A step is often three instructions in one sentence, and only one of them is
 * the one with the number attached. The nearest verb *before* the clock is that
 * one, because English puts the action first and the duration after it.
 */
function verbNearest(text, seconds) {
  const at = clockIndex(text, seconds);
  if (at < 0) return null;
  const before = String(text).slice(0, at);
  const { verb } = labelFor(lastClause(before));
  return verb === 'Then' ? labelFor(before).verb : verb;
}

/** Where in the sentence the duration the timer picked actually appears. */
function clockIndex(text, seconds) {
  const s = String(text);
  const re = /(\d+)\s*(?:[-–—]|\s+to\s+)?\s*(\d+)?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/gi;
  let best = -1;
  for (const m of s.matchAll(re)) {
    const unit = /hour|hr/i.test(m[3]) ? 3600 : /sec/i.test(m[3]) ? 1 : 60;
    if (Number(m[1]) * unit === seconds) best = m.index;
  }
  return best;
}

/** The last clause of a run-on instruction — the one the clock belongs to. */
const lastClause = (s) => String(s).split(/[.;,]|\band\b|\bthen\b/i).filter(p => p.trim()).pop() || s;

/**
 * The whole schedule for one recipe.
 *
 * Steps run in sequence on one lane until something opens a parallel thread,
 * which gets its own lane starting at the same clock reading as the step it runs
 * alongside — because that is what "meanwhile" means, and drawing it in sequence
 * tells somebody to boil the water after the sauce is finished, which is how
 * dinner arrives in two halves twenty minutes apart.
 *
 * @returns {{blocks:Array, lanes:number, statedMin:number, handsOnMin:number,
 *   freeMin:number, untimed:number, windows:Array, longest:object|null}}
 */
export function timeline(recipe) {
  const steps = recipe?.steps || [];
  if (!steps.length) return empty();

  const blocks = [];
  let cursor = 0;       // where the main thread has got to
  let branchEnd = 0;    // the furthest any parallel thread has run to
  let previous = null;

  for (let i = 0; i < steps.length; i++) {
    const text = steps[i];
    const shape = stepShape(text);

    // "Meanwhile, cook the pasta" runs alongside the step before it, so it
    // starts when *that* step started — not when it finished. Scheduling it
    // afterward tells somebody to boil the water once the sauce is done, which
    // is how dinner arrives in two halves twenty minutes apart.
    //
    // The branch is one step. Every "meanwhile" in the collection is a single
    // errand — cook the pasta, mash the butter, dress the slaw — and where a
    // second step does continue it, treating that step as sequential only ever
    // makes the evening look longer than it is. Over-promising free time is the
    // error that ruins a dinner; under-promising just fails to help.
    const parallel = opensBranch(text) && previous !== null;
    const lane = parallel ? 1 : 0;
    const at = parallel ? previous.at : cursor;

    const block = { step: i, text, lane, at, ...shape };
    blocks.push(block);

    if (parallel) {
      branchEnd = Math.max(branchEnd, at + shape.minutes);
    } else {
      // A step that pulls the parallel thread back in cannot start until that
      // thread has finished either.
      const start = mergesBranch(text) ? Math.max(at, branchEnd) : at;
      blocks[blocks.length - 1].at = start;
      cursor = start + shape.minutes;
      previous = blocks[blocks.length - 1];
    }
  }

  // A thread left open at the end still has to finish before the dish does.
  const statedMin = Math.max(cursor, branchEnd);
  const timed = blocks.filter(b => b.minutes > 0);
  const handsOnMin = timed.filter(b => b.kind === 'attend').reduce((n, b) => n + b.minutes, 0);
  const freeMin = timed.filter(b => b.kind === 'away').reduce((n, b) => n + b.minutes, 0);

  const windows = freeWindows(blocks);

  return {
    blocks,
    lanes: blocks.some(b => b.lane === 1) ? 2 : 1,
    statedMin,
    handsOnMin,
    freeMin,
    untimed: blocks.length - timed.length,
    windows,
    longest: windows.length ? windows.reduce((a, b) => (b.minutes > a.minutes ? b : a)) : null
  };
}

const empty = () => ({
  blocks: [], lanes: 1, statedMin: 0, handsOnMin: 0, freeMin: 0,
  untimed: 0, windows: [], longest: null
});

/**
 * The stretches where nothing wants you.
 *
 * Consecutive away-steps merge into one window, because two twelve-minute bakes
 * back to back is twenty-four free minutes and reporting it as two twelves
 * understates the evening. A window is only real if nothing on the *other* lane
 * needs you during it — a simmer you spend chopping through is not free time,
 * and that is exactly the case a naive reading gets wrong.
 */
export function freeWindows(blocks) {
  const windows = [];
  let open = null;
  const close = () => { if (open) windows.push(open); open = null; };

  for (const b of blocks) {
    // A minute of something left undisturbed is a beat, not a window — you are
    // standing right over it. Letting one seed a window merged 90 seconds of
    // frying tomato paste into a half-hour simmer and then labeled the whole
    // stretch with the fry's cue, which described neither.
    const isWindow = b.kind === 'away' && b.minutes >= 2;

    if (isWindow && open && open.lane === b.lane && open.endsAt === b.at) {
      open.minutes += b.minutes;
      open.endsAt += b.minutes;
      open.steps.push(b.step);
      // The cue of the block that dominates the window, not of whichever one
      // happened to come first.
      if (b.minutes > open.longestBlock) { open.longestBlock = b.minutes; open.cue = b.cue; }
      continue;
    }

    if (isWindow) {
      close();
      open = {
        at: b.at, endsAt: b.at + b.minutes, minutes: b.minutes, lane: b.lane,
        steps: [b.step], cue: b.cue, longestBlock: b.minutes
      };
      continue;
    }

    if (!open) continue;

    if (b.lane === open.lane) {
      // Anything else on this lane ends the window, including a step with no
      // stated time. Tossing tofu in cornstarch takes no minutes the recipe
      // bothered to write down and it absolutely takes your hands, and a window
      // that runs straight through it is offering time somebody does not have.
      close();
    } else if (b.minutes > 0 && b.kind === 'attend') {
      // Something on the other lane wants you during this window. What is left
      // after that work is still free; the overlap is not.
      const overlap = Math.max(0, Math.min(open.endsAt, b.at + b.minutes) - Math.max(open.at, b.at));
      open.minutes = Math.max(0, open.minutes - overlap);
    }
  }
  close();

  return windows.filter(w => w.minutes >= WINDOW_MIN);
}

/**
 * The chart in one sentence, for the people who would rather read it — and for
 * the screen reader, which cannot see a bar however carefully it is drawn.
 *
 * This is the whole point of the module. If the sentence is not worth reading
 * the chart above it was not worth drawing either.
 */
export function timelineWords(tl, recipe) {
  if (!tl || !tl.statedMin) return '';

  const parts = [];
  const total = recipe?.totalMin || 0;

  // Three genuinely different situations, and the first version had one
  // sentence for all of them — which produced "add up to 180 minutes, inside
  // the 5 the recipe gives start to finish" for a chia pudding, a sentence that
  // is not merely awkward but arithmetically absurd.
  if (total && tl.statedMin > total + 5) {
    parts.push(
      `The steps name ${tl.statedMin} minutes between them, which is more than the ${total} on the recipe — ` +
      `the header counts the work, and most of this is the fridge or the oven doing it without you.`);
  } else if (total && total - tl.statedMin > 5) {
    parts.push(`The steps that name a time add up to ${tl.statedMin} minutes, inside the ${total} the recipe gives start to finish.`);
  } else {
    parts.push(`The steps that name a time add up to ${tl.statedMin} minutes.`);
  }

  if (tl.freeMin >= WINDOW_MIN && tl.handsOnMin) {
    parts.push(`About ${tl.handsOnMin} of those want your hands; ${tl.freeMin} are the pot working on its own.`);
  } else if (tl.freeMin >= WINDOW_MIN) {
    parts.push(`None of that is standing over anything — it is all oven, pot and fridge time.`);
  } else if (tl.handsOnMin) {
    parts.push(`Nearly all of it wants your hands — there is no real stretch where you can walk off.`);
  }

  if (tl.longest) {
    const which = tl.longest.steps.length > 1
      ? `steps ${tl.longest.steps[0] + 1}–${tl.longest.steps[tl.longest.steps.length - 1] + 1}`
      : `step ${tl.longest.steps[0] + 1}`;
    const until = tl.longest.cue ? ` — until ${tl.longest.cue}` : '';

    // Past about an hour it stops being a gap in the cooking and becomes a fact
    // about the day: you cannot start this at six and eat at seven, and that is
    // the single most useful thing the chart can tell somebody choosing dinner.
    if (tl.longest.minutes >= LONG_WAIT) {
      parts.push(`It has to sit for ${hoursWords(tl.longest.minutes)} at ${which}, so this one gets started well ahead rather than at dinnertime.`);
    } else {
      parts.push(`The longest stretch you are free is ${tl.longest.minutes} minutes, at ${which}${until}.`);
    }
  }

  if (tl.lanes > 1) {
    const branch = tl.blocks.find(b => b.lane === 1);
    if (branch) parts.push(`Step ${branch.step + 1} runs alongside rather than after, so start it at the same time.`);
  }

  if (tl.untimed) {
    parts.push(`${tl.untimed} other ${tl.untimed === 1 ? 'step names' : 'steps name'} no time — the chopping, the mixing, the plating. They are not drawn, because the recipe never said how long they take and guessing would make this look more precise than it is.`);
  }

  return parts.join(' ');
}

/** Enough of a schedule to be worth drawing at all. */
export const worthDrawing = (tl) => !!tl && tl.statedMin >= 10 && tl.blocks.filter(b => b.minutes > 0).length >= 2;

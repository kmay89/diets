/**
 * cook-moments.js — the table advice, put where it is actually useful.
 *
 * "At the table" was a good block in the wrong place. It held real things —
 * warm the plates because a hot dish on a cold one loses ten degrees before
 * anyone picks up a fork, rest the roast, taste it before it leaves the pan —
 * and it held them in a list at the bottom of the page, after the method,
 * phrased as a countdown to a dinner that had not started yet.
 *
 * Read there it is a chore list. Nobody scrolls back down mid-cook to find out
 * that ten minutes ago was when to set the table.
 *
 * The fix is not better wording. It is that this app now knows, per step, when
 * the pot does not need you — and *that* is when these things are worth doing.
 * A suggestion that arrives during the thirty minutes a sauce simmers is not a
 * chore, it is somebody noticing you have a free hand and telling you the one
 * thing worth doing with it.
 *
 * So each mark is placed on the step it belongs to, preferring the free window
 * it falls inside. A mark with nowhere sensible to go is dropped rather than
 * pinned to an approximate step — an instruction to warm the plates during the
 * chopping is worse than no instruction.
 *
 * ERRERLabs — MIT licensed.
 */

import { timeline } from './timeline.js';
import { timelineFor, getTableModel } from './table.js';

/** A window shorter than this is not long enough to leave the kitchen for. */
const WORTH_LEAVING = 8;

/** Two is a suggestion. Five is the chore list this was meant to replace. */
const MAX_PER_STEP = 2;

/** How long plating takes, so the schedule's end is not mistaken for sitting down. */
const platingMin = (m) => m?.timeline?.platingMin || 4;

/**
 * Which step each piece of table advice belongs under.
 *
 * The two clocks have to be reconciled and only one of them can be trusted for
 * this. `timelineFor` counts back from the recipe's stated totalMin, which is a
 * header number; the schedule counts forward through the steps' own durations,
 * which is what the reader is looking at. Placing a mark by the header's clock
 * would land it on whichever step happened to be there if the two agreed, and
 * they frequently do not. So marks are positioned on the schedule's clock: the
 * end of the schedule plus plating is the moment everyone sits down.
 *
 * @returns {Array<{step:number, marks:Array, window:object|null, freeMin:number}>}
 *   one entry per step that has something worth saying, in step order.
 */
export function momentsFor(recipe, m = getTableModel()) {
  if (!m) return [];

  const tl = timeline(recipe);
  if (!tl.statedMin) return [];

  const sitDown = tl.statedMin + platingMin(m);
  const marks = timelineFor(recipe, m);
  const byStep = new Map();

  const put = (step, mark, window, freeMin) => {
    if (!byStep.has(step)) byStep.set(step, { step, marks: [], window, freeMin });
    const entry = byStep.get(step);
    if (entry.marks.length < MAX_PER_STEP) entry.marks.push(mark);
  };

  // Things done away from the pot, offered during a gap. Only into a gap long
  // enough to be worth leaving the kitchen for — "you have 3 free minutes, go
  // and lay the table" is not help, it is a stopwatch.
  for (const mark of marks.filter(x => x.phase === 'ahead')) {
    const at = sitDown - mark.at;
    if (at < 0) continue;
    const window = windowAround(tl, at);
    if (!window || window.minutes < WORTH_LEAVING) continue;
    put(window.steps[window.steps.length - 1], mark, window, window.minutes);
  }

  // Things done to the food as it comes off the heat. These belong to the last
  // step there is, not to whichever minute of a simmer the countdown's clock
  // happened to land on — the first version put "sit down" in the middle of a
  // thirty-minute sauce.
  const last = tl.blocks.length - 1;
  for (const mark of marks.filter(x => x.phase === 'end')) put(last, mark, null, 0);

  return [...byStep.values()].sort((a, b) => a.step - b.step);
}

/**
 * The free window a given minute falls in, or the last one before it.
 *
 * Falling back to an earlier window is deliberate: advice that lands two
 * minutes into a step wanting both hands is better given during the simmer that
 * ended just before it. Earlier and useful beats on-time and impossible.
 */
function windowAround(tl, at) {
  return tl.windows.find(w => at >= w.at && at <= w.endsAt + 2)
    || [...tl.windows].reverse().find(w => w.at <= at)
    || null;
}

/**
 * The opening line for a step's moments — the part that makes it an observation
 * rather than an order.
 *
 * "You have about 30 minutes here" is the sentence that changes what follows
 * from a chore into a use for time somebody did not know they had.
 */
export function momentLede(moment) {
  if (!moment.window) return 'As it comes off the heat:';
  if (moment.freeMin >= 20) return `You have about ${moment.freeMin} minutes here. Worth doing now:`;
  if (moment.freeMin >= 8) return `${moment.freeMin} free minutes here — enough for:`;
  return 'A gap here, if you want it:';
}

/** Whether any of this is worth drawing for a recipe at all. */
export const hasMoments = (recipe, m = getTableModel()) => momentsFor(recipe, m).length > 0;

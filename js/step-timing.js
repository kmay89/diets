/**
 * step-timing.js — what the number in a step actually means.
 *
 * A time in a recipe is not a deadline. It is an estimate somebody made in a
 * different kitchen, with a different pan, on a different stove, and the
 * sentence around it usually admits as much: "simmer 20-25 minutes, until the
 * lentils are tender" is saying that twenty-five is a guess and tender is the
 * answer. A timer that keeps the twenty-five and throws the tender away has
 * kept the wrong half, and then rings like a smoke alarm about it.
 *
 * So three things are read out of a step here, not one:
 *
 *   when to look     the *lower* bound of a range. Arriving early with a spoon
 *                    costs nothing; arriving late costs the dinner.
 *   how much slack   the upper bound, so the pill can say "up to 5 more if it
 *                    needs it" instead of implying the food is now ruined.
 *   what to look for  the "until ..." clause, which turns a bell into an
 *                    instruction and hands the decision back to the cook.
 *
 * That ordering is the whole design. A timer that says TIME IS UP is a small
 * emergency three times an evening, and the way people cope with three small
 * emergencies an evening is to stop setting timers. A timer that says "have a
 * look — the lentils should be tender, up to 5 min more if not" is a colleague
 * leaning over your shoulder, and you keep those.
 *
 * ERRERLabs — MIT licensed.
 */

import { labelFor } from './recipe-table.js';

const UNIT_SECONDS = { second: 1, sec: 1, minute: 60, min: 60, hour: 3600, hr: 3600 };

const DURATION = /(\d+)\s*(?:[-–—]|\s+to\s+)?\s*(\d+)?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/gi;

/** Beyond this it is a plan for tomorrow — a soak, a rise — not a thing to watch. */
const LONGEST = 14400;

/**
 * @returns {{seconds:number, upto:number, cue:string}} seconds is when to ring,
 * upto is how far the recipe is willing to go, cue is what to look for. All
 * zero and empty when the step has no time in it.
 */
export function stepTiming(text) {
  let pick = null;
  for (const m of String(text).matchAll(DURATION)) {
    const unit = m[3].toLowerCase().replace(/s$/, '');
    const mult = UNIT_SECONDS[unit] ?? UNIT_SECONDS[unit.replace(/s$/, '')] ?? 0;
    if (!mult) continue;
    const lo = Number(m[1]);
    const hi = m[2] != null ? Number(m[2]) : lo;
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo || lo <= 0) continue;
    if (hi * mult > LONGEST) continue;
    // The longest thing in the step is the one worth a timer: a step that
    // browns for 2 minutes and then simmers for 20 is a 20-minute step.
    if (!pick || hi * mult > pick.upto) pick = { seconds: lo * mult, upto: hi * mult };
  }
  return pick ? { ...pick, cue: cueFrom(text) } : { seconds: 0, upto: 0, cue: '' };
}

/** When to ring. Kept as its own name because most callers want only this. */
export const ringAt = (text) => stepTiming(text).seconds;

/**
 * The doneness cue: the clause that describes the food rather than the clock.
 *
 * Trimmed hard, because this is read at a glance over a hot pan. Anything that
 * turns into a sentence is dropped rather than truncated — half a cue is worse
 * than none, since the missing half is where the condition usually lives.
 */
export function cueFrom(text) {
  // A dash ends the cue as surely as a period does. "until everything is soft
  // and the onion is genuinely golden — not translucent, golden" is a fine cue
  // and a paragraph of one, and the part before the dash is the whole test.
  const m = String(text).match(/\b(?:or\s+)?until\s+([^.;:—–]+)/i);
  if (!m) return '';
  const cue = m[1]
    // "until tender, about 20 minutes" and "until tender, 20-25 minutes" both
    // end with the clock again, and the clock is already on the pill.
    .replace(/,?\s*(?:about|around|roughly)?\s*\d[^,]*\b(?:seconds?|secs?|minutes?|mins?|hours?|hrs?)\b.*$/i, '')
    // A comma followed by an order is the next instruction, not more of the
    // cue: "until it smokes lightly, add the tofu" describes one thing to watch
    // for and one thing to do, and only the first belongs on a timer.
    .replace(/,\s*(?:and\s+|or\s+)?(?:then|add|stir|flip|pour|toss|drain|remove|transfer|season|serve|turn|cover|reduce|scrape|push|set|put|tip|fold|whisk|spoon|lower|raise|increase|taste|garnish|top|use|run)\b.*$/i, '')
    .replace(/\s+(?:and|or|then|but)\s*$/i, '')
    .replace(/[\s,;–—-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cue.length >= 3 && cue.length <= 64 ? cue : '';
}

/**
 * Enough of a dish's name to recognize it in a dock across the kitchen.
 *
 * Budgeted in characters rather than words, because three words of
 * "Fifteen-Minute Chickpea Skillet" is longer than five of most things, and the
 * pill has a fixed width regardless of how the title was punctuated.
 */
export function shortTitle(title) {
  const words = String(title).split(/[,(—]/)[0].trim().split(/\s+/).filter(Boolean);
  const kept = [];
  for (const word of words.slice(0, 3)) {
    if (kept.length && [...kept, word].join(' ').length > 30) break;
    kept.push(word);
  }
  return kept.join(' ');
}

/**
 * "Bolognese · simmer".
 *
 * Not the first forty characters of the step: a truncated sentence is unreadable
 * at a glance, and glancing is the only thing anyone ever does to a timer. The
 * dish says which pot, the verb says which timer on that pot.
 */
export function timerLabel(title, stepText, stepNumber = null) {
  const dish = shortTitle(title);
  const verb = labelFor(stepText)?.verb;
  // "Then" is what the diagram falls back to when a step names no action, and
  // "Vinaigrette · then" tells a cook nothing at all — worse, two of them on the
  // same dish are indistinguishable. The step number always is.
  if (verb && verb !== 'Then') return `${dish} · ${verb.toLowerCase()}`;
  return stepNumber ? `${dish} · step ${stepNumber}` : dish;
}

/**
 * What a finished timer should say, in the order a cook needs it.
 *
 * Never "done" — the timer is done, the food might not be, and conflating the
 * two is how a recipe gets a pan of underbaked brownies with a clear conscience.
 */
export function ringWords({ cue = '', seconds = 0, upto = 0 } = {}) {
  const slackMin = upto > seconds ? Math.round((upto - seconds) / 60) : 0;
  return {
    head: 'Have a look',
    look: cue ? `until ${cue}` : 'it should be about ready',
    slack: slackMin > 0 ? `up to ${slackMin} min more if it needs it` : ''
  };
}

/** "just now", "6 min ago", "1 hr 10 min ago". */
export function sinceWords(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 45) return 'just now';
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${h} hr ${rest} min ago` : `${h} hr ago`;
}

/**
 * How much "a bit longer" is worth.
 *
 * Another minute means something to a 4-minute sear and nothing at all to a
 * 3-hour braise, and a button that adds a meaningless amount is a button you
 * press six times feeling foolish.
 */
export function bumpSeconds(total) {
  if (total <= 600) return 60;
  if (total <= 1800) return 120;
  if (total <= 5400) return 300;
  return 600;
}

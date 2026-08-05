/**
 * read-aloud.js — the step, out loud, for when both hands are in a bowl.
 *
 * This is the one channel the app never had, and at a stove it may be the most
 * useful of them: you are three feet from the phone, your hands are covered in
 * flour, and the alternative is wiping them on a towel to scroll, twice a step.
 *
 * It uses the speech synthesizer built into the device. That matters for the
 * promise this app makes: nothing is sent anywhere. The voice is a system
 * service on the same machine, the text never leaves it, and the app makes no
 * network call to produce it — which is the same reason there is no cloud voice
 * here, however much better it might sound.
 *
 * ON NOT BEING ANNOYING
 *
 * Nothing speaks unless asked. There is no auto-read, no chime before the
 * sentence, no "step four of seven" preamble read out every time — the screen
 * already says that, and hearing it aloud on every tap is how a helpful feature
 * becomes something people switch off in the first ten minutes.
 *
 * ERRERLabs — MIT licensed.
 */

/** Whether this device can do it at all. Older browsers and some kiosks cannot. */
export const canSpeak = () =>
  typeof window !== 'undefined' &&
  typeof window.speechSynthesis !== 'undefined' &&
  typeof window.SpeechSynthesisUtterance === 'function';

/* ------------------------------------------------------------------ *
 * Saying a recipe the way a person would
 * ------------------------------------------------------------------ */

const FRACTIONS = {
  '½': 'a half', '⅓': 'a third', '⅔': 'two thirds', '¼': 'a quarter',
  '¾': 'three quarters', '⅛': 'an eighth', '⅜': 'three eighths',
  '⅝': 'five eighths', '⅞': 'seven eighths', '⅕': 'a fifth', '⅖': 'two fifths'
};

const UNITS = [
  ['tbsp', 'tablespoons'], ['tsp', 'teaspoons'], ['oz', 'ounces'],
  ['lbs?', 'pounds'], ['qts?', 'quarts'], ['pts?', 'pints'],
  ['mins?', 'minutes'], ['secs?', 'seconds'], ['hrs?', 'hours']
];

/**
 * The words that mean "one or less", so the unit after them stays singular.
 *
 * The lookbehind is what keeps "one and a half cups" plural: the fraction is
 * only singular when it is the whole quantity, not when it is the tail of a
 * mixed number.
 */
const SINGULAR_BEFORE = /(?<!\band\s)\b(1|one|a half|a quarter|a third|an eighth|three quarters|two thirds)\s+(tablespoon|teaspoon|ounce|pound|quart|pint|minute|second|hour|cup)s\b/gi;

/**
 * A recipe sentence, rewritten to be *said* rather than read.
 *
 * A synthesizer reads "10-12 minutes" as "ten dash twelve", "425°F" as "four
 * two five degree F", and "9x13" as "nine ex thirteen" — each of which is a
 * small moment of confusion at exactly the wrong time. None of this is
 * cosmetic: a voice that mangles the numbers is a voice you stop trusting for
 * the numbers, which are the part you needed it for.
 *
 * Pure and exported so it can be tested without a speech engine anywhere near it.
 */
export function forSpeech(text) {
  let s = String(text ?? '');

  // Ranges. Done before anything else touches the digits.
  s = s.replace(/(\d)\s*[-–—]\s*(\d)/g, '$1 to $2');

  // Temperatures, both notations, and the degree sign on its own.
  s = s.replace(/(\d+)\s*°\s*F\b/gi, '$1 degrees');
  s = s.replace(/(\d+)\s*°\s*C\b/gi, '$1 degrees celsius');
  s = s.replace(/(\d+)\s*°/g, '$1 degrees');

  // Pan sizes: "9x13" is a dish, not a multiplication.
  s = s.replace(/(\d+)\s*[x×]\s*(\d+)/gi, '$1 by $2');

  // Fractions, typographic and typed. A fraction hard against a digit is a
  // mixed number — "1½ cups" is one and a half, not "one, a half".
  for (const [glyph, words] of Object.entries(FRACTIONS)) {
    s = s.replace(new RegExp(`(\\d)\\s*${glyph}`, 'g'), `$1 and ${words}`);
    s = s.split(glyph).join(` ${words} `);
  }
  s = s.replace(/(\d+)\s+1\/2\b/g, '$1 and a half');
  s = s.replace(/\b1\/2\b/g, 'a half').replace(/\b1\/4\b/g, 'a quarter')
       .replace(/\b3\/4\b/g, 'three quarters').replace(/\b1\/3\b/g, 'a third')
       .replace(/\b2\/3\b/g, 'two thirds');

  // Units, in two passes. The first swallows the abbreviation's own period —
  // "2 tbsp. oil" — and the second leaves a sentence-ending one alone. Doing it
  // in one pass turned "bake 40 min." into "bake 40 minutes" with the full stop
  // gone, which runs the next instruction straight onto the end of this one.
  for (const [abbr, word] of UNITS) {
    s = s.replace(new RegExp(`\\b${abbr}\\b\\.(?=\\s+[a-z0-9])`, 'gi'), word);
    s = s.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), word);
  }
  s = s.replace(SINGULAR_BEFORE, '$1 $2');

  // A dash mid-sentence is a breath. Left alone it is read as a hyphen or,
  // worse, silently — running two clauses together into one long one.
  s = s.replace(/\s+[—–]\s+/g, ', ');

  s = s.replace(/&/g, ' and ').replace(/\*/g, '');

  return s.replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ *
 * Actually saying it
 * ------------------------------------------------------------------ */

let current = null;

/**
 * Say something, stopping whatever was being said first.
 *
 * Two sentences at once is not twice the help. Moving to the next step while
 * the previous one is still being read has to cut it off, or a fast tap through
 * four steps queues four paragraphs and the kitchen is talked at for a minute.
 *
 * @param onEnd called when it finishes or is cut off, so a button can go back
 *   to saying "read it" without polling.
 */
export function say(text, { rate = 0.92, onEnd } = {}) {
  if (!canSpeak()) return false;
  const words = forSpeech(text);
  if (!words) return false;

  hush();

  const utterance = new window.SpeechSynthesisUtterance(words);
  // Slower than the default, which is pitched for reading a page rather than
  // for being followed by somebody doing something else with their hands.
  utterance.rate = rate;
  utterance.onend = () => { current = null; onEnd?.(); };
  utterance.onerror = () => { current = null; onEnd?.(); };

  current = utterance;
  window.speechSynthesis.speak(utterance);
  return true;
}

/** Stop. Safe to call when nothing is speaking. */
export function hush() {
  if (!canSpeak()) return;
  current = null;
  try { window.speechSynthesis.cancel(); } catch { /* nothing was speaking */ }
}

export const speaking = () =>
  canSpeak() && (window.speechSynthesis.speaking || window.speechSynthesis.pending);

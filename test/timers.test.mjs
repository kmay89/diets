/**
 * Tests for what a timer says.
 *
 * A timer is mostly words. The count is the easy part — every phone has one —
 * and the reason people use the phone's instead of the app's is that the app's
 * never says which pot it belongs to or what it wants. So the things checked
 * here are the label, the cue and the slack: whether a timer going off is a
 * legible request to look at something, or a bell that leaves you standing in
 * the kitchen working out which of three pans it meant.
 *
 * The other thing under test is restraint. The failure mode this component has
 * is not being wrong, it is being frightening — the word "done" on food nobody
 * has looked at, a countdown that implies a deadline the recipe never set. Those
 * are cheap to reintroduce by accident and expensive to notice, because nothing
 * breaks; the app just becomes slightly unpleasant to cook with.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RECIPE_FILES } from '../tools/recipe-files.mjs';
import {
  stepTiming, cueFrom, timerLabel, ringWords, sinceWords, bumpSeconds
} from '../js/step-timing.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const recipes = RECIPE_FILES.flatMap(f => read(f).recipes);

/* ------------------------------------------------------------------ *
 * What to look for
 * ------------------------------------------------------------------ */

test('the doneness cue is kept, because it is the half that matters', () => {
  // "20-25 minutes" is a guess somebody made in another kitchen. "Until the
  // lentils are tender" is the actual answer, and a timer that keeps the guess
  // and throws the answer away has kept the wrong half.
  assert.equal(cueFrom('Simmer 20-25 minutes, until the lentils are tender.'),
    'the lentils are tender');
  assert.equal(cueFrom('Cook 3 minutes or until fragrant.'), 'fragrant');
  assert.equal(cueFrom('Bake until the top is set, about 25 minutes.'), 'the top is set');
});

test('a cue never carries the clock back in with it', () => {
  // The time is already on the pill in large type. Repeating it inside the cue
  // is how "until tender, 20-25 minutes" becomes a pill that says the number
  // twice and the condition once.
  for (const step of [
    'Simmer until tender, 20-25 minutes.',
    'Roast until golden, about 30 minutes.',
    'Cook until the edges pull away, roughly 12 min.'
  ]) {
    assert.doesNotMatch(cueFrom(step), /\d/, `a number survived into the cue of "${step}"`);
  }
});

test('a cue that turns into a sentence is dropped rather than cut', () => {
  // Half a cue is worse than none: the missing half is where the condition
  // usually lives, so a truncated one reads as an instruction and is not one.
  const long = 'Cook until the mixture has reduced by roughly half and coats the back '
    + 'of a spoon and no longer tastes at all of raw flour';
  assert.equal(cueFrom(long), '');
  assert.equal(cueFrom('Stir for a minute.'), '');
});

/* ------------------------------------------------------------------ *
 * Which pot
 * ------------------------------------------------------------------ */

test('a timer is named after its dish and its job', () => {
  assert.equal(
    timerLabel('Weeknight Lentil Bolognese', 'Simmer 20 minutes until thickened.'),
    'Weeknight Lentil Bolognese · simmer'
  );
  // A long title is shortened rather than truncated mid-word: the dock is read
  // at a glance from across a kitchen, and "Sheet-Pan Harissa Chickpe…" is not.
  assert.ok(!timerLabel('Sheet-Pan Harissa Chickpeas with Lemon Yogurt', 'Roast 25 minutes.')
    .includes('Yogurt'));
});

test('a step with no action in it falls back to something a cook can use', () => {
  // "Vinaigrette · then" names nothing, and two of them on one dish are
  // indistinguishable in a dock. A step number always tells them apart.
  assert.equal(timerLabel('House Lemon-Dijon Vinaigrette', 'Leave it 10 minutes.', 3),
    'House Lemon-Dijon Vinaigrette · step 3');
});

test('every timer the collection can offer has a label with a dish in it', () => {
  let checked = 0;
  for (const recipe of recipes) {
    for (const step of recipe.steps || []) {
      if (!stepTiming(step).seconds) continue;
      const label = timerLabel(recipe.title, step);
      assert.ok(label && label.length >= 3, `${recipe.id}: a timer with no label`);
      assert.ok(label.length <= 40, `${recipe.id}: label too long to glance at — "${label}"`);
      checked++;
    }
  }
  assert.ok(checked > 100, `only ${checked} timers across the collection`);
});

/* ------------------------------------------------------------------ *
 * Tone
 * ------------------------------------------------------------------ */

test('a finished timer asks rather than declares', () => {
  // The timer is done. The food might not be. A screen that says "done" over a
  // pan nobody has looked at is how underbaked brownies get everyone's blessing.
  const words = ringWords({ cue: 'the lentils are tender', seconds: 1200, upto: 1500 });
  assert.equal(words.head, 'Have a look');
  assert.equal(words.look, 'until the lentils are tender');
  assert.equal(words.slack, 'up to 5 min more if it needs it');

  const all = `${words.head} ${words.look} ${words.slack}`.toLowerCase();
  assert.doesNotMatch(all, /\bdone\b|time is up|finished/,
    'a finished timer passed a verdict on food nobody has looked at');
});

test('with nothing to look for it still does not pretend to know', () => {
  const words = ringWords({ cue: '', seconds: 300, upto: 0 });
  assert.equal(words.look, 'it should be about ready');
  assert.equal(words.slack, '', 'slack was invented out of a step that gave none');
});

test('a timer that rang while the app was shut reads as history', () => {
  // Opening an app to a fresh-sounding alarm for something that happened while
  // you were out is a fright, and a fright on launch teaches you to dread it.
  assert.equal(sinceWords(10), 'just now');
  assert.equal(sinceWords(360), '6 min ago');
  assert.equal(sinceWords(4200), '1 hr 10 min ago');
  assert.equal(sinceWords(7200), '2 hr ago');
});

test('a bit longer means a useful amount of longer', () => {
  // Another minute is something to a 4-minute sear and nothing to a 3-hour
  // braise, and a button that adds a meaningless amount gets pressed six times.
  assert.equal(bumpSeconds(240), 60);
  assert.equal(bumpSeconds(1200), 120);
  assert.equal(bumpSeconds(3600), 300);
  assert.equal(bumpSeconds(10800), 600);
});

test('the slack offered on the pill is the slack the recipe promised', () => {
  // The note under the start button says "up to 5 min more if it needs it", so
  // the button that appears when it rings has to read +5 min. Two different
  // numbers for the same allowance is one number too many to think about with
  // a pan going.
  const { slack } = ringWords(stepTiming('Simmer 20-25 minutes until tender.'));
  assert.equal(slack, 'up to 5 min more if it needs it');
});

/* ------------------------------------------------------------------ *
 * The count itself
 * ------------------------------------------------------------------ */

test('no timer in the collection promises slack the step did not give', () => {
  for (const recipe of recipes) {
    for (const step of recipe.steps || []) {
      const { seconds, upto } = stepTiming(step);
      if (!seconds) continue;
      assert.ok(upto >= seconds, `${recipe.id}: an upper bound below the ring time`);
      assert.match(step, /\d/, `${recipe.id}: a timer from a step with no number`);
    }
  }
});

test('a long soak is a plan for tomorrow, not a timer for tonight', () => {
  assert.equal(stepTiming('refrigerate 8 hours or overnight').seconds, 0);
  // But the watchable part of a step that also mentions one is still offered.
  assert.equal(stepTiming('Bake 50 minutes, then chill 8 hours before serving.').seconds, 50 * 60);
});

test('a good share of steps can offer a timer at all', () => {
  const steps = recipes.flatMap(r => r.steps || []);
  const timed = steps.filter(s => stepTiming(s).seconds > 0).length;
  assert.ok(timed / steps.length > 0.2, `only ${timed} of ${steps.length} steps parsed a timer`);
});

test('most timers know what they are waiting for', () => {
  // Not a target, a smoke alarm: if the cue regex breaks, every pill quietly
  // falls back to "it should be about ready" and the feature is gone without
  // anything failing.
  const timed = recipes.flatMap(r => (r.steps || []).map(s => stepTiming(s))).filter(t => t.seconds);
  const withCue = timed.filter(t => t.cue).length;
  assert.ok(withCue / timed.length > 0.3,
    `only ${withCue} of ${timed.length} timers found something to look for`);
});

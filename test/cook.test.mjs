/**
 * Tests for the bits of cook mode that are guesses.
 *
 * The timer and the step icons are both derived from prose written for a human
 * cook, so they are the two places the screen can be confidently wrong. A timer
 * that reads 10 seconds for "simmer 30-35 minutes" is worse than no timer, and
 * an icon for an ingredient the step never mentions is worse than no icon.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const ingredients = read('data/ingredients.json').items;
const ingIndex = new Map(ingredients.map(i => [i.id, i]));
const recipes = [
  ...read('data/recipes.dinners.json').recipes,
  ...read('data/recipes.daily.json').recipes,
  ...read('data/recipes.occasions.json').recipes
];

/* The two functions under test are pure and free of DOM access, but they live
 * in modules that import ui.js. Re-declaring them here would test a copy, so
 * they are pulled in with a stub for the one browser global those imports
 * touch at load time. */
globalThis.window ??= {};
globalThis.document ??= { createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }) };

const { parseDuration, formatClock } = await import('../js/views/cook.js');
const { stepTiming } = await import('../js/step-timing.js');
const { ingredientsNamedIn } = await import('../js/food-icon.js');

test('a range rings at its lower bound, and keeps the upper as slack', () => {
  // This used to ring at the top of the range, on the reasoning that going off
  // early teaches people to ignore the timer. That was the wrong way round.
  // Arriving early with a spoon costs nothing; arriving at the top of the range
  // is how a thing gets overcooked, and it turns the bell into a verdict on
  // food the cook has not looked at yet. It rings at the bottom now and carries
  // the top along, so the pill can offer the remaining minutes rather than
  // imply they have been used up.
  assert.equal(parseDuration('Cook 10-12 minutes, stirring now and then'), 10 * 60);
  assert.equal(parseDuration('simmer 30-35 minutes until tender'), 30 * 60);
  assert.equal(parseDuration('roast 20 to 25 minutes'), 20 * 60);

  assert.deepEqual(stepTiming('roast 20 to 25 minutes'), { seconds: 1200, upto: 1500, cue: '' });
  // A single number has no slack to offer and must not invent any.
  assert.equal(stepTiming('bake 45 min').upto, 45 * 60);
});

test('durations are read in whatever unit the step used', () => {
  assert.equal(parseDuration('Cook 60 seconds until fragrant'), 60);
  assert.equal(parseDuration('let it fry undisturbed for 90 seconds'), 90);
  assert.equal(parseDuration('rest 1 hr before slicing'), 3600);
  assert.equal(parseDuration('bake 45 min'), 45 * 60);
});

test('the longest duration in a step wins', () => {
  // A step that browns for 2 minutes then simmers for 20 needs the 20.
  assert.equal(parseDuration('Brown for 2 minutes, then simmer 20 minutes'), 20 * 60);
});

test('a step with no time in it gets no timer', () => {
  assert.equal(parseDuration('Season with salt and pepper to taste'), 0);
  assert.equal(parseDuration('Serves 4 people'), 0);
});

test('long cooks get a timer now that timers outlive the screen', () => {
  // This used to stop at an hour, because a timer that died the moment you left
  // cook mode was no use to a braise — you would be somewhere else when it went
  // off. Timers now live outside every view and are written to storage, so they
  // survive navigation and a closed tab, and a two-hour braise is exactly the
  // thing worth being told about.
  assert.equal(parseDuration('bake 90 minutes'), 90 * 60);
  assert.equal(parseDuration('braise 3 hours'), 3 * 3600);
  // An overnight soak is a plan for tomorrow rather than a timer for tonight.
  assert.equal(parseDuration('refrigerate 8 hours or overnight'), 0);
});

test('the clock reads like a clock', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(9), '0:09');
  assert.equal(formatClock(60), '1:00');
  assert.equal(formatClock(725), '12:05');
});

test('a step is illustrated only with ingredients it names', () => {
  const lines = [
    { ing: 'ing.onion.yellow' }, { ing: 'ing.carrot' }, { ing: 'ing.celery' },
    { ing: 'ing.garlic' }, { ing: 'ing.lentil.brown' }
  ];
  const found = ingredientsNamedIn(
    'Add onion, carrot, celery and a pinch of salt.', lines, ingIndex
  ).map(i => i.id);

  assert.deepEqual(found, ['ing.onion.yellow', 'ing.carrot', 'ing.celery'],
    'named in the order the step names them');
  assert.ok(!found.includes('ing.lentil.brown'), 'lentils are not in this step');
});

test('a step naming nothing recognisable draws nothing', () => {
  const lines = [{ ing: 'ing.onion.yellow' }, { ing: 'ing.carrot' }];
  assert.deepEqual(ingredientsNamedIn('Taste and adjust.', lines, ingIndex), []);
});

test('salt and oil are too common to identify a step', () => {
  // Almost every step mentions one of them; matching on them would put the
  // same two icons on the whole recipe.
  const lines = [{ ing: 'ing.salt.kosher' }, { ing: 'ing.oil.olive' }, { ing: 'ing.broccoli' }];
  const found = ingredientsNamedIn('Toss the broccoli with olive oil and salt.', lines, ingIndex);
  assert.deepEqual(found.map(i => i.id), ['ing.broccoli']);
});

test('no step in the collection claims a duration it does not have', () => {
  // A cheap guard against a parser change that starts inventing timers: every
  // timer offered must correspond to a number actually written in the step.
  for (const recipe of recipes) {
    for (const step of recipe.steps || []) {
      const seconds = parseDuration(step);
      if (!seconds) continue;
      assert.match(step, /\d/, `${recipe.id}: timer from a step with no number`);
      assert.ok(seconds <= 14400, `${recipe.id}: ${seconds}s is longer than any single cooking step`);
    }
  }
});

test('a good share of steps get a timer at all', () => {
  // Not a target, a smoke alarm: if a regex change drops this to zero, the
  // feature is silently gone and every step looks the same.
  const steps = recipes.flatMap(r => r.steps || []);
  const timed = steps.filter(s => parseDuration(s) > 0).length;
  assert.ok(timed / steps.length > 0.2,
    `only ${timed} of ${steps.length} steps parsed a timer`);
});

/**
 * timeline.test.mjs — the schedule a recipe never tells you.
 *
 * Most of these are bugs found by running the model over all 242 recipes and
 * reading what it claimed. Every one is here as the *shape* of the mistake
 * rather than the specific sentence, so the next thing that gets a step's
 * attention-cost wrong fails here rather than in somebody's kitchen.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  stepShape, timeline, freeWindows, timelineWords, worthDrawing, needsAhead, hoursWords
} from '../js/timeline.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const recipes = read('data/recipes.index.json').parts
  .map(p => read(p.file)).flatMap(p => p.recipes);

/* ------------------------------------------------------------------ *
 * What a step costs you
 * ------------------------------------------------------------------ */

test('a step with no stated time is work, not zero minutes of waiting', () => {
  const s = stepShape('Toss the broccoli with olive oil and a pinch of salt.');
  assert.equal(s.kind, 'work');
  assert.equal(s.minutes, 0);
});

test('a covered simmer is time you are free, however it is worded', () => {
  // "cover partway" — an order, not the adjective "covered". Matching only the
  // adjective called the single biggest free window in the collection's most
  // cooked dish hands-on time.
  const s = stepShape('Bring to a simmer, cover partway, and cook 30-35 minutes until the lentils are tender.');
  assert.equal(s.kind, 'away');
  assert.equal(s.minutes, 30, 'the lower bound is when to look');
});

test('"uncovered" is not read as "covered"', () => {
  const s = stepShape('Cook uncovered 20 minutes, stirring often, until it thickens.');
  assert.equal(s.kind, 'attend');
});

test('the sentence outranks the verb when it says you are needed', () => {
  const s = stepShape('Simmer 20 minutes, stirring often.');
  assert.equal(s.kind, 'attend', 'simmer usually means free — but not this one');
});

test('the verb that owns the clock wins, not the first verb in the sentence', () => {
  // Opens with a wait and describes eight minutes of standing at a pan.
  const s = stepShape('Preheat the oven to 400°F. Sauté the onion 8 minutes until soft.');
  assert.equal(s.kind, 'attend');
});

test('broiling is never free time', () => {
  const s = stepShape('Broil 4 minutes until the top blisters.');
  assert.equal(s.kind, 'attend', 'thirty seconds is the whole margin under a broiler');
});

/* ------------------------------------------------------------------ *
 * The schedule
 * ------------------------------------------------------------------ */

test('a "meanwhile" step runs alongside the step before it, not after it', () => {
  const tl = timeline({
    steps: [
      'Heat the oil and cook the onion 10 minutes until soft.',
      'Simmer the sauce, covered, 30 minutes until thick.',
      'Meanwhile, cook the pasta in well-salted water.',
      'Toss the drained pasta into the sauce.'
    ]
  });
  const pasta = tl.blocks[2];
  const simmer = tl.blocks[1];
  assert.equal(pasta.lane, 1);
  assert.equal(pasta.at, simmer.at,
    'scheduling it afterward tells somebody to boil the water once the sauce is done');
});

test('the step after a "meanwhile" returns to the main thread', () => {
  const tl = timeline({
    steps: [
      'Simmer, covered, 30 minutes.',
      'Meanwhile, mash the butter with the miso.',
      'Pull the bay leaf and stir in the balsamic.'
    ]
  });
  assert.equal(tl.blocks[2].lane, 0, 'the sauce is not part of the butter errand');
});

/* ------------------------------------------------------------------ *
 * Free windows — the whole point
 * ------------------------------------------------------------------ */

test('a window does not run through a step that needs your hands', () => {
  // Press the tofu 15 min, toss it in cornstarch, roast 22 min. The tossing has
  // no stated duration and absolutely has your hands; a window spanning all
  // three offered 37 free minutes that do not exist.
  const tl = timeline({
    steps: [
      'Press the tofu between paper towels 15 minutes.',
      'Toss the tofu cubes with cornstarch until every face is chalky-dry.',
      'Roast 22-25 minutes, flipping once.'
    ]
  });
  const longest = tl.longest;
  assert.ok(longest.minutes <= 22, `claimed ${longest.minutes} free minutes across a hands-on step`);
});

test('a minute of something undisturbed is a beat, not a window', () => {
  const windows = freeWindows([
    { step: 0, lane: 0, at: 0, minutes: 1, kind: 'away', cue: 'it turns brick red' },
    { step: 1, lane: 0, at: 1, minutes: 30, kind: 'away', cue: 'the lentils are tender' }
  ]);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].minutes, 30, 'the 90-second fry is not part of the free stretch');
  assert.match(windows[0].cue, /lentils/, 'the cue belongs to the block that dominates the window');
});

test('consecutive waits merge into the one window they really are', () => {
  const windows = freeWindows([
    { step: 0, lane: 0, at: 0, minutes: 12, kind: 'away', cue: '' },
    { step: 1, lane: 0, at: 12, minutes: 12, kind: 'away', cue: '' }
  ]);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].minutes, 24, 'two twelves back to back is twenty-four free minutes');
});

/* ------------------------------------------------------------------ *
 * Saying it out loud
 * ------------------------------------------------------------------ */

test('the words never claim a total that contradicts the recipe', () => {
  // A chia pudding: 5 minutes on the header, three hours in the fridge. The
  // first version produced "add up to 185 minutes, inside the 5 the recipe
  // gives start to finish" — not merely awkward, arithmetically absurd.
  const recipe = {
    totalMin: 5,
    steps: ['Whisk the chia into the milk.', 'Chill 3 hours until set.']
  };
  const words = timelineWords(timeline(recipe), recipe);
  assert.doesNotMatch(words, /inside the 5\b/, words);
  assert.match(words, /more than the 5/);
});

test('a long wait is described as a constraint on the day, not a coffee break', () => {
  const recipe = { totalMin: 60, steps: ['Mix it.', 'Chill 4 hours until firm.'] };
  const tl = timeline(recipe);
  assert.ok(needsAhead(tl));
  assert.match(timelineWords(tl, recipe), /well ahead|has to sit/);
});

test('minutes are pluralized like a person would', () => {
  assert.equal(hoursWords(40), '40 minutes');
  assert.equal(hoursWords(60), '60 minutes');
  assert.equal(hoursWords(120), '2 hours');
  assert.equal(hoursWords(200), '3 hours 20 minutes');
});

/* ------------------------------------------------------------------ *
 * Against the whole collection
 * ------------------------------------------------------------------ */

test('the chart is offered for a useful share of the collection', () => {
  const drawn = recipes.filter(r => worthDrawing(timeline(r))).length;
  assert.ok(drawn >= 140, `only ${drawn} of ${recipes.length} recipes get a timeline`);
});

test('a free window is never longer than the schedule it sits inside', () => {
  // Deliberately not compared against the recipe's own totalMin: a chill or an
  // overnight soak legitimately exceeds it, because the header counts the work
  // and the fridge is not work. That gap is a feature — it is how the app can
  // say "this is not a start-at-six dish".
  for (const r of recipes) {
    const tl = timeline(r);
    if (!tl.longest) continue;
    assert.ok(tl.longest.minutes <= tl.statedMin,
      `${r.id}: a ${tl.longest.minutes} min window in a ${tl.statedMin} min schedule`);
  }
});

test('no minute is counted twice', () => {
  // Against total work rather than wall-clock: with a parallel thread the two
  // legitimately differ, since twenty-four minutes of evening can contain
  // twenty-eight minutes of cooking. Comparing to statedMin instead failed on
  // exactly that case, and the model was right.
  for (const r of recipes) {
    const tl = timeline(r);
    const work = tl.blocks.reduce((n, b) => n + b.minutes, 0);
    assert.ok(tl.handsOnMin + tl.freeMin <= work,
      `${r.id}: ${tl.handsOnMin} + ${tl.freeMin} > ${work} minutes of actual steps`);
    assert.ok(tl.statedMin <= work, `${r.id}: schedule longer than the sum of its steps`);
  }
});

test('an accented verb is still a verb', () => {
  // \b is defined on [A-Za-z0-9_], so \bsauté\b can never match "sauté" —
  // there is no boundary between "é" and the space. Every sautéing step in the
  // collection fell through to the diagram's "Then" fallback until this was found.
  assert.equal(stepShape('Sauté the onion 8 minutes until soft.').verb, 'Sauté');
});

test('every timeline can be said in words without an empty clause', () => {
  for (const r of recipes) {
    const tl = timeline(r);
    if (!worthDrawing(tl)) continue;
    const words = timelineWords(tl, r);
    assert.ok(words.length > 40, `${r.id}: "${words}"`);
    assert.doesNotMatch(words, /\bundefined\b|\bNaN\b|\s,|\bnull\b/, `${r.id}: "${words}"`);
    assert.doesNotMatch(words, /\b0 (?:minutes|of those)\b/, `${r.id} says zero of something: "${words}"`);
  }
});

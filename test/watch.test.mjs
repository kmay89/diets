/**
 * Tests for what crosses to the wrist.
 *
 * The watch is the one place in this app where a wrong number cannot be
 * corrected by looking harder. There is no second screen, no scrolling back,
 * and the person reading it has both hands in a bowl — so the two things tested
 * here are the two that would silently produce a wrong one.
 *
 * First, timers must travel as absolute end times rather than as seconds
 * remaining. A payload saying "4:12 left" is wrong the moment it arrives late,
 * and a Bluetooth link to a sleeping watch delivers late as a matter of course.
 * Sending `endsAt` lets the watch count on its own clock and be right with the
 * phone asleep, in another room, or off.
 *
 * Second, the payload has to stay small. It crosses to a device with a small
 * battery, and the failure mode of a fat one is not an error — it is a watch
 * that updates a few seconds after everybody stopped looking.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window ??= {};
globalThis.document ??= {
  documentElement: { classList: { add() {} } },
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} })
};
globalThis.localStorage ??= {
  _v: {},
  getItem(k) { return this._v[k] ?? null; },
  setItem(k, v) { this._v[k] = String(v); },
  removeItem(k) { delete this._v[k]; }
};

const { snapshot, applyCommand, setWatchStep, clearWatchStep, hasWatch } =
  await import('../js/watch.js');
const { startTimer, clearAllTimers, pauseTimer, clearTimer, timerFor } = await import('../js/timers.js');

const state = (over = {}) => ({ customItems: [], checked: {}, ...over });

test('with no watch paired, nothing here does anything', () => {
  // The normal case by a wide margin. Most people do not own one, and the web
  // has no watch at all.
  assert.equal(hasWatch(), false);
  assert.doesNotThrow(() => setWatchStep({ recipe: 'x', index: 0, total: 1, text: 'y', wants: [] }));
  assert.doesNotThrow(() => clearWatchStep());
});

test('a timer crosses as an end time, never as a countdown', () => {
  // The whole reason the watch stays correct with the phone out of range. A
  // number of seconds is stale on arrival; a wall-clock end time is not.
  clearAllTimers();
  startTimer({ id: 't1', label: 'Bolognese · simmer', seconds: 600, cue: 'the lentils are tender' });

  const [t] = snapshot(state()).timers;
  assert.equal(t.id, 't1');
  assert.equal(t.cue, 'the lentils are tender');
  assert.ok(typeof t.endsAt === 'number', 'no absolute end time — the watch cannot count');
  assert.ok(t.endsAt > Date.now(), 'the end time is already in the past');
  clearAllTimers();
});

test('a paused timer sends no end time, because there is not one', () => {
  clearAllTimers();
  startTimer({ id: 't2', label: 'x', seconds: 300 });
  pauseTimer('t2');

  const [t] = snapshot(state()).timers;
  assert.equal(t.endsAt, null, 'a paused pot was given a moment it would go off');
  assert.equal(t.paused, true);
  assert.ok(t.left > 0, 'a paused timer must still say how much is left');
  clearAllTimers();
});

test('the payload stays small enough to arrive while somebody is looking', () => {
  clearAllTimers();
  for (let i = 0; i < 20; i++) startTimer({ id: `t${i}`, label: `Timer ${i}`, seconds: 600 + i });

  const items = Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, name: `Item ${i}`, qty: '1' }));
  setWatchStep({
    recipe: 'Weeknight Lentil Bolognese',
    index: 3, total: 9,
    text: 'Add the crushed tomatoes and the broth, and simmer.',
    wants: [{ name: 'Crushed tomatoes', amount: '1 can' }, { name: 'Broth', amount: '2 cups' }]
  });

  const snap = snapshot(state({ customItems: items }));
  assert.ok(snap.timers.length <= 6, 'every timer ever started was sent');
  assert.ok(snap.list.length <= 60, 'the whole shopping list was sent');

  const bytes = JSON.stringify(snap).length;
  assert.ok(bytes < 8000, `payload is ${bytes} bytes — too much for a wrist`);
  clearWatchStep();
  clearAllTimers();
});

test('a finished timer still crosses, because that is the one you need', () => {
  clearAllTimers();
  startTimer({ id: 't3', label: 'x', seconds: 60 });
  const t = timerFor('t3');
  assert.ok(t);
  clearAllTimers();
});

/* ------------------------------------------------------------------ *
 * What the wrist can ask for
 * ------------------------------------------------------------------ */

test('the watch can pause, extend and clear a timer', () => {
  clearAllTimers();
  startTimer({ id: 't4', label: 'x', seconds: 600 });

  assert.equal(applyCommand({ type: 'timer.toggle', id: 't4' }), true);
  assert.equal(timerFor('t4').paused, true, 'pause from the wrist did nothing');

  assert.equal(applyCommand({ type: 'timer.more', id: 't4', seconds: 120 }), true);
  assert.equal(applyCommand({ type: 'timer.clear', id: 't4' }), true);
  assert.equal(timerFor('t4'), null, 'clear from the wrist did nothing');
});

test('advancing the step is asked of the phone, never decided on the watch', () => {
  // Two devices each keeping their own idea of the current step is two devices
  // that will eventually disagree, in a kitchen, out loud.
  const moves = [];
  assert.equal(applyCommand({ type: 'step.next' }, { onStep: (d) => moves.push(d) }), true);
  assert.equal(applyCommand({ type: 'step.back' }, { onStep: (d) => moves.push(d) }), true);
  assert.deepEqual(moves, [1, -1]);
});

test('an unknown command is ignored rather than guessed at', () => {
  // The watch app and the web app ship on different schedules through different
  // review queues. A newer watch asking an older phone for something must be a
  // no-op, not an exception in the middle of cooking.
  assert.equal(applyCommand({ type: 'recipe.delete', id: 'rec.x' }), false);
  assert.equal(applyCommand({}), false);
  assert.equal(applyCommand(), false);
});

/* ------------------------------------------------------------------ *
 * The step
 * ------------------------------------------------------------------ */

test('the step carries its amounts, because that is what you cannot see', () => {
  setWatchStep({
    recipe: 'Weeknight Lentil Bolognese',
    index: 3, total: 9,
    text: 'Add the crushed tomatoes.',
    wants: [{ name: 'Crushed tomatoes', amount: '1 can' }]
  });
  const snap = snapshot(state());
  assert.equal(snap.step.recipe, 'Weeknight Lentil Bolognese');
  assert.equal(snap.step.index, 3);
  assert.deepEqual(snap.step.wants, [{ name: 'Crushed tomatoes', amount: '1 can' }]);
  clearWatchStep();
});

test('leaving cook mode clears the step rather than leaving it on the wrist', () => {
  // A step from a dish that came off the heat an hour ago is worse than a blank
  // watch face, because it looks current.
  setWatchStep({ recipe: 'x', index: 0, total: 2, text: 'y', wants: [] });
  clearWatchStep();
  assert.equal(snapshot(state()).step, null);
});

/* ------------------------------------------------------------------ *
 * Starting the step's timer from the wrist
 * ------------------------------------------------------------------ */

test('the wrist can start the step\'s timer, on the step\'s own terms', () => {
  // The button somebody was about to walk across the kitchen for. The terms
  // come from the step rather than from the watch — a wrist is no place to
  // pick a duration, and one picked there would not carry the cue or the slack.
  clearAllTimers();
  setWatchStep({
    recipe: 'x', index: 0, total: 2, text: 'Cook 10-12 minutes.', wants: [],
    timer: {
      id: 'rec.x:0', seconds: 600, upto: 720,
      cue: 'the onion is golden', label: 'x · cook', step: 0, recipeId: 'rec.x'
    }
  });

  assert.equal(applyCommand({ type: 'timer.start' }), true);
  const started = timerFor('rec.x:0');
  assert.ok(started, 'nothing started');
  assert.equal(started.cue, 'the onion is golden', 'the cue was left behind');
  assert.equal(started.upto, 720, 'the slack was left behind');
  clearWatchStep();
  clearAllTimers();
});

test('a step with no timer offers none, and asking for one does nothing', () => {
  clearAllTimers();
  setWatchStep({ recipe: 'x', index: 0, total: 2, text: 'Season to taste.', wants: [], timer: null });
  assert.equal(applyCommand({ type: 'timer.start' }), false,
    'a step with no timer invented one');
  clearWatchStep();
});

test('a timer already counting is not offered again', () => {
  // Starting one from the watch does not redraw cook mode, so whether the offer
  // still stands has to be decided when the snapshot is taken. Baked in at
  // publish time, the wrist went on showing "Start 10 min" beside a pot that
  // had been counting for four minutes — which is how a timer gets started
  // twice and the pasta gets ten extra minutes.
  clearAllTimers();
  const timer = { id: 'rec.y:2', seconds: 600, upto: 720, cue: 'golden', label: 'y · cook' };
  setWatchStep({ recipe: 'y', index: 2, total: 5, text: 'Cook 10 minutes.', wants: [], timer });

  assert.equal(snapshot(state()).step.timer.seconds, 600, 'not offered before it was started');
  applyCommand({ type: 'timer.start' });
  assert.equal(snapshot(state()).step.timer, null, 'still on offer while it was counting');

  clearTimer('rec.y:2');
  assert.equal(snapshot(state()).step.timer.seconds, 600, 'not offered again after being stopped');
  clearWatchStep();
  clearAllTimers();
});

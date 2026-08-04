/**
 * Tests for the seam between the web app and an app shell around it.
 *
 * The thing that must not break is the web. This app is a static site with no
 * build step and no runtime dependencies, and adding an iOS target is only
 * worth it if the deployed site is byte for byte what it was — so the first
 * test here is simply that with no `window.Capacitor` present, every function
 * is inert and nothing throws.
 *
 * The second thing is notification identity. iOS wants an integer id and the
 * app thinks in strings like "rec.lentil-bolognese:4". If that mapping is not
 * stable across launches, canceling stops working and a kitchen ends up with a
 * pile of duplicate alarms for a pot that came off the heat an hour ago — which
 * is exactly the behavior that gets notification permission revoked.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

globalThis.window ??= {};
globalThis.document ??= {
  documentElement: { classList: { add() {} } },
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} })
};

const native = await import('../js/native.js');

/* ------------------------------------------------------------------ *
 * The web is unchanged
 * ------------------------------------------------------------------ */

test('with no app shell present, nothing is native and nothing throws', () => {
  assert.equal(native.isNative(), false);
  assert.equal(native.platform(), 'web');

  // Every entry point, called on a plain page. None of these may reject or
  // throw: a browser is the normal case, not the degraded one.
  assert.doesNotThrow(() => native.haptic('light'));
  assert.doesNotThrow(() => native.paintStatusBar(true));
  assert.equal(native.initNative(), false);
  assert.doesNotThrow(() => native.onNotificationTap(() => {}));
});

test('the async entry points resolve to a plain no rather than rejecting', async () => {
  assert.equal(await native.ensureNotifications(), false);
  assert.equal(await native.notifyAt('t', Date.now() + 60000, { title: 'x', body: 'y' }), false);
  await native.cancelNotification('t');   // must not reject
});

test('the seam imports no package, so the site keeps its zero-build promise', () => {
  // The moment this file imports '@capacitor/core', the app needs a bundler and
  // the whole architecture changes. The native runtime injects a global into
  // the WebView instead, which is what makes one codebase serve both targets.
  const source = readFileSync(join(root, 'js/native.js'), 'utf8');
  assert.doesNotMatch(source, /from\s+['"]@capacitor/,
    'native.js imports a package — that would require a build step');
  assert.match(source, /window\.Capacitor/);
});

test('no other module in the app reaches for the native runtime directly', () => {
  // One seam, not fifteen. A view that checks the platform for itself is a view
  // that behaves differently in the two targets for reasons nobody remembers.
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else if (entry.name.endsWith('.js')) files.push(join(dir, entry.name));
    }
  };
  walk('js');

  for (const file of files) {
    if (file.endsWith('native.js')) continue;
    const source = readFileSync(join(root, file), 'utf8');
    assert.doesNotMatch(source, /window\.Capacitor|Capacitor\.Plugins/,
      `${file} talks to the native runtime directly instead of through native.js`);
  }
});

/* ------------------------------------------------------------------ *
 * Notification identity
 * ------------------------------------------------------------------ */

test('a timer id maps to the same number every time', () => {
  // Cancel works by id. If the mapping drifts between launches, a paused pot
  // keeps its alarm and the kitchen gets told about dinner it already ate.
  const id = 'rec.lentil-bolognese:4';
  assert.equal(native.numericId(id), native.numericId(id));
  assert.equal(native.numericId(id), native.numericId(String(id)));
});

test('different timers get different numbers', () => {
  // Two pots on at once is the normal case, not the edge case, and a collision
  // means starting the second one silently cancels the first.
  const ids = [];
  for (const recipe of ['rec.a', 'rec.b', 'rec.lentil-bolognese', 'rec.shakshuka']) {
    for (let step = 0; step < 24; step++) ids.push(native.numericId(`${recipe}:${step}`));
  }
  assert.equal(new Set(ids).size, ids.length, 'two timers would share a notification');
});

test('every id is a positive integer iOS will accept', () => {
  for (const id of ['rec.a:0', 'x', '', 'rec.very-long-recipe-name-indeed:19', '🌿:3']) {
    const n = native.numericId(id);
    assert.ok(Number.isInteger(n), `${id} produced ${n}`);
    assert.ok(n >= 0 && n < 2147483647, `${id} produced ${n}, which is out of range`);
  }
});

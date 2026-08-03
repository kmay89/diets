/**
 * Tests for the home-screen invitation.
 *
 * The words matter more than the code here: on an iPhone there is no install
 * prompt to fire, so the banner has to name the two buttons people actually
 * have to press — Share, then "Add to Home Screen" — or it is an instruction
 * to do something that does not exist.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installRoute, bannerCopy } from '../js/install.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

test('iPadOS is not mistaken for a desktop Mac', () => {
  assert.equal(installRoute(IPHONE, 0), 'ios');
  // An iPad reports itself as a Mac; the touchscreen is the only tell.
  assert.equal(installRoute(IPAD, 5), 'ios');
  assert.equal(installRoute(MAC, 0), 'desktop');
  assert.equal(installRoute(ANDROID, 5), 'android');
});

test('the iPhone banner names Share and Add to Home Screen', () => {
  const copy = bannerCopy('ios', false);
  assert.match(copy.line, /Share/);
  assert.match(copy.line, /Add to Home Screen/i);
  // "Install" is not a word that appears anywhere in iOS Safari.
  assert.doesNotMatch(copy.line, /install/i);
});

test('a browser that can be asked outright gets a button, not a lesson', () => {
  const copy = bannerCopy('android', true);
  assert.equal(copy.action, 'Add');
  assert.doesNotMatch(copy.line, /menu/i);
});

test('every route has banner copy and an action label', () => {
  for (const route of ['ios', 'android', 'desktop']) {
    const copy = bannerCopy(route, false);
    assert.ok(copy.line.length > 20, `${route}: banner line too thin`);
    assert.ok(copy.action.length, `${route}: no action label`);
  }
});

test('the banner ships dismissible', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /id="install-dismiss"/, 'no dismiss control in the banner');
  assert.match(html, /id="install-text"/, 'banner copy is not addressable');

  // Dismissing has to take the toolbar button with it, or the invitation is
  // still sitting there after you said no.
  const js = readFileSync(join(root, 'js/install.js'), 'utf8');
  const paint = js.match(/function paint\(\)\{?([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(paint, /banner\.hidden = hide/);
  assert.match(paint, /btn\.hidden = hide/);
});

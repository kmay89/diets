/**
 * Tests for the stylesheet's own footguns.
 *
 * The tab-bar labels vanished on a phone because a rule 800 lines below the tab
 * bar reset `font: inherit` on `.tabbar__item`. The shorthand quietly took the
 * `font-size: .68rem` and the active `font-weight: 600` with it, every label
 * jumped to the body's 16px, and the row grew from 56px to 66px — past the 62px
 * `--tabbar-h` the layout reserves for it. On a device with a home indicator
 * that overflow put the labels underneath the screen edge.
 *
 * Nothing about that was visible in the rule that caused it. So the shape of
 * the mistake is what gets tested: a `font:` shorthand landing after a
 * `font-size` for the same selector.
 *
 * ERRERLabs — MIT licensed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'css/app.css'), 'utf8');

/** [{ selector, body, index }] for every rule, in source order. */
function rules(source) {
  const out = [];
  for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // Only the last line of the match is the selector; anything above it is a
    // preceding declaration block's tail or an at-rule opener.
    const selector = m[1].trim().split('\n').pop().trim();
    if (!selector || selector.startsWith('@')) continue;
    for (const one of selector.split(',').map(s => s.trim()).filter(Boolean)) {
      out.push({ selector: one, body: m[2], index: m.index });
    }
  }
  return out;
}

test('no `font:` shorthand lands after a font-size for the same selector', () => {
  const lastSize = new Map();
  const offenders = [];

  for (const { selector, body, index } of rules(css)) {
    if (/(^|[^-\w])font-size\s*:/.test(body)) lastSize.set(selector, index);
    // The shorthand — `font: inherit`, `font: 12px/1 sans` — but not
    // `font-size`, `font-weight`, `font-family` and friends.
    if (/(^|[^-\w])font\s*:/.test(body)) {
      const size = lastSize.get(selector);
      if (size != null && index > size) {
        offenders.push(`${selector}: \`font:\` at ${index} undoes font-size at ${size}`);
      }
    }
  }

  assert.deepEqual(offenders, [],
    `a font shorthand is silently resetting an earlier font-size:\n  ${offenders.join('\n  ')}`);
});

test('the tab bar keeps its own type scale', () => {
  const bar = rules(css).filter(r => r.selector.includes('tabbar__item'));
  assert.ok(bar.length, 'no .tabbar__item rules found');

  // Whatever resets the More button must not reach the four links' font.
  for (const { selector, body } of bar) {
    if (/(^|[^-\w])font\s*:/.test(body)) {
      assert.ok(selector.startsWith('button'),
        `${selector} sets the font shorthand; scope it to button.tabbar__item`);
    }
  }
  assert.ok(bar.some(r => /font-size\s*:\s*\.68rem/.test(r.body)),
    '.tabbar__item lost its font-size');
});

test('--tabbar-h matches what the body reserves for it', () => {
  // The bar is fixed; the body pads itself by --tabbar-h so the last card is
  // reachable. If the two ever disagree the bar eats the end of every page.
  assert.match(css, /--tabbar-h:\s*62px/);
  assert.match(css, /padding-bottom:\s*calc\(var\(--tabbar-h\)/);
});

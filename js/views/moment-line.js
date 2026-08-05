/**
 * moment-line.js — the table advice, drawn under the step it belongs to.
 *
 * One component, used by the method on the recipe page and by cook mode, so the
 * two cannot end up saying different things about the same minute.
 *
 * The tone is the whole design. "Set the table now" printed under a step is an
 * order and reads as a chore; "you have about 30 minutes here — worth doing
 * now: set the table, warm the plates" is somebody noticing you have a free
 * hand. Same words afterward, completely different sentence in front of them,
 * and the difference is a fact the app worked out rather than a nicety.
 *
 * Tapping opens the reason, because every one of these has a real mechanism
 * behind it — a hot dish on a cold plate loses ten degrees before anybody picks
 * up a fork — and a suggestion you cannot interrogate is just a nag.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, sheet } from '../ui.js';
import { momentLede } from '../cook-moments.js';

/**
 * @param moment one entry from momentsFor()
 * @param tone 'page' on the recipe screen, 'cook' on the dark cooking screen
 */
export function momentLine(moment, { tone = 'page' } = {}) {
  if (!moment?.marks?.length) return null;

  return h(`div.moment.moment--${tone}`,
    h('p.moment__lede',
      moment.window ? h('span.moment__clock', '⏳') : h('span.moment__clock', '🍽'),
      momentLede(moment)
    ),
    h('div.moment__marks', ...moment.marks.map(mark => h('button.moment__mark', {
      type: 'button',
      onclick: () => sheet(mark.title, h('div', h('p.lede', mark.body)))
    }, mark.title)))
  );
}

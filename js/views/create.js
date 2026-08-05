/**
 * create.js (view) — four ways into a meal, on one screen.
 *
 * The app grew several front doors — the dice, the pantry, the collection, the
 * plate — and they were scattered across the tab bar and the More sheet, which
 * left the honest answer to "how do I start" as "it depends". This screen is
 * that answer written down: pick the decision you are actually able to make
 * right now, and it takes you to the tool built around it.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount } from '../ui.js';
import { getDb } from '../data.js';
import { foodIcon } from '../food-icon.js';
import { play } from '../feedback.js';
import { getState } from '../store.js';

/** Each way in, and the two ingredients that stand for it. */
const ENTRIES = [
  {
    href: '#/roll',
    name: 'Roll the dice',
    body: 'Say how many dinners you need and let it deal you a hand that fits the week, the season and the pantry. Lock what you like, re-roll the rest.',
    icons: ['ing.tomato.roma', 'ing.lentil.brown'],
    tint: 'green'
  },
  {
    href: '#/plate',
    name: 'Build a plate',
    body: 'Four quarters: grain, vegetable, protein, finish. Watch the heart-forward numbers move as you fill them, then find the dinners that match.',
    icons: ['ing.broccoli', 'ing.farro'],
    tint: 'gold'
  },
  {
    href: '#/pantry',
    name: 'From my kitchen',
    body: 'Tick what you already have. Meals that lean on it come up the roll, and the shopping list stops asking you to buy it again.',
    icons: ['ing.beans.cannellini', 'ing.lemon'],
    tint: 'clay'
  },
  {
    href: '#/new',
    name: 'Add your own',
    body: 'Paste one in from anywhere, or press it together here. Either way it ends up in the same shape as the rest, so it gets the flavor panel, cook mode and the diagram like any other dish.',
    icons: ['ing.flour.ap', 'ing.egg'],
    tint: 'green'
  },
  {
    href: '#/browse',
    name: 'Start from a recipe',
    body: 'Browse the collection, then fork it at the table — the vegetarian base everyone eats, and one extra pan for whoever wants meat.',
    icons: ['ing.salmon', 'ing.kale.lacinato'],
    tint: 'slate'
  }
];

export function render(root, { navigate }) {
  mount(root, view(navigate));
}

function view(navigate) {
  const state = getState();
  const { ingIndex } = getDb();
  const planned = state.plan.length;

  return h('section.view',
    h('div.view__head',
      h('div',
        h('p.eyebrow', 'Create'),
        h('h1.view__title', 'Where would you like', h('br'), 'to ', h('em', 'start'), '?'),
        h('p.view__sub', planned
          ? `${planned} meal${planned === 1 ? '' : 's'} on the plan already. Anything you add joins them.`
          : 'Nothing planned yet — any of these will get the week going.')
      )
    ),

    h('div.entries', ...ENTRIES.map(e => entryCard(e, ingIndex, navigate))),

    h('p.fine-print', 'However you start, the result lands in the same place: the plan, then the shopping list in the order you walk the store.')
  );
}

function entryCard(entry, ingIndex, navigate) {
  const [a, b] = entry.icons.map(id => ingIndex.get(id));

  return h('button', {
    type: 'button',
    class: `entry entry--${entry.tint}`,
    onclick: () => { play('tap'); navigate(entry.href); }
  },
    h('span.entry__art',
      a ? h('span.entry__art-a', foodIcon(a, { size: 52 })) : null,
      b ? h('span.entry__art-b', foodIcon(b, { size: 32 })) : null
    ),
    h('span.entry__text',
      h('span.entry__name', entry.name),
      h('span.entry__body', entry.body)
    )
  );
}

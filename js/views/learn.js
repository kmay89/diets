/**
 * learn.js (view) — the whole technique library, in one place.
 *
 * Everything the recipes assume: knife work, how heat actually behaves, what
 * each pan is for, the fats argument stated fairly, how much your oven lies to
 * you, the first techniques to teach a child, why cookies do what they do, and
 * whether the dishwasher beats the sink.
 *
 * It is a reference rather than a course. Nothing here has to be read in order
 * and nothing tracks whether you did.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, chip, debounce } from '../ui.js';
import { tipsByGroup, searchTips, groupById, foundationTips } from '../tips.js';
import { balanceAxes, balanceLessons } from '../balance.js';
import { allMethods, prepSteps } from '../proteins.js';
import { tipCard, openTip } from './tips-panel.js';
import { play } from '../feedback.js';

let query = '';
let openGroup = null;

export function render(root, { navigate }) {
  const draw = () => mount(root, view(draw, navigate));
  draw();
}

function view(draw, navigate) {
  const groups = tipsByGroup();
  const results = query ? searchTips(query) : null;

  return h('section.view',
    h('div.view__head',
      h('div',
        h('p.eyebrow', 'The part nobody tells you'),
        h('h1.view__title', 'How cooking works'),
        h('p.view__sub',
          'The things a recipe assumes you already know. None of it is a rule, and none of it is a test — ',
          'it is what a good cook would say if they were standing next to you.')
      )
    ),

    h('div.card.filters',
      h('input.input', {
        type: 'search',
        placeholder: 'Search — onion, induction, cast iron, whisk…',
        value: query,
        oninput: debounce((e) => { query = e.target.value; draw(); }, 200)
      })
    ),

    results
      ? h('section.card.block',
          h('h2.block__title', `${results.length} ${results.length === 1 ? 'note' : 'notes'}`),
          h('div.tip-row.tip-row--wrap', ...results.map(t => tipCard(t)))
        )
      : h('div',
          h('section.card.block',
            h('h2.block__title', 'Start with these'),
            h('p.muted.small', 'True of every dish, and each one changes the next thing you cook.'),
            h('div.tip-row.tip-row--wrap', ...foundationTips().map(t => tipCard(t)))
          ),

          h('div.chip-row',
            chip('Everything', { on: !openGroup, onclick: () => { openGroup = null; play('tap'); draw(); } }),
            ...groups.map(({ group }) => chip(`${group.icon} ${group.name}`, {
              on: openGroup === group.id,
              onclick: () => { openGroup = openGroup === group.id ? null : group.id; play('tap'); draw(); }
            }))
          ),

          ...groups
            .filter(({ group }) => !openGroup || group.id === openGroup)
            .map(({ group, tips }) => h('section.card.block',
              h('h2.block__title', `${group.icon} ${group.name}`),
              h('p.muted.small', group.blurb),
              h('div.tip-row.tip-row--wrap', ...tips.map(t => tipCard(t)))
            )),

          flavorBlock(),
          methodBlock(),

          h('section.card.block',
            h('h2.block__title', 'Where the claims come from'),
            h('p.muted.small',
              'Anything on this screen that is a health or resource claim rather than a piece of craft carries a ',
              'numbered source, the kind of evidence it is, and what it does not show.'),
            h('div.row-actions',
              h('button.btn', { type: 'button', onclick: () => navigate('#/why') }, 'Why this works, with every source'),
              h('button.btn.btn--ghost', { type: 'button', onclick: () => navigate('#/browse') }, 'Go and cook something')
            )
          )
        )
  );
}

/** The flavor model, explained once, away from any particular dish. */
function flavorBlock() {
  const axes = balanceAxes();
  if (!axes.length) return null;
  return h('section.card.block',
    h('h2.block__title', '⚖️ The six dials, and two checks'),
    h('p.muted.small',
      'Every recipe in this app is scored on these, and the panel on a recipe page is this model applied to that dish.'),
    h('div.tip-row.tip-row--wrap',
      ...axes.map(axis => h('button.tip-card', {
        type: 'button',
        onclick: () => openTip({
          icon: axis.icon,
          title: axis.name,
          short: axis.short,
          body: [axis.does, `How to taste for it: ${axis.taste}`, `When it goes in: ${axis.when}`],
          why: axis.reference || null,
          group: null,
          level: 'first'
        })
      },
        h('span.tip-card__icon', axis.icon),
        h('span.tip-card__title', axis.name),
        h('span.tip-card__short', axis.short)
      ))
    ),
    h('ul.tight', ...balanceLessons().map(l => h('li', h('strong', l.title + '. '), l.body)))
  );
}

/** Every way to apply heat, with what each one trades away. */
function methodBlock() {
  const methods = allMethods();
  if (!methods.length) return null;
  return h('section.card.block',
    h('h2.block__title', '🔥 Every way to cook a piece of something'),
    h('p.muted.small',
      'The same ingredient seared, roasted, braised or crumbled is four different dinners. Each card says what it ',
      'does, why it works, how to tell it is done, and how it goes wrong.'),
    h('div.tip-row.tip-row--wrap',
      ...methods.map(m => h('button.tip-card', {
        type: 'button',
        onclick: () => openTip({
          icon: m.icon,
          title: m.name,
          short: m.what,
          body: [m.why, `You know it is done when: ${m.doneWhen}`, `How it goes wrong: ${m.goesWrong}`],
          why: m.teaches,
          level: 'deeper'
        })
      },
        h('span.tip-card__icon', m.icon),
        h('span.tip-card__title', m.name),
        h('span.tip-card__short', `${m.minutes[0]}–${m.minutes[1]} min · ${m.heat}`)
      ))
    ),
    h('h3.step__sub', 'Before the heat goes on'),
    h('dl.notes', ...prepSteps().flatMap(p => [
      h('dt', `${p.icon} ${p.name} — ${p.when}`),
      h('dd', h('p', p.what), h('p.muted.small', p.why))
    ]))
  );
}

/**
 * pantry.js (view) — what is already in the house, by aisle.
 *
 * Ticking something here removes it from the shopping list and nudges the roll
 * toward meals you can nearly make already.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, chip, toast, debounce, confirmSheet } from '../ui.js';
import { getDb, recipesUsing } from '../data.js';
import { play } from '../feedback.js';
import { getState, togglePantry, clearPantry } from '../store.js';
import { foodIcon } from '../food-icon.js';
import { tipsByGroup } from '../tips.js';
import { tipCard } from './tips-panel.js';

let query = '';
let showOnlyHave = false;

export function render(root, { navigate }) {
  const draw = () => mount(root, view(draw, navigate));
  draw();
}

function view(draw, navigate) {
  const state = getState();
  const { ingredients, aisles, aisleIndex } = getDb();
  const q = query.trim().toLowerCase();

  const matching = ingredients.filter(i => {
    if (showOnlyHave && !state.pantry[i.id]) return false;
    if (!q) return true;
    return i.name.toLowerCase().includes(q) || (i.tags || []).some(t => t.includes(q));
  });

  const haveCount = Object.keys(state.pantry).length;

  const groups = aisles
    .map(a => ({ aisle: a, items: matching.filter(i => i.aisle === a.id) }))
    .filter(g => g.items.length);

  return h('section.view',
    h('div.view__head',
      h('div',
        h('h1.view__title', 'Pantry'),
        h('p.view__sub', `${haveCount} items on hand · ${ingredients.length} in the database`)
      )
    ),

    h('div.card.filters',
      h('input.input', {
        type: 'search', placeholder: 'Find an ingredient…', value: query,
        oninput: debounce(e => { query = e.target.value; draw(); }, 180)
      }),
      h('div.chip-row.chip-row--tight',
        chip('Show only what I have', { on: showOnlyHave, onclick: () => { showOnlyHave = !showOnlyHave; draw(); } }),
        chip('Clear the pantry', {
          onclick: async () => {
            if (await confirmSheet('Clear the pantry?', 'Unticks everything. Your plan, tastes and shopping list are untouched.', { confirmLabel: 'Clear', danger: true })) {
              clearPantry(); toast('Pantry cleared'); draw();
            }
          }
        })
      )
    ),

    // Storage advice belongs where somebody is looking at what they own. Half
    // of what a household throws away was stored in the wrong place rather than
    // bought in the wrong quantity.
    storageTips(),

    ...groups.map(g => h('section.card.block',
      h('h2.block__title', `${g.aisle.icon || ''} ${g.aisle.name}`),
      g.aisle.hint ? h('p.muted.small', g.aisle.hint) : null,
      h('div.pantry-grid',
        ...g.items.map(item => {
          const have = !!state.pantry[item.id];
          const uses = recipesUsing(item.id).length;
          return h('label', { class: `pantry-item ${have ? 'is-have' : ''}` },
            h('input', { type: 'checkbox', checked: have, onchange: (e) => { togglePantry(item.id); play(e.target.checked ? 'check' : 'uncheck'); draw(); } }),
            foodIcon(item, { size: 22 }),
            h('span.pantry-item__name', item.name),
            uses ? h('span.pantry-item__uses', `${uses}`) : null
          );
        })
      )
    )),

    groups.length === 0 ? h('p.empty', 'Nothing matches that search.') : null,

    h('p.fine-print', 'The small number beside an ingredient is how many recipes in the collection use it — a decent guide to what is worth keeping stocked.')
  );
}

/** How to keep what is in the house alive, from the technique library. */
function storageTips() {
  const group = tipsByGroup().find(g => g.group.id === 'storage');
  if (!group) return null;
  return h('section.card.block.tips',
    h('div.balance__head',
      h('h2.block__title', `${group.group.icon} ${group.group.name}`),
      h('a.tag-btn', { href: '#/learn' }, 'the rest of it →')
    ),
    h('p.muted.small', group.group.blurb),
    h('div.tip-row', ...group.tips.map(t => tipCard(t)))
  );
}

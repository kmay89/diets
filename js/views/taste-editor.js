/**
 * taste-editor.js — every ingredient, tastable, without a wall of 227 chips.
 *
 * Shared by onboarding and settings. Onboarding leads with a short curated set
 * because a first run is not the moment to hand somebody the whole database;
 * this is the door out of that set, and the one settings opens directly.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, sheet, debounce } from '../ui.js';
import { getDb } from '../data.js';
import { getState, setLike } from '../store.js';
import { play } from '../feedback.js';
import { foodIcon } from '../food-icon.js';

/**
 * The old editor put roughly 180 chips on one screen and left out the spice
 * rack entirely — so you could not tell it you hate dried oregano, and finding
 * anything meant scanning a paragraph of buttons.
 *
 * The fix is structure rather than fewer options: search across the lot, and
 * otherwise one collapsed row per aisle. Aisles you have already expressed an
 * opinion about open on their own, because that is what you came back to change.
 *
 * @param draw called after each change so the screen behind can restate counts
 */
export function openTasteEditor(draw = () => {}) {
  const { ingredients, aisles } = getDb();
  const body = h('div');
  const aisleList = h('div');

  // Household goods are the only things here nobody eats.
  const edible = ingredients.filter(i => i.aisle !== 'household');
  const byAisle = new Map(aisles.map(a => [a.id, []]));
  for (const i of edible) (byAisle.get(i.aisle) || byAisle.set(i.aisle, []).get(i.aisle)).push(i);

  let query = '';
  const open = new Set(
    aisles.filter(a => (byAisle.get(a.id) || []).some(i => getState().likes[i.id])).map(a => a.id)
  );

  const summary = h('p.muted.small');
  const refreshSummary = () => {
    const likes = getState().likes;
    const loved = Object.values(likes).filter(v => v === 1).length;
    const never = Object.values(likes).filter(v => v === -1).length;
    // replaceChildren has no opinion about null and will happily render the
    // word "null", so the optional child is filtered rather than passed.
    summary.replaceChildren(...[
      `${loved} loved · ${never} never · ${edible.length} to choose from`,
      loved + never
        ? h('button.linkish.taste__clear', {
            type: 'button',
            onclick: () => {
              for (const id of Object.keys(getState().likes)) setLike(id, 0);
              rebuild();
              draw();
            }
          }, 'Clear them all')
        : null
    ].filter(Boolean));
  };

  /**
   * One ingredient. The button owns its own state so a tap repaints a single
   * chip rather than the whole sheet — which would throw away your scroll
   * position halfway down the produce aisle.
   */
  const chipFor = (item) => {
    const btn = h('button', { type: 'button', class: 'chip chip--taste' });
    const label = h('span');
    btn.append(foodIcon(item, { size: 18 }), label);
    const paint = () => {
      const v = getState().likes[item.id] || 0;
      btn.className = `chip chip--taste ${v === 1 ? 'is-love' : ''} ${v === -1 ? 'is-never' : ''}`;
      btn.setAttribute('aria-pressed', v !== 0);
      label.textContent = `${v === 1 ? '♥ ' : v === -1 ? '✕ ' : ''}${item.name}`;
    };
    btn.addEventListener('click', () => {
      const v = getState().likes[item.id] || 0;
      setLike(item.id, v === 0 ? 1 : v === 1 ? -1 : 0);
      play(v === 0 ? 'check' : v === 1 ? 'warn' : 'uncheck');
      paint();
      refreshSummary();
      draw();
    });
    paint();
    return btn;
  };

  const rebuild = () => {
    const q = query.trim().toLowerCase();
    const sections = [];

    for (const aisle of aisles) {
      const all = byAisle.get(aisle.id) || [];
      if (!all.length) continue;
      const items = q ? all.filter(i => i.name.toLowerCase().includes(q)) : all;
      if (!items.length) continue;

      // A search is a request to see the matches, not to go hunting for them.
      const expanded = q ? true : open.has(aisle.id);
      const marked = all.filter(i => getState().likes[i.id]).length;

      sections.push(h('section.taste-aisle',
        h('button.taste-aisle__head', {
          type: 'button',
          'aria-expanded': String(expanded),
          onclick: () => {
            if (q) return;                       // nothing to collapse while filtering
            open.has(aisle.id) ? open.delete(aisle.id) : open.add(aisle.id);
            play('tap');
            rebuild();
          }
        },
          h('span.taste-aisle__icon', aisle.icon || '🍽'),
          h('span.taste-aisle__name', aisle.name),
          h('span.taste-aisle__count', q ? `${items.length} matching` : `${items.length}`),
          marked ? h('span.pill.pill--green', `${marked} set`) : null,
          h('span.taste-aisle__chev', expanded ? '▾' : '▸')
        ),
        expanded ? h('div.chip-row', ...items.map(chipFor)) : null
      ));
    }

    aisleList.replaceChildren(
      sections.length ? h('div.taste-aisles', ...sections) : h('p.empty', 'Nothing matches that.')
    );
    refreshSummary();
  };

  // Built once and never re-rendered: rebuilding it under the cursor is how a
  // search field eats every second character you type.
  const search = h('input.input', {
    type: 'search',
    placeholder: `Search all ${edible.length} ingredients…`,
    oninput: debounce(() => { query = search.value; rebuild(); }, 180)
  });

  body.append(
    h('p.muted', 'Tap once for ', h('strong', 'love'), ', twice for ', h('strong', 'never'), ', a third time to clear. ',
      'Loved things get pulled toward the top of every roll; anything marked never is taken out of it entirely.'),
    summary,
    search,
    aisleList
  );

  rebuild();
  sheet('Food likes and dislikes', body, { wide: true });
}

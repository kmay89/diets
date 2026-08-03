/**
 * list.js (view) — the shopping list: grouped by aisle, editable, exportable.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, chip, toast, sheet, titleCase } from '../ui.js';
import { getDb } from '../data.js';
import { play, stagger } from '../feedback.js';
import { foodIcon } from '../food-icon.js';
import { printShoppingList } from '../print.js';
import {
  getState, addCustomItem, removeCustomItem, toggleChecked,
  suppressItem, clearChecked, togglePantry,
  shoppingStores, setStores, assignItem, setAisleRule, declineAisleRule
} from '../store.js';
import { clubAdvice, suggestForClub, isWarehouse, KEEPS, FREEZES, PERISHES } from '../bulk.js';
import {
  buildList, formatList, EXPORT_FORMATS, STORE_LINKS, shareList, copyText,
  downloadFile, mailtoLink, smsLink, parsePastedList, guessAisle
} from '../shopping.js';

let hideChecked = false;

export function render(root, { navigate }) {
  const draw = () => mount(root, view(draw, navigate));
  draw();
}

function view(draw, navigate) {
  const state = getState();
  const { storeLayouts, aisles } = getDb();
  const list = buildList(state);

  if (!list.items.length) {
    return h('section.view',
      h('div.view__head', h('h1.view__title', 'Shopping list')),
      h('div.empty-state',
        h('div.empty-state__dice', '🛒'),
        h('h2', 'The list is empty'),
        h('p.muted', 'Plan some meals and everything you need shows up here, grouped the way you walk the store. You can also add items by hand.'),
        h('div.row-actions',
          h('button.btn.btn--primary', { onclick: () => navigate('#/roll') }, '🎲 Roll some meals'),
          h('button.btn', { onclick: () => openAddItem(draw) }, '+ Add an item')
        )
      )
    );
  }

  return h('section.view',
    h('div.view__head',
      h('div',
        h('h1.view__title', 'Shopping list'),
        h('p.view__sub',
          `${list.meta.totalItems} items for ${list.meta.mealCount} meals · ${list.meta.checkedItems} in the cart`,
          list.meta.pantrySkipped ? ` · ${list.meta.pantrySkipped} skipped (already in the pantry)` : ''
        )
      )
    ),

    h('div.card.filters',
      storePicker(state, storeLayouts, draw),

      h('div.chip-row.chip-row--tight',
        chip(hideChecked ? 'Showing unchecked' : 'Hide what is in the cart', { on: hideChecked, onclick: () => { hideChecked = !hideChecked; draw(); } }),
        chip('+ Add item', { onclick: () => openAddItem(draw) }),
        chip('📋 Paste a list', { onclick: () => openPaste(draw) }),
        chip('Uncheck all', { onclick: () => { clearChecked(); draw(); } })
      )
    ),

    h('div.export-bar',
      h('button.btn.btn--primary', {
        type: 'button',
        onclick: async () => {
          play('tap');
          const how = await shareList(list, { title: 'Shopping list' });
          toast(how === 'shared' ? 'Shared' : 'Copied to the clipboard');
        }
      }, '📤 Send to my list app'),
      h('button.btn', { type: 'button', onclick: () => openExport(list, draw) }, 'Export…'),
      h('a.btn', { href: mailtoLink(list) }, '✉️ Email'),
      h('a.btn', { href: smsLink(list) }, '💬 Text'),
      h('button.btn', {
        type: 'button',
        title: 'One condensed page: everything still to buy, in aisle order',
        onclick: () => printShoppingList(list)
      }, '🖨 Print')
    ),

    ...list.runs.flatMap(run => runSection(run, list.runs.length > 1, state, draw, list)),

    h('p.fine-print',
      'Quantities are rounded up to how things are actually sold — a recipe needing 300 g of chickpeas asks for one can. ',
      'Tap an item name to see which meals it is for and where to buy it.')
  );
}

/**
 * One store's worth of the list.
 *
 * With no bulk run there is one of these and it carries no heading, which is
 * exactly the list as it was before. With a club selected there are two, and
 * the club comes first — it is the stop with the frozen things in it, so it is
 * the one you want to do on the way home rather than at the start.
 */
function runSection(run, split, state, draw, list) {
  if (!run.groups.length) return [];
  const head = split
    ? h('div.run-head',
        h('h2.run-head__name', run.store.name),
        h('span.run-head__count', `${run.items.length} items`),
        // Only a club has a "what is worth buying here" question to answer.
        isWarehouse(run.store)
          ? h('button.btn.btn--small', {
              type: 'button',
              onclick: () => openBulkPicker(run, list, draw)
            }, '🧊 What keeps')
          : null,
        run.store.note ? h('p.run-head__note.muted.small', run.store.note) : null
      )
    : null;
  return [head, ...run.groups.map(g => aisleBlock(g, state, draw, run, list))].filter(Boolean);
}

/**
 * "Where do you shop?" — the only setup this feature has.
 *
 * A row of chips rather than a wizard, because the honest answer for most
 * households is one or two names and they already know them. Tap order is the
 * driving order, and the first one is home: everything with no opinion
 * attached goes there, so choosing one store leaves the list exactly as it was.
 */
function storePicker(state, storeLayouts, draw) {
  const chosen = shoppingStores(state);
  const label = (id) => storeLayouts[id]?.name || id;

  const toggle = (id) => {
    const next = chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id];
    // Refusing to have no store at all is kinder than an empty list screen.
    setStores(next.length ? next : [id]);
    play(chosen.includes(id) ? 'uncheck' : 'check');
    draw();
  };

  return h('div.store-picker',
    h('span.field__label', 'Where you shop'),
    h('div.chip-row.chip-row--tight',
      ...Object.entries(storeLayouts).map(([id, l]) =>
        chip(l.name, { on: chosen.includes(id), onclick: () => toggle(id) }))
    ),
    chosen.length > 1
      ? h('p.fine-print',
          `${chosen.map(label).join(' → ')}. `,
          `${label(chosen[0])} is home base — anything you have not filed elsewhere ends up there. `,
          'Move a row with the store button to file it; the list remembers.')
      : h('p.fine-print',
          'Pick a second one and the list splits into a run per store, in the order you tap them.')
  );
}

/**
 * The per-row store button.
 *
 * With one store there is nowhere to move anything, so there is no control.
 * With two it is a toggle, which is the common case and wants to be one tap.
 * With more it opens a short list. Either way this is the gesture that teaches
 * the app where things come from — there is no other place to configure it.
 */
function storeButton(item, list, state, draw) {
  const stores = list.meta.stores;
  if (stores.length < 2 || item.kind !== 'ingredient') return null;
  const { storeLayouts } = getDb();
  const here = item.store;
  const name = (id) => storeLayouts[id]?.name || id;

  const move = (to) => {
    assignItem(item.ingredientId, to === list.meta.stores[0] && !state.aisleRules?.[item.aisle] ? null : to);
    // Assigning to home with no rule in play is the same as having no opinion,
    // so it is stored as no opinion rather than as a pin that looks like a
    // decision somebody made.
    if (to !== here) play('check');
    draw();
  };

  if (stores.length === 2) {
    const other = stores.find(id => id !== here) || stores[0];
    return h('button.tag-btn.tag-btn--icon', {
      type: 'button',
      title: `Buy this at ${name(other)} instead`,
      onclick: () => move(other)
    }, '→ ' + shortName(name(other)));
  }

  return h('button.tag-btn.tag-btn--icon', {
    type: 'button',
    title: `Bought at ${name(here)} — tap to move it`,
    onclick: () => openStoreChooser(item, list, draw)
  }, shortName(name(here)));
}

/** "Trader Joe's" does not fit on a row button; "Trader" does. */
function shortName(name) {
  const first = String(name).split(/[\s'’]/)[0];
  return first.length > 9 ? first.slice(0, 8) + '…' : first;
}

function openStoreChooser(item, list, draw) {
  const { storeLayouts } = getDb();
  const dlg = sheet(item.name,
    h('div',
      h('p.muted.small', 'Where do you buy this one?'),
      h('div.chip-row',
        ...list.meta.stores.map(id => chip(storeLayouts[id]?.name || id, {
          on: item.store === id,
          onclick: () => {
            assignItem(item.ingredientId, id === list.meta.stores[0] ? null : id);
            play('check');
            dlg.close();
            draw();
          }
        }))
      )
    )
  );
}

/**
 * The one moment this feature asks a question.
 *
 * Three things out of the same aisle sent to the same store is somebody
 * telling you a rule one item at a time. Offering to write it down saves the
 * next twenty taps; asking more than once about the same aisle would be
 * nagging, so a no is remembered as firmly as a yes.
 */
const RULE_THRESHOLD = 3;

function ruleOffer(group, run, list, state, draw) {
  const aisleId = group.aisle.id;
  if (list.meta.stores.length < 2) return null;
  if (state.aisleRules?.[aisleId] || state.declinedRules?.[aisleId]) return null;

  const pinnedHere = list.items.filter(i =>
    i.aisle === aisleId && state.assignments?.[i.ingredientId] === run.store.id).length;
  if (pinnedHere < RULE_THRESHOLD) return null;

  return h('div.rule-offer',
    h('span.rule-offer__text',
      `You keep sending ${group.aisle.name.toLowerCase()} to ${run.store.name}. Always?`),
    h('div.rule-offer__actions',
      h('button.btn.btn--small.btn--primary', {
        type: 'button',
        onclick: () => {
          setAisleRule(aisleId, run.store.id);
          play('complete');
          toast(`${group.aisle.name} now goes to ${run.store.name}`);
          draw();
        }
      }, 'Always'),
      h('button.btn.btn--small', {
        type: 'button',
        onclick: () => { declineAisleRule(aisleId); play('tap'); draw(); }
      }, 'Just these')
    )
  );
}

function aisleBlock(group, state, draw, run = null, list = null) {
  const items = hideChecked ? group.items.filter(i => !i.checked) : group.items;
  if (!items.length) return null;

  return h('section.card.block.aisle',
    h('h2.block__title', `${group.aisle.icon || ''} ${group.aisle.name}`),
    group.aisle.hint ? h('p.muted.small.aisle__hint', group.aisle.hint) : null,
    run && list ? ruleOffer(group, run, list, state, draw) : null,
    h('ul.list-items',
      ...items.map(item => h('li', { class: `list-item ${item.checked ? 'is-checked' : ''}` },
        h('label.list-item__main',
          h('input', {
            type: 'checkbox', checked: item.checked,
            onchange: (e) => { toggleChecked(item.key); play(e.target.checked ? 'check' : 'uncheck'); draw(); },
            'aria-label': `Got ${item.name}`
          }),
          foodIcon(getDb().ingIndex.get(item.ingredientId), { size: 24 }),
          h('span.list-item__qty', item.buy || ''),
          h('span.list-item__name', { role: 'button', tabindex: '0', onclick: (e) => { e.preventDefault(); openItem(item, draw); } }, item.name),
          // Only on the club run, and only when the answer is "this one rots".
          run && isWarehouse(run.store) && item.item && clubAdvice(item.item, item.grams || 0).verdict === PERISHES
            ? h('span.bulk-warn', { title: clubAdvice(item.item, item.grams || 0).note }, 'will not keep')
            : null
        ),
        h('div.list-item__actions',
          list ? storeButton(item, list, state, draw) : null,
          item.kind === 'ingredient'
            ? h('button.tag-btn', {
                type: 'button', title: 'I already have this — move it to the pantry',
                onclick: () => { togglePantry(item.ingredientId, true); toast(`${item.name} moved to the pantry`); draw(); }
              }, '🏠')
            : null,
          h('button.tag-btn', {
            type: 'button', title: 'Remove from this list',
            onclick: () => {
              if (item.kind === 'custom') removeCustomItem(item.key);
              else suppressItem(item.key, true);
              draw();
            }
          }, '✕')
        )
      ))
    )
  );
}

/* ---------- sheets ---------- */

/**
 * "What should I get at Costco?"
 *
 * The list is already sorted by the answer — things that keep at the top,
 * things that rot at the bottom — so the sensible picks are the ones under
 * your thumb, and the ones you should not buy in bulk are visibly last with
 * the reason attached. "Take the sensible ones" ticks the first two groups,
 * which is the whole decision for most people.
 */
function openBulkPicker(run, list, draw) {
  const storeName = run.store.name;
  // Offered over the whole list, not just this run — the point is to pull the
  // things that keep *onto* the club trip, which means showing what is not
  // there yet.
  const rows = suggestForClub(list.items);
  const home = list.meta.stores[0];

  const SECTIONS = [
    { verdict: KEEPS, title: 'Worth the big pack', blurb: 'Shelf-stable or frozen already. Nothing here is a race against the fridge.' },
    { verdict: FREEZES, title: 'Worth it if you freeze it', blurb: 'Portion into meal-size bags the day you get home — this is where the saving actually happens, or does not.' },
    { verdict: PERISHES, title: 'Buy these somewhere else', blurb: 'A club pack is more than one household finishes before it turns.' }
  ];

  const body = h('div');
  const paint = () => {
    const st = getState();
    const at = (id) => st.assignments?.[id] === run.store.id;
    body.replaceChildren(
      h('p.muted.small',
        `Ticked items move to the ${storeName} run and stay there for future lists. `,
        'Pack sizes are a rule of thumb — roughly two to four times a supermarket unit — not a product catalog.'),

      h('div.row-actions',
        h('button.btn.btn--small', {
          type: 'button',
          onclick: () => {
            for (const r of rows) {
              if (r.advice.verdict !== PERISHES) assignItem(r.ingredientId, run.store.id);
            }
            play('check');
            paint();
          }
        }, 'Take the sensible ones'),
        h('button.btn.btn--small', {
          type: 'button',
          onclick: () => {
            for (const r of rows) if (at(r.ingredientId)) assignItem(r.ingredientId, null);
            play('uncheck');
            paint();
          }
        }, 'None of them')
      ),

      ...SECTIONS.flatMap(sec => {
        const inSection = rows.filter(r => r.advice.verdict === sec.verdict);
        if (!inSection.length) return [];
        return [
          h('h3.step__sub', sec.title),
          h('p.fine-print', sec.blurb),
          h('ul.bulk-picks',
            ...inSection.map(r => h('li', { class: `bulk-pick bulk-pick--${r.advice.verdict}` },
              h('label.bulk-pick__main',
                h('input', {
                  type: 'checkbox',
                  checked: at(r.ingredientId),
                  onchange: () => {
                    assignItem(r.ingredientId, at(r.ingredientId) ? null : run.store.id);
                    paint();
                  }
                }),
                h('span.bulk-pick__name', r.name),
                r.buy ? h('span.bulk-pick__qty.muted', r.buy) : null
              ),
              // The share of a pack only matters where the leftover is the
              // problem. "0% of a pack of bay leaves" is noise on a shelf-
              // stable item that was never going to spoil.
              h('p.bulk-pick__note.fine-print',
                r.advice.verdict !== KEEPS && r.advice.usedPct != null
                  ? `${r.advice.headline} · this plan uses about ${r.advice.usedPct}% of a pack. ${r.advice.note}`
                  : `${r.advice.headline}. ${r.advice.note}`)
            ))
          )
        ];
      }),

      h('p.fine-print', `Anything unticked goes to ${list.meta.storeNames[0] || home}.`)
    );
  };
  paint();

  const dlg = sheet(`What keeps at ${storeName}`, body, {
    wide: true,
    actions: [h('button.btn.btn--primary', { type: 'button', onclick: () => { dlg.close(); draw(); } }, 'Done')]
  });
}

function openItem(item, draw) {
  const links = h('div.chip-row',
    ...STORE_LINKS.map(s => h('a.chip', { href: s.url(item.name), target: '_blank', rel: 'noopener noreferrer' }, s.name))
  );

  sheet(item.name,
    h('div',
      item.buy ? h('p', h('strong', 'Buy: '), item.buy, item.grams ? h('span.muted', ` (recipes need about ${item.grams} g)`) : null) : null,
      item.detail?.length
        ? h('div', h('h3.step__sub', 'For'), h('ul.tight', ...item.detail.map(d => h('li', d))))
        : null,
      item.tips ? h('p.muted', '💡 ' + item.tips) : null,
      h('h3.step__sub', 'Find it online'),
      links,
      h('p.fine-print', 'These are ordinary search links. Nothing about your list is sent anywhere — the link just opens a search on that store.')
    )
  );
}

function openAddItem(draw) {
  const nameInput = h('input.input', { type: 'text', placeholder: 'e.g. paper towels', autofocus: true });
  const qtyInput = h('input.input', { type: 'text', placeholder: 'Quantity (optional)' });
  const aisleSelect = h('select.input', ...getDb().aisles.map(a => h('option', { value: a.id }, a.name)));

  const submit = () => {
    const name = nameInput.value.trim();
    if (!name) return toast('Give it a name first', { kind: 'warn' });
    addCustomItem({ name, qty: qtyInput.value.trim(), aisle: aisleSelect.value });
    dlg.close();
    toast('Added');
    draw();
  };

  nameInput.addEventListener('input', () => { aisleSelect.value = guessAisle(nameInput.value); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  const dlg = sheet('Add to the list',
    h('div.form-grid',
      h('label.field', h('span.field__label', 'Item'), nameInput),
      h('label.field', h('span.field__label', 'Quantity'), qtyInput),
      h('label.field', h('span.field__label', 'Aisle'), aisleSelect)
    ),
    { actions: [h('button.btn.btn--primary', { type: 'button', onclick: submit }, 'Add')] }
  );
}

function openPaste(draw) {
  const ta = h('textarea.input.textarea', { rows: 10, placeholder: 'Paste a list from anywhere — one item per line.\n\n2 lemons\n- [ ] oat milk\n* 1 lb carrots' });
  const dlg = sheet('Paste a list',
    h('div',
      h('p.muted', 'Bullets, checkboxes and numbers are stripped automatically, and each item is filed into the right aisle where it can be recognized.'),
      ta
    ),
    {
      actions: [h('button.btn.btn--primary', {
        type: 'button',
        onclick: () => {
          const parsed = parsePastedList(ta.value);
          if (!parsed.length) return toast('Nothing to import', { kind: 'warn' });
          for (const p of parsed) addCustomItem({ name: p.name, qty: p.qty, aisle: guessAisle(p.name) });
          dlg.close();
          toast(`Imported ${parsed.length} items`);
          draw();
        }
      }, 'Import')]
    }
  );
}

function openExport(list, draw) {
  const preview = h('pre.preview');
  let format = 'plain';
  const render = () => { preview.textContent = formatList(list, format); };

  const chips = h('div.chip-row',
    ...Object.entries(EXPORT_FORMATS).map(([k, f]) =>
      h('button', {
        type: 'button', class: `chip ${format === k ? 'is-on' : ''}`,
        onclick: (e) => {
          format = k;
          [...chips.children].forEach(c => c.classList.remove('is-on'));
          e.currentTarget.classList.add('is-on');
          hint.textContent = f.hint;
          render();
        }
      }, f.label))
  );
  const hint = h('p.muted.small', EXPORT_FORMATS[format].hint);
  render();

  sheet('Export the list',
    h('div', chips, hint, preview),
    {
      wide: true,
      actions: [
        h('button.btn', {
          type: 'button',
          onclick: async () => { await copyText(preview.textContent); toast('Copied'); }
        }, 'Copy'),
        h('button.btn.btn--primary', {
          type: 'button',
          onclick: () => {
            const f = EXPORT_FORMATS[format];
            downloadFile(preview.textContent, `shopping-list.${f.ext}`, f.mime);
            toast('Downloaded');
          }
        }, 'Download')
      ]
    }
  );
}

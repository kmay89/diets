/**
 * list.js (view) — the shopping list: grouped by aisle, editable, exportable.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, chip, toast, sheet, titleCase } from '../ui.js';
import { getDb } from '../data.js';
import {
  getState, setPref, addCustomItem, removeCustomItem, toggleChecked,
  suppressItem, clearChecked, togglePantry
} from '../store.js';
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
      h('label.field.field--inline',
        h('span.field__label', 'Store layout'),
        h('select.input', { onchange: (e) => { setPref('store', e.target.value); draw(); } },
          ...Object.entries(storeLayouts).map(([id, l]) =>
            h('option', { value: id, selected: state.prefs.store === id }, l.name))
        )
      ),
      list.meta.storeNote ? h('p.muted.small', list.meta.storeNote) : null,
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
          const how = await shareList(list, { title: 'Shopping list' });
          toast(how === 'shared' ? 'Shared' : 'Copied to the clipboard');
        }
      }, '📤 Send to my list app'),
      h('button.btn', { type: 'button', onclick: () => openExport(list, draw) }, 'Export…'),
      h('a.btn', { href: mailtoLink(list) }, '✉️ Email'),
      h('a.btn', { href: smsLink(list) }, '💬 Text'),
      h('button.btn', { type: 'button', onclick: () => window.print() }, '🖨 Print')
    ),

    ...list.groups.map(g => aisleBlock(g, state, draw)),

    h('p.fine-print',
      'Quantities are rounded up to how things are actually sold — a recipe needing 300 g of chickpeas asks for one can. ',
      'Tap an item name to see which meals it is for and where to buy it.')
  );
}

function aisleBlock(group, state, draw) {
  const items = hideChecked ? group.items.filter(i => !i.checked) : group.items;
  if (!items.length) return null;

  return h('section.card.block.aisle',
    h('h2.block__title', `${group.aisle.icon || ''} ${group.aisle.name}`),
    group.aisle.hint ? h('p.muted.small.aisle__hint', group.aisle.hint) : null,
    h('ul.list-items',
      ...items.map(item => h('li', { class: `list-item ${item.checked ? 'is-checked' : ''}` },
        h('label.list-item__main',
          h('input', {
            type: 'checkbox', checked: item.checked,
            onchange: () => { toggleChecked(item.key); draw(); },
            'aria-label': `Got ${item.name}`
          }),
          h('span.list-item__qty', item.buy || ''),
          h('span.list-item__name', { role: 'button', tabindex: '0', onclick: (e) => { e.preventDefault(); openItem(item, draw); } }, item.name)
        ),
        h('div.list-item__actions',
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
      h('p.muted', 'Bullets, checkboxes and numbers are stripped automatically, and each item is filed into the right aisle where it can be recognised.'),
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

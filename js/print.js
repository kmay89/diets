/**
 * print.js — the paper version.
 *
 * The screen and the page want different things. On screen the shopping list is
 * a working surface: tap targets, food icons, aisle advice, export buttons. On
 * paper every one of those is ink you paid for and cannot press, and the app
 * used to hand you four sheets of it.
 *
 * So printing does not print the app. It builds a separate, deliberately plain
 * sheet — a wordmark, one line of context, then checkboxes set in columns —
 * sized so an ordinary week lands on one side of one piece of paper.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, $, clear, plural } from './ui.js';
import { formatQty } from './nutrition.js';
import { getDb } from './data.js';

const HOST_ID = 'print-sheet';

function host() {
  let node = $('#' + HOST_ID);
  if (!node) {
    node = h('div#' + HOST_ID, { 'aria-hidden': 'true' });
    document.body.appendChild(node);
  }
  return clear(node);
}

/**
 * Put one sheet on paper and take it back off again.
 *
 * The flag on <body> is what the print stylesheet keys off: with it set, the
 * app is hidden and only this node prints.
 */
function printSheet(kind, content) {
  host().appendChild(content);
  document.body.dataset.printing = kind;

  const done = () => {
    delete document.body.dataset.printing;
    clear(host());
  };
  // afterprint is the reliable signal; the timer is only there so a browser
  // that never fires it does not leave the flag set forever.
  window.addEventListener('afterprint', done, { once: true });
  setTimeout(done, 20000);

  window.print();
}

function today() {
  return new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function sheetHead(title, meta) {
  return h('header.printout__head',
    h('div.printout__what',
      h('h1.printout__title', title),
      h('p.printout__meta', meta)
    ),
    h('div.printout__id',
      h('span.printout__brand', 'Veg-Nourish'),
      h('span.printout__by', 'ERRERLabs')
    )
  );
}

function sheetFoot(...notes) {
  return h('footer.printout__foot', ...notes.filter(Boolean), h('span.printout__url', 'veg-nourish.com'));
}

/* ------------------------------------------------------------------ *
 * The shopping list
 * ------------------------------------------------------------------ */

/**
 * Column count is chosen from how much there is to fit rather than fixed, so a
 * six-item list is not three lonely stripes and a sixty-item list is not four
 * pages.
 *
 * Two columns hold about seventy lines on letter or A4 without anything having
 * to wrap, which covers a full week of dinners. Three is the fallback for the
 * lists that would otherwise spill onto a second sheet.
 */
function columnsFor(count) {
  if (count > 60) return 3;
  if (count > 12) return 2;
  return 1;
}

export function printShoppingList(list) {
  printSheet('list', shoppingSheet(list));
}

function shoppingSheet(list) {
  // What is already in the cart is not what you are walking the store for.
  const groups = list.groups
    .map(g => ({ aisle: g.aisle, items: g.items.filter(i => !i.checked) }))
    .filter(g => g.items.length);

  const count = groups.reduce((n, g) => n + g.items.length, 0);
  const checked = list.meta.totalItems - count;

  return h('article', { class: `printout ${count > 60 ? 'printout--dense' : ''}` },
    sheetHead('Shopping list',
      `${plural(count, 'item')} · ${plural(list.meta.mealCount, 'meal')} · ${list.meta.store} · ${today()}`),

    count
      ? h('div.printout__cols', { style: { columnCount: String(columnsFor(count)) } },
          ...groups.map(g => h('section.printout__group',
            h('h2.printout__group-title', g.aisle.name),
            h('ul.printout__items',
              ...g.items.map(i => h('li.printout__item',
                h('span.printout__box'),
                i.buy ? h('span.printout__qty', i.buy) : null,
                h('span.printout__name', i.name)
              ))
            )
          ))
        )
      : h('p.printout__empty', 'Everything on this list is already in the cart.'),

    sheetFoot(
      checked ? h('span', `${plural(checked, 'item')} already in the cart, left off. `) : null,
      list.meta.pantrySkipped
        ? h('span', `${plural(list.meta.pantrySkipped, 'item')} skipped — already in the pantry. `)
        : null
    )
  );
}

/* ------------------------------------------------------------------ *
 * One recipe
 * ------------------------------------------------------------------ */

export function printRecipe(recipe, servings, { withOmnivore = false, withVegSwap = false } = {}) {
  printSheet('recipe', recipeSheet(recipe, servings, { withOmnivore, withVegSwap }));
}

function ingredientLines(lines, scale) {
  const { ingIndex } = getDb();
  return lines
    .map(line => {
      const item = ingIndex.get(line.ing);
      if (!item) return null;
      return h('li.printout__item',
        h('span.printout__box'),
        h('span.printout__qty', formatQty(line.qty * scale, line.unit)),
        h('span.printout__name',
          item.name,
          line.prep ? `, ${line.prep}` : '',
          line.optional ? ' (optional)' : '')
      );
    })
    .filter(Boolean);
}

function recipeSheet(recipe, servings, { withOmnivore, withVegSwap }) {
  const scale = servings / recipe.servings;
  const forks = [
    withOmnivore && recipe.omnivore ? ['For the meat eaters', recipe.omnivore] : null,
    withVegSwap && recipe.vegetarianSwap ? ['Vegetarian version', recipe.vegetarianSwap] : null
  ].filter(Boolean);

  const main = ingredientLines(recipe.ingredients, scale);

  return h('article.printout',
    sheetHead(recipe.title,
      `${plural(servings, 'serving')} · ${recipe.activeMin} min active · ${recipe.totalMin} min total`),

    h('p.printout__lede', recipe.blurb),

    h('section.printout__group',
      h('h2.printout__group-title', 'Ingredients'),
      h('ul.printout__items', { style: { columnCount: String(columnsFor(main.length)) } }, ...main)
    ),

    ...forks.map(([title, fork]) => h('section.printout__group',
      h('h2.printout__group-title', title),
      fork.add?.length ? h('ul.printout__items', ...ingredientLines(fork.add, scale)) : null,
      fork.steps?.length ? h('ol.printout__steps', ...fork.steps.map(s => h('li', s))) : null
    )),

    h('section.printout__group',
      h('h2.printout__group-title', 'Method'),
      h('ol.printout__steps', ...recipe.steps.map(s => h('li', s)))
    ),

    sheetFoot(recipe.leftovers ? h('span', `Leftovers: ${recipe.leftovers} `) : null)
  );
}

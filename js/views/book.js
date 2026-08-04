/**
 * book.js (view) — your cookbook.
 *
 * The browse screen is somebody else's 242 recipes. This is the fifteen that
 * are yours, and the difference matters more than the size: these are the ones
 * you cook in your own version, with your own notes, and they are the ones that
 * would actually hurt to lose.
 *
 * So the two things this screen has to do are show them and let them leave.
 * A cookbook you cannot get out of the software is not yours, it is the
 * software's — which is why Copy and Print sit at the top rather than buried in
 * settings, and why the export is Markdown a person can read rather than JSON a
 * program can.
 *
 * Nothing on this page is chosen. There is no "add to my book" button, because
 * a button you have to remember to press produces a list of intentions rather
 * than a list of dinners. A dish arrives here by being cooked, and moves up the
 * page by being cooked again.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, toast, plural } from '../ui.js';
import { getDb } from '../data.js';
import { getState } from '../store.js';
import { buildBook, bookAsText, OWNED_AT } from '../book.js';
import { changesIn, whenWords, timesWords } from '../memory.js';
import { copyText } from '../shopping.js';
import { printBook } from '../print.js';
import { foodIcon } from '../food-icon.js';
import { heroIngredients } from './today.js';
import { cardLook } from '../palette.js';
import { play } from '../feedback.js';

export function render(root, { navigate }) {
  const draw = () => mount(root, view(navigate));
  draw();
}

function view(navigate) {
  const state = getState();
  const { recipeIndex, ingIndex } = getDb();
  const book = buildBook(state, recipeIndex);
  const label = state.household.label || 'Our';

  if (!book.total) return emptyView(navigate);

  return h('section.view',
    h('div.view__head',
      h('div',
        h('p.eyebrow', `${plural(book.total, 'dish', 'dishes')} · ${plural(book.cooks, 'time')} cooked`),
        h('h1.view__title', 'Your', h('br'), h('em', 'cookbook')),
        h('p.view__sub',
          'Not the collection — the part of it you actually make, in the version you make it. ',
          'Nothing here was chosen from a list; it arrived by being cooked.')
      )
    ),

    h('div.row-actions.book__actions',
      h('button.btn', {
        type: 'button',
        onclick: async () => {
          const ok = await copyText(bookAsText(book, ingIndex, { title: `${label} cookbook` }));
          play(ok ? 'check' : 'warn');
          toast(ok ? 'Copied — paste it anywhere you like' : 'Could not copy');
        }
      }, 'Copy as text'),
      h('button.btn', {
        type: 'button',
        onclick: () => { play('tap'); printBook(book, ingIndex, { title: `${label} cookbook` }); }
      }, 'Print')
    ),

    book.owned.length
      ? shelf('Dishes you make',
          `Cooked ${OWNED_AT} times or more. These are the ones you can probably make without reading.`,
          book.owned, ingIndex, navigate)
      : null,

    book.cooked.length
      ? shelf('Also cooked',
          book.owned.length
            ? 'Once or twice so far.'
            : `Cook something ${OWNED_AT} times and it moves to the top of this page.`,
          book.cooked, ingIndex, navigate)
      : null,

    h('p.fine-print',
      'Assembled from meals marked cooked, on this device only. ',
      'Nothing on this page has ever been sent anywhere — see Settings to export or erase all of it.')
  );
}

function shelf(title, blurb, entries, ingIndex, navigate) {
  return h('section.card.block',
    h('h2.block__title', title),
    h('p.muted.small', blurb),
    h('div.book__list', ...entries.map(e => bookEntry(e, ingIndex, navigate)))
  );
}

/**
 * One dish as this kitchen makes it.
 *
 * The note is the largest text in the row, above the recipe's own blurb, which
 * is not shown at all. Whatever the recipe writer said about this dish, the
 * person who has made it four times has the better description.
 */
function bookEntry(entry, ingIndex, navigate) {
  const { recipe, times, lastWords, notes } = entry;
  const { swapped, added } = changesIn({ swaps: entry.swaps, added: entry.added }, ingIndex);
  const look = cardLook(recipe, ingIndex);
  const icons = heroIngredients(recipe, ingIndex, 2);

  return h('button.book__entry', {
    type: 'button',
    style: look.style,
    onclick: () => { play('tap'); navigate(`#/recipe/${recipe.id}`); }
  },
    h('span.book__art', ...icons.map(item => foodIcon(item, { size: 40 }))),
    h('span.book__body',
      h('span.book__title', recipe.title),
      // whenWords already says "last Friday" or "3 weeks ago", so no preposition
      // in front of it — "last last Friday" is the classic version of this bug.
      h('span.book__meta', `${capitalize(timesWords(times))} · made ${lastWords}`),

      swapped.length || added.length
        ? h('span.book__version',
            [swapped.length ? swapped.join('; ') : null,
              added.length ? `plus ${added.join(', ')}` : null].filter(Boolean).join(' · '))
        : null,

      notes.length
        ? h('span.book__note',
            h('span.book__note-text', notes[0].note),
            notes.length > 1
              ? h('span.book__note-more', ` and ${notes.length - 1} more`)
              : null)
        : null
    )
  );
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Empty, and not apologetic about it.
 *
 * The book is empty because nothing has been cooked yet, which is a fine and
 * temporary state. Saying so plainly, and saying exactly what fills it, beats a
 * grayed-out shelf implying somebody has failed at something.
 */
function emptyView(navigate) {
  return h('section.view',
    h('div.view__head', h('h1.view__title', 'Your cookbook')),
    h('div.empty-state',
      h('div.empty-state__dice', '📔'),
      h('p.muted',
        'Empty, for now. Every meal you mark as cooked lands here — in the version you cooked it, ',
        'with whatever you wrote about it afterwards.'),
      h('p.muted.small',
        `Cook one ${OWNED_AT} times and it moves to the top as a dish you make rather than a recipe you follow.`),
      h('div.row-actions',
        h('button.btn.btn--primary', { type: 'button', onclick: () => navigate('#/roll') }, '🎲 Roll dinner'),
        h('button.btn', { type: 'button', onclick: () => navigate('#/browse') }, 'Browse recipes')
      )
    )
  );
}

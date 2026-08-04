/**
 * memory-panel.js — "you have made this before", on the recipe screen.
 *
 * Placed high, above the ingredients, because it changes how the rest of the
 * page is read. A recipe you have cooked three times is not a recipe you are
 * evaluating; it is one you are checking. The question you have is what you did
 * last time, and the page should answer it before you go looking.
 *
 * It draws nothing at all for a dish nobody has cooked. "You have made this 0
 * times" is not information, and an empty state on every one of 242 recipes is
 * a wall of nothing that teaches people to scroll past the block entirely — so
 * by the time it does have something to say, nobody is reading it.
 *
 * Your own note gets the largest type in the block. Everything else here the
 * app worked out; the note is the only part that came from the kitchen.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, toast, sheet } from '../ui.js';
import { annotateCook } from '../store.js';
import { play } from '../feedback.js';
import {
  cooksOf, lastNote, whenWords, timesWords, whatHappened, notesOn
} from '../memory.js';

export function memoryBlock(recipe, state, ingIndex, { draw } = {}) {
  const cooks = cooksOf(recipe.id, state);
  if (!cooks.length) return null;

  const last = cooks[0];
  const changed = whatHappened(last, ingIndex);
  const note = lastNote(recipe.id, state);
  const others = notesOn(recipe.id, state).filter(e => e !== note);

  return h('section.memory',
    h('h2.memory__title', 'You have made this'),
    h('p.memory__when',
      h('strong', capitalize(timesWords(cooks.length))),
      ` · last made ${whenWords(last.at)}`,
      last.servings ? ` · ${last.servings} servings` : ''
    ),

    changed ? h('p.memory__did', changed) : null,

    note
      ? h('blockquote.memory__note',
          h('p', note.note),
          h('cite', whenWords(note.at))
        )
      : null,

    // Older notes are folded away rather than dropped. A dish cooked eight
    // times accumulates a margin, and the margin is the point — but only the
    // most recent line should be competing with the recipe for attention.
    others.length
      ? h('details.memory__more',
          h('summary', `${others.length} earlier ${others.length === 1 ? 'note' : 'notes'}`),
          ...others.map(e => h('blockquote.memory__note.memory__note--old',
            h('p', e.note), h('cite', whenWords(e.at))))
        )
      : null,

    h('button.memory__add', {
      type: 'button',
      onclick: () => openNote(recipe, last, draw)
    }, note ? 'Add a note' : 'Add a note for next time')
  );
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Writing a note about a dish you are not currently cooking.
 *
 * It attaches to the most recent cook rather than to the recipe, because a note
 * is always about a particular time you made it — "needed ten more minutes" is
 * a fact about one Tuesday, and pretending otherwise is how a note ends up
 * contradicting itself two years later.
 */
export function openNote(recipe, entry, draw) {
  const field = h('textarea.memory__field', {
    rows: 4,
    placeholder: 'Needed ten more minutes. Double the garlic.',
    value: entry?.note || ''
  });

  const dlg = sheet('Your note',
    h('div',
      h('p.muted.small', `About the time you cooked ${recipe.title} ${whenWords(entry?.at)}.`),
      field
    ),
    {
      actions: [
        h('button.btn', { type: 'button', onclick: () => dlg.close() }, 'Cancel'),
        h('button.btn.btn--primary', {
          type: 'button',
          onclick: () => {
            annotateCook(recipe.id, { note: field.value }, { at: entry?.at || null });
            play('check');
            dlg.close();
            toast(field.value.trim() ? 'Noted.' : 'Note removed.');
            draw?.();
          }
        }, 'Save')
      ]
    }
  );
  field.focus();
  return dlg;
}

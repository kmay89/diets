/**
 * book.js — the household's own cookbook, assembled from what it has cooked.
 *
 * The collection is 242 recipes somebody else wrote. This is the much smaller,
 * much more valuable book underneath it: the dishes this kitchen actually
 * makes, in the versions it actually makes them, with the notes it wrote in the
 * margins. Nobody needs a personal copy of 242 recipes. Everybody who cooks
 * ends up with about fifteen dishes they can make without looking, and losing
 * that list — to a new phone, a lost notebook, a dead laptop — is the thing
 * people are actually afraid of.
 *
 * Three shelves, in order of how much they mean.
 *
 *   Yours       cooked enough times to be memorized rather than followed
 *   Cooked      everything else that has been through the kitchen once or twice
 *   Noted       anything you wrote about, however few times you made it
 *
 * The shelves are earned by cooking rather than chosen from a menu. A star you
 * have to remember to press is a star nobody presses, and the resulting list
 * describes intentions rather than dinners.
 *
 * Nothing here is a new store. It is the cook log read a second way, which is
 * the point: memory that only serves one screen is a database, and memory that
 * serves several is a memory.
 *
 * ERRERLabs — MIT licensed.
 */

import { cooksOf, whenWords, changesIn, notesOn } from './memory.js';

/** Cooked this many times and it is not a recipe any more, it is a dish you make. */
export const OWNED_AT = 3;

/**
 * One entry per dish, newest-cooked first, with everything the book knows.
 *
 * `swaps` and `added` come from the most recent cook rather than from current
 * settings, because the book is a record of what was made and not a plan for
 * what might be.
 */
export function buildBook(state, recipeIndex, { ownedAt = OWNED_AT } = {}) {
  const seen = new Set();
  const entries = [];

  for (const cook of state?.history || []) {
    if (!cook || seen.has(cook.id)) continue;
    seen.add(cook.id);
    const recipe = recipeIndex.get(cook.id);
    if (!recipe) continue;

    const cooks = cooksOf(cook.id, state);
    const notes = notesOn(cook.id, state);
    entries.push({
      recipe,
      times: cooks.length,
      last: cooks[0]?.at || null,
      lastWords: whenWords(cooks[0]?.at),
      servings: cooks[0]?.servings || null,
      swaps: cooks[0]?.swaps || {},
      added: cooks[0]?.added || [],
      notes,
      owned: cooks.length >= ownedAt,
      liked: state?.recipeLikes?.[cook.id] === 1
    });
  }

  const owned = entries.filter(e => e.owned);
  const cooked = entries.filter(e => !e.owned);
  const noted = entries.filter(e => e.notes.length);

  return {
    entries,
    owned,
    cooked,
    noted,
    total: entries.length,
    cooks: (state?.history || []).filter(e => recipeIndex.has(e.id)).length
  };
}

/**
 * The book in plain text, for keeping somewhere that is not this app.
 *
 * A cookbook you cannot get out of the software is not yours, it is the
 * software's. This is deliberately Markdown rather than JSON: the export that
 * matters is the one a person can read in twenty years, on a machine none of
 * this runs on.
 */
export function bookAsText(book, ingIndex, { title = 'Our cookbook' } = {}) {
  const out = [`# ${title}`, ''];
  out.push(`${book.total} ${book.total === 1 ? 'dish' : 'dishes'}, ${book.cooks} ${book.cooks === 1 ? 'time' : 'times'} cooked.`, '');

  const section = (heading, entries) => {
    if (!entries.length) return;
    out.push(`## ${heading}`, '');
    for (const e of entries) {
      out.push(`### ${e.recipe.title}`);
      out.push(`Cooked ${e.times} ${e.times === 1 ? 'time' : 'times'} · made ${e.lastWords}`);

      const { swapped, added } = changesIn({ swaps: e.swaps, added: e.added }, ingIndex);
      if (swapped.length) out.push(`Your version: ${swapped.join('; ')}`);
      if (added.length) out.push(`Added: ${added.join(', ')}`);

      for (const note of e.notes) out.push('', `> ${note.note}`, `> — ${whenWords(note.at)}`);
      out.push('');
    }
  };

  section('Dishes you make', book.owned);
  section('Also cooked', book.cooked);

  out.push('---', 'Kept on your own device by Veg-Nourish. Nothing here was ever sent anywhere.');
  return out.join('\n');
}

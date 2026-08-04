/**
 * after-cooking.js — the ten seconds after the last step.
 *
 * This is the only moment the app will ever get a straight answer about a meal.
 * Ask on Thursday whether Tuesday's dinner was any good and you get a shrug;
 * ask while it is on the plate and you get the truth, and sometimes the sentence
 * that makes the dish work next time.
 *
 * So it asks once, here, and it asks the smallest possible question: again
 * sometime, yes or no. One tap answers it and one tap dismisses it, and the
 * meal is already recorded either way — nothing is being held hostage. The note
 * field is folded away, because most nights there is nothing to say and a text
 * box staring at somebody holding a hot pan is a demand, not an invitation.
 *
 * The answer is not just filed. "Not really" tells the roll to stop offering
 * it, which is the whole reason the question is worth asking: an app that
 * collects opinions and does nothing with them is running a survey.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, sheet, toast } from '../ui.js';
import { annotateCook, setRecipeLike } from '../store.js';
import { play } from '../feedback.js';

/**
 * @param recipe the dish just cooked
 * @param entry  the history entry markCooked returned, so the answer lands on
 *               this cook and not on some earlier one
 * @param done   called when the sheet closes, however it closes
 */
export function askAboutIt(recipe, entry, done = () => {}) {
  let answered = null;

  const field = h('textarea.memory__field', {
    rows: 3,
    placeholder: 'Needed ten more minutes. Double the garlic.'
  });

  const noteBlock = h('details.after__note',
    h('summary', 'Anything to remember for next time?'),
    field
  );

  const choice = (value, label) => h('button', {
    type: 'button',
    class: 'after__choice',
    onclick: (e) => {
      answered = value;
      for (const b of e.currentTarget.parentElement.children) b.classList.remove('is-on');
      e.currentTarget.classList.add('is-on');
      play(value === 1 ? 'check' : 'uncheck');
    }
  }, label);

  const save = () => {
    const note = field.value.trim();
    if (answered || note) {
      annotateCook(recipe.id, { again: answered || undefined, note }, { at: entry?.at || null });
    }
    // A "not really" is the roll's business, not just the log's. A yes is left
    // alone: liking a dish enough to repeat it is not the same as making it a
    // favorite, and quietly promoting it would put words in somebody's mouth.
    if (answered === -1) setRecipeLike(recipe.id, -1);
    dlg.close();
    if (note) toast('Noted. It will be on the recipe next time.');
  };

  const dlg = sheet(`How was ${shortName(recipe.title)}?`,
    h('div',
      h('p.muted.small', 'Marked as cooked. This is optional — close it and nothing is lost.'),
      h('div.after__choices', choice(1, 'Again sometime'), choice(-1, 'Not really')),
      noteBlock
    ),
    { actions: [h('button.btn.btn--primary', { type: 'button', onclick: save }, 'Done')] }
  );

  dlg.addEventListener('close', done);
  return dlg;
}

/** Enough of the title to make the question read like a question. */
const shortName = (title) => String(title).split(/[,(—]/)[0].trim();

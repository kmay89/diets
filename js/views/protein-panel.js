/**
 * protein-panel.js — pick the protein, then pick what happens to it.
 *
 * Two rows, because they are two decisions. The first is what goes in, with the
 * amount already converted and what is in the pantry floated to the front. The
 * second is the one recipes never offer at all: the same ingredient seared,
 * roasted, braised or crumbled is four different dinners, and the choice is
 * usually made by how much time there is rather than by what tastes best.
 *
 * Every method card carries the failure mode. That is the part a recipe leaves
 * out and the part that decides whether somebody cooks the dish twice.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, sheet, pill, minutes } from '../ui.js';
import { formatQty } from '../nutrition.js';
import { foodIcon } from '../food-icon.js';
import {
  proteinsIn, proteinOptionsFor, methodsFor, methodUsedBy, prepFor, methodTrade
} from '../proteins.js';
import { getState } from '../store.js';
import { avoidedSet } from '../allergy.js';

/**
 * The block, for every protein the recipe contains.
 *
 * A dish with a fork in the road has two, and they swap independently — the
 * chickpeas and the chicken beside them are separate decisions made by
 * different people at the same table.
 */
export function proteinBlock(recipe, ingIndex, { pantry = {}, scale = 1, onSwap = null } = {}) {
  const found = proteinsIn(recipe);
  if (!found.length) return null;

  return h('section.card.block.protein',
    h('h2.block__title', found.length > 1 ? 'The proteins, and how to cook them' : 'The protein, and how to cook it'),
    ...found.map(current => proteinRow(recipe, current, ingIndex, { pantry, scale, onSwap }))
  );
}

function proteinRow(recipe, current, ingIndex, { pantry, scale, onSwap }) {
  const item = ingIndex.get(current.line.ing);
  const options = proteinOptionsFor(recipe, current, {
    ingIndex, pantry, avoid: avoidedSet(getState().prefs), limit: 6
  });
  const using = methodUsedBy(recipe, current.protein);
  const ways = methodsFor(current.protein.id);
  const prep = prepFor(current.protein.id);

  return h('div.protein-row',
    h('div.protein-row__head',
      item ? foodIcon(item, { size: 30 }) : null,
      h('div',
        h('p.protein-row__name',
          h('strong', current.protein.name),
          current.from === 'omnivore' ? pill('the meat fork', 'meat') : null,
          current.from === 'veg' ? pill('the vegetarian fork', 'green') : null
        ),
        h('p.muted.small', current.protein.tastes)
      )
    ),

    h('p.protein-row__wants', h('strong', 'What it wants: '), current.protein.wants),

    options.length
      ? h('div.protein-swaps',
          h('p.field__label', 'Use instead'),
          h('div.chip-row.chip-row--tight',
            ...options.map(o => h('button', {
              type: 'button',
              class: `chip protein-chip ${o.inPantry ? 'is-have' : ''}`,
              title: `${o.protein.tastes} ${o.minutesDelta ? `About ${Math.abs(o.minutesDelta)} minutes ${o.minutesDelta > 0 ? 'longer' : 'quicker'}.` : 'About the same time.'}`,
              onclick: () => openProtein(recipe, current, o, ingIndex, { scale, onSwap })
            },
              o.protein.name,
              o.amount ? h('span.protein-chip__qty', formatQty(o.amount.qty * scale, o.amount.unit)) : null,
              o.inPantry ? h('span.protein-chip__have', 'have it') : null
            ))
          ),
          h('p.fine-print', 'Amounts are by weight against the original, which is how cooks actually swap — a pound of chicken becomes a pound of tofu, not the weight that matches its protein.')
        )
      : null,

    h('div.methods',
      h('p.field__label',
        'Ways to cook it',
        using ? h('span.muted.small', ` — this recipe ${using.name.toLowerCase()}s it`) : null
      ),
      h('div.method-row',
        ...ways.map(m => h('button', {
          type: 'button',
          class: `method-card ${using?.id === m.id ? 'is-current' : ''}`,
          onclick: () => openMethod(m, current.protein)
        },
          h('span.method-card__icon', m.icon),
          h('span.method-card__name', m.name),
          h('span.method-card__time', `${m.minutes[0]}–${m.minutes[1]} min`),
          h('span.method-card__trade', methodTrade(m))
        ))
      )
    ),

    prep.length
      ? h('details.explain',
          h('summary', `Before the heat: ${prep.map(p => p.name.toLowerCase()).join(', ')}`),
          h('dl.notes', ...prep.flatMap(p => [
            h('dt', `${p.icon} ${p.name} — ${p.when}`),
            h('dd', h('p', p.what), h('p.muted.small', p.why), h('p.fine-print', `Skip it when: ${p.skipWhen}`))
          ]))
        )
      : null
  );
}

/* ------------------------------------------------------------------ *
 * Sheets
 * ------------------------------------------------------------------ */

function openMethod(method, protein) {
  const s = method.scores || {};
  sheet(`${method.icon} ${method.name}`,
    h('div.method-sheet',
      h('p.lede', method.what),
      h('div.pill-row',
        pill(`${method.minutes[0]}–${method.minutes[1]} min`),
        pill(method.heat),
        pill(methodTrade(method))
      ),
      h('div.score-grid',
        ...[['flavor', 'Flavor'], ['speed', 'Speed'], ['forgiving', 'Forgiving'], ['handsOff', 'Leaves you free'], ['cleanup', 'Easy cleanup']]
          .map(([k, label]) => h('div.score',
            h('span.score__label', label),
            h('span.score__dots', '●'.repeat(s[k] || 0) + '○'.repeat(5 - (s[k] || 0)))
          ))
      ),
      h('dl.notes',
        h('dt', 'Why it works'), h('dd', method.why),
        h('dt', 'How you know it is done'), h('dd', method.doneWhen),
        h('dt', 'How it goes wrong'), h('dd', method.goesWrong),
        h('dt', 'What it teaches you'), h('dd', method.teaches)
      ),
      protein ? h('p.fine-print', `For ${protein.name.toLowerCase()}: ${protein.goesWrong}`) : null
    )
  );
}

function openProtein(recipe, current, option, ingIndex, { scale, onSwap }) {
  const amount = option.amount ? formatQty(option.amount.qty * scale, option.amount.unit) : null;
  const dlg = sheet(`${option.protein.name} instead`,
    h('div',
      h('p.lede',
        amount ? h('strong', `${amount}. `) : null,
        option.protein.tastes),
      h('dl.notes',
        h('dt', 'What it wants'), h('dd', option.protein.wants),
        h('dt', 'How it goes wrong'), h('dd', option.protein.goesWrong),
        option.protein.buy ? h('dt', 'Buying it') : null,
        option.protein.buy ? h('dd', option.protein.buy) : null
      ),
      h('p.muted.small',
        option.minutesDelta === 0
          ? 'About the same cooking time as the original.'
          : `About ${minutes(Math.abs(option.minutesDelta))} ${option.minutesDelta > 0 ? 'longer' : 'quicker'} than the original.`),
      option.shared.length
        ? h('p.muted.small', `Cooks the same ways: ${option.shared.map(m => m.name.toLowerCase()).join(', ')}.`)
        : h('p.muted.small', 'It does not cook the way the original does, so read the method notes before you commit.'),
      option.protein.note ? h('p.fine-print', option.protein.note) : null,
      onSwap
        ? h('div.row-actions',
            h('button.btn.btn--primary', {
              type: 'button',
              onclick: () => { onSwap(current, option); dlg.close(); }
            }, `Use ${option.protein.name.toLowerCase()}`)
          )
        : null
    )
  );
}

/**
 * table-panel.js — the countdown, the plate, and what to drink.
 *
 * Everything on this screen after the method finishes. It sits behind a summary
 * line rather than open by default, because it is the part you read once for a
 * dish and then know — and the part nobody wants between them and the recipe.
 *
 * The eating and drinking guidance renders through the citation engine, so a
 * sentence about blood sugar carries its source and the caveat that belongs
 * with it, exactly like every other factual claim in this app.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, sheet } from '../ui.js';
import { citeMarkersFor } from '../citations.js';
import { tableFor } from '../table.js';

/**
 * The block. `serveAt` turns the countdown into clock times; without it the
 * marks stay relative, which is what a recipe page wants until somebody says
 * when they are eating.
 */
export function tableBlock(recipe, { perServing, balance, serveAt = null, onSetTime = null, inMethod = true } = {}) {
  const t = tableFor(recipe, { perServing, balance, serveAt });
  if (!t) return null;

  // Setting the table and warming the plates are now offered inside the method,
  // on the step where the pot is working without you. Printing them here too
  // would be the same advice twice on one page, and the second copy is the one
  // phrased as a countdown to a dinner that has not started — which is what made
  // this read as a chore list. What stays is the shape of the evening: when to
  // start, when your hands are needed, when everybody sits down.
  const marks = inMethod ? t.timeline.filter(m => m.phase === 'plan') : t.timeline;

  return h('section.card.block.table-block',
    h('h2.block__title', 'At the table'),
    h('p.muted.small', 'The twenty minutes on either side of the pan coming off the heat — the part a recipe never prints.'),

    h('div.timeline',
      h('div.timeline__head',
        h('p.field__label', serveAt ? 'Working back from when you eat' : 'Working back from when you sit down'),
        onSetTime
          ? h('button.btn.btn--small', { type: 'button', onclick: onSetTime },
              serveAt ? clock(serveAt) : 'Set a time')
          : null
      ),
      ...marks.map(mark => h('div.timeline__row',
        h('span.timeline__at', mark.time ? clock(mark.time) : (mark.at ? `−${mark.at}m` : 'now')),
        h('div.timeline__body',
          h('p.timeline__title', mark.title),
          h('p.timeline__text', mark.body)
        )
      ))
    ),

    h('details.explain',
      h('summary', 'Getting it onto a plate'),
      h('div',
        t.plating?.forCourse ? h('p.lede', t.plating.forCourse) : null,
        h('dl.notes', ...(t.plating?.principles || []).flatMap(p => [h('dt', p.title), h('dd', p.body)]))
      )
    ),

    h('details.explain',
      h('summary', 'Eating it — order, pace, and afterward'),
      h('div.eating',
        ...t.eating.map(note => h('div.eating__note',
          h('h4.step__sub', note.title),
          h('p', note.body, ' ', note.claim ? claimMarker(note.claim) : null),
          h('p.muted.small', note.practical),
          h('p.fine-print', note.honest)
        ))
      )
    ),

    h('div.water',
      h('p.field__label', '💧 What to drink'),
      ...t.water.notes.map(note => h('div.water__note',
        h('p', h('strong', note.title + ' — '), note.say),
        h('p.muted.small', note.why)
      )),
      t.water.base
        ? h('p.fine-print',
            t.water.base.body, ' ', claimMarker(t.water.base.claim), ' ', t.water.base.honest)
        : null,
      h('button.linkish', { type: 'button', onclick: () => openMyths(t) }, 'Four things about eating that are not true')
    ),

    t.leftovers
      ? h('p.muted.small', h('strong', t.leftovers.title + ': '), t.leftovers.body)
      : null
  );
}

/**
 * The markers for one claim id.
 *
 * The table data names claims — table.walk, table.order — because that is the
 * unit a sentence belongs to; the citation engine turns a claim into the papers
 * behind it. If citations failed to load, the sentence renders without markers
 * rather than the page failing to render at all.
 */
function claimMarker(claimId) {
  if (!claimId) return null;
  try {
    return h('span.cite-row', ...citeMarkersFor(claimId));
  } catch {
    return null;
  }
}

function openMyths(t) {
  sheet('Four things that are not true',
    h('div',
      ...(t.water.myths || []).map(m => h('div.myth',
        h('p.myth__claim', '“' + m.claim + '”'),
        h('p.myth__truth', m.truth)
      ))
    )
  );
}

function clock(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

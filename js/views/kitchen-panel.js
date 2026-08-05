/**
 * kitchen-panel.js — who else can help, and what this dish teaches.
 *
 * The jobs list is per age band and per step, so it says "step 3 and step 7"
 * rather than leaving a parent to work out which parts of a recipe a
 * five-year-old can be trusted with while something is on the stove.
 *
 * The wording is deliberate and it is worth being explicit about. A child
 * tearing basil is cooking, not helping, which is why every job says what it
 * teaches. And a recipe is described by what it asks for, never by how good the
 * cook needs to be — nothing in this app calls a person a beginner.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, sheet } from '../ui.js';
import { jobsChart, bandsOfHousehold, grownUpSteps, asksFor, teachesIn, kitchenWording } from '../kitchen.js';

/** What this recipe asks of whoever is cooking it — a pill for the head row. */
export function asksPill(recipe) {
  const rung = asksFor(recipe);
  if (!rung) return null;
  return h('button.pill.pill--ask', {
    type: 'button',
    title: rung.blurb,
    onclick: () => sheet(`${rung.icon} ${rung.name}`,
      h('div',
        h('p.lede', rung.blurb),
        h('p', h('strong', 'What it asks for: '), rung.asks),
        h('p.muted.small',
          `${rung.counts.steps} steps, ${rung.counts.ingredients} ingredients, `,
          `${rung.counts.activeMin} minutes with your hands in it.`),
        h('p.fine-print', kitchenWording()?.note || '')
      ))
  }, `${rung.icon} ${rung.name}`);
}

/** The lessons hiding in this recipe's own method. */
export function teachesBlock(recipe) {
  const lessons = teachesIn(recipe);
  if (!lessons.length) return null;
  const [first, ...rest] = lessons;

  return h('section.card.block.teaches',
    h('h2.block__title', 'What this one teaches you'),
    h('div.lesson',
      h('h3.lesson__title', first.title),
      h('p', first.body)
    ),
    rest.length
      ? h('details.explain',
          h('summary', `${rest.length} more technique${rest.length > 1 ? 's' : ''} in this recipe`),
          h('dl.notes', ...rest.flatMap(l => [h('dt', l.title), h('dd', l.body)]))
        )
      : null,
    h('p.fine-print',
      'Read off the recipe\'s own method rather than written for it, so it is right most of the time and occasionally reaches. ',
      'Nobody learns emulsification from a chapter about it — they learn it holding a ladle of pasta water.')
  );
}

/**
 * Jobs for everybody else in the kitchen — one row per job, ages across.
 *
 * This was five cards, one per age band, each listing the jobs that suited it.
 * Since a job like setting the table suits every age there is, it appeared in
 * all five, and a recipe with three usable jobs filled most of a screen with
 * eleven chips saying three things. The question a parent actually arrives with
 * — *what can my six-year-old do* — meant reading all five cards.
 *
 * Turned ninety degrees it is three rows and a header, the age is an axis
 * instead of a heading, and if the household has children in it their column is
 * marked with their name. The answer is then the one lit column.
 */
export function kidsBlock(recipe, { members = [] } = {}) {
  const chart = jobsChart(recipe);
  if (!chart) return null;
  const grown = grownUpSteps(recipe);
  const mine = bandsOfHousehold(members);
  const somePartial = chart.rows.some(r => r.cells.some(c => c.partial));

  return h('section.card.block.kids',
    h('h2.block__title', '🧑‍🍳 Who else can help'),
    h('p.muted.small',
      'Matched to this recipe\'s own steps. Children who cook eat more of what they cooked, which is a better ',
      'argument than any conversation about vegetables has ever been.'),

    h('div.jobgrid', { role: 'table', 'aria-label': 'Jobs by age' },
      // The age axis. Every band every time, including the ones this recipe has
      // nothing for — an axis that changes shape between recipes cannot be
      // compared with the last one, and an empty column is an answer.
      h('div.jobgrid__head', { role: 'row' },
        h('span.jobgrid__corner', { role: 'columnheader' }, 'Job'),
        ...chart.bands.map(band => h('span.jobgrid__age', {
          role: 'columnheader',
          class: mine.has(band.id) ? 'is-mine' : '',
          title: band.blurb
        },
          h('strong', band.label),
          h('span.jobgrid__who', mine.get(band.id)?.join(', ') || band.short)
        ))
      ),

      ...chart.rows.map(row => h('div.jobgrid__row', { role: 'row' },
        h('button.jobgrid__job', {
          type: 'button',
          role: 'rowheader',
          onclick: () => openJob(row, chart.bands)
        },
          h('span.job__icon', row.job.icon),
          h('span.job__name', row.job.name),
          h('span.job__steps', row.anyTime ? 'any time' : `step ${row.steps.join(', ')}`)
        ),
        ...row.cells.map((cell, i) => h('span.jobgrid__cell', {
          role: 'cell',
          class: [cell.on ? 'is-on' : 'is-off', cell.partial ? 'is-partial' : '',
            mine.has(chart.bands[i].id) ? 'is-mine' : ''].filter(Boolean).join(' '),
          // The cell is a mark, and a mark cannot be read by a screen reader.
          // The sentence is the cell as far as anything non-visual is concerned.
          'aria-label': cellWords(row, cell, chart.bands[i])
        }))
      ))
    ),

    h('p.jobgrid__legend',
      h('span.jobgrid__key.is-on'), ' a good job for this age',
      somePartial
        ? h('span', h('span.jobgrid__key.is-partial'), ' all but the step with heat or a blade in it')
        : null
    ),

    grown.steps.length
      ? h('div.grownup',
          h('p.grownup__title', '⚠️ Steps for a grown-up'),
          h('p.muted.small', grown.say),
          h('ul.tight', ...grown.steps.map(s => h('li', h('strong', `Step ${s.index + 1}. `), shorten(s.text))))
        )
      : h('p.muted.small', 'Nothing in this recipe has heat or a blade in it that a child could not be shown once and then trusted with.')
  );
}

/** What a cell means, said in a sentence — the only version a screen reader gets. */
function cellWords(row, cell, band) {
  if (!cell.on) return `${row.job.name}: not this age (${band.label})`;
  if (cell.partial) return `${row.job.name}: ${band.label}, step ${cell.steps.join(', ')} only — the rest has heat or a blade in it`;
  return `${row.job.name}: ${band.label}`;
}

/**
 * One job in full, for every age it suits.
 *
 * Opened from a row rather than from a chip in one band, so it says what the row
 * says: here is the job, here is what it teaches, here is how to do it safely,
 * and here is what supervision means at each age it is offered for — which is
 * the part that actually differs, and the part the old sheet could only ever
 * show one band of at a time.
 */
function openJob(row, bands) {
  const offered = bands.filter((_, i) => row.cells[i].on);

  sheet(`${row.job.icon} ${row.job.name}`,
    h('div',
      h('p.lede', row.job.teaches),
      h('dl.notes',
        h('dt', 'Doing it safely'), h('dd', row.job.safe),
        ...offered.flatMap((band, n) => {
          const cell = row.cells[bands.indexOf(band)];
          return [
            h('dt', band.label, cell.partial ? h('span.muted', ' — part of it') : null),
            h('dd',
              h('span', band.supervision),
              cell.partial
                ? h('p.muted.small', `Here, that means step ${cell.steps.join(', ')} — the rest of this job has heat or a blade in it at this age.`)
                : null
            )
          ];
        })
      ),
      row.steps.length
        ? h('p.muted.small', `In this recipe: step ${row.steps.join(', step ')}.`)
        : h('p.muted.small', 'This one is not tied to a step — it is a job any time.')
    )
  );
}

const shorten = (text) => (text.length > 110 ? text.slice(0, 107).trimEnd() + '…' : text);

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
import { jobsFor, grownUpSteps, asksFor, teachesIn, kitchenWording } from '../kitchen.js';

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

/** Jobs for everybody else in the kitchen, by age. */
export function kidsBlock(recipe) {
  const bands = jobsFor(recipe);
  if (!bands.length) return null;
  const grown = grownUpSteps(recipe);

  return h('section.card.block.kids',
    h('h2.block__title', '🧑‍🍳 Who else can help'),
    h('p.muted.small',
      'Matched to this recipe\'s own steps. Children who cook eat more of what they cooked, which is a better ',
      'argument than any conversation about vegetables has ever been.'),

    h('div.bands', ...bands.map(band => h('div.band',
      h('div.band__head',
        h('span.band__age', band.age.label),
        h('span.band__short', band.age.short)
      ),
      h('div.band__jobs', ...band.jobs.map(job => h('button.job', {
        type: 'button',
        onclick: () => openJob(job, band.age)
      },
        h('span.job__icon', job.icon),
        h('span.job__name', job.name),
        job.steps.length
          ? h('span.job__steps', `step ${job.steps.join(', ')}`)
          : h('span.job__steps', 'any time')
      )))
    ))),

    grown.steps.length
      ? h('div.grownup',
          h('p.grownup__title', '⚠️ Steps for a grown-up'),
          h('p.muted.small', grown.say),
          h('ul.tight', ...grown.steps.map(s => h('li', h('strong', `Step ${s.index + 1}. `), shorten(s.text))))
        )
      : h('p.muted.small', 'Nothing in this recipe has heat or a blade in it that a child could not be shown once and then trusted with.')
  );
}

function openJob(job, age) {
  sheet(`${job.icon} ${job.name}`,
    h('div',
      h('p.lede', job.teaches),
      h('dl.notes',
        h('dt', 'Doing it safely'), h('dd', job.safe),
        h('dt', `About ${age.label}`), h('dd', age.blurb),
        h('dt', 'Supervision'), h('dd', age.supervision)
      ),
      job.steps.length
        ? h('p.muted.small', `In this recipe: step ${job.steps.join(', step ')}.`)
        : h('p.muted.small', 'This one is not tied to a step — it is a job any time.')
    )
  );
}

const shorten = (text) => (text.length > 110 ? text.slice(0, 107).trimEnd() + '…' : text);

/**
 * garden.js (view) — what to plant, when, and what it unlocks in the kitchen.
 * Calibrated for USDA zone 6a by default; edit data/garden.json for your own region.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, pill, titleCase } from '../ui.js';
import { getDb, gardenMonth, recipesUsing } from '../data.js';

export function render(root, { navigate }) {
  const { garden, ingIndex, recipeIndex } = getDb();
  const monthIndex = new Date().getMonth();
  const now = gardenMonth(monthIndex);

  const growable = getDb().ingredients.filter(i => i.garden?.grow);

  mount(root, h('section.view',
    h('div.view__head',
      h('div',
        h('h1.view__title', 'The garden'),
        h('p.view__sub', `${garden.location.name} · last frost ${garden.location.lastFrostAvg} · first frost ${garden.location.firstFrostAvg}`)
      )
    ),

    h('section.card.block.now',
      h('h2.block__title', `Right now — ${now.month}`),
      now.tasks?.length ? h('div', h('h3.step__sub', 'To do'), h('ul.tight', ...now.tasks.map(t => h('li', t)))) : null,
      now.harvest?.length ? h('div', h('h3.step__sub', 'Coming out of the ground'), h('div.pill-row', ...now.harvest.map(x => pill(x, 'green')))) : null,
      now.recipeTie?.length
        ? h('div',
            h('h3.step__sub', 'Cook this with it'),
            h('div.chip-row', ...now.recipeTie.map(id => {
              const r = recipeIndex.get(id);
              return r ? h('button.chip', { type: 'button', onclick: () => navigate(`#/recipe/${id}`) }, r.title) : null;
            }))
          )
        : null
    ),

    h('section.card.block',
      h('h2.block__title', garden.startHere.title),
      h('p.muted.small', garden.philosophy),
      h('div.grow-list',
        ...garden.startHere.items.map(item => {
          const ing = ingIndex.get(item.ing);
          const uses = recipesUsing(item.ing).length;
          return h('article.grow',
            h('h3.grow__name', ing?.name || item.ing),
            h('p', item.why),
            h('p.muted.small', h('strong', 'How: '), item.how),
            uses ? h('p.muted.small', `Used in ${uses} recipes here.`) : null
          );
        })
      )
    ),

    h('section.card.block',
      h('h2.block__title', 'Year at a glance'),
      ...garden.calendar.map((m, i) => h('details', { class: 'month', open: i === monthIndex },
        h('summary', h('strong', m.month), m.harvest?.length ? h('span.muted.small', ` — ${m.harvest.slice(0, 3).join(', ')}`) : null),
        m.tasks?.length ? h('ul.tight', ...m.tasks.map(t => h('li', t))) : null,
        m.harvest?.length ? h('p.muted.small', h('strong', 'Harvest: '), m.harvest.join(', ')) : null
      ))
    ),

    h('section.card.block',
      h('h2.block__title', garden.containerOnly.title),
      h('div.pill-row', ...garden.containerOnly.items.map(id => pill(ingIndex.get(id)?.name || id, 'green'))),
      h('p.muted.small', garden.containerOnly.note)
    ),

    h('section.card.block',
      h('h2.block__title', 'Everything in this app you could grow'),
      h('div.grow-grid',
        ...growable.map(i => h('div.grow-cell',
          h('strong', i.name),
          i.garden.difficulty ? h('span.pill', i.garden.difficulty) : null,
          i.garden.sow ? h('p.muted.small', h('strong', 'Sow: '), i.garden.sow) : null,
          i.garden.harvest ? h('p.muted.small', h('strong', 'Harvest: '), i.garden.harvest) : null,
          i.garden.note ? h('p.muted.small', i.garden.note) : null
        ))
      )
    ),

    h('section.card.block',
      h('h2.block__title', 'Local, when you would rather not grow it'),
      ...garden.localSources.map(s => h('div.source',
        h('strong', s.name),
        h('p.muted.small', h('em', s.when), ' — ', s.note)
      ))
    ),

    h('div', h('p.fine-print', garden.location.note), garden.location.howToAdapt ? h('p.fine-print', garden.location.howToAdapt) : null)
  ));
}

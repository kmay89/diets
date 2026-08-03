/**
 * why.js (view) — the case for cooking this way, with every claim sourced.
 *
 * This is the screen that has to earn trust. It does that by being specific,
 * by citing everything, by naming the limits of each piece of evidence, and by
 * never telling anyone what they must eat.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount } from '../ui.js';
import { getCitations, renderClaims, renderReferences, uncitedSources, openSource } from '../citations.js';

export function render(root, { navigate }) {
  const { topics } = getCitations();

  mount(root, h('section.view.prose-view',
    h('header.hero',
      h('p.hero__eyebrow', 'Why cook this way'),
      h('h1.hero__title', 'Food is nourishment before it is anything else.'),
      h('p.hero__lede',
        'Every number on this page is attached to a source you can open, with the kind of study it ',
        'came from and what it does not show. Where the evidence is strong we say so. Where it is a ',
        'model or an opinion, we say that too.'
      )
    ),

    ...topics.map(topic => topicBlock(topic)),

    h('section.card.block',
      h('h2.block__title', 'References'),
      h('p.muted.small', 'Numbered in the order they first appear above. Tap any one for the full record, including what it does not show.'),
      renderReferences(),
      uncited()
    ),

    h('section.card.block.method',
      h('h2.block__title', 'How we handle evidence'),
      h('ul.tight',
        h('li', h('strong', 'Claims are data, not prose. '), 'Every factual sentence on this screen lives in a file with its sources attached. A claim without a source cannot be displayed.'),
        h('li', h('strong', 'Every source carries its caveat. '), 'A citation showing only the flattering half of a study borrows the authority of research while discarding what makes research trustworthy.'),
        h('li', h('strong', 'Study types are labeled. '), 'A randomized trial and a modeling study do not deserve equal confidence, and an app that flattens the difference is misleading you politely.'),
        h('li', h('strong', 'We quote ranges, not the most dramatic number in them. '), 'Where two credible estimates disagree, you get both.'),
        h('li', h('strong', 'Nothing here is medical advice. '), 'It is a cooking tool that takes the research seriously.')
      ),
      h('div.row-actions',
        h('button.btn.btn--primary', { type: 'button', onclick: () => navigate('#/roll') }, '🎲 Start cooking'),
        h('a.btn', { href: 'docs/DATA-SOURCES.md' }, 'Where the nutrition numbers come from')
      )
    )
  ));
}

function topicBlock(topic) {
  return h('section.card.block.topic',
    h('h2.block__title', `${topic.icon || ''} ${topic.title}`),
    topic.lede ? h('p.lede', topic.lede) : null,
    ...(topic.body || []).map(p => h('p', p)),
    renderClaims(topic.claims),
    ...(topic.sections || []).map(section => h('section.subtopic',
      h('h3.subtopic__title', section.title),
      ...(section.body || []).map(p => h('p', p)),
      renderClaims(section.claims)
    ))
  );
}

function uncited() {
  const extra = uncitedSources();
  if (!extra.length) return null;
  return h('div',
    h('h3.step__sub', 'Also used to build this app'),
    h('ul.tight',
      ...extra.map(s => h('li',
        h('button.reference__link', { type: 'button', onclick: () => openSource(s.id) },
          h('strong', s.authors), ` (${s.year}). `, h('em', s.title), '.')
      ))
    )
  );
}

/**
 * tips-panel.js — the technique notes, offered rather than inserted.
 *
 * A recipe that explained the pinch grip every time would be unreadable, and a
 * cook who has heard it once does not need it again. So the tips that match
 * what is actually in front of you sit in a row of cards you can ignore, and
 * the whole library lives on its own screen for anybody who wants to read it
 * straight through.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, sheet, pill } from '../ui.js';
import { tipsFor, groupById } from '../tips.js';
import { citeMarkersFor } from '../citations.js';

/** The row of tip cards for one recipe. */
export function tipsBlock(recipe, { limit = 4 } = {}) {
  const tips = tipsFor(recipe, { limit });
  if (!tips.length) return null;

  return h('section.card.block.tips',
    h('div.balance__head',
      h('h2.block__title', 'Worth knowing for this one'),
      h('a.tag-btn', { href: '#/learn' }, 'all of them →')
    ),
    h('p.muted.small', 'The things this recipe assumes you already know. Matched to what is actually in it.'),
    h('div.tip-row', ...tips.map(tip => tipCard(tip)))
  );
}

export function tipCard(tip, { compact = false } = {}) {
  const group = groupById(tip.group);
  return h('button', {
    type: 'button',
    class: `tip-card ${compact ? 'tip-card--compact' : ''}`,
    onclick: () => openTip(tip)
  },
    h('span.tip-card__icon', tip.icon || group?.icon || '💡'),
    h('span.tip-card__title', tip.title),
    h('span.tip-card__short', tip.short),
    group ? h('span.tip-card__group', group.name) : null
  );
}

export function openTip(tip) {
  const group = groupById(tip.group);
  let markers = [];
  try { markers = tip.claim ? citeMarkersFor(tip.claim) : []; } catch { markers = []; }

  sheet(`${tip.icon || '💡'} ${tip.title}`,
    h('div.tip-sheet',
      h('div.pill-row',
        group ? pill(group.name) : null,
        tip.level === 'first' ? pill('worth knowing early', 'green') : pill('the deeper version')
      ),
      h('p.lede', tip.short),
      ...(tip.body || []).map(p => h('p', p)),
      tip.why
        ? h('p.tip-sheet__why', h('strong', 'Why it matters: '), tip.why, markers.length ? h('span.cite-row', ...markers) : null)
        : null,
      tip.ages?.length ? h('p.fine-print', 'Written so it can be taught to a child, because it usually is.') : null
    )
  );
}

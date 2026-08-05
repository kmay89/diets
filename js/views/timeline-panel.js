/**
 * timeline-panel.js — the shape of the evening, drawn and written.
 *
 * Both, always, never one or the other. The bar shows proportion, which a
 * sentence is bad at — you can see in a glance that the dark stretch is most of
 * the dish. The sentence shows the facts, which a bar is bad at — which step,
 * how many minutes, what to look for. Neither is a fallback for the other, and
 * a screen reader gets exactly the same information as everybody else because
 * the words are really there rather than tucked into an aria-label.
 *
 * ERRERLabs — MIT licensed.
 */

import { h } from '../ui.js';
import { timeline, timelineWords, worthDrawing, needsAhead } from '../timeline.js';

/**
 * @returns the block, or null when this recipe has too little stated time for a
 *   chart to say anything a reader could not already see.
 */
export function timelineBlock(recipe, { onStep } = {}) {
  const tl = timeline(recipe);
  if (!worthDrawing(tl)) return null;

  return h('section.card.block.timechart',
    h('h2.block__title', 'How the time goes'),

    needsAhead(tl)
      ? h('p.timechart__ahead', '⏳ Start this one well ahead — most of it is waiting.')
      : null,

    chart(tl, onStep),
    legend(),

    // The same information in prose. This is not a caption for the chart, it is
    // the other half of it.
    h('p.timechart__words', timelineWords(tl, recipe))
  );
}

/**
 * The bar.
 *
 * Widths are percentages of the stated total, set inline rather than in a
 * stylesheet — they are data, they differ per recipe, and a <style> block
 * written per render leaks its rules to every other chart on the page. (That is
 * not hypothetical: it is exactly how the cook-mode minimap ended up drawing
 * every recipe with the last one's column count.)
 */
function chart(tl, onStep) {
  const lanes = [];
  for (let lane = 0; lane < tl.lanes; lane++) {
    const blocks = tl.blocks.filter(b => b.lane === lane && b.minutes > 0);
    if (!blocks.length) continue;

    lanes.push(h('div.timechart__lane',
      lane === 1 ? h('span.timechart__lane-tag', 'alongside') : null,
      h('div.timechart__track',
        ...blocks.map(b => h('button.timechart__blk', {
          type: 'button',
          class: `is-${b.kind}`,
          style: `left:${pct(b.at, tl.statedMin)}%;width:${pct(b.minutes, tl.statedMin)}%`,
          title: `Step ${b.step + 1} · ${b.verb} · ${b.minutes} min${b.cue ? ` · until ${b.cue}` : ''}`,
          'aria-label': `Step ${b.step + 1}, ${b.verb}, ${b.minutes} minutes, ${b.kind === 'away' ? 'unattended' : 'hands on'}`,
          onclick: () => onStep?.(b.step)
        },
          // The number only fits where the block is wide enough to hold it, and
          // a clipped "3" reading as "8" on a chart about time is worse than no
          // label at all.
          b.minutes / tl.statedMin > 0.14 ? h('span', `${b.minutes}m`) : null
        ))
      )
    ));
  }

  return h('div.timechart__chart', ...lanes,
    h('div.timechart__axis',
      h('span', '0'),
      h('span', `${tl.statedMin} min`)
    )
  );
}

const legend = () => h('p.timechart__legend',
  h('span.timechart__key.is-attend'), ' at the pan  ',
  h('span.timechart__key.is-away'), ' the pot on its own'
);

const pct = (n, total) => Math.max(0, Math.min(100, (n / total) * 100)).toFixed(2);

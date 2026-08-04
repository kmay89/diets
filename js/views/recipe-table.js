/**
 * recipe-table.js (view) — the method as a diagram instead of a list.
 *
 * Ingredients down the left, brackets to the right, each one swallowing the
 * ones before it under the thing you do. What it shows that a numbered list
 * cannot is structure: that the dry ingredients never meet the wet until step
 * four, that the pasta is boiling in parallel rather than after, that this
 * recipe is really three things merging at the end.
 *
 * Drawn as a real table with row spans, because that is what it is — the shape
 * carries the meaning, and a grid of positioned divs would say nothing to a
 * screen reader. Wide recipes scroll sideways rather than being squeezed into
 * something illegible.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, sheet } from '../ui.js';
import { formatQty } from '../nutrition.js';
import { recipeTable } from '../recipe-table.js';
import { foodIcon } from '../food-icon.js';

/**
 * The block, or null when this recipe cannot be drawn honestly.
 *
 * `scale` is the household's serving multiplier, so the amounts in the left
 * column are the ones to actually measure.
 */
export function tableBlock(recipe, ingIndex, { scale = 1 } = {}) {
  const table = recipeTable(recipe, ingIndex);
  if (!table) return null;

  // A cell is emitted in the row where it starts; the rest of its span is
  // covered by its rowspan, exactly as a merged cell in a spreadsheet.
  const startingAt = new Map();
  for (const cell of table.cells) {
    if (!startingAt.has(cell.lo)) startingAt.set(cell.lo, []);
    startingAt.get(cell.lo).push(cell);
  }

  return h('div.method-table__wrap',
    ...table.prep.map(p => h('p.method-table__prep', p.text)),
    h('table.method-table',
      h('caption.method-table__caption',
        'Each bracket is one thing you do. It covers everything that has gone into it so far.',
        table.threads > 1
          ? h('strong', ` ${table.threads} things are on the go at once.`)
          : null
      ),
      h('tbody',
        ...table.rows.map((row, index) => h('tr',
          h('th.method-table__ing', { scope: 'row' },
            foodIcon(row.item, { size: 22 }),
            h('span.method-table__qty', formatQty(row.line.qty * scale, row.line.unit)),
            h('span.method-table__name', row.item.name),
            row.line.prep ? h('span.method-table__prepnote', `, ${row.line.prep}`) : null
          ),
          ...(startingAt.get(index) || [])
            .sort((a, b) => a.col - b.col)
            .map(cell => h('td', {
              class: `method-table__op method-table__op--c${cell.col}`,
              rowspan: cell.hi - cell.lo + 1,
              onclick: () => sheet(`Step ${cell.step + 1}`, h('p.lede', cell.text)),
              tabindex: '0',
              role: 'button',
              'aria-label': `Step ${cell.step + 1}: ${cell.text}`
            },
              h('span.method-table__verb', cell.verb),
              cell.time ? h('span.method-table__time', cell.time) : null
            ))
        ))
      )
    ),
    h('p.fine-print',
      'Worked out from the recipe\'s own method rather than drawn by hand, so it is right most of the ',
      'time and occasionally reaches. Tap any bracket for the sentence it came from — that is still ',
      'the instruction.')
  );
}

/** Whether to offer the switch at all. */
export { recipeTable };

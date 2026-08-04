/**
 * balance-panel.js — the flavor panel, drawn.
 *
 * Six dials and two checks. The rule the layout follows is that a dial sitting
 * where it should be says nothing beyond its own name: a panel that lectures
 * about all eight every time is a panel nobody reads twice. What earns space is
 * the one or two things a cook could act on in the next thirty seconds.
 *
 * The other job here is the swap banner. When a substitution takes the last
 * acid out of a dish, this is where the app says so, in the same breath as
 * handing back half a teaspoon of vinegar and the reason.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, pill, sheet } from '../ui.js';
import { formatQty } from '../nutrition.js';
import { fixesFor, sayFor, balanceLessons } from '../balance.js';
import { foodIcon } from '../food-icon.js';

/**
 * The whole block for one recipe's profile.
 *
 * `delta` is what changed since the recipe as written — the output of
 * balanceDelta — and is null when nothing has been swapped.
 */
export function balanceBlock(profile, ingIndex, { delta = [], added = [], onAdd = null, onRemove = null } = {}) {
  if (!profile) return null;

  const lost = (delta || []).filter(c => c.lost);
  const gained = (delta || []).filter(c => c.gained);
  const { low, high, missing } = profile.notes;

  return h('section.card.block.balance',
    h('div.balance__head',
      h('h2.block__title', 'Where the flavor comes from'),
      h('button.tag-btn', {
        type: 'button',
        title: 'How to read this',
        onclick: () => openPrimer()
      }, '? how to read this')
    ),

    lost.length ? swapWarning(lost, ingIndex, onAdd) : null,
    gained.length && !lost.length
      ? h('p.balance__gained', `Your version adds ${gained.map(nameOf).join(' and ').toLowerCase()}.`)
      : null,

    added.length ? addedRow(added, ingIndex, onRemove) : null,

    h('div.flavor-dials', ...profile.axes.map(axis => dial(axis, ingIndex, onAdd))),

    h('div.finish-row',
      ...profile.finishers.map(f => h('button', {
        type: 'button',
        class: `finish ${f.present ? 'is-on' : ''}`,
        onclick: () => openFinisher(f, ingIndex, onAdd)
      },
        h('span.finish__icon', f.icon),
        h('span.finish__name', f.name),
        h('span.finish__state', f.present ? 'yes' : 'nothing yet')
      ))
    ),

    verdict(profile, low, high, missing, ingIndex, onAdd)
  );
}

/** One dial: a bar with the band marked on it, and a word for where it sits. */
function dial(axis, ingIndex, onAdd) {
  const label = axis.state === 'low' ? (axis.carried ? 'light, and carried' : 'low')
    : axis.state === 'high' ? 'a lot'
      : axis.state === 'off' ? 'none'
        : 'in range';

  return h('button', {
    type: 'button',
    class: `flavor-dial flavor-dial--${axis.state}${axis.carried ? ' is-carried' : ''}`,
    onclick: () => openAxis(axis, ingIndex, onAdd),
    'aria-label': `${axis.name}: ${label}. ${axis.short}`
  },
    h('span.flavor-dial__top',
      h('span.flavor-dial__icon', axis.icon),
      h('span.flavor-dial__name', axis.name),
      h('span.flavor-dial__state', label)
    ),
    h('span.flavor-dial__track',
      h('span.flavor-dial__band', { style: `left:${pct(axis.bandStart)};right:${pct(1 - axis.bandEnd)}` }),
      h('span.flavor-dial__fill', { style: `width:${pct(axis.fill)}` })
    ),
    h('span.flavor-dial__sub', axis.contributors.length
      ? `mostly ${axis.contributors[0].name.toLowerCase()}`
      : axis.short.toLowerCase())
  );
}

const pct = (n) => `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
const nameOf = (change) => change.axis?.name || change.finisher?.name || 'balance';

/**
 * The line at the bottom: what a cook would say having tasted it.
 *
 * At most two things, because a list of five corrections is a list nobody acts
 * on. Everything else stays behind the dials, one tap away.
 */
function verdict(profile, low, high, missing, ingIndex, onAdd) {
  const items = [...low.map(a => ({ axis: a, dir: 'low' })), ...high.map(a => ({ axis: a, dir: 'high' }))];
  const carried = profile.axes.filter(a => a.carried);
  const uncounted = profile.axes.filter(a => a.uncounted);

  if (!items.length && !missing.length) {
    return h('div.balance__verdict',
      h('p.balance__settled', '✓ Balanced as written. Taste it anyway before it leaves the stove.'),
      ...carried.map(a => h('p.muted.small', a.whenCarried?.say || '')),
      ...uncounted.map(a => h('p.muted.small', a.uncountedSay || ''))
    );
  }

  const first = items[0];
  const firstFix = first ? fixesFor(first.axis, first.dir, ingIndex)[0] : null;
  const firstMissing = missing[0];
  const missFix = firstMissing ? fixesFor(firstMissing, 'missing', ingIndex)[0] : null;

  return h('div.balance__verdict',
    first
      ? h('div.balance__fix',
          h('p.balance__say', h('strong', `${first.axis.icon} ${first.axis.name}: `), sayFor(first.axis, first.dir)),
          firstFix ? fixRow(firstFix, ingIndex, onAdd) : null
        )
      : null,
    firstMissing
      ? h('div.balance__fix',
          h('p.balance__say', h('strong', `${firstMissing.icon} ${firstMissing.name}: `), firstMissing.whenMissing?.say || ''),
          missFix ? fixRow(missFix, ingIndex, onAdd) : null
        )
      : null,
    items.length + missing.length > 2
      ? h('button.linkish', {
          type: 'button',
          onclick: () => openAll(profile, ingIndex, onAdd)
        }, `And ${items.length + missing.length - 2} more · see everything`)
      : null,
    ...carried.map(a => h('p.muted.small', a.whenCarried?.say || '')),
    ...uncounted.map(a => h('p.muted.small', a.uncountedSay || ''))
  );
}

/**
 * One suggested addition: what, how much, how, and why it works.
 *
 * The button puts it in the dish rather than on a list. That is the whole point
 * of the panel — accept the crunch and the panel has to stop saying there is no
 * crunch, or the suggestion was theater.
 */
function fixRow(fix, ingIndex, onAdd) {
  const item = fix.item || ingIndex.get(fix.ing);
  const canAdd = onAdd && item && fix.qty > 0 && fix.unit;
  return h('div.fix',
    item ? foodIcon(item, { size: 26 }) : null,
    h('div.fix__body',
      h('p.fix__what', h('strong', fix.amount), ' ', item?.name || fix.ing, ' — ', fix.how),
      h('p.fix__why', fix.why)
    ),
    canAdd
      ? h('button.btn.btn--small.btn--primary', {
          type: 'button',
          title: `Add ${fix.amount} of ${item.name.toLowerCase()} to this dish`,
          onclick: () => onAdd(fix, item)
        }, 'Add it')
      : null
  );
}

/**
 * What the household has already added, with a way back out.
 *
 * Shown at the top of the panel rather than buried, because these lines are the
 * reason the dials below look the way they do.
 */
function addedRow(added, ingIndex, onRemove) {
  return h('div.added-row',
    h('p.field__label', 'You added to this dish'),
    h('div.added-chips', ...added.map(line => {
      const item = ingIndex.get(line.ing);
      if (!item) return null;
      return h('span.added-chip',
        item ? foodIcon(item, { size: 20 }) : null,
        h('span.added-chip__name', item.name),
        h('span.added-chip__qty', formatQty(line.qty, line.unit)),
        onRemove
          ? h('button.added-chip__x', {
              type: 'button',
              'aria-label': `Take the ${item.name.toLowerCase()} back out`,
              onclick: () => onRemove(line.ing)
            }, '×')
          : null
      );
    }).filter(Boolean)),
    h('p.fine-print', 'These are real ingredient lines: the amounts, the nutrition, the score and the shopping list all follow them.')
  );
}

/* ------------------------------------------------------------------ *
 * The sheets behind it
 * ------------------------------------------------------------------ */

function openAxis(axis, ingIndex, onAdd) {
  const dir = axis.state === 'high' ? 'high' : 'low';
  sheet(`${axis.icon} ${axis.name}`,
    h('div.axis-sheet',
      h('p.lede', axis.does),
      h('dl.notes',
        h('dt', 'How to taste for it'), h('dd', axis.taste),
        h('dt', 'When it goes in'), h('dd', axis.when)
      ),
      h('p.axis-sheet__reading',
        h('strong', 'In this dish: '),
        `${axis.value}${axis.unit === 'mg' || axis.unit === 'g' ? ' ' + axis.unit : ' units'} a serving. `,
        axis.band[1] === Infinity
          ? ''
          : `A ${axis.name.toLowerCase()} that suits this kind of dish usually lands between ${axis.band[0]} and ${axis.band[1]}.`
      ),
      axis.contributors.length
        ? h('p.muted.small', 'Coming from: ' + axis.contributors.map(c => `${c.name} (${c.pct}%)`).join(', '))
        : null,
      axis.carried && axis.whenCarried
        ? h('div.axis-sheet__carried', h('p', axis.whenCarried.say), h('p.muted.small', axis.whenCarried.learn))
        : null,
      axis.uncounted ? h('p.muted.small', axis.uncountedSay) : null,
      axis.reference ? h('p.fine-print', axis.reference) : null,
      axis.cross ? h('p.fine-print', axis.cross) : null,
      h('h4.step__sub', dir === 'high' ? 'If it is too much' : 'If it needs more'),
      h('div.fix-list', ...fixesFor(axis, dir, ingIndex).map(f => fixRow(f, ingIndex, onAdd)))
    )
  );
}

function openFinisher(f, ingIndex, onAdd) {
  sheet(`${f.icon} ${f.name}`,
    h('div.axis-sheet',
      h('p.lede', f.does),
      f.present
        ? h('p', 'This dish has it: ' + f.contributors.map(c => c.name).join(', ') + '.')
        : h('div',
            h('p', f.whenMissing?.say || ''),
            h('div.fix-list', ...fixesFor(f, 'missing', ingIndex).map(x => fixRow(x, ingIndex, onAdd)))
          )
    )
  );
}

function openAll(profile, ingIndex, onAdd) {
  const rows = [
    ...profile.notes.low.map(a => ({ source: a, dir: 'low' })),
    ...profile.notes.high.map(a => ({ source: a, dir: 'high' })),
    ...profile.notes.missing.map(f => ({ source: f, dir: 'missing' }))
  ];
  sheet('Everything this dish could use',
    h('div',
      h('p.muted.small', 'None of these are faults. They are the things a cook would consider before it goes to the table.'),
      ...rows.map(({ source, dir }) => h('div.balance__fix',
        h('p.balance__say', h('strong', `${source.icon} ${source.name}: `), sayFor(source, dir)),
        ...fixesFor(source, dir, ingIndex).slice(0, 2).map(f => fixRow(f, ingIndex, onAdd))
      ))
    )
  );
}

/** The banner that makes a substitution honest. */
function swapWarning(lost, ingIndex, onAdd) {
  const first = lost[0];
  const source = first.axis || first.finisher;
  const fix = fixesFor(source, source.whenMissing ? 'missing' : 'low', ingIndex)[0];
  return h('div.balance__alert',
    h('p', h('strong', 'Your swap changed the balance. '),
      `There is no ${lost.map(nameOf).join(' or ').toLowerCase()} left in this dish.`),
    fix ? fixRow(fix, ingIndex, onAdd) : null
  );
}

function openPrimer() {
  sheet('How to read this',
    h('div',
      h('p.lede',
        'Six dials with numbers behind them and two checks a cook makes in the last thirty seconds. ',
        'A dial below its band is a prompt, not a verdict — plenty of excellent dishes have no chile in them at all.'),
      h('ul.tight',
        ...balanceLessons().map(l => h('li', h('strong', l.title + '. '), l.body))
      ),
      h('p.fine-print',
        'Salt, fat and sweetness are counted from the ingredient database. Acid, savory depth and heat are ',
        'weighted by how strong each ingredient actually is. Acid and fresh aroma cook away, so long recipes ',
        'are discounted for both — the app cannot see whether the lemon went in at the start or at the table, ',
        'and it would rather say so than pretend otherwise.')
    )
  );
}

/** A one-line summary for a card or a cook-mode header. */
export function balanceSummary(profile) {
  if (!profile) return null;
  const { low, high, missing, settled } = profile.notes;
  if (settled) return pill('balanced', 'green');
  const first = low[0] || high[0];
  if (first) return pill(`${first.icon} ${first.state === 'high' ? 'a lot of' : 'wants'} ${first.name.toLowerCase()}`, 'warn');
  if (missing[0]) return pill(`${missing[0].icon} no ${missing[0].name.toLowerCase().replace('something ', '')}`, '');
  return null;
}

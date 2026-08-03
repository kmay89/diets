/**
 * nutrition-panel.js — one serving, read at a glance.
 *
 * The old panel was six numbers in six boxes and three bars underneath. Every
 * figure was correct and none of them answered the question people actually
 * have in front of a recipe: is this a lot? A number like "1195 mg potassium"
 * means nothing without the day it belongs to.
 *
 * So the panel is built the way food labels that work are built:
 *
 *   - a dial for calories, against the share this course usually carries, so
 *     "a light dinner" reads as a light dinner rather than as a failure;
 *   - a traffic-light row per nutrient — the UK Food Standards Agency's
 *     multiple-traffic-light idea, which reads faster than anything else
 *     tested — with the bands taken from the FDA's own %DV rule (5% low,
 *     20% high) so the thresholds are the ones on every American label;
 *   - the word beside the color, always. "High" is printed, not implied by a
 *     shade of amber, because a colorblind cook is still a cook, and because
 *     a color with no caption is a verdict with no argument.
 *
 * Nothing here diagnoses anything. It is the label, arranged better.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, titleCase } from '../ui.js';
import {
  NUTRIENT_LABELS, NUTRIENT_UNITS, dailyValue, dayShare
} from '../nutrition.js';

/** The six that earn their place on a plate: what to get, what to watch. */
const ENCOURAGE = ['fiber_g', 'protein_g', 'potassium_mg'];
const LIMIT = ['sodium_mg', 'satfat_g'];

/* ---------- the dial ---------- */

const TAU = Math.PI * 2;

/** A point on the dial's circle, measured clockwise from twelve o'clock. */
function polar(cx, cy, r, turns) {
  const a = turns * TAU - TAU / 4;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arc(cx, cy, r, from, to) {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x2} ${y2}`;
}

const svg = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid) n.appendChild(kid);
  return n;
};

/**
 * Calories as a share of one person's day, with a tick where this course
 * usually lands. The ring is capped at a full turn — a 3,000 kcal serving
 * should read as "off the end", not wrap around and look moderate.
 */
function dayDial(share, kcal) {
  const R = 34, C = 44, W = 9;
  const filled = Math.min(share.pct / 100, 1);

  return h('div.dial',
    svg('svg', { viewBox: '0 0 88 88', class: 'dial__svg', 'aria-hidden': 'true' },
      svg('path', { d: arc(C, C, R, 0, 0.9999), class: 'dial__track', 'stroke-width': W, fill: 'none' }),
      filled > 0.001
        ? svg('path', {
            d: arc(C, C, R, 0, Math.max(filled, 0.004)),
            class: `dial__fill dial__fill--${share.verdict.split(' ')[0]}`,
            'stroke-width': W, fill: 'none', 'stroke-linecap': 'round'
          })
        : null,
      // Where a meal of this kind usually sits. Context, not a target to hit.
      svg('path', {
        d: arc(C, C, R, share.typicalPct / 100 - 0.004, share.typicalPct / 100 + 0.004),
        class: 'dial__mark', 'stroke-width': W + 5, fill: 'none'
      })
    ),
    h('div.dial__center',
      h('span.dial__pct', `${share.pct}%`),
      h('span.dial__of', 'of the day')
    ),
    h('div.dial__caption',
      h('strong', `${Math.round(kcal)} calories`),
      h('span.muted.small', `${share.verdict} for a ${share.course} · typical is ~${share.typicalPct}%`)
    )
  );
}

/* ---------- the traffic-light rows ---------- */

function nutrientRow(key, value, target, pace) {
  const dv = dailyValue(key, value, target, { pace });
  const unit = NUTRIENT_UNITS[key];
  const width = dv.pct == null ? 0 : Math.min(dv.pct, 100);

  return h('div', { class: `nut-row nut-row--${dv.tone}` },
    h('div.nut-row__head',
      h('span.nut-row__name', NUTRIENT_LABELS[key]),
      h('span.nut-row__amount', `${Math.round(value)}`, h('span.nut-row__unit', unit))
    ),
    h('div.nut-row__bar', { 'aria-hidden': 'true' },
      h('div.nut-row__track', h('div.nut-row__fill', { style: { width: `${width}%` } })),
      // The plate's own share of the day. It sits outside the clipped track so
      // it stays readable whether the fill has passed it or not.
      dv.direction === 'limit' && pace > 0
        ? h('span.nut-row__pace', { style: { left: `${Math.min(pace, 100)}%` } })
        : null
    ),
    h('div.nut-row__foot',
      h('span.nut-row__band', dv.note),
      dv.pct != null ? h('span.nut-row__dv', `${dv.pct}% of the day`) : null
    )
  );
}

/* ---------- the panel ---------- */

/**
 * @param per       per-serving nutrients
 * @param targets   dailyTargets() for the person this is measured against
 * @param eaterName whose day these percentages are
 * @param course    which meal, for the dial's typical share
 */
export function glancePanel(per, targets, { eaterName = null, course = 'dinner' } = {}) {
  if (!targets) {
    return h('p.muted.small',
      'Add someone to your household and every number here gets measured against their day.');
  }

  const share = dayShare(per.kcal, targets.kcal, course);
  const pace = share?.pct ?? null;
  const who = eaterName ? titleCase(eaterName) : 'the day';

  return h('div.glance',
    share ? dayDial(share, per.kcal) : null,

    h('div.glance__rows',
      h('h3.glance__heading', 'Worth getting'),
      ...ENCOURAGE.map(k => nutrientRow(k, per[k], targets[k], pace)),
      h('h3.glance__heading', 'Worth watching'),
      ...LIMIT.map(k => nutrientRow(k, per[k], targets[k], pace))
    ),

    h('p.fine-print.glance__key',
      `Every percentage is of ${who}'s own daily target, not a generic 2,000-calorie day. `,
      'Fiber, protein and potassium use the FDA’s thresholds — a tenth of a day is a good source, a fifth an excellent one. ',
      pace
        ? `Sodium and saturated fat are read against the plate instead: this serving is ${pace}% of the day, so the mark on those bars sits at ${pace}%. Stopping short of it means eating this way all day would still land inside the target.`
        : 'Sodium and saturated fat use the same fifth-of-a-day reading.'
    )
  );
}

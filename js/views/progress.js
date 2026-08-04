/**
 * progress.js (view) — what you have actually been eating.
 *
 * Deliberately not a scoreboard. No streaks, no points, no red numbers: the
 * meal you will happily cook again next month is worth more than a perfect
 * week you resent. What it does show is direction — the three numbers the
 * heart guidance actually turns on, and how many different plants went through
 * the kitchen — computed from meals marked cooked, never from meals merely
 * planned. A quiet week is allowed to look like a quiet week.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, num } from '../ui.js';
import { getDb, nutritionFor, heartFor } from '../data.js';
import { foodIcon } from '../food-icon.js';
import { getState } from '../store.js';
import { kitchenMemory, timesWords } from '../memory.js';
import { citeMarker, getCitations } from '../citations.js';
import { dailyTargets, typicalBody, MEAL_SHARE } from '../nutrition.js';

/** The three the guidance turns on, and which direction is good. */
const METRICS = [
  { key: 'sodium_mg', label: 'Sodium', unit: 'mg a serving', lower: true },
  { key: 'fiber_g', label: 'Fiber', unit: 'g a serving', lower: false },
  { key: 'satfat_g', label: 'Sat fat', unit: 'g a serving', lower: true }
];

/** Plant variety counts food you would recognize as a plant, not seasoning. */
const PLANT_AISLES = new Set(['produce', 'nuts-seeds', 'dry-goods']);

/**
 * Roll up the meals cooked in the last `days` days.
 *
 * Shared with the Today screen, which shows a smaller version of the same
 * bars — so the two screens can never quietly disagree about the week.
 */
export function recentNutrition(state, days = 7, now = new Date()) {
  const { recipeIndex, ingIndex } = getDb();
  const cutoff = now.getTime() - days * 86400000;

  const cooked = (state.history || [])
    .filter(e => e && e.at && Date.parse(e.at) >= cutoff)
    .map(e => ({ at: new Date(e.at), recipe: recipeIndex.get(e.id) }))
    .filter(x => x.recipe);

  // One bucket per day, oldest on the left, so the bars read like a calendar.
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    buckets.push({ date: d, key: d.toDateString(), meals: [] });
  }
  const byKey = new Map(buckets.map(b => [b.key, b]));
  for (const c of cooked) byKey.get(c.at.toDateString())?.meals.push(c.recipe);

  const nutritionOf = (recipe) => nutritionFor(recipe).perServing;

  const metrics = METRICS.map(m => {
    const perDay = buckets.map(b =>
      b.meals.length
        ? b.meals.reduce((a, r) => a + (nutritionOf(r)[m.key] || 0), 0) / b.meals.length
        : 0
    );
    const cookedDays = perDay.filter((v, i) => buckets[i].meals.length);
    const avg = cookedDays.length ? cookedDays.reduce((a, b) => a + b, 0) / cookedDays.length : 0;
    const peak = Math.max(...perDay, 1);
    return {
      ...m,
      avg,
      display: num(avg, m.key === 'satfat_g' ? 1 : 0),
      // Bars are scaled to the week's own peak: this is a shape, not a gauge.
      bars: perDay.map(v => Math.round((v / peak) * 100))
    };
  });

  const scored = cooked.map(c => heartFor(c.recipe)).filter(x => x && x.score != null);
  const heartAvg = scored.length
    ? Math.round(scored.reduce((a, b) => a + b.score, 0) / scored.length)
    : null;

  const plants = new Set();
  for (const { recipe } of cooked) {
    for (const line of recipe.ingredients || []) {
      const item = ingIndex.get(line.ing);
      if (item && PLANT_AISLES.has(item.aisle)) plants.add(item.id);
    }
  }

  return { days: buckets, metrics, cooked, heartAvg, plants: [...plants], meals: cooked.length };
}

/** Look a claim up by id, wherever it sits in the topic tree. */
function findClaim(id) {
  try {
    for (const topic of getCitations().topics || []) {
      for (const c of topic.claims || []) if (c.id === id) return c;
      for (const s of topic.sections || []) {
        for (const c of s.claims || []) if (c.id === id) return c;
      }
    }
  } catch { /* citations not loaded — the card just runs without the claim */ }
  return null;
}

export function render(root, { navigate }) {
  mount(root, view(navigate));
}

function view(navigate) {
  const state = getState();
  const { ingIndex, recipeIndex } = getDb();
  const t = recentNutrition(state, 7);

  if (!t.meals) return emptyView(state, recipeIndex, navigate);

  const eaters = state.household.members.filter(m => m.eats !== false);
  const ref = eaters[0] || typicalBody();
  const targets = dailyTargets(ref, { heartMode: state.prefs.heartMode });
  const share = MEAL_SHARE.dinner;

  const targetFor = {
    sodium_mg: targets.sodium_mg * share,
    fiber_g: targets.fiber_g * share,
    satfat_g: targets.satfat_g * share
  };

  return h('section.view',
    h('div.view__head',
      h('div',
        h('p.eyebrow', 'Last 7 days'),
        h('h1.view__title', 'What has been on', h('br'), h('em', 'the table'))
      )
    ),

    t.heartAvg != null ? heartRing(t) : null,

    h('div.trend-cards', ...t.metrics.map(m => trendCard(m, targetFor[m.key], t.days))),

    plantsCard(t, ingIndex),

    // The seven days above are a window; this is the whole record. Deliberately
    // placed after them and deliberately not a total to beat — how long this
    // kitchen has been keeping notes is a nicer thing to know than a number
    // going up.
    kitchenCard(state, recipeIndex, navigate),

    h('p.fine-print', `Counted from ${t.meals} meal${t.meals === 1 ? '' : 's'} marked cooked in the last seven days. Meals you planned but did not cook are not in here, and nothing is graded against anyone else.`)
  );
}

function heartRing(t) {
  const pct = Math.max(0, Math.min(100, t.heartAvg));
  return h('div.ring-wrap',
    h('div.ring', {
      style: { '--ring-pct': `${pct}%` },
      role: 'img',
      'aria-label': `Average heart-forward score ${t.heartAvg} out of 100`
    },
      h('div.ring__inner',
        h('span.ring__num', t.heartAvg),
        h('span.ring__label', 'heart score'),
        h('span.ring__note', `across ${t.meals} meal${t.meals === 1 ? '' : 's'}`)
      )
    )
  );
}

function trendCard(m, target, days) {
  const onTrack = m.lower ? m.avg <= target : m.avg >= target;
  return h('article.card.trend-card',
    h('div.trend-card__head',
      h('div',
        h('span.trend-card__value', m.display),
        h('span.trend-card__unit', ` ${m.unit}`)
      ),
      h('span', { class: `trend-card__target ${onTrack ? 'is-ok' : ''}` },
        `${m.lower ? 'aim under' : 'aim over'} ${num(target, m.key === 'satfat_g' ? 1 : 0)}${onTrack ? ' ✓' : ''}`)
    ),
    h('p.eyebrow', m.label),
    h('div.trend-card__bars', ...m.bars.map((pct, i) =>
      h('span.trend-card__bar', {
        style: { height: `${Math.max(3, pct)}%` },
        title: `${days[i].date.toLocaleDateString(undefined, { weekday: 'short' })}: ${num(pct ? m.avg : 0)}`
      })
    ))
  );
}

/**
 * The plant-variety card.
 *
 * The thirty-a-week figure is a research finding, not a house opinion, so it
 * is stated in the words of the claim in data/claims.json and carries that
 * claim's source marker. Counting what went through this kitchen is ours.
 */
function plantsCard(t, ingIndex) {
  const shown = t.plants.slice(0, 2).map(id => ingIndex.get(id)).filter(Boolean);
  const n = t.plants.length;
  const claim = findClaim('nourish.plants');

  return h('article.card.plants',
    h('div.plants__icons', ...shown.map(item => foodIcon(item, { size: 34 }))),
    h('div',
      h('p.plants__text',
        h('strong', `${n} different plant${n === 1 ? '' : 's'}`),
        ' through this kitchen in the last seven days.'
      ),
      claim
        ? h('p.plants__text.muted',
            claim.text,
            ' ',
            ...(claim.cites || []).map(id => citeMarker(id)).filter(Boolean)
          )
        : null,
      h('p.fine-print', 'Counted from produce, nuts, seeds, grains and pulses — herbs and spices are left out, so the real variety is a little wider.')
    )
  );
}

function emptyView(state, recipeIndex, navigate) {
  return h('section.view',
    h('div.view__head', h('h1.view__title', 'Nothing cooked yet')),
    h('div.empty-state',
      h('div.empty-state__dice', '🌱'),
      h('p.muted', 'Mark a meal as cooked — on the plan, or at the end of cook mode — and the week starts filling in here.'),
      h('div.row-actions',
        h('button.btn.btn--primary', { type: 'button', onclick: () => navigate('#/today') }, 'Back to today'),
        state.plan.length ? h('button.btn', { type: 'button', onclick: () => navigate('#/plan') }, 'See the plan') : null
      )
    ),

    // A quiet week is not an empty kitchen. Somebody who cooked thirty meals
    // and then had a week of takeout should not be shown a blank screen that
    // implies they have never cooked anything.
    kitchenCard(state, recipeIndex, navigate)
  );
}

/**
 * The kitchen's whole record, in three sentences.
 *
 * No total to beat and no streak to break: a month where nobody cooked is a
 * month where nobody cooked, and an app that makes somebody feel watched about
 * that is an app they delete in January. What it does say is how long the
 * record goes back and which dish this kitchen keeps coming back to, because
 * the second one is a genuinely useful thing most people cannot name about
 * themselves.
 */
function kitchenCard(state, recipeIndex, navigate) {
  const m = kitchenMemory(state);
  if (!m.total) return null;

  const favorite = m.mostCooked ? recipeIndex.get(m.mostCooked.id) : null;

  return h('article.card.kitchen-memory',
    h('p.eyebrow', 'Everything, not just this week'),
    h('p.kitchen-memory__line',
      h('strong', `${m.total} meal${m.total === 1 ? '' : 's'}`),
      m.distinct > 1 ? ` · ${m.distinct} different dishes` : '',
      m.sinceWords ? ` · since ${m.sinceWords}` : ''
    ),
    favorite
      ? h('button.linkish', {
          type: 'button',
          onclick: () => navigate(`#/recipe/${favorite.id}`)
        }, `The one you keep making is ${favorite.title} — ${timesWords(m.mostCooked.times)} →`)
      : null,
    m.withNotes
      ? h('p.muted.small', `${m.withNotes} of them have a note from you on the recipe.`)
      : h('p.muted.small', 'Notes you write after cooking show up on the recipe next time.')
  );
}

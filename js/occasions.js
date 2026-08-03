/**
 * occasions.js — the days that shape what gets cooked.
 *
 * Loads the occasion taxonomy and answers two questions: what is coming up,
 * and what should I cook for it.
 *
 * ERRERLabs — MIT licensed.
 */

import { getDb } from './data.js';

let occasions = null;

export async function loadOccasions() {
  if (occasions) return occasions;
  const res = await fetch('data/occasions.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load occasions (${res.status})`);
  const data = await res.json();
  occasions = data.occasions;
  return occasions;
}

export function allOccasions() {
  return occasions || [];
}

export function occasionById(id) {
  return (occasions || []).find(o => o.id === id) || null;
}

export function recipesForOccasion(id) {
  return getDb().recipes.filter(r => (r.occasions || []).includes(id));
}

/**
 * The occasion worth surfacing right now.
 *
 * Dated occasions win when they are close — nobody wants a Thanksgiving
 * suggestion in March, and everybody wants one in the third week of November.
 * Otherwise fall back to whatever suits the month, ignoring the always-on
 * categories, which would otherwise always win and never be interesting.
 */
export function upcomingOccasion(date = new Date()) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const list = occasions || [];

  const dated = list
    .map(o => {
      if (!o.peak) return null;
      const [pm, pd] = o.peak.split('-').map(Number);
      // Days until the peak, wrapping around the year.
      let days = (new Date(date.getFullYear(), pm - 1, pd) - date) / 86400000;
      if (days < -3) days = (new Date(date.getFullYear() + 1, pm - 1, pd) - date) / 86400000;
      return { occasion: o, days };
    })
    .filter(x => x && x.days <= 21 && x.days >= -3)
    .sort((a, b) => a.days - b.days);

  if (dated.length) return dated[0].occasion;

  const seasonal = list.filter(o =>
    (o.months || []).includes(month) && (o.months || []).length <= 6
  );
  if (!seasonal.length) return null;

  // Stable through the day rather than flickering on every render.
  return seasonal[(month * 31 + day) % seasonal.length];
}

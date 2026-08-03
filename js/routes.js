/**
 * routes.js — which hash means which screen.
 *
 * Kept apart from app.js so it can be checked without a browser: a link the app
 * generates but the router cannot match is a dead end nobody notices until
 * somebody taps it, and that is exactly what happened to #/browse?occasion=….
 *
 * ERRERLabs — MIT licensed.
 */

export const ROUTE_PATTERNS = [
  { id: 'onboarding', pattern: /^#\/onboarding$/ },
  { id: 'today', pattern: /^#\/today$/ },
  { id: 'create', pattern: /^#\/create$/ },
  { id: 'plate', pattern: /^#\/plate$/ },
  { id: 'cook', pattern: /^#\/cook\/(.+)$/ },
  { id: 'progress', pattern: /^#\/progress$/ },
  { id: 'roll', pattern: /^#\/roll$/ },
  { id: 'plan', pattern: /^#\/plan$/ },
  { id: 'day', pattern: /^#\/day\/([a-zA-Z]+)$/ },
  { id: 'browse', pattern: /^#\/browse$/ },
  { id: 'recipe', pattern: /^#\/recipe\/(.+)$/ },
  { id: 'pantry', pattern: /^#\/pantry$/ },
  { id: 'list', pattern: /^#\/list$/ },
  { id: 'garden', pattern: /^#\/garden$/ },
  { id: 'settings', pattern: /^#\/settings$/ },
  { id: 'why', pattern: /^#\/why$/ }
];

/**
 * The part of a hash the route table matches.
 *
 * A hash can carry a query — #/browse?occasion=picnic — and the query belongs
 * to the view, not to the routing decision.
 */
export const routePath = (hash) => String(hash).split('?')[0];

/** @returns { id, match } for the first matching route, or null. */
export function matchRoute(hash) {
  const path = routePath(hash);
  const route = ROUTE_PATTERNS.find(r => r.pattern.test(path));
  return route ? { id: route.id, match: path.match(route.pattern) } : null;
}

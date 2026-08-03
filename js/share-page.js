/**
 * share-page.js — the small amount of behaviour a shared recipe page needs.
 *
 * A link arriving from iMessage lands on a static, readable recipe page. That
 * is the right destination for someone who has never seen this app. But if the
 * visitor already uses it — there is saved state, or they are in the installed
 * app — the link should behave like a deep link and drop them straight onto
 * that recipe inside the app.
 *
 * ERRERLabs — MIT licensed.
 */

const STATE_KEY = 'errerlabs.diets.v1';

function appLink() {
  return document.querySelector('[data-app-link]')?.getAttribute('href') || '/';
}

function isExistingUser() {
  try {
    if (localStorage.getItem(STATE_KEY)) return true;
  } catch {
    // Storage can be blocked entirely; that just means "not a returning user".
  }
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

// Forward returning users, but never when they arrived by pressing Back — that
// would trap them on this page.
const navEntry = performance.getEntriesByType?.('navigation')?.[0];
const wentBack = navEntry?.type === 'back_forward';

if (isExistingUser() && !wentBack) {
  location.replace(appLink());
}

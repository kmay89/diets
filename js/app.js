/**
 * app.js — bootstrap, hash router, service worker registration, install prompt.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, $, toast } from './ui.js';
import { loadAll } from './data.js';
import { getState, subscribe } from './store.js';

import * as onboarding from './views/onboarding.js';
import * as rollView from './views/roll.js';
import * as planView from './views/plan.js';
import * as recipeView from './views/recipe.js';
import * as pantryView from './views/pantry.js';
import * as listView from './views/list.js';
import * as gardenView from './views/garden.js';
import * as settingsView from './views/settings.js';

const ROUTES = [
  { pattern: /^#\/onboarding$/, view: (m) => ({ render: onboarding.render, params: {} }) },
  { pattern: /^#\/roll$/, view: () => ({ render: rollView.render, params: {} }) },
  { pattern: /^#\/plan$/, view: () => ({ render: planView.render, params: {} }) },
  { pattern: /^#\/browse$/, view: () => ({ render: recipeView.renderBrowse, params: {} }) },
  { pattern: /^#\/recipe\/(.+)$/, view: (m) => ({ render: recipeView.render, params: { id: m[1] } }) },
  { pattern: /^#\/pantry$/, view: () => ({ render: pantryView.render, params: {} }) },
  { pattern: /^#\/list$/, view: () => ({ render: listView.render, params: {} }) },
  { pattern: /^#\/garden$/, view: () => ({ render: gardenView.render, params: {} }) },
  { pattern: /^#\/settings$/, view: () => ({ render: settingsView.render, params: {} }) }
];

const NAV = [
  { href: '#/roll', label: 'Roll', icon: '🎲' },
  { href: '#/plan', label: 'Plan', icon: '📋' },
  { href: '#/list', label: 'List', icon: '🛒' },
  { href: '#/browse', label: 'Recipes', icon: '📖' },
  { href: '#/pantry', label: 'Pantry', icon: '🏠' },
  { href: '#/garden', label: 'Garden', icon: '🌿' },
  { href: '#/settings', label: 'Settings', icon: '⚙️' }
];

function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

let currentRoot = null;

function route() {
  const hash = location.hash || (getState().onboarded ? '#/roll' : '#/onboarding');
  if (!location.hash) { location.replace(hash); return; }

  const match = ROUTES.find(r => r.pattern.test(hash));
  const main = $('#main');

  if (!match) {
    mount(main, h('section.view', h('p.empty', 'That page does not exist.'),
      h('button.btn.btn--primary', { onclick: () => navigate('#/roll') }, 'Back to the dice')));
    return;
  }

  const { render, params } = match.view(hash.match(match.pattern));
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  currentRoot = main;
  render(main, { navigate, params });
  paintNav(hash);
}

function paintNav(hash) {
  for (const a of document.querySelectorAll('.tabbar__item')) {
    const on = hash.startsWith(a.getAttribute('href'));
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function buildChrome() {
  const nav = h('nav.tabbar', { 'aria-label': 'Main' },
    ...NAV.map(item => h('a.tabbar__item', { href: item.href },
      h('span.tabbar__icon', item.icon),
      h('span.tabbar__label', item.label)
    ))
  );
  document.body.appendChild(nav);
}

/* ---------- install prompt ---------- */

let deferredPrompt = null;
const INSTALL_DISMISSED = 'errerlabs.diets.installDismissed';

function showInstallAffordances(on) {
  const banner = $('#install-banner');
  const btn = $('#install-btn');
  const dismissed = localStorage.getItem(INSTALL_DISMISSED) === '1';
  if (banner) banner.hidden = !on || dismissed;
  if (btn) btn.hidden = !on;
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallAffordances(true);
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  showInstallAffordances(false);
  toast('Installed — look for it on your home screen');
});

window.__dietsInstall = async () => {
  if (!deferredPrompt) {
    // iOS and desktop Safari never fire beforeinstallprompt; the browser menu
    // is the only route there.
    toast('Use your browser menu → "Add to Home Screen"', { duration: 4000 });
    return;
  }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  showInstallAffordances(false);
  if (outcome === 'accepted') toast('Installing…');
};

/** Wired here rather than with inline onclick, so the page needs no 'unsafe-inline'. */
function wireInstallButtons() {
  $('#install-btn')?.addEventListener('click', () => window.__dietsInstall());
  $('#install-accept')?.addEventListener('click', () => window.__dietsInstall());
  $('#install-dismiss')?.addEventListener('click', () => {
    localStorage.setItem(INSTALL_DISMISSED, '1');
    const banner = $('#install-banner');
    if (banner) banner.hidden = true;
  });
}

/* ---------- boot ---------- */

async function boot() {
  const main = $('#main');
  try {
    await loadAll();
  } catch (err) {
    console.error(err);
    mount(main, h('section.view',
      h('h1.view__title', 'Could not load the recipe data'),
      h('p.muted', String(err.message || err)),
      h('p.muted', 'If this is the first visit, check the connection and reload. After one successful visit everything works offline.')
    ));
    return;
  }

  settingsView.applyTheme(getState().prefs.theme || 'system');
  buildChrome();
  wireInstallButtons();

  const splash = $('#splash');
  if (splash) splash.remove();

  window.addEventListener('hashchange', route);
  route();

  // Re-render the current view when state changes elsewhere (e.g. a sheet).
  subscribe(() => paintNav(location.hash));

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('An update is ready — reopen the app to apply it', { duration: 5000 });
          }
        });
      });
    } catch (err) {
      console.warn('Service worker registration failed; the app still works online.', err);
    }
  }
}

boot();

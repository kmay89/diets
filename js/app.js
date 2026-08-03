/**
 * app.js — bootstrap, hash router, service worker registration, install prompt.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, $, toast, sheet } from './ui.js';
import { loadAll } from './data.js';
import { loadCitations } from './citations.js';
import { loadOccasions } from './occasions.js';
import { initFeedback, play } from './feedback.js';
import { initInstall } from './install.js';
import { matchRoute } from './routes.js';
import { initTheme, refreshThemeToggles } from './theme.js';
import { getState, subscribe } from './store.js';

import * as onboarding from './views/onboarding.js';
import * as rollView from './views/roll.js';
import * as planView from './views/plan.js';
import * as recipeView from './views/recipe.js';
import * as pantryView from './views/pantry.js';
import * as listView from './views/list.js';
import * as gardenView from './views/garden.js';
import * as settingsView from './views/settings.js';
import * as whyView from './views/why.js';

/** Route id → the view it draws. The patterns themselves live in routes.js. */
const VIEWS = {
  onboarding: () => ({ render: onboarding.render, params: {} }),
  roll: () => ({ render: rollView.render, params: {} }),
  plan: () => ({ render: planView.render, params: {} }),
  browse: () => ({ render: recipeView.renderBrowse, params: {} }),
  recipe: (m) => ({ render: recipeView.render, params: { id: m[1] } }),
  pantry: () => ({ render: pantryView.render, params: {} }),
  list: () => ({ render: listView.render, params: {} }),
  garden: () => ({ render: gardenView.render, params: {} }),
  settings: () => ({ render: settingsView.render, params: {} }),
  why: () => ({ render: whyView.render, params: {} })
};

// Five tabs, because a row of eight is a wall of icons nobody reads. The rest
// live one tap away behind More, which is where people look for them anyway.
const NAV = [
  { href: '#/roll', label: 'Roll', icon: '🎲' },
  { href: '#/plan', label: 'Plan', icon: '📋' },
  { href: '#/list', label: 'List', icon: '🛒' },
  { href: '#/browse', label: 'Recipes', icon: '📖' }
];

const MORE = [
  { href: '#/pantry', label: 'Pantry', icon: '🏠', blurb: 'What is already in the kitchen' },
  { href: '#/garden', label: 'Garden', icon: '🌿', blurb: 'What to plant, and when' },
  { href: '#/why', label: 'Why this works', icon: '💡', blurb: 'The research, with every source' },
  { href: '#/settings', label: 'Settings', icon: '⚙️', blurb: 'Household, preferences, your data' }
];

function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

let currentRoot = null;

function route() {
  const hash = location.hash || (getState().onboarded ? '#/roll' : '#/onboarding');
  if (!location.hash) { location.replace(hash); return; }

  // A link can carry a query — #/browse?occasion=picnic comes off the roll
  // screen — and matchRoute ignores it, leaving the view to read location.hash
  // for whatever it needs.
  const match = matchRoute(hash);
  const main = $('#main');

  if (!match) {
    mount(main, h('section.view', h('p.empty', 'That page does not exist.'),
      h('button.btn.btn--primary', { onclick: () => navigate('#/roll') }, 'Back to the dice')));
    return;
  }

  const { render, params } = VIEWS[match.id](match.match);
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  currentRoot = main;
  render(main, { navigate, params });
  paintNav(hash);
}

function paintNav(hash) {
  for (const a of document.querySelectorAll('.tabbar__item[href]')) {
    const on = hash.startsWith(a.getAttribute('href'));
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const moreTab = $('#more-tab');
  if (moreTab) moreTab.classList.toggle('is-active', MORE.some(m => hash.startsWith(m.href)));
}

function buildChrome() {
  const nav = h('nav.tabbar', { 'aria-label': 'Main' },
    ...NAV.map(item => h('a.tabbar__item', { href: item.href },
      h('span.tabbar__icon', item.icon),
      h('span.tabbar__label', item.label)
    )),
    h('button.tabbar__item', { id: 'more-tab', type: 'button', onclick: openMore },
      h('span.tabbar__icon', '⋯'),
      h('span.tabbar__label', 'More')
    )
  );
  document.body.appendChild(nav);
}

function openMore() {
  play('tap');
  const dlg = sheet('More', h('div.more-grid',
    ...MORE.map(item => h('a.more-item', {
      href: item.href,
      onclick: () => setTimeout(() => dlg.close(), 60)
    },
      h('span.more-item__icon', item.icon),
      h('div', h('strong', item.label), h('p.muted.small', item.blurb))
    ))
  ));
}

/* ---------- boot ---------- */

async function boot() {
  const main = $('#main');
  try {
    await loadAll();
    await Promise.all([loadCitations(), loadOccasions()]);
  } catch (err) {
    console.error(err);
    mount(main, h('section.view',
      h('h1.view__title', 'Could not load the recipe data'),
      h('p.muted', String(err.message || err)),
      h('p.muted', 'If this is the first visit, check the connection and reload. After one successful visit everything works offline.')
    ));
    return;
  }

  initTheme();
  buildChrome();
  initInstall();
  initFeedback();

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

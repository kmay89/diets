/**
 * app.js — bootstrap, hash router, service worker registration, install prompt.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, $, toast, sheet } from './ui.js';
import { loadAll, mergeMyRecipes } from './data.js';
import { loadCitations } from './citations.js';
import { loadOccasions } from './occasions.js';
import { loadBalance } from './balance.js';
import { loadSubstitutions } from './swaps.js';
import { loadProteins } from './proteins.js';
import { loadTable } from './table.js';
import { loadKitchen } from './kitchen.js';
import { loadTips } from './tips.js';
import { loadPalette } from './palette.js';
import { loadSkills } from './skills.js';
import { initTimers, setTimerAlarm, timerFor } from './timers.js';
import { initNative } from './native.js';
import { initWatch } from './watch.js';
import { initTimerDock } from './views/timer-dock.js';
import { initFeedback, play } from './feedback.js';
import { initInstall } from './install.js';
import { matchRoute } from './routes.js';
import { initTheme, refreshThemeToggles } from './theme.js';
import { getState, subscribe } from './store.js';
import { myRecipes } from './myrecipes.js';

import * as onboarding from './views/onboarding.js';
import * as todayView from './views/today.js';
import * as createView from './views/create.js';
import * as plateView from './views/plate.js';
import * as cookView from './views/cook.js';
import * as dayView from './views/day.js';
import * as progressView from './views/progress.js';
import * as rollView from './views/roll.js';
import * as planView from './views/plan.js';
import * as recipeView from './views/recipe.js';
import * as pantryView from './views/pantry.js';
import * as listView from './views/list.js';
import * as gardenView from './views/garden.js';
import * as bookView from './views/book.js';
import * as settingsView from './views/settings.js';
import * as whyView from './views/why.js';
import * as learnView from './views/learn.js';

/** Route id → the view it draws. The patterns themselves live in routes.js. */
const VIEWS = {
  onboarding: () => ({ render: onboarding.render, params: {} }),
  today: () => ({ render: todayView.render, params: {} }),
  create: () => ({ render: createView.render, params: {} }),
  plate: () => ({ render: plateView.render, params: {} }),
  cook: (m) => ({ render: cookView.render, params: { id: m[1] } }),
  progress: () => ({ render: progressView.render, params: {} }),
  roll: () => ({ render: rollView.render, params: {} }),
  plan: () => ({ render: planView.render, params: {} }),
  day: (m) => ({ render: dayView.render, params: { day: m[1] } }),
  browse: () => ({ render: recipeView.renderBrowse, params: {} }),
  recipe: (m) => ({ render: recipeView.render, params: { id: m[1] } }),
  pantry: () => ({ render: pantryView.render, params: {} }),
  list: () => ({ render: listView.render, params: {} }),
  garden: () => ({ render: gardenView.render, params: {} }),
  book: () => ({ render: bookView.render, params: {} }),
  settings: () => ({ render: settingsView.render, params: {} }),
  why: () => ({ render: whyView.render, params: {} }),
  learn: () => ({ render: learnView.render, params: {} })
};

// Five tabs, because a row of eight is a wall of icons nobody reads. The rest
// live one tap away behind More, which is where people look for them anyway.
//
// The dice get a tab because the dice are the promise on the tin — "Roll
// dinner. Cook once." — and a front door does not belong behind an overflow
// menu. Create stays the hub of every other way in (the plate, the pantry,
// the collection); it sits in More and is linked from Today and from the roll
// screen, so nothing got further away — the most-used way in just got closer.
const NAV = [
  { href: '#/today', label: 'Today', icon: '🌅' },
  { href: '#/roll', label: 'Roll', icon: '🎲' },
  { href: '#/plan', label: 'Plan', icon: '📋' },
  { href: '#/list', label: 'List', icon: '🛒' }
];

const MORE = [
  { href: '#/create', label: 'Create', icon: '✚', blurb: 'Every way to start a meal, on one screen' },
  { href: '#/book', label: 'Your cookbook', icon: '📔', blurb: 'The dishes you actually make, in your version' },
  { href: '#/browse', label: 'Recipes', icon: '📖', blurb: 'The whole collection' },
  { href: '#/pantry', label: 'Pantry', icon: '🏠', blurb: 'What is already in the kitchen' },
  { href: '#/progress', label: 'Progress', icon: '🌱', blurb: 'What you have been eating' },
  { href: '#/garden', label: 'Garden', icon: '🌿', blurb: 'What to plant, and when' },
  { href: '#/learn', label: 'How cooking works', icon: '🔪', blurb: 'Knife work, heat, pans, fats and the rest' },
  { href: '#/why', label: 'Why this works', icon: '💡', blurb: 'The research, with every source' },
  { href: '#/settings', label: 'Settings', icon: '⚙️', blurb: 'Household, preferences, your data' }
];

function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

let currentRoot = null;

function route() {
  const hash = location.hash || (getState().onboarded ? '#/today' : '#/onboarding');
  if (!location.hash) { location.replace(hash); return; }

  // A link can carry a query — #/browse?occasion=picnic comes off the roll
  // screen — and matchRoute ignores it, leaving the view to read location.hash
  // for whatever it needs.
  const match = matchRoute(hash);
  const main = $('#main');

  if (!match) {
    mount(main, h('section.view', h('p.empty', 'That page does not exist.'),
      h('button.btn.btn--primary', { onclick: () => navigate('#/today') }, 'Back to today')));
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
  const link = (item) => h('a.tabbar__item', { href: item.href },
    h('span.tabbar__icon', item.icon),
    h('span.tabbar__label', item.label)
  );

  const nav = h('nav.tabbar', { 'aria-label': 'Main' },
    ...NAV.map(link),
    h('button.tabbar__item', { id: 'more-tab', type: 'button', onclick: openMore },
      h('span.tabbar__icon', '⋯'),
      h('span.tabbar__label', 'More')
    ),

    // The same destinations the More sheet holds, rendered inline and shown
    // only once the window is wide enough to have room for them. On a phone,
    // five tabs and an overflow is the right trade; on an iPad or a Mac there
    // is space, and making somebody open a sheet to reach their own cookbook
    // is the phone's compromise imported somewhere it was never needed.
    h('div.tabbar__rest',
      h('div.tabbar__rule'),
      h('p.tabbar__section', 'Everything else'),
      ...MORE.map(link)
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
    // The craft models — flavor balance, substitutions, proteins, the table,
    // kitchen jobs and the technique library. All small, all precached, and all
    // needed by the recipe screen, which is where most sessions end up.
    await Promise.all([
      loadCitations(), loadOccasions(), loadBalance(), loadSubstitutions(),
      loadProteins(), loadTable(), loadKitchen(), loadTips(), loadPalette(), loadSkills()
    ]);
  } catch (err) {
    console.error(err);
    mount(main, h('section.view',
      h('h1.view__title', 'Could not load the recipe data'),
      h('p.muted', String(err.message || err)),
      h('p.muted', 'If this is the first visit, check the connection and reload. After one successful visit everything works offline.')
    ));
    return;
  }

  // The household's own recipes join the collection before anything renders, so
  // no screen ever has to ask where a recipe came from.
  mergeMyRecipes(myRecipes());

  initTheme();
  buildChrome();
  // Inside an app shell this wires up the status bar and notification taps. In
  // a browser it does nothing and the site is unchanged.
  // The wrist. Does nothing without a paired watch, and nothing at all on the
  // web. The step command reaches cook mode through the session it published.
  initWatch({
    onStep: (delta) => {
      const session = window.__cookSession;
      session?.onStep?.(delta);
    }
  });
  initNative({
    onOpenRef: (id) => {
      const timer = timerFor(id);
      if (!timer?.recipeId) return;
      const step = Number.isInteger(timer.step) ? `?step=${timer.step + 1}` : '';
      navigate(`#/cook/${timer.recipeId}${step}`);
    }
  });
  // Timers live outside every view, so they survive leaving cook mode.
  initTimerDock();
  // A chime, and the dock says the rest. It used to also throw a toast, which
  // meant one timer produced three simultaneous announcements of the same fact
  // on top of a screen someone was reading — and being told a thing three times
  // at once is what makes an app feel like it is panicking at you.
  setTimerAlarm(() => play('cooked'));
  initTimers();
  initInstall();
  initFeedback();

  const splash = $('#splash');
  if (splash) splash.remove();

  window.addEventListener('hashchange', route);
  route();

  // Re-render the current view when state changes elsewhere (e.g. a sheet), and
  // keep the index in step with recipes being written, edited or deleted.
  subscribe(() => { mergeMyRecipes(myRecipes()); paintNav(location.hash); });

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

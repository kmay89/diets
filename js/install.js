/**
 * install.js — the road to a home screen icon.
 *
 * Three browsers, three different routes. Chrome and Edge hand us a real
 * install prompt; Safari never has and never will, so on an iPhone the only
 * honest thing to do is name the buttons — Share, then "Add to Home Screen" —
 * rather than say "install" and leave people hunting.
 *
 * The invitation is also genuinely dismissible. One ✕ takes away the banner and
 * the toolbar button together, permanently, and Settings keeps the way back.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, $, sheet, toast } from './ui.js';

const DISMISSED = 'errerlabs.diets.installDismissed';

/** Set by beforeinstallprompt where the browser supports it. */
let deferredPrompt = null;

/* ---------- what this browser can actually do ---------- */

/** Already running from the home screen — nothing left to offer. */
export function isInstalled() {
  return window.matchMedia?.('(display-mode: standalone)').matches === true
    || window.matchMedia?.('(display-mode: window-controls-overlay)').matches === true
    || window.navigator.standalone === true;
}

/**
 * Which set of words describes the route here: 'ios', 'android' or 'desktop'.
 * Exported so it can be tested without a browser.
 */
export function installRoute(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints || 0) {
  // iPadOS 13+ reports itself as a Mac, and the only thing that gives it away
  // is a touchscreen. A Mac with a touch bar does not count — it reports 0.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export function isDismissed() {
  try { return localStorage.getItem(DISMISSED) === '1'; } catch { return false; }
}

function remember() {
  try { localStorage.setItem(DISMISSED, '1'); } catch { /* private mode: this visit only */ }
}

/* ---------- the words ---------- */

/** The banner copy, by route. Short enough to read at a glance on a phone. */
export function bannerCopy(route = installRoute(), canPrompt = !!deferredPrompt) {
  if (canPrompt) {
    return {
      line: 'Add Veg-Nourish to your home screen — it opens like an app and works offline.',
      action: 'Add'
    };
  }
  if (route === 'ios') {
    return {
      line: 'Add Veg-Nourish to your Home Screen: tap Share, then “Add to Home Screen”.',
      action: 'Show me'
    };
  }
  if (route === 'android') {
    return {
      line: 'Add Veg-Nourish to your home screen from the browser menu — it works offline.',
      action: 'Show me'
    };
  }
  return {
    line: 'Install Veg-Nourish and it opens in its own window, offline and all.',
    action: 'Show me'
  };
}

const GUIDES = {
  ios: {
    title: 'Add it to your Home Screen',
    intro: 'Two taps in Safari, and Veg-Nourish opens like an app — with no signal needed.',
    steps: [
      ['Tap Share', 'The square with an arrow coming out of it, in Safari’s bottom bar. On an iPad it is up in the top-right.'],
      ['Choose “Add to Home Screen”', 'Scroll the share sheet down past the row of apps — it is in the list underneath.'],
      ['Tap “Add”', 'The leaf lands on your Home Screen, with your household, plan and list already in it.']
    ],
    note: 'Safari is the only iPhone browser that can do this. If you are reading this in Chrome or Firefox, open veg-nourish.com in Safari first.'
  },
  android: {
    title: 'Add it to your home screen',
    intro: 'Chrome puts this behind its menu rather than on the page.',
    steps: [
      ['Open the browser menu', 'The three dots, top-right.'],
      ['Choose “Add to Home screen” or “Install app”', 'Both do the same thing — the wording changes with the Chrome version.'],
      ['Confirm', 'Veg-Nourish gets its own icon and opens without browser chrome.']
    ],
    note: 'Everything stays on your device either way. Installing only changes how it opens.'
  },
  desktop: {
    title: 'Install Veg-Nourish',
    intro: 'It runs in its own window, out of the way of your tabs.',
    steps: [
      ['Look in the address bar', 'Chrome and Edge show a small install icon at the right-hand end.'],
      ['Or open the browser menu', 'Chrome: “Cast, save and share” → “Install page as app”. Safari: Share → “Add to Dock”.'],
      ['Confirm', 'The app opens in its own window and keeps working offline.']
    ],
    note: 'Firefox has no install step — bookmark it and everything still works offline.'
  }
};

/** The step-by-step sheet, for every browser that cannot just be asked. */
export function openInstallGuide(route = installRoute()) {
  const guide = GUIDES[route] || GUIDES.desktop;
  return sheet(guide.title,
    h('div',
      h('p.muted', guide.intro),
      h('ol.install-steps',
        ...guide.steps.map(([what, how]) => h('li',
          h('strong', what),
          h('p.muted.small', how)
        ))
      ),
      h('p.fine-print', guide.note)
    )
  );
}

/* ---------- the affordances ---------- */

function paint() {
  const banner = $('#install-banner');
  const btn = $('#install-btn');
  const text = $('#install-text');
  const accept = $('#install-accept');

  const hide = isInstalled() || isDismissed();
  const copy = bannerCopy();

  if (text) text.textContent = copy.line;
  if (accept) accept.textContent = copy.action;
  if (banner) banner.hidden = hide;
  if (btn) btn.hidden = hide;
}

/** The one-tap route where it exists, the instructions where it does not. */
export async function promptInstall() {
  if (!deferredPrompt) {
    openInstallGuide();
    return 'guided';
  }
  const prompt = deferredPrompt;
  deferredPrompt = null;
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  paint();
  if (outcome === 'accepted') toast('Installing…');
  return outcome;
}

/** Dismiss the invitation — banner and toolbar button both, and for good. */
export function dismissInstall() {
  remember();
  paint();
}

export function initInstall() {
  $('#install-btn')?.addEventListener('click', () => promptInstall());
  $('#install-accept')?.addEventListener('click', () => promptInstall());
  $('#install-dismiss')?.addEventListener('click', dismissInstall);

  window.addEventListener('beforeinstallprompt', (e) => {
    // Holding onto the event is what lets the "Add" button be a real button
    // instead of a page of instructions.
    e.preventDefault();
    deferredPrompt = e;
    paint();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    paint();
    toast('Installed — look for it on your home screen');
  });

  // Settings offers a way back after the banner has been dismissed.
  window.__dietsInstall = () => promptInstall();

  paint();
}

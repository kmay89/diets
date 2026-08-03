/**
 * theme.js — the light/dark control that lives in the top right of the app bar.
 *
 * Three states, cycled by one tap: Auto (follow the phone), Light, Dark. Auto
 * is the default and is genuinely different from picking light — it keeps
 * following the OS when the OS changes at sunset.
 *
 * The choice is stored in the same pref the Settings screen writes, so the two
 * controls can never disagree. Whichever one changes it, the other is told.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, $ } from './ui.js';
import { getState, setPref } from './store.js';

export const THEMES = ['system', 'light', 'dark'];

const FACE = {
  system: { icon: '◐', label: 'Auto', title: 'Theme: Auto — following your device. Tap for light.' },
  light: { icon: '☀', label: 'Light', title: 'Theme: Light. Tap for dark.' },
  dark: { icon: '☾', label: 'Dark', title: 'Theme: Dark. Tap to follow your device again.' }
};

/** Put the choice on the document. "system" means: take the attribute off. */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark' || theme === 'light') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');

  // The browser chrome color has to move with it, or a dark app sits under a
  // green status bar on iOS.
  const dark = theme === 'dark'
    || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  for (const el of document.querySelectorAll('meta[name="theme-color"]')) {
    if (!el.hasAttribute('media')) el.setAttribute('content', dark ? '#141a17' : '#244C3F');
  }
}

export const currentTheme = () => {
  const t = getState().prefs.theme || 'system';
  return THEMES.includes(t) ? t : 'system';
};

export const nextTheme = (theme) => THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];

/**
 * How long the word stays up after a press, in ms.
 *
 * The button sits in the app bar all day, so at rest it is the icon alone. The
 * word is the answer to "what did I just switch it to", and that question has a
 * short life — long enough to read at a glance, gone before it is clutter.
 */
const REVEAL_MS = 1600;

/** Redraw whatever theme buttons are on screen. Called after any change. */
export function refreshThemeToggles() {
  for (const btn of document.querySelectorAll('[data-theme-toggle]')) paint(btn, currentTheme());
}

/** Show the word, then take it away again. */
function reveal(btn) {
  clearTimeout(btn._revealTimer);
  btn.classList.add('is-revealing');
  btn._revealTimer = setTimeout(() => btn.classList.remove('is-revealing'), REVEAL_MS);
}

function paint(btn, theme) {
  const face = FACE[theme];
  btn.dataset.themeToggle = theme;
  btn.title = face.title;
  btn.setAttribute('aria-label', face.title);
  btn.replaceChildren(
    h('span.theme-toggle__icon', { 'aria-hidden': 'true' }, face.icon),
    h('span.theme-toggle__label', face.label)
  );
}

export function setTheme(theme) {
  setPref('theme', theme);
  applyTheme(theme);
  refreshThemeToggles();
}

/**
 * The button itself. Small, always in the same corner, never hidden behind a menu.
 *
 * Icon-only at rest and it grows to fit the word when pressed, so the app bar
 * keeps its space for the wordmark. The accessible name carries the state in
 * full at all times, whatever the width is doing.
 */
export function themeToggle() {
  const btn = h('button.theme-toggle', {
    type: 'button',
    'data-theme-toggle': 'system',
    onclick: () => { setTheme(nextTheme(currentTheme())); reveal(btn); }
  });
  paint(btn, currentTheme());
  return btn;
}

/**
 * Mount it into the app bar and start following the OS.
 *
 * The media query listener matters: on "Auto" the CSS switches itself, but the
 * status bar color is ours to keep in step.
 */
export function initTheme() {
  applyTheme(currentTheme());

  const slot = $('#theme-slot');
  if (slot) slot.replaceChildren(themeToggle());

  window.matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener?.('change', () => { if (currentTheme() === 'system') applyTheme('system'); });
}

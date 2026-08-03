/**
 * ui.js — tiny DOM helpers. No framework, no build step, no dependencies.
 *
 * ERRERLabs — MIT licensed.
 */

/** Hyperscript: h('div.card', {onclick}, 'text', childNode) */
export function h(spec, props = null, ...children) {
  // Accepts 'div', 'div#id', 'div.a.b' and 'div.a#id' — the id may ride on the
  // tag or on the last class, because both look right and one silently failing
  // is a bug you find in a screenshot an hour later.
  const [tagPart, ...classParts] = String(spec).split('.');
  let [tag, id] = tagPart.split('#');
  const classes = [];
  for (const part of classParts) {
    const [cls, tailId] = part.split('#');
    if (cls) classes.push(cls);
    if (tailId) id = tailId;
  }
  const node = document.createElement(tag || 'div');
  if (id) node.id = id;
  if (classes.length) node.className = classes.join(' ');

  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }

  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = [node.className, v].filter(Boolean).join(' ');
    else if (k === 'style' && typeof v === 'object') setStyle(node, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') node.innerHTML = v;
    else if (k in node && k !== 'list' && k !== 'form') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }

  append(node, children);
  return node;
}

/**
 * Custom properties are invisible to `Object.assign(node.style, …)` — the
 * assignment succeeds and sets nothing, so `--ring-pct` silently never
 * arrives and the element renders as though the value were absent.
 */
function setStyle(node, styles) {
  for (const [prop, value] of Object.entries(styles)) {
    if (value == null) continue;
    if (prop.startsWith('--')) node.style.setProperty(prop, String(value));
    else node.style[prop] = value;
  }
}

function append(node, children) {
  for (const c of children.flat(4)) {
    if (c == null || c === false) continue;
    node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const frag = (...children) => {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(node, ...children) {
  clear(node);
  append(node, children);
  return node;
}

/* ---------- feedback ---------- */

let toastTimer = null;
export function toast(message, { kind = 'info', duration = 2600 } = {}) {
  let host = $('#toast');
  if (!host) {
    host = h('div#toast', { role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(host);
  }
  host.className = `toast toast--${kind} is-visible`;
  host.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.classList.remove('is-visible'), duration);
}

/** A bottom sheet / dialog. Returns the dialog element. */
export function sheet(title, content, { actions = [], wide = false } = {}) {
  const dialog = h('dialog.sheet', { class: wide ? 'sheet sheet--wide' : 'sheet' },
    h('div.sheet__head',
      h('h2.sheet__title', title),
      h('button.icon-btn', { type: 'button', 'aria-label': 'Close', onclick: () => dialog.close() }, '✕')
    ),
    h('div.sheet__body', content),
    actions.length ? h('div.sheet__actions', ...actions) : null
  );
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.body.appendChild(dialog);
  dialog.showModal();
  return dialog;
}

export function confirmSheet(title, message, { confirmLabel = 'Confirm', danger = false } = {}) {
  return new Promise(resolve => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const dlg = sheet(title, h('p.muted', message), {
      actions: [
        h('button.btn', { type: 'button', onclick: () => { done(false); dlg.close(); } }, 'Cancel'),
        h('button', {
          class: danger ? 'btn btn--danger' : 'btn btn--primary',
          type: 'button',
          onclick: () => { done(true); dlg.close(); }
        }, confirmLabel)
      ]
    });
    dlg.addEventListener('close', () => done(false));
  });
}

/* ---------- formatting ---------- */

export function minutes(n) {
  if (n < 60) return `${n} min`;
  const h1 = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h1} hr ${m} min` : `${h1} hr`;
}

/** "1 serving" / "2 servings" — pluralise a count without a library. */
export function plural(n, one, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`;
}

export function titleCase(s) {
  return String(s).replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function num(n, digits = 0) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** Simple horizontal bar for nutrient vs target. */
export function meter(value, target, { label = '', unit = '', invert = false } = {}) {
  const pct = target ? Math.min(140, Math.round((value / target) * 100)) : 0;
  const over = invert ? value > target : pct > 115;
  return h('div.meter',
    h('div.meter__top',
      h('span.meter__label', label),
      h('span.meter__value', `${num(value)}${unit} / ${num(target)}${unit}`)
    ),
    h('div.meter__track',
      h('div', { class: `meter__fill ${over ? 'is-over' : ''}`, style: { width: Math.min(pct, 100) + '%' } })
    )
  );
}

/**
 * A slider that actually slides.
 *
 * The first version re-rendered the whole view on every `input` event to keep
 * its label in sync, which threw away the element being dragged — so a drag
 * moved exactly one step and then died under the pointer. Nothing here
 * re-renders: the value pill, the fill and the ticks are patched in place, and
 * `onchange` hears about it without anybody redrawing anything.
 *
 * @param label   text to the left of the value
 * @param format  (value) => string, for the pill and the accessible name
 * @param onInput fired on every movement, including mid-drag
 */
export function rangeField(label, {
  min, max, step = 1, value, format = (v) => String(v), onInput = null, legend = true
} = {}) {
  const stops = Math.round((max - min) / step);
  const pct = (v) => ((v - min) / (max - min)) * 100;

  const readout = h('span.range__value', format(value));
  const input = h('input.range__input', {
    type: 'range', min, max, step, value,
    'aria-label': label,
    'aria-valuetext': format(value)
  });

  const ticks = stops > 1 && stops <= 24
    ? h('div.range__ticks', ...Array.from({ length: stops + 1 }, (_, i) =>
        h('span.range__tick', { style: { left: `${(i / stops) * 100}%` } })))
    : null;

  const paint = (v) => {
    input.style.setProperty('--fill', `${pct(v)}%`);
    readout.textContent = format(v);
    input.setAttribute('aria-valuetext', format(v));
    if (ticks) {
      [...ticks.children].forEach((t, i) =>
        t.classList.toggle('is-passed', min + i * step <= v));
    }
  };

  input.addEventListener('input', () => {
    const v = Number(input.value);
    paint(v);
    onInput?.(v);
  });
  paint(value);

  return h('div.range',
    h('div.range__head', h('span.range__label', label), readout),
    h('div.range__track', input, ticks),
    legend ? h('div.range__legend', h('span', format(min)), h('span', format(max))) : null
  );
}

export function chip(text, { on = false, onclick = null, kind = '' } = {}) {
  return h('button', {
    type: 'button',
    class: `chip ${on ? 'is-on' : ''} ${kind ? 'chip--' + kind : ''}`,
    'aria-pressed': on ? 'true' : 'false',
    onclick
  }, text);
}

export function pill(text, kind = '') {
  return h('span', { class: `pill ${kind ? 'pill--' + kind : ''}` }, text);
}

export function scoreBadge(heart) {
  if (!heart || heart.score == null) return h('span.pill.pill--muted', 'component');
  return h('span', {
    class: `score score--${heart.grade}`,
    title: `Heart-forward score ${heart.score}/100 — a sorting heuristic, not medical advice`
  }, heart.grade);
}

/** Debounce for search inputs. */
export function debounce(fn, ms = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

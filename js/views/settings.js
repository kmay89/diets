/**
 * settings.js (view) — household, preferences, your data, and what this thing is.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, chip, toast, sheet, confirmSheet, titleCase } from '../ui.js';
import { getDb } from '../data.js';
import {
  getState, setPref, addMember, updateMember, removeMember, newMember,
  exportData, importData, resetAll, setLike
} from '../store.js';
import { ACTIVITY, energyNeeds, dailyTargets } from '../nutrition.js';
import { downloadFile } from '../shopping.js';
import { soundEnabled, setSoundEnabled, prefersReducedMotion, play } from '../feedback.js';

export function render(root, { navigate }) {
  const draw = () => mount(root, view(draw, navigate));
  draw();
}

function view(draw, navigate) {
  const state = getState();
  const db = getDb();

  return h('section.view',
    h('div.view__head', h('h1.view__title', 'Settings')),

    h('section.card.block',
      h('h2.block__title', 'Household'),
      ...state.household.members.map(m => memberRow(m, state, draw)),
      h('div.row-actions',
        h('button.btn', { type: 'button', onclick: () => { addMember({ name: 'New person' }); draw(); } }, '+ Add a person')
      )
    ),

    h('section.card.block',
      h('h2.block__title', 'How meals are chosen'),
      toggle('Heart-forward mode', 'Tighter AHA sodium and saturated fat targets, and heart-friendly recipes float to the top.', state.prefs.heartMode, v => setPref('heartMode', v), draw),
      toggle('Cook with the season', 'Favour what is good in Northeast Ohio this month.', state.prefs.seasonAware, v => setPref('seasonAware', v), draw),
      toggle('Shop the pantry first', 'Weight rolls toward meals you can nearly make already.', state.prefs.preferPantry, v => setPref('preferPantry', v), draw),
      toggle('Only kid-friendly meals', 'Hide anything not on the kid-tested list.', state.prefs.kidFriendlyOnly, v => setPref('kidFriendlyOnly', v), draw),
      h('label.field',
        h('span.field__label', `Weeknight active time: ${state.prefs.maxActiveMin} minutes`),
        h('input.range', {
          type: 'range', min: 10, max: 60, step: 5, value: state.prefs.maxActiveMin,
          oninput: (e) => { setPref('maxActiveMin', Number(e.target.value)); draw(); }
        })
      ),
      h('label.field',
        h('span.field__label', 'Default store layout'),
        h('select.input', { onchange: (e) => { setPref('store', e.target.value); draw(); } },
          ...Object.entries(db.storeLayouts).map(([id, l]) => h('option', { value: id, selected: state.prefs.store === id }, l.name)))
      ),
      h('label.field',
        h('span.field__label', 'Appearance'),
        h('select.input', {
          onchange: (e) => { setPref('theme', e.target.value); applyTheme(e.target.value); draw(); }
        }, ...['system', 'light', 'dark'].map(t => h('option', { value: t, selected: state.prefs.theme === t }, titleCase(t))))
      )
    ),

    h('section.card.block',
      h('h2.block__title', 'Feel'),
      h('label.switch-row',
        h('input', {
          type: 'checkbox', checked: soundEnabled(),
          onchange: (e) => { setSoundEnabled(e.target.checked); draw(); }
        }),
        h('div',
          h('strong', 'Sound'),
          h('p.muted', 'Quiet tones when you roll, tick something off, or finish a meal. Never plays on load, never plays without you touching something first.')
        )
      ),
      h('p.fine-print',
        prefersReducedMotion()
          ? 'Your device asks for reduced motion, so animations are already switched off throughout the app.'
          : 'Animations follow your device\u2019s reduced-motion setting automatically.')
    ),

    h('section.card.block',
      h('h2.block__title', 'Tastes'),
      h('p.muted.small', `${Object.values(state.likes).filter(v => v === 1).length} loved · ${Object.values(state.likes).filter(v => v === -1).length} never · ${Object.values(state.recipeLikes).filter(v => v === -1).length} recipes hidden`),
      h('div.row-actions',
        h('button.btn', { type: 'button', onclick: () => openTasteEditor(draw) }, 'Edit food likes and dislikes'),
        h('button.btn', {
          type: 'button',
          onclick: async () => {
            if (await confirmSheet('Unhide every recipe?', 'Recipes you marked "not for us" come back into rolls.')) {
              const s = getState();
              for (const k of Object.keys(s.recipeLikes)) if (s.recipeLikes[k] === -1) delete s.recipeLikes[k];
              toast('All recipes are back in the deck');
              draw();
            }
          }
        }, 'Unhide recipes')
      )
    ),

    h('section.card.block',
      h('h2.block__title', 'Your data'),
      h('p.muted',
        'Everything lives in this browser on this device. There is no account and no server. ',
        'Clearing your browser data for this site deletes it, so keep a backup if it matters.'),
      h('div.row-actions',
        h('button.btn', {
          type: 'button',
          onclick: () => {
            downloadFile(exportData(), `veg-nourish-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
            toast('Backup downloaded');
          }
        }, '⬇ Download a backup'),
        h('button.btn', { type: 'button', onclick: () => openImport(draw) }, '⬆ Restore from backup'),
        h('button.btn.btn--danger', {
          type: 'button',
          onclick: async () => {
            if (await confirmSheet('Erase everything?', 'Household, tastes, pantry, plan and list are all deleted from this device. This cannot be undone.', { confirmLabel: 'Erase it all', danger: true })) {
              resetAll();
              toast('Wiped clean');
              navigate('#/onboarding');
            }
          }
        }, 'Erase all my data')
      ),
      h('p.fine-print', `Saved ${new Date(state.updatedAt).toLocaleString()}.`)
    ),

    h('section.card.block',
      h('h2.block__title', 'Targets in use'),
      ...state.household.members.filter(m => m.eats !== false).map(m => {
        const t = dailyTargets(m, { heartMode: state.prefs.heartMode });
        const e = energyNeeds(m);
        return h('div.target-row',
          h('strong', m.name || 'Unnamed'),
          h('p.muted.small',
            `${e.target.toLocaleString()} kcal · ${t.sodium_mg} mg sodium · ${t.satfat_g} g sat fat · ${t.fiber_g} g fiber · ${t.protein_g} g protein`),
          h('p.fine-print', `Energy method: ${e.method}`)
        );
      }),
      h('p.fine-print',
        'Adult energy uses Mifflin-St Jeor with an activity factor; children use the Dietary Guidelines reference tables. ',
        'Sodium and saturated fat targets follow American Heart Association guidance when heart-forward mode is on. ',
        'None of this is medical advice — a clinician who knows the person should set real targets.')
    ),

    h('section.card.block',
      h('h2.block__title', 'About'),
      h('p', 'Veg-Nourish by ERRERLabs — a private, offline-first meal planner built around one idea: cook one dinner everybody can eat, and make the healthy version the one people actually want.'),
      h('p.muted.small', `Data: ${db.ingredients.length} ingredients, ${db.recipes.length} recipes, ${db.graph.counts.nodes} graph nodes, ${db.graph.counts.edges} edges.`),
      h('p.muted.small', db.nutrientNote),
      h('div.row-actions',
        h('a.btn', { href: 'README.md' }, 'Read me'),
        h('a.btn', { href: 'PRIVACY.md' }, 'Privacy'),
        h('a.btn', { href: 'LICENSE' }, 'License (MIT)')
      ),
      h('div.row-actions',
        h('button.btn', {
          type: 'button',
          onclick: async () => {
            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations();
              await Promise.all(regs.map(r => r.update()));
              toast('Checked for an update — reopen the app to apply it');
            }
          }
        }, 'Check for updates'),
        h('button.btn', { type: 'button', onclick: () => { window.__dietsInstall?.(); } }, '📲 Add to home screen')
      )
    )
  );
}

function memberRow(m, state, draw) {
  const e = energyNeeds(m);
  return h('div.card.member',
    h('div.member__row',
      h('input.input.input--name', {
        type: 'text', value: m.name, placeholder: 'Name',
        oninput: (ev) => updateMember(m.id, { name: ev.target.value })
      }),
      h('button.icon-btn', { type: 'button', 'aria-label': 'Remove', onclick: () => { removeMember(m.id); draw(); } }, '🗑')
    ),
    h('div.field-grid',
      f('Age', h('input.input', { type: 'number', value: m.age ?? '', oninput: (ev) => { updateMember(m.id, { age: Number(ev.target.value) || null }); draw(); } })),
      f('Sex', sel(['female', 'male'], m.sex, v => { updateMember(m.id, { sex: v }); draw(); })),
      f('Diet', sel(['omnivore', 'vegetarian', 'vegan', 'pescatarian'], m.diet, v => { updateMember(m.id, { diet: v }); draw(); })),
      f('Activity', sel(Object.keys(ACTIVITY), m.activity, v => { updateMember(m.id, { activity: v }); draw(); })),
      f('Goal', sel(['maintain', 'lose', 'gain'], m.goal, v => { updateMember(m.id, { goal: v }); draw(); })),
      f('Eats here', h('input', { type: 'checkbox', checked: m.eats !== false, onchange: (ev) => { updateMember(m.id, { eats: ev.target.checked }); draw(); } }))
    ),
    h('p.member__est', `≈ ${e.target.toLocaleString()} kcal a day (${e.method})`)
  );
}

const f = (label, control) => h('label.field', h('span.field__label', label), control);
const sel = (values, current, onchange) =>
  h('select.input', { onchange: (e) => onchange(e.target.value) },
    ...values.map(v => h('option', { value: v, selected: v === current }, titleCase(v))));

function toggle(title, desc, value, onchange, draw) {
  return h('label.switch-row',
    h('input', { type: 'checkbox', checked: value, onchange: (e) => { onchange(e.target.checked); draw(); } }),
    h('div', h('strong', title), h('p.muted', desc))
  );
}

function openTasteEditor(draw) {
  const { ingredients } = getDb();
  const state = getState();
  const body = h('div');

  const rebuild = () => {
    const s = getState();
    const rows = ingredients
      .filter(i => !['spices', 'baking', 'household'].includes(i.aisle))
      .map(i => {
        const v = s.likes[i.id] || 0;
        return h('button', {
          type: 'button',
          class: `chip chip--taste ${v === 1 ? 'is-love' : ''} ${v === -1 ? 'is-never' : ''}`,
          onclick: () => {
            setLike(i.id, v === 0 ? 1 : v === 1 ? -1 : 0);
            rebuild();
            draw();
          }
        }, `${v === 1 ? '♥ ' : v === -1 ? '✕ ' : ''}${i.name}`);
      });
    body.replaceChildren(
      h('p.muted', 'Tap once for love, twice for never, a third time to clear.'),
      h('div.chip-row', ...rows)
    );
  };
  rebuild();

  sheet('Food likes and dislikes', body, { wide: true });
}

function openImport(draw) {
  const input = h('input', { type: 'file', accept: 'application/json' });
  const ta = h('textarea.input.textarea', { rows: 6, placeholder: '…or paste the contents of a backup file here' });

  const apply = (text) => {
    try {
      importData(text);
      toast('Restored');
      dlg.close();
      draw();
    } catch (err) {
      toast(err.message || 'That file could not be read', { kind: 'warn' });
    }
  };

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (file) apply(await file.text());
  });

  const dlg = sheet('Restore from a backup',
    h('div',
      h('p.muted', 'This replaces everything currently saved on this device.'),
      input,
      ta
    ),
    { actions: [h('button.btn.btn--primary', { type: 'button', onclick: () => apply(ta.value) }, 'Restore from pasted text')] }
  );
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

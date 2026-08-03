/**
 * settings.js (view) — household, preferences, your data, and what this thing is.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, chip, toast, sheet, confirmSheet, titleCase, rangeField } from '../ui.js';
import { getDb } from '../data.js';
import { setTheme, THEMES } from '../theme.js';
import {
  getState, setPref, addMember, exportData, importData, resetAll,
  shoppingStores, clearStoreMemory
} from '../store.js';
import { energyNeeds, dailyTargets } from '../nutrition.js';
import { downloadFile } from '../shopping.js';
import { memberCard } from './member-card.js';
import { openTasteEditor } from './taste-editor.js';
import { soundEnabled, setSoundEnabled, prefersReducedMotion, play } from '../feedback.js';
import { promptInstall, isInstalled, isDismissed } from '../install.js';

export function render(root, { navigate }) {
  const draw = () => mount(root, view(draw, navigate));
  draw();
}

function view(draw, navigate) {
  const state = getState();
  const db = getDb();

  // "Targets in use" restates what the household cards say, so it has to follow
  // an edit — but by patching one container, never by redrawing the page under
  // whichever field is being typed into.
  const targetsBody = h('div');
  const refreshTargets = () => targetsBody.replaceChildren(
    ...getState().household.members.filter(m => m.eats !== false).map(m => {
      const t = dailyTargets(m, { heartMode: getState().prefs.heartMode });
      const e = energyNeeds(m);
      return h('div.target-row',
        h('strong', m.name || 'Unnamed'),
        h('p.muted.small',
          `${e.target.toLocaleString()} kcal · ${t.sodium_mg} mg sodium · ${t.satfat_g} g sat fat · ${t.fiber_g} g fiber · ${t.protein_g} g protein`),
        h('p.fine-print', `Energy method: ${e.method}`)
      );
    })
  );
  refreshTargets();

  return h('section.view',
    h('div.view__head', h('h1.view__title', 'Settings')),

    h('section.card.block',
      h('h2.block__title', 'Household'),
      ...state.household.members.map(m => memberCard(m, { onStructuralChange: draw, onValueChange: refreshTargets })),
      h('div.row-actions',
        h('button.btn', { type: 'button', onclick: () => { addMember({ name: 'New person' }); draw(); } }, '+ Add a person')
      )
    ),

    h('section.card.block',
      h('h2.block__title', 'How meals are chosen'),
      toggle('Heart-forward mode', 'Tighter AHA sodium and saturated fat targets, and heart-friendly recipes float to the top.', state.prefs.heartMode, v => setPref('heartMode', v), draw),
      toggle('Cook with the season', 'Favor what is good in Northeast Ohio this month.', state.prefs.seasonAware, v => setPref('seasonAware', v), draw),
      toggle('Shop the pantry first', 'Weight rolls toward meals you can nearly make already.', state.prefs.preferPantry, v => setPref('preferPantry', v), draw),
      toggle('Only kid-friendly meals', 'Hide anything not on the kid-tested list.', state.prefs.kidFriendlyOnly, v => setPref('kidFriendlyOnly', v), draw),
      rangeField('Weeknight active time', {
        min: 10, max: 60, step: 5, value: state.prefs.maxActiveMin,
        format: (v) => `${v} min`,
        onInput: (v) => setPref('maxActiveMin', v)
      }),
      // The stores themselves are chosen on the shopping list, because that is
      // where somebody is thinking about them. This is the place to see what
      // the app has learned and to take it back.
      h('label.field',
        h('span.field__label', 'Where you shop'),
        h('p.muted.small',
          shoppingStores(state).length
            ? shoppingStores(state).map(id => db.storeLayouts[id]?.name || id).join(' → ')
            : 'Not set yet.'),
        h('span.field__hint', 'Set on the shopping list — tap the store chips there.')
      ),
      (Object.keys(state.aisleRules || {}).length || Object.keys(state.assignments || {}).length)
        ? h('div',
            h('p.muted.small',
              ...Object.entries(state.aisleRules || {}).map(([aisleId, storeId]) =>
                h('span.pill.pill--green',
                  `${db.aisleIndex.get(aisleId)?.name || aisleId} → ${db.storeLayouts[storeId]?.name || storeId}`)),
              Object.keys(state.assignments || {}).length
                ? h('span.pill', `${Object.keys(state.assignments).length} single items filed`)
                : null),
            h('div.row-actions',
              h('button.btn.btn--small', {
                type: 'button',
                onclick: async () => {
                  if (await confirmSheet('Forget where things come from?',
                    'The per-item choices and the aisle rules go; the stores themselves stay.')) {
                    clearStoreMemory();
                    toast('Forgotten');
                    draw();
                  }
                }
              }, 'Forget what it learned'))
          )
        : null,
      h('label.field',
        h('span.field__label', 'Appearance'),
        h('select.input', {
          onchange: (e) => { setTheme(e.target.value); draw(); }
        }, ...THEMES.map(t => h('option', { value: t, selected: state.prefs.theme === t },
          t === 'system' ? 'Auto — follow my device' : titleCase(t)))),
        h('span.field__hint', 'The same switch lives in the top right of every screen.')
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
      targetsBody,
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
        isInstalled()
          ? null
          : h('button.btn', { type: 'button', onclick: () => promptInstall() }, '📲 Add to home screen')
      ),
      // Dismissing the banner is meant to be final, so this is where it lives
      // afterwards — otherwise "not now" quietly means "never".
      !isInstalled() && isDismissed()
        ? h('p.fine-print', 'You dismissed the home-screen banner. The button above still walks you through it.')
        : null
    )
  );
}

function toggle(title, desc, value, onchange, draw) {
  return h('label.switch-row',
    h('input', { type: 'checkbox', checked: value, onchange: (e) => { onchange(e.target.checked); draw(); } }),
    h('div', h('strong', title), h('p.muted', desc))
  );
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

/** Kept as a re-export so older callers (and the tests) still have one name for it. */
export { applyTheme } from '../theme.js';

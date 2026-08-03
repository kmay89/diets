/**
 * onboarding.js — first run. Household, health focus, time budget, taste map, pantry.
 *
 * Everything collected here stays on the device; the copy says so, because
 * people are right to ask before typing their family's ages into a web app.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, chip, toast } from '../ui.js';
import { getDb } from '../data.js';
import { getState, update, newMember, setLike, togglePantry, setPref } from '../store.js';
import { ACTIVITY, energyNeeds } from '../nutrition.js';

const STEPS = ['welcome', 'household', 'health', 'time', 'tastes', 'pantry', 'done'];

let step = 0;

export function render(root, { navigate }) {
  const state = getState();
  const draw = () => mount(root, view(state, draw, navigate));
  draw();
}

function view(state, draw, navigate) {
  const name = STEPS[step];
  const next = () => { step = Math.min(step + 1, STEPS.length - 1); draw(); };
  const back = () => { step = Math.max(step - 1, 0); draw(); };

  const body = {
    welcome: () => welcomeStep(),
    household: () => householdStep(state, draw),
    health: () => healthStep(state, draw),
    time: () => timeStep(state, draw),
    tastes: () => tastesStep(state, draw),
    pantry: () => pantryStep(state, draw),
    done: () => doneStep(state)
  }[name]();

  const canAdvance = name !== 'household' || state.household.members.length > 0;

  return h('section.view.onboarding',
    h('div.progress-dots', { 'aria-label': `Step ${step + 1} of ${STEPS.length}` },
      ...STEPS.map((s, i) => h('span', { class: `dot ${i === step ? 'is-on' : ''} ${i < step ? 'is-done' : ''}` }))
    ),
    body,
    h('div.onboarding__nav',
      step > 0 ? h('button.btn', { type: 'button', onclick: back }, 'Back') : h('span'),
      name === 'done'
        ? h('button.btn.btn--primary', {
            type: 'button',
            onclick: () => {
              update(s => { s.onboarded = true; });
              navigate('#/roll');
            }
          }, 'Start rolling meals →')
        : h('button.btn.btn--primary', {
            type: 'button',
            disabled: !canAdvance,
            onclick: () => {
              if (!canAdvance) return toast('Add at least one person first');
              next();
            }
          }, step === 0 ? 'Get started' : 'Next')
    ),
    name !== 'done' && step > 0
      ? h('button.linkish', {
          type: 'button',
          onclick: () => { update(s => { s.onboarded = true; }); navigate('#/roll'); }
        }, 'Skip the rest for now')
      : null
  );
}

/* ---------- steps ---------- */

function welcomeStep() {
  return h('div.step',
    h('h1.step__title', 'Dinner, solved.'),
    h('p.lede',
      'Roll a few meal ideas, get an ingredient list that already knows what is in your kitchen, ',
      'and walk out the door with a shopping list in the order you actually shop.'),
    h('ul.feature-list',
      feature('🎲', 'Roll, do not browse', 'Tell it how many meals you need. It weighs your tastes, the season, your pantry and the clock, then deals you a hand. Re-roll anything you do not like.'),
      feature('🌱', 'One dinner, two ways', 'Every dinner has a vegetarian base the whole table eats, plus a fork-in-the-road add-on for the omnivores. Nobody cooks twice.'),
      feature('❤️', 'Heart-forward by default', 'Sodium, saturated fat, fiber and potassium are tracked on every plate, using public USDA data.'),
      feature('📴', 'Yours, offline', 'Everything lives on this device. No account, no server, no analytics. Add it to your home screen and it works on airplane mode.')
    ),
    h('p.fine-print',
      'This is a planning tool, not medical advice. If someone in your house is managing heart disease, ',
      'their cardiologist or a registered dietitian should have the final word on targets.')
  );
}

function feature(icon, title, text) {
  return h('li.feature',
    h('span.feature__icon', icon),
    h('div', h('strong', title), h('p.muted', text))
  );
}

const TEMPLATES = [
  { label: 'Me', partial: { name: 'Me', sex: 'female', age: 42, diet: 'vegetarian', isCook: true } },
  { label: 'Partner', partial: { name: 'Partner', sex: 'male', age: 44, diet: 'omnivore' } },
  { label: 'Kid', partial: { name: 'Kid', sex: 'female', age: 10, diet: 'omnivore', activity: 'active' } },
  { label: 'Teen', partial: { name: 'Teen', sex: 'male', age: 15, diet: 'omnivore', activity: 'active' } }
];

function householdStep(state, draw) {
  const members = state.household.members;

  const add = (partial) => {
    update(s => { s.household.members.push(newMember(partial)); });
    draw();
  };

  return h('div.step',
    h('h1.step__title', 'Who is at the table?'),
    h('p.lede', 'Ages and activity drive the portion math — how many servings to cook and how the calories split across the family. Height and weight are optional and only sharpen the estimate.'),
    h('div.chip-row', ...TEMPLATES.map(t => chip(`+ ${t.label}`, { onclick: () => add(t.partial) }))),
    members.length
      ? h('div.member-list', ...members.map(m => memberCard(m, draw)))
      : h('p.empty', 'No one yet — tap a button above to add the first person.'),
    members.length
      ? h('p.fine-print', 'Diet matters: mark the vegetarian, and every dinner rolled will have a base she can eat, with meat kept to a separate pan.')
      : null
  );
}

function memberCard(m, draw) {
  const est = energyNeeds(m);
  const set = (patch) => {
    update(s => {
      const t = s.household.members.find(x => x.id === m.id);
      if (t) Object.assign(t, patch);
    });
    draw();
  };

  return h('div.card.member',
    h('div.member__row',
      h('input.input.input--name', {
        type: 'text', value: m.name, placeholder: 'Name',
        oninput: (e) => update(s => {
          const t = s.household.members.find(x => x.id === m.id);
          if (t) t.name = e.target.value;
        })
      }),
      h('button.icon-btn', {
        type: 'button', 'aria-label': `Remove ${m.name || 'person'}`,
        onclick: () => { update(s => { s.household.members = s.household.members.filter(x => x.id !== m.id); }); draw(); }
      }, '🗑')
    ),
    h('div.field-grid',
      field('Age', h('input.input', {
        type: 'number', min: 1, max: 110, value: m.age ?? '',
        oninput: (e) => set({ age: Number(e.target.value) || null })
      })),
      field('Sex', select(['female', 'male'], m.sex, v => set({ sex: v }), { female: 'Female', male: 'Male' })),
      field('Diet', select(['omnivore', 'vegetarian', 'vegan', 'pescatarian'], m.diet, v => set({ diet: v }), {
        omnivore: 'Omnivore', vegetarian: 'Vegetarian', vegan: 'Vegan', pescatarian: 'Pescatarian'
      })),
      field('Activity', select(Object.keys(ACTIVITY), m.activity, v => set({ activity: v }),
        Object.fromEntries(Object.entries(ACTIVITY).map(([k, v]) => [k, v.label.split(' — ')[0]])))),
      field('Height', heightInput(m, set)),
      field('Weight (lb)', h('input.input', {
        type: 'number', min: 20, max: 500, value: m.weightKg ? Math.round(m.weightKg * 2.2046) : '',
        placeholder: 'optional',
        oninput: (e) => set({ weightKg: e.target.value ? Number(e.target.value) / 2.2046 : null })
      }))
    ),
    h('p.member__est',
      `≈ ${est.target.toLocaleString()} kcal a day `,
      h('span.muted', `(${est.method})`)
    )
  );
}

function heightInput(m, set) {
  const totalIn = m.heightCm ? Math.round(m.heightCm / 2.54) : null;
  const ft = totalIn ? Math.floor(totalIn / 12) : '';
  const inch = totalIn ? totalIn % 12 : '';
  const apply = (f, i) => {
    const t = (Number(f) || 0) * 12 + (Number(i) || 0);
    set({ heightCm: t ? t * 2.54 : null });
  };
  return h('div.height-input',
    h('input.input', { type: 'number', min: 1, max: 8, value: ft, placeholder: 'ft', oninput: (e) => apply(e.target.value, inch) }),
    h('input.input', { type: 'number', min: 0, max: 11, value: inch, placeholder: 'in', oninput: (e) => apply(ft, e.target.value) })
  );
}

function field(label, control) {
  return h('label.field', h('span.field__label', label), control);
}

function select(values, current, onchange, labels = {}) {
  return h('select.input', { onchange: (e) => onchange(e.target.value) },
    ...values.map(v => h('option', { value: v, selected: v === current }, labels[v] || v))
  );
}

const ALLERGENS = ['dairy', 'egg', 'gluten', 'soy', 'peanut', 'tree-nut', 'sesame', 'fish', 'shellfish'];

function healthStep(state, draw) {
  const p = state.prefs;
  return h('div.step',
    h('h1.step__title', 'What are we cooking around?'),
    h('label.switch-row',
      h('input', {
        type: 'checkbox', checked: p.heartMode,
        onchange: (e) => { setPref('heartMode', e.target.checked); draw(); }
      }),
      h('div',
        h('strong', 'Heart-forward mode'),
        h('p.muted', 'Uses the tighter American Heart Association figures — 1,500 mg sodium a day and saturated fat under 6% of calories — and pushes recipes that fit them to the top of every roll.')
      )
    ),
    h('div.card.info',
      h('h3', 'What that actually changes'),
      h('ul.tight',
        h('li', 'Low-sodium broth, no-salt-added beans and tomatoes are the defaults in every recipe.'),
        h('li', 'Salty things — parmesan, feta, olives, soy sauce, sausage — are used as finishers in small amounts, never as the body of a dish.'),
        h('li', 'Acid does the work salt usually does. Almost every recipe here ends with lemon or vinegar.'),
        h('li', 'Two fatty-fish dinners a week are suggested for the omnivores, with a vegetarian version cooked on the same tray.')
      )
    ),
    h('h3.step__sub', 'Anything to keep out of the house entirely?'),
    h('div.chip-row',
      ...ALLERGENS.map(a => chip(a.replace('-', ' '), {
        on: p.avoidAllergens.includes(a),
        onclick: () => {
          const next = p.avoidAllergens.includes(a)
            ? p.avoidAllergens.filter(x => x !== a)
            : [...p.avoidAllergens, a];
          setPref('avoidAllergens', next);
          draw();
        }
      }))
    ),
    h('p.fine-print', 'Recipes containing anything you flag here are removed from rolls completely, not just labelled.')
  );
}

function timeStep(state, draw) {
  const p = state.prefs;
  return h('div.step',
    h('h1.step__title', 'How much time do you actually have?'),
    h('p.lede', 'Active time is hands-on work — chopping and stirring. Total time includes the oven doing its thing while you do something else.'),
    h('div.card',
      h('label.field',
        h('span.field__label', `Weeknight active time: ${p.maxActiveMin} minutes`),
        h('input.range', {
          type: 'range', min: 10, max: 60, step: 5, value: p.maxActiveMin,
          oninput: (e) => { setPref('maxActiveMin', Number(e.target.value)); draw(); }
        })
      ),
      h('div.range-legend', h('span', '10 min'), h('span', '60 min'))
    ),
    toggleRow('Only meals the kids will eat', 'Filters every roll down to the kid-tested list. You can turn this off any time — most recipes here have a kid tweak instead.', p.kidFriendlyOnly, v => setPref('kidFriendlyOnly', v), draw),
    toggleRow('Cook with the season', 'Favours what is actually good in Northeast Ohio this month, and what is coming out of the garden.', p.seasonAware, v => setPref('seasonAware', v), draw),
    toggleRow('Shop the pantry first', 'Weights the roll toward meals you can mostly already make.', p.preferPantry, v => setPref('preferPantry', v), draw)
  );
}

function toggleRow(title, desc, value, onchange, draw) {
  return h('label.switch-row',
    h('input', { type: 'checkbox', checked: value, onchange: (e) => { onchange(e.target.checked); draw(); } }),
    h('div', h('strong', title), h('p.muted', desc))
  );
}

/* ---------- taste map ---------- */

const TASTE_GROUPS = [
  { title: 'Vegetables', ids: ['ing.broccoli', 'ing.cauliflower', 'ing.mushroom.cremini', 'ing.brusselsprouts', 'ing.eggplant', 'ing.zucchini', 'ing.sweetpotato', 'ing.kale.lacinato', 'ing.spinach.baby', 'ing.beet', 'ing.asparagus', 'ing.squash.butternut', 'ing.pepper.bell.red', 'ing.cabbage.green', 'ing.fennel'] },
  { title: 'Proteins', ids: ['ing.tofu.firm', 'ing.tempeh', 'ing.chickpeas.canned', 'ing.lentil.brown', 'ing.beans.black', 'ing.egg', 'ing.salmon', 'ing.shrimp', 'ing.chicken.thigh', 'ing.turkey.ground93'] },
  { title: 'Flavours', ids: ['ing.spice.pepperflakes', 'ing.cilantro', 'ing.garlic', 'ing.ginger', 'ing.miso.white', 'ing.currypaste.red', 'ing.spice.smokedpaprika', 'ing.olives.kalamata', 'ing.cheese.feta', 'ing.tahini', 'ing.peanutbutter', 'ing.vinegar.balsamic'] },
  { title: 'Grains and pasta', ids: ['ing.pasta.wholewheat', 'ing.rice.brown', 'ing.quinoa', 'ing.farro', 'ing.oats.rolled', 'ing.tortilla.corn', 'ing.noodle.rice', 'ing.cornmeal'] }
];

function tastesStep(state, draw) {
  const { ingIndex } = getDb();
  const cycle = (id) => {
    const cur = state.likes[id] || 0;
    setLike(id, cur === 0 ? 1 : cur === 1 ? -1 : 0);
    draw();
  };

  return h('div.step',
    h('h1.step__title', 'What do you love? What is never happening?'),
    h('p.lede', 'Tap once for ', h('strong', 'love'), ', twice for ', h('strong', 'never'), ', a third time to clear. Loved ingredients get pulled toward the top of every roll; anything marked never is removed entirely.'),
    ...TASTE_GROUPS.map(group => h('div.taste-group',
      h('h3.step__sub', group.title),
      h('div.chip-row',
        ...group.ids.map(id => {
          const item = ingIndex.get(id);
          if (!item) return null;
          const v = state.likes[id] || 0;
          return h('button', {
            type: 'button',
            class: `chip chip--taste ${v === 1 ? 'is-love' : ''} ${v === -1 ? 'is-never' : ''}`,
            onclick: () => cycle(id)
          }, `${v === 1 ? '♥ ' : v === -1 ? '✕ ' : ''}${item.name}`);
        })
      )
    )),
    h('p.fine-print', 'You can change any of this later, and the recipe screen lets you mark things as you cook.')
  );
}

/* ---------- pantry ---------- */

const PANTRY_STAPLES = [
  'ing.oil.olive', 'ing.salt.kosher', 'ing.spice.blackpepper', 'ing.garlic', 'ing.onion.yellow',
  'ing.lemon', 'ing.mustard.dijon', 'ing.vinegar.redwine', 'ing.vinegar.balsamic', 'ing.soysauce.lowsodium',
  'ing.tomato.canned.crushed', 'ing.tomatopaste', 'ing.chickpeas.canned', 'ing.beans.black', 'ing.lentil.brown',
  'ing.pasta.wholewheat', 'ing.rice.brown', 'ing.oats.rolled', 'ing.broth.veg', 'ing.spice.cumin',
  'ing.spice.smokedpaprika', 'ing.spice.oregano', 'ing.spice.chili', 'ing.spice.pepperflakes', 'ing.spice.cinnamon',
  'ing.flour.ap', 'ing.honey', 'ing.maple', 'ing.peanutbutter', 'ing.tahini'
];

function pantryStep(state, draw) {
  const { ingIndex } = getDb();
  return h('div.step',
    h('h1.step__title', 'What is already in the kitchen?'),
    h('p.lede', 'Tick what you keep on hand. Anything ticked drops off the shopping list and pulls matching meals up the roll. This is a five-second job you can redo any time.'),
    h('div.chip-row',
      ...PANTRY_STAPLES.map(id => {
        const item = ingIndex.get(id);
        if (!item) return null;
        return chip(item.name, { on: !!state.pantry[id], onclick: () => { togglePantry(id); draw(); } });
      })
    ),
    h('div.row-actions',
      h('button.btn', { type: 'button', onclick: () => { PANTRY_STAPLES.forEach(id => togglePantry(id, true)); draw(); } }, 'I have all of these'),
      h('button.btn', { type: 'button', onclick: () => { PANTRY_STAPLES.forEach(id => togglePantry(id, false)); draw(); } }, 'Clear')
    ),
    h('p.fine-print', 'The full pantry list — every ingredient in the app, by aisle — is on the Pantry tab.')
  );
}

function doneStep(state) {
  const members = state.household.members;
  const totalKcal = members.filter(m => m.eats !== false).reduce((a, m) => a + energyNeeds(m).target, 0);
  const loves = Object.values(state.likes).filter(v => v === 1).length;
  const nevers = Object.values(state.likes).filter(v => v === -1).length;
  const pantry = Object.keys(state.pantry).length;

  return h('div.step',
    h('h1.step__title', 'Ready.'),
    h('div.card.summary',
      summaryRow('Household', `${members.length} ${members.length === 1 ? 'person' : 'people'}, about ${totalKcal.toLocaleString()} kcal a day between you`),
      summaryRow('Diets', members.map(m => `${m.name || 'unnamed'}: ${m.diet}`).join(' · ') || '—'),
      summaryRow('Time budget', `${state.prefs.maxActiveMin} minutes of active cooking on a weeknight`),
      summaryRow('Taste map', `${loves} loved, ${nevers} never`),
      summaryRow('Pantry', `${pantry} items on hand`)
    ),
    h('p.lede', 'Next: roll a few dinners, check the ingredient lists against your kitchen, and send yourself a shopping list.'),
    h('p.fine-print', 'Add this to your home screen from your browser menu and it will open like an app and work with no signal.')
  );
}

function summaryRow(label, value) {
  return h('div.summary__row', h('span.summary__label', label), h('span.summary__value', value));
}

export function resetOnboarding() { step = 0; }

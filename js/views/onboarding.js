/**
 * onboarding.js — first run. Household, health focus, time budget, taste map, pantry.
 *
 * Everything collected here stays on the device; the copy says so, because
 * people are right to ask before typing their family's ages into a web app.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, chip, toast, rangeField } from '../ui.js';
import { getDb } from '../data.js';
import { getState, update, newMember, setLike, togglePantry, setPref } from '../store.js';
import { memberCard } from './member-card.js';
import { openTasteEditor } from './taste-editor.js';
import { energyNeeds } from '../nutrition.js';

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
    h('p.hero__eyebrow', 'Welcome'),
    h('h1.step__title', 'Food is nourishment first.'),
    h('p.lede',
      'Most eating advice starts with what to cut. This starts somewhere else: dinner is how you ',
      'take care of the people at your table, and the meal you will happily cook again next month ',
      'is worth more than the perfect meal you cook once.'
    ),
    h('p.lede',
      'So nothing here asks you to eat less. It asks what could go ', h('em', 'on'), ' the plate to make ',
      'it better — more plants, more fiber, more color, flavor built from technique instead of salt. ',
      'The rest takes care of itself, quietly.'
    ),
    h('ul.feature-list',
      feature('🎲', 'Roll, don\u2019t browse',
        'Say how many meals you need. It weighs your tastes, the season, your pantry and the clock, then deals you a hand. Re-roll anything you don\u2019t like.'),
      feature('🌱', 'One dinner, everybody eats',
        'Every dinner has a base the whole table can eat, plus a fork in the road for anyone who wants meat — cooked in a separate pan. Nobody cooks twice, and nobody eats a compromise.'),
      feature('❤️', 'Backed by real research',
        'Every health, cost and climate claim in this app is attached to a study you can open, labeled with what kind of evidence it is and what it does not show.'),
      feature('📴', 'Yours, and private',
        'Everything stays on this device. No account, no server, no analytics. Add it to your home screen and it works with no signal at all.')
    ),
    h('div.card.info',
      h('h3', 'No streaks. No points. No red numbers.'),
      h('p.muted',
        'A week where you cook twice is a good week. This is a tool for making the cooking easier, ',
        'not a scoreboard for how you eat.')
    ),
    h('p.fine-print',
      'A planning tool, not medical advice. If someone in your house is managing heart disease, their ',
      'clinician sets the targets \u2014 this just helps you hit them at dinner. The ',
      h('a', { href: '#/why' }, 'Why'), ' page explains what food can and cannot do, with sources.')
  );
}

function feature(icon, title, text) {
  return h('li.feature',
    h('span.feature__icon', icon),
    h('div', h('strong', title), h('p.muted', text))
  );
}

const TEMPLATES = [
  { label: 'Adult', partial: { name: '', age: 40, diet: 'omnivore' } },
  { label: 'Adult (vegetarian)', partial: { name: '', age: 40, diet: 'vegetarian' } },
  { label: 'Child', partial: { name: '', age: 9, diet: 'omnivore', activity: 'active' } },
  { label: 'Teen', partial: { name: '', age: 15, diet: 'omnivore', activity: 'active' } }
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
      ? h('div.member-list', ...members.map(m => memberCard(m, { onStructuralChange: draw })))
      : h('p.empty', 'No one yet — tap a button above to add the first person.'),
    members.length
      ? h('p.fine-print', 'Diet matters. Mark anyone who does not eat meat and every dinner rolled will have a base they can eat, with meat kept to a separate pan.')
      : null
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
    h('p.fine-print', 'Recipes containing anything you flag here are removed from rolls completely, not just labeled.')
  );
}

function timeStep(state, draw) {
  const p = state.prefs;
  return h('div.step',
    h('h1.step__title', 'How much time do you actually have?'),
    h('p.lede', 'Active time is hands-on work — chopping and stirring. Total time includes the oven doing its thing while you do something else.'),
    h('div.card',
      rangeField('Weeknight active time', {
        min: 10, max: 60, step: 5, value: p.maxActiveMin,
        format: (v) => `${v} min`,
        // No redraw: re-rendering mid-drag is what used to tear the slider out
        // from under the pointer after a single step.
        onInput: (v) => setPref('maxActiveMin', v)
      })
    ),
    toggleRow('Only meals the kids will eat', 'Filters every roll down to the kid-tested list. You can turn this off any time — most recipes here have a kid tweak instead.', p.kidFriendlyOnly, v => setPref('kidFriendlyOnly', v), draw),
    toggleRow('Cook with the season', 'Favors what is actually good in Northeast Ohio this month, and what is coming out of the garden.', p.seasonAware, v => setPref('seasonAware', v), draw),
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
  { title: 'Flavors', ids: ['ing.spice.pepperflakes', 'ing.cilantro', 'ing.garlic', 'ing.ginger', 'ing.miso.white', 'ing.currypaste.red', 'ing.spice.smokedpaprika', 'ing.olives.kalamata', 'ing.cheese.feta', 'ing.tahini', 'ing.peanutbutter', 'ing.vinegar.balsamic'] },
  { title: 'Grains and pasta', ids: ['ing.pasta.wholewheat', 'ing.rice.brown', 'ing.quinoa', 'ing.farro', 'ing.oats.rolled', 'ing.tortilla.corn', 'ing.noodle.rice', 'ing.cornmeal'] }
];

function tastesStep(state, draw) {
  const { ingIndex, ingredients } = getDb();
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
    h('div.row-actions',
      h('button.btn', {
        type: 'button',
        onclick: () => openTasteEditor(draw)
      }, `Browse all ${ingredients.length} ingredients`)
    ),
    h('p.fine-print', 'These are the ones that come up most. The full list is there when you want it, and the recipe screen lets you mark things as you cook.')
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
  const { ingIndex, ingredients } = getDb();
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
    h('p.eyebrow', 'Where would you like to start?'),
    h('div.entry-grid',
      entryCard('🎲', 'Roll tonight', 'Deal a hand of dinners that fit your time, your diets and what is already in the kitchen.', '#/roll'),
      entryCard('📖', 'Browse the collection', `${getDb().recipes.length} recipes by meal, method, cuisine and region.`, '#/browse'),
      entryCard('🏠', 'Fill the pantry', 'Tick off what you already have and every list from here on gets shorter.', '#/pantry'),
      entryCard('🌿', 'See the garden plan', 'What to plant this month in zone 6a, tied to the recipes it feeds.', '#/garden')
    ),
    h('p.fine-print',
      'On an iPhone, tap Share and then “Add to Home Screen” — everywhere else it is in the browser menu. ',
      'It then opens like an app and works with no signal.')
  );
}

/**
 * The four ways in, offered once at the end of setup.
 *
 * A meal planner that opens on a dice screen assumes everybody wants the dice.
 * Some people arrive wanting a specific cuisine, some want to use up a fridge.
 * Naming all four takes one screen and saves the other three from hunting.
 */
function entryCard(icon, title, body, href) {
  return h('a.entry-card', { href },
    h('span.entry-card__icon', { 'aria-hidden': 'true' }, icon),
    h('span.entry-card__body',
      h('strong.entry-card__title', title),
      h('span.entry-card__text', body)
    ),
    h('span.entry-card__go', { 'aria-hidden': 'true' }, '→')
  );
}

function summaryRow(label, value) {
  return h('div.summary__row', h('span.summary__label', label), h('span.summary__value', value));
}

export function resetOnboarding() { step = 0; }

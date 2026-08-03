/**
 * member-card.js — one person in the household, editable.
 *
 * Shared by onboarding and settings so the two can never drift apart.
 *
 * The important thing this file gets right: typing never re-renders. An earlier
 * version called draw() on every keystroke, which rebuilt the DOM, destroyed
 * the focused input and dropped the character you were mid-way through typing.
 * Here the inputs own their own values, state is written on the way past, and
 * only the one derived line — the calorie estimate — is patched in place.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, sheet } from '../ui.js';
import { updateMember, removeMember } from '../store.js';
import { ACTIVITY, energyNeeds, typicalBody } from '../nutrition.js';
import { play } from '../feedback.js';

/**
 * Short enough to read at a glance in a half-width select on a phone. The full
 * descriptions live in ACTIVITY and are spelled out in the why-sheet below.
 */
const ACTIVITY_SHORT = {
  sedentary: 'Sedentary',
  light: 'Lightly active',
  moderate: 'Moderate',
  active: 'Very active',
  athlete: 'Athlete'
};

/** Why each field is here, in one sentence, in plain language. */
const WHY = {
  name: 'Only so you can tell rows apart. It never leaves this device.',
  age: 'Portion sizing. A nine-year-old and a fifteen-year-old need very different amounts, and getting this roughly right is what stops the app cooking too much or too little.',
  sex: 'It changes the calorie equation. If neither option fits, pick either — the difference is small next to activity level, and nothing else in the app uses it.',
  diet: 'The one field that changes what gets cooked. Mark anyone who does not eat meat and every dinner will have a base they can eat, with meat kept to a separate pan.',
  activity: 'The single biggest factor in how much someone actually eats — bigger than height or weight.',
  height: 'Optional. With height and weight the estimate uses a real equation instead of a population average.',
  weight: 'Optional, and never shown as a judgment. It is one number in an equation that decides how big a pot of food to cook.',
  goal: 'Whether to size portions for staying as you are, or to nudge them a little in one direction.'
};

function whyButton(field) {
  return h('button.why-btn', {
    type: 'button',
    'aria-label': `Why we ask for ${field}`,
    onclick: (e) => {
      e.preventDefault();
      play('tap');
      sheet(`Why we ask for ${field}`, h('div',
        h('p', WHY[field]),
        field === 'activity'
          ? h('ul.plain-list', ...Object.entries(ACTIVITY).map(([k, v]) =>
              h('li', h('strong', ACTIVITY_SHORT[k]), ` — ${v.label.split(' — ')[1]}`)))
          : null,
        h('p.fine-print', 'Everything you enter stays in this browser. There is no account and no server — see the privacy note in Settings.')
      ));
    }
  }, '?');
}

function field(label, control, whyKey, { optional = false } = {}) {
  return h('label.field',
    h('span.field__label',
      label,
      optional ? h('span.field__optional', 'optional') : null,
      whyKey ? whyButton(whyKey) : null
    ),
    control
  );
}

/**
 * Read a number field without fighting the person typing it.
 *
 * While the cursor is in the box we only clamp what feeds the estimate, so a
 * half-typed "1" on the way to "110" never gets rewritten under the caret. The
 * field itself is normalised on blur, once, when they have finished.
 */
function numeric(input, { min, max }) {
  const read = () => {
    if (input.value.trim() === '') return null;
    const n = Number(input.value);
    if (!Number.isFinite(n)) return null;
    return Math.min(Math.max(n, min), max);
  };
  input.addEventListener('blur', () => {
    const n = read();
    if (n != null && String(n) !== input.value.trim()) input.value = n;
  });
  return read;
}

const select = (values, current, onchange, labels = {}) =>
  h('select.input', { onchange: (e) => onchange(e.target.value) },
    ...values.map(v => h('option', { value: v, selected: v === current },
      labels[v] || v.charAt(0).toUpperCase() + v.slice(1))));

/**
 * @param member the household member record
 * @param onStructuralChange called only when the row is removed — never on typing
 * @param onValueChange called on every edit, for anything elsewhere on the page
 *        that shows derived numbers. It must patch, not re-render: re-rendering
 *        would take the focused input with it.
 */
export function memberCard(member, { onStructuralChange = () => {}, onValueChange = () => {} } = {}) {
  // A live reference to the one piece of derived text, so a keystroke updates
  // the estimate without touching the input the cursor is sitting in.
  const estimate = h('p.member__est');
  const local = { ...member };

  // Buttons whose usefulness depends on the age typed above them. They are
  // toggled in place rather than re-rendered, for the same reason as everything
  // else here: the cursor may be sitting in a field two rows up.
  const typicalBtn = h('button.linkish', { type: 'button', onclick: () => useTypical() }, 'Use typical values');
  const childNote = h('span.fine-print', { hidden: true },
    'Under 18 the estimate uses a growth reference for this age, so height and weight are not needed.');

  const refreshEstimate = () => {
    const e = energyNeeds(local);
    // Mirror the branch energyNeeds actually took, so the caption can never
    // claim a precision the number does not have.
    const child = local.age != null && local.age < 18;
    const exact = !child && local.heightCm && local.weightKg && local.age != null;
    estimate.replaceChildren(
      h('strong', `≈ ${e.target.toLocaleString()} kcal a day`),
      h('span.muted.small', child
        ? ' — the reference figure for this age and activity'
        : exact
          ? ' — from height, weight, age and activity'
          : ' — a population average. Add height and weight for a closer estimate.')
    );
    typicalBtn.hidden = child || exact;
    childNote.hidden = !child;
  };

  /** Write through to the store without re-rendering anything. */
  const set = (patch) => {
    Object.assign(local, patch);
    updateMember(member.id, patch);
    refreshEstimate();
    onValueChange();
  };

  const heightFt = h('input.input', { type: 'number', min: 1, max: 8, inputmode: 'numeric', placeholder: 'ft' });
  const heightIn = h('input.input', { type: 'number', min: 0, max: 11, inputmode: 'numeric', placeholder: 'in' });
  const weightInput = h('input.input', { type: 'number', min: 20, max: 700, inputmode: 'decimal', placeholder: 'lb' });
  const ageInput = h('input.input', { type: 'number', min: 1, max: 110, inputmode: 'numeric', placeholder: 'years' });
  const nameInput = h('input.input.input--name', { type: 'text', placeholder: 'Name or nickname', autocomplete: 'off' });

  // Seed the values once. After this the inputs are the source of truth for
  // what is on screen, and nothing re-renders them out from under the cursor.
  nameInput.value = member.name || '';
  ageInput.value = member.age ?? '';
  if (member.heightCm) {
    const totalIn = Math.round(member.heightCm / 2.54);
    heightFt.value = Math.floor(totalIn / 12);
    heightIn.value = totalIn % 12;
  }
  if (member.weightKg) weightInput.value = Math.round(member.weightKg * 2.2046);

  const readAge = numeric(ageInput, { min: 1, max: 110 });
  const readFt = numeric(heightFt, { min: 1, max: 8 });
  const readIn = numeric(heightIn, { min: 0, max: 11 });
  const readWeight = numeric(weightInput, { min: 20, max: 700 });

  nameInput.addEventListener('input', () => set({ name: nameInput.value }));
  ageInput.addEventListener('input', () => set({ age: readAge() }));
  const applyHeight = () => {
    const inches = (readFt() || 0) * 12 + (readIn() || 0);
    set({ heightCm: inches ? inches * 2.54 : null });
  };
  heightFt.addEventListener('input', applyHeight);
  heightIn.addEventListener('input', applyHeight);
  weightInput.addEventListener('input', () => {
    const lb = readWeight();
    set({ weightKg: lb ? lb / 2.2046 : null });
  });

  function useTypical() {
    const body = typicalBody(local.sex, local.age);
    play('tap');
    if (ageInput.value === '') ageInput.value = body.age;
    // Under 18 there is no adult median to borrow — and none is needed, since
    // the child estimate never reads height or weight. Leave the boxes empty
    // rather than stamping a misleading number into them.
    if (body.heightCm && body.weightKg) {
      const totalIn = Math.round(body.heightCm / 2.54);
      heightFt.value = Math.floor(totalIn / 12);
      heightIn.value = totalIn % 12;
      weightInput.value = Math.round(body.weightKg * 2.2046);
    }
    set({ heightCm: body.heightCm, weightKg: body.weightKg, age: local.age ?? body.age });
  }

  refreshEstimate();

  return h('div.card.member',
    h('div.member__row',
      nameInput,
      h('button.icon-btn', {
        type: 'button',
        'aria-label': `Remove ${member.name || 'this person'}`,
        onclick: () => { removeMember(member.id); play('remove'); onStructuralChange(); }
      }, '🗑')
    ),

    h('div.field-grid',
      field('Diet', select(['omnivore', 'vegetarian', 'vegan', 'pescatarian'], local.diet, v => set({ diet: v })), 'diet'),
      field('Age', ageInput, 'age', { optional: true }),
      field('Activity', select(Object.keys(ACTIVITY), local.activity, v => set({ activity: v }), ACTIVITY_SHORT), 'activity'),
      field('Sex', select(['female', 'male'], local.sex, v => set({ sex: v })), 'sex'),
      // The unit lives outside the box, so it is still there once the
      // placeholder has been typed over.
      field('Height', h('div.height-input',
        h('span.unit-pair', heightFt, h('span.unit', 'ft')),
        h('span.unit-pair', heightIn, h('span.unit', 'in'))
      ), 'height', { optional: true }),
      field('Weight', h('span.unit-pair', weightInput, h('span.unit', 'lb')), 'weight', { optional: true })
    ),

    estimate,

    h('div.member__hint',
      typicalBtn,
      childNote,
      h('span.fine-print',
        'Everything except diet is optional. Left blank, portions use a population average — ',
        'good enough to size a pot of food.')
    )
  );
}

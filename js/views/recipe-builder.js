/**
 * recipe-builder.js — writing a recipe by pressing things rather than typing one.
 *
 * A form would have been quicker to build and would have produced a worse
 * recipe. The app reads a lot out of a step's own wording — the verb becomes a
 * bracket in the method diagram, "6 minutes" becomes a timer, "until soft and
 * golden" becomes that timer's cue, the ingredient names become the per-step
 * amounts in cook mode — and a free-text box produces sentences that do all of
 * that only by luck.
 *
 * So a step is assembled from parts:
 *
 *     [Cook ▾] the [onion ▾] for [6] minutes until [soft and golden]
 *
 * which writes "Cook the onion for 6 minutes until soft and golden." — a real
 * sentence, and one the app's own derivation reads back perfectly, because the
 * pieces it looks for were placed there on purpose rather than hoped for. That
 * is the whole argument for the chips: they are not a friendlier form, they are
 * the input that produces a recipe the rest of the app can think about.
 *
 * The sentence is editable afterwards. Somebody who wants to write "Sweat the
 * soffritto until it collapses" should not be stopped by a dropdown, and the
 * derivation handles that sentence fine — the chips are scaffolding, not a cage.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, toast, sheet, debounce } from '../ui.js';
import { getDb } from '../data.js';
import { getState } from '../store.js';
import { foodIcon } from '../food-icon.js';
import { play } from '../feedback.js';
import { parseRecipe } from '../recipe-parse.js';
import { saveMyRecipe, myRecipe, deleteMyRecipe, whatIsMissing, canSave } from '../myrecipes.js';
import { stepTiming } from '../step-timing.js';

/* ------------------------------------------------------------------ *
 * The vocabulary the chips offer
 * ------------------------------------------------------------------ */

/**
 * Verbs the rest of the app already recognizes.
 *
 * Chosen to match what `recipe-table.js` looks for when it labels a bracket and
 * what `cook-steps.js` reads when it works out amounts — offering a verb the
 * diagram cannot draw would be the builder quietly producing a worse recipe
 * than the collection's.
 */
const VERBS = ['Heat', 'Cook', 'Sauté', 'Fry', 'Brown', 'Sear', 'Simmer', 'Boil',
  'Roast', 'Bake', 'Grill', 'Steam', 'Toast', 'Stir in', 'Fold in', 'Whisk',
  'Blend', 'Mash', 'Toss', 'Season', 'Drain', 'Add', 'Pour', 'Cover', 'Rest',
  'Chill', 'Top with', 'Serve'];

const UNITS = ['each', 'tbsp', 'tsp', 'cup', 'clove', 'can', 'oz', 'lb', 'g',
  'slice', 'stalk', 'head', 'bunch', 'block', 'jar', 'pint', 'sprig'];

const COURSES = ['dinner', 'lunch', 'breakfast', 'snack', 'dessert', 'side'];

/** Doneness cues, which is the field people leave blank and shouldn't. */
const CUES = ['soft and golden', 'fragrant', 'tender', 'crisp', 'bubbling',
  'thickened', 'browned', 'the liquid has gone', 'it smells nutty', 'heated through'];

const PREPS = ['diced', 'finely chopped', 'thinly sliced', 'minced', 'grated',
  'shredded', 'drained and rinsed', 'halved', 'torn', 'zested and juiced'];

/* ------------------------------------------------------------------ *
 * The view
 * ------------------------------------------------------------------ */

export function render(root, { navigate, params }) {
  const existing = params?.id ? myRecipe(params.id) : null;

  const draft = existing
    ? {
        ...existing,
        // Steps come back as sentences; the chips are for building new ones.
        steps: existing.steps.map(text => ({ text }))
      }
    : {
        title: '', course: 'dinner', cuisine: '', servings: 4,
        activeMin: 20, totalMin: 40,
        ingredients: [], steps: [], source: null
      };

  let mode = existing ? 'build' : 'start';
  const draw = () => mount(root, view());
  const view = () => screen({ draft, mode, setMode: (m) => { mode = m; draw(); }, draw, navigate, existing });
  draw();
}

function screen({ draft, mode, setMode, draw, navigate, existing }) {
  const { ingIndex } = getDb();

  return h('section.view.builder',
    h('button.linkish', { type: 'button', onclick: () => navigate('#/create') }, '← Create'),

    h('div.view__head',
      h('div',
        h('p.eyebrow', existing ? 'Editing' : 'Yours'),
        h('h1.view__title', existing ? draft.title || 'Your recipe' : 'Add a recipe'),
        h('p.view__sub',
          'However it arrives, it ends up in the same shape as everything else here — ',
          'so it gets the flavor panel, cook mode, the diagram and the shopping list like any other dish.')
      )
    ),

    mode === 'start' ? startCard(setMode, draft, draw) : null,
    mode === 'paste' ? pasteCard(draft, setMode, draw) : null,

    mode === 'build'
      ? h('div',
          sentenceCard(draft, draw),
          ingredientsCard(draft, ingIndex, draw),
          stepsCard(draft, ingIndex, draw),
          saveCard(draft, navigate, existing)
        )
      : null
  );
}

/**
 * The fork in the road, stated as what each one costs you.
 *
 * Pasting is faster and less accurate; building is slower and produces a recipe
 * the app understands completely. Saying that plainly beats presenting two
 * equal-looking buttons and letting somebody discover the difference later.
 */
function startCard(setMode, draft, draw) {
  const way = (icon, title, blurb, onclick) => h('button.builder__way', { type: 'button', onclick },
    h('span.builder__way-icon', icon),
    h('span.builder__way-body',
      h('strong', title),
      h('span.muted.small', blurb)
    )
  );

  return h('section.card.block',
    h('h2.block__title', 'Where is it coming from?'),
    h('div.builder__ways',
      way('📋', 'Paste it in',
        'From a website, a note, a message. Paste the page source and the site\'s own amounts come across exactly; paste the text and it is read as best it can be.',
        () => { play('tap'); setMode('paste'); }),
      way('🧩', 'Build it here',
        'Press the parts together. Slower, and the app ends up understanding every step — timers, amounts and the diagram all come from what you pick.',
        () => { play('tap'); setMode('build'); })
    )
  );
}

/* ------------------------------------------------------------------ *
 * Pasting
 * ------------------------------------------------------------------ */

function pasteCard(draft, setMode, draw) {
  const field = h('textarea.builder__paste', {
    rows: 10,
    placeholder: 'Paste the recipe here — the ingredients and the steps, or the whole page source.'
  });
  const result = h('div');

  const readIt = () => {
    const { ingredients: items } = getDb();
    const parsed = parseRecipe(field.value, items);
    if (!parsed) { toast('Nothing recipe-shaped in there yet.'); return; }

    Object.assign(draft, {
      title: parsed.title === 'Untitled' ? draft.title : parsed.title,
      blurb: parsed.blurb || draft.blurb,
      servings: parsed.servings || draft.servings,
      activeMin: parsed.activeMin || draft.activeMin,
      totalMin: parsed.totalMin || draft.totalMin,
      ingredients: parsed.lines.map(l => ({
        ing: l.ing, qty: l.qty, unit: l.unit, prep: l.prep || null,
        // Carried so the builder can mark a guess as a guess.
        sure: l.sure, confidence: l.confidence
      })),
      steps: parsed.steps.map(text => ({ text })),
      // Every line that did not land on a known ingredient. Shown, never dropped.
      unmatched: parsed.needsYou.map(n => ({ name: n.name, qty: n.qty, unit: n.unit }))
    });

    play('check');
    mount(result,
      h('p.builder__read',
        `Read ${parsed.lines.length} ${parsed.lines.length === 1 ? 'ingredient' : 'ingredients'} `,
        `and ${parsed.steps.length} ${parsed.steps.length === 1 ? 'step' : 'steps'}`,
        parsed.from === 'page' ? ' straight from the page\'s own data.' : '.'),
      parsed.needsYou.length
        ? h('p.builder__read.builder__read--gap',
            `${parsed.needsYou.length} ${parsed.needsYou.length === 1 ? 'line' : 'lines'} could not be matched to an ingredient — `,
            'they are waiting for you below rather than being thrown away.')
        : null
    );
    setMode('build');
  };

  return h('section.card.block',
    h('h2.block__title', 'Paste it in'),
    h('p.muted.small',
      'Nothing is sent anywhere — this reads what you paste, on this device. ',
      'For the most accurate result, paste a page\'s source: almost every recipe site embeds its own structured data, and that gives exact amounts.'),
    field,
    result,
    h('div.row-actions',
      h('button.btn.btn--primary', { type: 'button', onclick: readIt }, 'Read it'),
      h('button.btn', { type: 'button', onclick: () => { play('tap'); setMode('build'); } }, 'Skip — build it by hand')
    )
  );
}

/* ------------------------------------------------------------------ *
 * The sentence at the top
 * ------------------------------------------------------------------ */

/**
 * The recipe's own facts, written as a sentence with the changeable parts
 * pressed into it. A row of labeled inputs would hold the same information and
 * would read as paperwork; this reads as a description of a dish, which is what
 * it is.
 */
function sentenceCard(draft, draw) {
  const set = (patch) => { Object.assign(draft, patch); draw(); };

  return h('section.card.block.builder__sentence',
    h('p.builder__line',
      'A ',
      pick(draft.course, COURSES, (v) => set({ course: v })),
      ' for ',
      number(draft.servings, 1, 40, (v) => set({ servings: v })),
      ', called ',
      text(draft.title, 'name it', (v) => { draft.title = v; }, 22)
    ),
    h('p.builder__line',
      'It takes ',
      number(draft.activeMin, 1, 720, (v) => set({ activeMin: v })),
      ' minutes of hands-on work and ',
      number(draft.totalMin, 1, 2880, (v) => set({ totalMin: v })),
      ' start to finish.'
    ),
    h('p.builder__line',
      'It is ',
      text(draft.cuisine, 'whose cooking?', (v) => { draft.cuisine = v; }, 14),
      '.'
    )
  );
}

/* ------------------------------------------------------------------ *
 * What goes in
 * ------------------------------------------------------------------ */

function ingredientsCard(draft, ingIndex, draw) {
  const rows = draft.ingredients || [];
  const unmatched = draft.unmatched || [];

  return h('section.card.block',
    h('h2.block__title', 'What goes in'),

    rows.length
      ? h('div.builder__rows', ...rows.map((line, i) => ingredientRow(line, i, draft, ingIndex, draw)))
      : h('p.muted.small', 'Nothing yet.'),

    h('button.builder__add', {
      type: 'button',
      onclick: () => openIngredientPicker((item) => {
        draft.ingredients = [...rows, { ing: item.id, qty: 1, unit: 'each', prep: null }];
        play('add');
        draw();
      })
    }, '⊕ add something'),

    // Never dropped, always visible, and one tap from being finished.
    unmatched.length
      ? h('div.builder__gap',
          h('p.eyebrow', 'Not matched yet'),
          h('p.muted.small',
            'These came across from what you pasted but do not point at anything the app knows, ',
            'so they are left out of the nutrition and the shopping list until they do.'),
          ...unmatched.map((u, i) => h('div.builder__unmatched',
            h('span', `${u.qty} ${u.unit} ${u.name}`),
            h('button.btn.btn--small', {
              type: 'button',
              onclick: () => openIngredientPicker((item) => {
                draft.ingredients = [...(draft.ingredients || []),
                  { ing: item.id, qty: u.qty, unit: u.unit, prep: null }];
                draft.unmatched = unmatched.filter((_, n) => n !== i);
                play('check');
                draw();
              }, u.name)
            }, 'match it'),
            h('button.icon-btn', {
              type: 'button',
              'aria-label': `Drop ${u.name}`,
              onclick: () => { draft.unmatched = unmatched.filter((_, n) => n !== i); play('uncheck'); draw(); }
            }, '✕')
          ))
        )
      : null
  );
}

function ingredientRow(line, i, draft, ingIndex, draw) {
  const item = ingIndex.get(line.ing);
  const drop = () => { draft.ingredients = draft.ingredients.filter((_, n) => n !== i); play('uncheck'); draw(); };

  return h('div', { class: `builder__row ${line.sure === false ? 'is-guess' : ''}` },
    item ? foodIcon(item, { size: 26 }) : null,
    number(line.qty, 0.125, 999, (v) => { line.qty = v; draw(); }, { step: 0.25, width: '4.5ch' }),
    pick(line.unit, UNITS, (v) => { line.unit = v; draw(); }),
    h('span.builder__name', item ? item.name : line.ing),
    pick(line.prep || '', ['', ...PREPS], (v) => { line.prep = v || null; draw(); }, 'how?'),
    h('button.icon-btn', { type: 'button', 'aria-label': 'Remove', onclick: drop }, '✕')
  );
}

/* ------------------------------------------------------------------ *
 * What you do — the visual-code part
 * ------------------------------------------------------------------ */

function stepsCard(draft, ingIndex, draw) {
  const steps = draft.steps || [];

  return h('section.card.block',
    h('h2.block__title', 'What you do'),
    h('p.muted.small',
      'Press a step together and it writes a real sentence. The verb becomes a bracket in the diagram, ',
      'the minutes become a timer and the "until" becomes what that timer asks you to look for.'),

    steps.length
      ? h('div.builder__steps', ...steps.map((step, i) => stepRow(step, i, draft, ingIndex, draw)))
      : h('p.muted.small', 'Nothing yet.'),

    h('button.builder__add', {
      type: 'button',
      onclick: () => {
        draft.steps = [...steps, { verb: 'Cook', what: '', minutes: null, cue: '', text: null }];
        play('add');
        draw();
      }
    }, '⊕ add a step')
  );
}

/**
 * One step, and the sentence it writes.
 *
 * The parts are the ones the app reads back out: verb, what, how long, what to
 * look for. Editing the sentence directly detaches it from the chips rather
 * than fighting them — somebody writing "Sweat the soffritto until it
 * collapses" is writing a better instruction than the chips would, and the
 * derivation handles it fine.
 */
function stepRow(step, i, draft, ingIndex, draw) {
  const names = (draft.ingredients || [])
    .map(l => ingIndex.get(l.ing)?.name)
    .filter(Boolean);

  const sentence = stepSentence(step);
  const timing = stepTiming(sentence);
  const drop = () => { draft.steps = draft.steps.filter((_, n) => n !== i); play('uncheck'); draw(); };

  return h('div.builder__step',
    h('span.builder__stepno', String(i + 1)),
    h('div.builder__stepbody',
      step.text != null
        // Written by hand. The chips step aside rather than arguing.
        ? h('textarea.builder__free', {
            rows: 2, value: step.text,
            oninput: (e) => { step.text = e.target.value; },
            onblur: draw
          })
        : h('p.builder__line',
            pick(step.verb, VERBS, (v) => { step.verb = v; draw(); }),
            ' the ',
            pick(step.what || '', ['', ...names], (v) => { step.what = v; draw(); }, 'what?'),
            ' for ',
            number(step.minutes ?? '', 0, 600, (v) => { step.minutes = v; draw(); }, { width: '4.5ch', allowEmpty: true }),
            ' minutes, until ',
            pick(step.cue || '', ['', ...CUES], (v) => { step.cue = v; draw(); }, 'what does it look like?')
          ),

      // Only when the pieces wrote it. Somebody editing the sentence directly is
      // already looking at the sentence, and showing it twice reads as a bug.
      step.text == null
        ? h('p.builder__preview', sentence || 'Pick a verb to start the sentence.')
        : null,

      // What the app will get out of it, shown while it is being built rather
      // than discovered later in cook mode.
      timing.seconds
        ? h('p.builder__gets',
            `⏱ a timer at ${Math.round(timing.seconds / 60) || 1} min`,
            timing.cue ? ` · asking you to look for "${timing.cue}"` : ' · with nothing to look for yet')
        : null,

      h('button.linkish.builder__write', {
        type: 'button',
        onclick: () => {
          step.text = step.text == null ? sentence : null;
          play('tap');
          draw();
        }
      }, step.text == null ? 'write it myself' : 'back to the pieces')
    ),
    h('button.icon-btn', { type: 'button', 'aria-label': 'Remove step', onclick: drop }, '✕')
  );
}

/** The sentence a step's parts spell out. */
export function stepSentence(step) {
  if (step.text != null) return String(step.text).trim();
  if (!step.verb) return '';
  const parts = [step.verb];
  if (step.what) parts.push(`the ${step.what.toLowerCase()}`);
  if (step.minutes) parts.push(`for ${step.minutes} minutes`);
  if (step.cue) parts.push(`until ${step.cue}`);
  const sentence = parts.join(' ').trim();
  return sentence ? `${sentence}.` : '';
}

/* ------------------------------------------------------------------ *
 * Saving
 * ------------------------------------------------------------------ */

function saveCard(draft, navigate, existing) {
  const asDraft = { ...draft, steps: (draft.steps || []).map(stepSentence).filter(Boolean) };
  const gaps = whatIsMissing(asDraft);
  const ready = canSave(asDraft);

  return h('section.card.block',
    gaps.length
      ? h('div.builder__gaps',
          h('p.eyebrow', 'Still to do'),
          ...gaps.map(g => h('p.muted.small', g.says)))
      : h('p.muted.small', 'Ready. It will behave exactly like the rest of the collection.'),

    h('div.row-actions',
      h('button.btn.btn--primary', {
        type: 'button',
        disabled: !ready,
        onclick: () => {
          const saved = saveMyRecipe(asDraft);
          if (!saved) { toast('Not quite enough to save yet.'); return; }
          play('complete');
          toast('Saved to your cookbook.');
          navigate(`#/recipe/${saved.id}`);
        }
      }, existing ? 'Save changes' : 'Save it'),

      existing
        ? h('button.btn.btn--danger', {
            type: 'button',
            onclick: () => {
              deleteMyRecipe(existing.id);
              play('remove');
              toast('Deleted.');
              navigate('#/book');
            }
          }, 'Delete')
        : null
    )
  );
}

/* ------------------------------------------------------------------ *
 * The chips themselves
 * ------------------------------------------------------------------ */

/** A value picked from a short list, rendered inline in a sentence. */
function pick(value, options, onchange, placeholder = '') {
  const select = h('select.chip-pick', {
    onchange: (e) => onchange(e.target.value)
  }, ...options.map(o => h('option', { value: o, selected: o === value }, o || placeholder)));
  select.classList.toggle('is-empty', !value);
  return select;
}

/** A number typed inline. */
function number(value, min, max, onchange, { step = 1, width = '5ch', allowEmpty = false } = {}) {
  return h('input.chip-num', {
    type: 'number', min, max, step, value: value ?? '',
    style: { width },
    onchange: (e) => {
      const raw = e.target.value;
      if (allowEmpty && raw === '') { onchange(null); return; }
      const n = Number(raw);
      onchange(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);
    }
  });
}

/** Free text inline, sized to what is in it. */
function text(value, placeholder, oninput, size = 18) {
  return h('input.chip-text', {
    type: 'text', value: value || '', placeholder, size,
    oninput: (e) => oninput(e.target.value)
  });
}

/**
 * Choosing an ingredient out of 353.
 *
 * A search box rather than a list, because a list of 353 is a list nobody
 * reads — and seeded with whatever the unmatched line said, so matching a
 * pasted "grandma's spice mix" starts from those words rather than from blank.
 */
export function openIngredientPicker(onpick, seed = '') {
  const { ingredients } = getDb();
  const results = h('div.builder__results');

  const show = (query) => {
    const q = query.trim().toLowerCase();
    const found = (q
      ? ingredients.filter(i => i.name.toLowerCase().includes(q))
      : ingredients
    ).slice(0, 40);

    mount(results, ...(found.length
      ? found.map(item => h('button.builder__result', {
          type: 'button',
          onclick: () => { dlg.close(); onpick(item); }
        },
          foodIcon(item, { size: 24 }),
          h('span', item.name)
        ))
      : [h('p.muted.small', 'Nothing by that name. Try a plainer word — "beans" rather than "the good beans".')]
    ));
  };

  const field = h('input.input', {
    type: 'search', placeholder: 'Search ingredients…', value: seed,
    oninput: debounce((e) => show(e.target.value), 150)
  });

  const dlg = sheet('Which one?', h('div', field, results));
  show(seed);
  field.focus();
  return dlg;
}

/**
 * recipe.js (view) — one recipe in full, plus the browse/search screen.
 *
 * The ingredient list is the working surface: tick what you already have and it
 * updates the pantry, which updates the shopping list and the next roll.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, chip, pill, toast, minutes, scoreBadge, meter, titleCase, debounce, sheet, plural } from '../ui.js';
import { getDb, nutritionFor, heartFor, substitutesFor, searchRecipes, pantryCoverage } from '../data.js';
import { getState, togglePantry, addToPlan, isPlanned, setLike, setRecipeLike, markCooked } from '../store.js';
import { formatQty, servingEquivalents, dailyTargets, heartFlags, topContributors, NUTRIENT_LABELS, NUTRIENT_UNITS } from '../nutrition.js';
import { shareRecipe, recipeShareUrl, copyText } from '../shopping.js';
import { play, stagger, pulse } from '../feedback.js';
import { allOccasions, occasionById } from '../occasions.js';

/* ------------------------------------------------------------------ *
 * Detail
 * ------------------------------------------------------------------ */

export function render(root, { navigate, params }) {
  const { recipeIndex } = getDb();
  const recipe = recipeIndex.get(params.id);
  if (!recipe) {
    mount(root, h('section.view', h('p.empty', 'That recipe is not in the collection.'),
      h('button.btn', { onclick: () => navigate('#/browse') }, 'Browse everything')));
    return;
  }

  const state = getState();
  const equiv = servingEquivalents(state.household.members, recipe.course);
  let servings = Math.max(1, Math.ceil(equiv.total));
  let withOmnivore = !!recipe.omnivore;
  let withVegSwap = !!recipe.vegetarianSwap;

  const draw = () => mount(root, view());
  const view = () => {
    const st = getState();
    const scale = servings / recipe.servings;
    const nut = nutritionFor(recipe, { withOmnivore: false, servings: recipe.servings });
    const nutOmni = recipe.omnivore ? nutritionFor(recipe, { withOmnivore: true, servings: recipe.servings }) : null;
    const heart = heartFor(recipe);
    const cov = pantryCoverage(recipe, st.pantry);

    return h('section.view.recipe',
      h('button.linkish', { type: 'button', onclick: () => history.back() }, '← Back'),

      h('header.recipe__head',
        h('div',
          h('h1.view__title', recipe.title),
          h('p.lede', recipe.blurb)
        ),
        scoreBadge(heart)
      ),

      h('div.pill-row',
        pill(`${minutes(recipe.activeMin)} active`),
        pill(`${minutes(recipe.totalMin)} total`),
        pill(titleCase(recipe.cuisine)),
        pill(titleCase(recipe.difficulty)),
        ...(recipe.diet || []).map(d => pill(d, 'green')),
        recipe.kidFriendly ? pill('kids eat it') : null,
        ...(recipe.tags || []).slice(0, 4).map(t => pill(t.replace(/-/g, ' ')))
      ),

      servingControl(recipe, servings, equiv, (n) => { servings = n; draw(); }),

      cov.total
        ? h('p.muted.small', `You already have ${cov.have} of ${cov.total} ingredients.`)
        : null,

      ingredientList(recipe, st, scale, draw),

      recipe.omnivore ? forkBlock(recipe.omnivore, 'omnivore', scale, withOmnivore, (v) => { withOmnivore = v; draw(); }, st, draw) : null,
      recipe.vegetarianSwap ? forkBlock(recipe.vegetarianSwap, 'veg', scale, withVegSwap, (v) => { withVegSwap = v; draw(); }, st, draw) : null,

      stepsBlock(recipe),

      recipe.variations?.length
        ? block('Variations', h('ul.tight', ...recipe.variations.map(v => h('li', v))))
        : null,

      notesBlock(recipe),

      nutritionBlock(recipe, nut, nutOmni, heart, st),

      h('div.recipe__actions',
        h('button', {
          class: isPlanned(recipe.id) ? 'btn' : 'btn btn--primary',
          type: 'button',
          disabled: isPlanned(recipe.id),
          onclick: () => {
            addToPlan(recipe.id, { course: recipe.course, servings, withOmnivore, withVegSwap });
            play('add');
            toast('Added to the plan');
            draw();
          }
        }, isPlanned(recipe.id) ? 'In the plan' : `Add ${plural(servings, 'serving')} to the plan`),
        h('button.btn', {
          type: 'button',
          onclick: () => { markCooked(recipe.id); play('cooked'); toast('Nice. Marked as cooked.'); }
        }, '✓ Cooked it'),
        h('button.btn', {
          type: 'button',
          onclick: () => { setRecipeLike(recipe.id, st.recipeLikes[recipe.id] === 1 ? 0 : 1); toast('Favourited'); draw(); }
        }, st.recipeLikes[recipe.id] === 1 ? '★ Favourite' : '☆ Favourite'),
        h('button.btn', {
          type: 'button',
          onclick: async () => {
            try {
              const how = await shareRecipe(recipe);
              if (how === 'copied') toast('Link copied — paste it anywhere');
            } catch (err) {
              await copyText(recipeShareUrl(recipe.id));
              toast('Link copied — paste it anywhere');
            }
          }
        }, '📤 Share'),
        h('button.btn', { type: 'button', onclick: () => printRecipe(recipe, servings) }, '🖨 Print')
      )
    );
  };

  draw();
}

function servingControl(recipe, servings, equiv, onchange) {
  const per = equiv.per.filter(p => p.equiv > 0);
  return h('div.card.servings',
    h('div.servings__row',
      h('span.field__label', 'Cook this many servings'),
      h('div.stepper',
        h('button.icon-btn', { type: 'button', onclick: () => { play('tap'); onchange(Math.max(1, servings - 1)); }, 'aria-label': 'Fewer servings' }, '−'),
        h('span.stepper__value', servings),
        h('button.icon-btn', { type: 'button', onclick: () => { play('tap'); onchange(servings + 1); }, 'aria-label': 'More servings' }, '+')
      )
    ),
    per.length
      ? h('p.muted.small',
          'Your table works out to about ', h('strong', String(equiv.total)), ' servings: ',
          per.map(p => `${p.name || 'someone'} ${p.equiv}`).join(' · '),
          '. Recipe is written for ', String(recipe.servings), '.')
      : h('p.muted.small', 'Add your household to get portions sized to your family.')
  );
}

function ingredientList(recipe, state, scale, draw) {
  const { ingIndex } = getDb();
  return block('Ingredients',
    h('ul.ing-list',
      ...recipe.ingredients.map(line => {
        const item = ingIndex.get(line.ing);
        if (!item) return null;
        const have = !!state.pantry[line.ing];
        const disliked = state.likes[line.ing] === -1;
        const subs = substitutesFor(line.ing);

        return h('li', { class: `ing ${have ? 'is-have' : ''}` },
          h('label.ing__main',
            h('input', {
              type: 'checkbox', checked: have,
              onchange: (e) => { togglePantry(line.ing); play(e.target.checked ? 'check' : 'uncheck'); draw(); },
              'aria-label': `I have ${item.name}`
            }),
            h('span.ing__qty', formatQty(line.qty * scale, line.unit)),
            h('span.ing__name', item.name),
            line.prep ? h('span.ing__prep', `, ${line.prep}`) : null,
            line.optional ? h('span.ing__opt', ' (optional)') : null
          ),
          h('div.ing__meta',
            item.heartNote ? h('button.tag-btn', { type: 'button', title: item.heartNote, onclick: () => sheet(item.name, h('p', item.heartNote)) }, '❤ note') : null,
            item.tips ? h('button.tag-btn', { type: 'button', onclick: () => sheet(item.name, h('p', item.tips)) }, '💡 tip') : null,
            subs.length ? h('button.tag-btn', {
              type: 'button',
              onclick: () => sheet(`Instead of ${item.name}`,
                h('ul.tight', ...subs.map(s => h('li', s.name))))
            }, '↔ swap') : null,
            disliked ? h('span.pill.pill--warn', 'you marked this never') : null
          )
        );
      })
    ),
    h('div.row-actions',
      h('button.btn.btn--ghost', {
        type: 'button',
        onclick: () => { recipe.ingredients.forEach(l => togglePantry(l.ing, true)); draw(); toast('All ticked as in the pantry'); }
      }, 'I have everything'),
      h('button.btn.btn--ghost', {
        type: 'button',
        onclick: () => { recipe.ingredients.forEach(l => togglePantry(l.ing, false)); draw(); }
      }, 'Untick all')
    )
  );
}

function forkBlock(fork, kind, scale, on, onToggle, state, draw) {
  const { ingIndex } = getDb();
  return h('section', { class: `card fork-block fork-block--${kind}` },
    h('div.fork-block__head',
      h('h2.block__title', kind === 'omnivore' ? '🍽 Fork in the road — omnivores' : '🌱 Fork in the road — vegetarian'),
      h('label.switch-inline',
        h('input', { type: 'checkbox', checked: on, onchange: (e) => onToggle(e.target.checked) }),
        h('span', on ? 'Included' : 'Skipped')
      )
    ),
    h('p.fork-block__label', fork.label),
    h('p.muted', fork.note),
    fork.add?.length
      ? h('ul.ing-list.ing-list--compact', ...fork.add.map(line => {
          const item = ingIndex.get(line.ing);
          if (!item) return null;
          return h('li.ing',
            h('label.ing__main',
              h('input', { type: 'checkbox', checked: !!state.pantry[line.ing], onchange: () => { togglePantry(line.ing); draw(); } }),
              h('span.ing__qty', formatQty(line.qty * scale, line.unit)),
              h('span.ing__name', item.name),
              line.prep ? h('span.ing__prep', `, ${line.prep}`) : null
            )
          );
        }))
      : null,
    fork.steps?.length ? h('ol.steps.steps--compact', ...fork.steps.map(s => h('li', s))) : null
  );
}

function stepsBlock(recipe) {
  return block('Method', h('ol.steps', ...recipe.steps.map(s => h('li', s))));
}

function notesBlock(recipe) {
  const rows = [
    recipe.restaurantTouch && ['✨ The restaurant touch', recipe.restaurantTouch],
    recipe.kidTweak && ['🧒 For the kids', recipe.kidTweak],
    recipe.garden && ['🌿 From the garden', recipe.garden],
    recipe.leftovers && ['🥡 Leftovers', recipe.leftovers],
    recipe.prepAhead && ['⏱ Get ahead', recipe.prepAhead],
    recipe.heartNote && ['❤️ Heart note', recipe.heartNote],
    recipe.allergenNote && ['⚠️ Allergens', recipe.allergenNote]
  ].filter(Boolean);
  if (!rows.length) return null;
  return block('Notes', h('dl.notes', ...rows.flatMap(([t, v]) => [h('dt', t), h('dd', v)])));
}

function nutritionBlock(recipe, nut, nutOmni, heart, state) {
  const { ingIndex } = getDb();
  const per = nut.perServing;
  const eaters = state.household.members.filter(m => m.eats !== false);
  const reference = eaters[0] ? dailyTargets(eaters[0], { heartMode: state.prefs.heartMode }) : null;
  const flags = heartFlags(per);

  const sodiumTop = topContributors(recipe.ingredients, ingIndex, 'sodium_mg');
  const satTop = topContributors(recipe.ingredients, ingIndex, 'satfat_g');

  return block('Per serving',
    h('div.nutri-grid',
      ...['kcal', 'protein_g', 'fiber_g', 'satfat_g', 'sodium_mg', 'potassium_mg'].map(k =>
        h('div.nutri',
          h('span.nutri__value', Math.round(per[k]), h('span.nutri__unit', NUTRIENT_UNITS[k])),
          h('span.nutri__label', NUTRIENT_LABELS[k])
        ))
    ),
    nutOmni
      ? h('p.muted.small', `With the omnivore add-on: ${Math.round(nutOmni.perServing.kcal)} kcal, ${Math.round(nutOmni.perServing.protein_g)} g protein, ${Math.round(nutOmni.perServing.sodium_mg)} mg sodium.`)
      : null,

    flags.length ? h('div.flag-row', ...flags.map(f => pill(f.text, f.kind === 'good' ? 'green' : 'warn'))) : null,

    reference
      ? h('div.meters',
          meter(Math.round(per.sodium_mg), reference.sodium_mg, { label: `Sodium vs ${eaters[0].name || 'day'} target`, unit: ' mg' }),
          meter(Math.round(per.satfat_g), reference.satfat_g, { label: 'Saturated fat vs day target', unit: ' g' }),
          meter(Math.round(per.fiber_g), reference.fiber_g, { label: 'Fiber vs day target', unit: ' g' })
        )
      : null,

    heart.score != null
      ? h('details.explain',
          h('summary', `Heart-forward score: ${heart.score}/100 (${heart.grade}) — how this is calculated`),
          h('ul.tight',
            ...Object.entries(heart.parts).map(([k, v]) =>
              h('li', `${titleCase(k)}: ${v >= 0 ? '+' : ''}${Math.round(v)}`)),
            h('li', 'Base 70, clamped 0-100.')
          ),
          sodiumTop.length ? h('p.muted.small', 'Most of the sodium: ' + sodiumTop.map(t => `${t.name} (${t.pct}%)`).join(', ')) : null,
          satTop.length ? h('p.muted.small', 'Most of the saturated fat: ' + satTop.map(t => `${t.name} (${t.pct}%)`).join(', ')) : null,
          h('p.fine-print', 'A sorting heuristic built from USDA values and public dietary guidance. Not medical advice, and not a substitute for what a clinician tells you.')
        )
      : h('p.muted.small', 'This is a component rather than a meal, so it is not graded on its own — it is scored inside the dish it goes into.'),

    nut.missing.length ? h('p.fine-print', `Unmatched ingredients: ${nut.missing.join(', ')}`) : null
  );
}

function block(title, ...content) {
  return h('section.card.block', h('h2.block__title', title), ...content);
}

function printRecipe(recipe, servings) {
  document.body.dataset.printing = recipe.id;
  window.print();
  setTimeout(() => { delete document.body.dataset.printing; }, 500);
}

/* ------------------------------------------------------------------ *
 * Browse
 * ------------------------------------------------------------------ */

let browseQuery = '';
let browseCourse = 'all';
let browseSort = 'heart';
let browseOccasion = null;

export function renderBrowse(root, { navigate }) {
  // A link like #/browse?occasion=thanksgiving arrives from the roll screen.
  const fromLink = location.hash.match(/[?&]occasion=([\w-]+)/)?.[1];
  if (fromLink) browseOccasion = fromLink;

  const draw = () => {
    mount(root, view());
    requestAnimationFrame(() => stagger(root.querySelector('.card-grid'), { step: 28 }));
  };
  const view = () => {
    const state = getState();
    let list = searchRecipes(browseQuery);
    if (browseCourse !== 'all') list = list.filter(r => r.course === browseCourse);
    if (browseOccasion) list = list.filter(r => (r.occasions || []).includes(browseOccasion));

    list = [...list].sort((a, b) => {
      if (browseSort === 'time') return a.activeMin - b.activeMin;
      if (browseSort === 'name') return a.title.localeCompare(b.title);
      const ha = heartFor(a).score ?? -1;
      const hb = heartFor(b).score ?? -1;
      return hb - ha;
    });

    return h('section.view',
      h('div.view__head',
        h('div',
          h('h1.view__title', browseOccasion ? (occasionById(browseOccasion)?.name || 'Recipes') : 'Every recipe'),
          h('p.view__sub',
            browseOccasion
              ? occasionById(browseOccasion)?.blurb || ''
              : `${list.length} of ${getDb().recipes.length}`)
        )
      ),
      h('div.occasion-strip',
        h('button', {
          type: 'button',
          class: `occasion ${browseOccasion ? '' : 'is-on'}`,
          onclick: () => { browseOccasion = null; play('tap'); draw(); }
        }, h('span.occasion__icon', '🍽'), 'Everything'),
        ...allOccasions().map(o => h('button', {
          type: 'button',
          class: `occasion ${browseOccasion === o.id ? 'is-on' : ''}`,
          onclick: () => { browseOccasion = browseOccasion === o.id ? null : o.id; play('tap'); draw(); }
        }, h('span.occasion__icon', o.icon), o.name))
      ),
      h('div.card.filters',
        h('input.input', {
          type: 'search', placeholder: 'Search recipes and ingredients…', value: browseQuery,
          oninput: debounce((e) => { browseQuery = e.target.value; draw(); }, 200)
        }),
        h('div.chip-row.chip-row--tight',
          ...['all', 'dinner', 'lunch', 'breakfast', 'snack', 'side', 'component'].map(c =>
            chip(c === 'all' ? 'All' : titleCase(c), { on: browseCourse === c, onclick: () => { browseCourse = c; draw(); } }))
        ),
        h('div.chip-row.chip-row--tight',
          ...[['heart', 'Heart score'], ['time', 'Fastest'], ['name', 'A-Z']].map(([k, label]) =>
            chip(label, { on: browseSort === k, onclick: () => { browseSort = k; draw(); } }))
        )
      ),
      h('div.card-grid',
        ...list.map(r => {
          const heart = heartFor(r);
          const cov = pantryCoverage(r, state.pantry);
          return h('article.card.recipe-card',
            h('div.recipe-card__head',
              h('div',
                h('h3.recipe-card__title', { role: 'button', tabindex: '0', onclick: () => navigate(`#/recipe/${r.id}`) }, r.title),
                h('p.recipe-card__blurb', r.blurb)
              ),
              scoreBadge(heart)
            ),
            h('div.pill-row',
              pill(`${minutes(r.activeMin)} active`),
              pill(titleCase(r.course)),
              r.omnivore ? pill('+ omnivore', 'meat') : null,
              cov.total ? pill(`${cov.have}/${cov.total} in pantry`, cov.ratio > 0.5 ? 'green' : '') : null
            ),
            h('div.recipe-card__actions',
              h('button.btn', {
                type: 'button',
                disabled: isPlanned(r.id),
                onclick: () => { addToPlan(r.id, { course: r.course }); play('add'); toast('Added to the plan'); draw(); }
              }, isPlanned(r.id) ? 'In the plan' : 'Add to plan'),
              h('button.btn.btn--ghost', { type: 'button', onclick: () => navigate(`#/recipe/${r.id}`) }, 'Open →')
            )
          );
        })
      )
    );
  };
  draw();
}

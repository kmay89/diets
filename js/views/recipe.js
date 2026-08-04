/**
 * recipe.js (view) — one recipe in full, plus the browse/search screen.
 *
 * The ingredient list is the working surface: tick what you already have and it
 * updates the pantry, which updates the shopping list and the next roll.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, mount, chip, pill, toast, minutes, scoreBadge, titleCase, debounce, sheet, plural } from '../ui.js';
import { getDb, nutritionFor, heartFor, searchRecipes, pantryCoverage } from '../data.js';
import { getState, togglePantry, addToPlan, isPlanned, setLike, setRecipeLike, markCooked, setSwap, clearSwaps, addToDish, removeFromDish, clearAdditions } from '../store.js';
import { formatQty, servingEquivalents, dailyTargets, heartFlags, topContributors, NUTRIENT_LABELS, NUTRIENT_UNITS } from '../nutrition.js';
import { shareRecipe, recipeShareUrl, copyText } from '../shopping.js';
import { play, stagger, pulse } from '../feedback.js';
import { allOccasions, occasionById } from '../occasions.js';
import { foodIcon, iconCollage } from '../food-icon.js';
import { collectionsByGroup, collectionById, matchesCollection } from '../collections.js';
import { asCooked, swapCount, substitutionsFor, swappedLine, buildLadder, rolesFor, combosFor } from '../swaps.js';
import { printRecipe } from '../print.js';
import { glancePanel } from './nutrition-panel.js';
import { computeBalance, balanceDelta } from '../balance.js';
import { balanceBlock } from './balance-panel.js';
import { proteinBlock } from './protein-panel.js';
import { tableBlock } from './table-panel.js';
import { kidsBlock, teachesBlock, asksPill } from './kitchen-panel.js';
import { memoryBlock } from './memory-panel.js';
import { teachesLine } from './skills-panel.js';
import { askAboutIt } from './after-cooking.js';
import { tipsBlock } from './tips-panel.js';
import { proteinSwapLine } from '../proteins.js';
import { cardLook } from '../palette.js';
import { tableBlock as methodTableBlock } from './recipe-table.js';
import { avoidedSet, recipeConflicts, forkConflicts, conflictPhrase } from '../allergy.js';

/* ------------------------------------------------------------------ *
 * Detail
 * ------------------------------------------------------------------ */

export function render(root, { navigate, params }) {
  const { recipeIndex } = getDb();
  const base = recipeIndex.get(params.id);
  if (!base) {
    mount(root, h('section.view', h('p.empty', 'That recipe is not in the collection.'),
      h('button.btn', { onclick: () => navigate('#/browse') }, 'Browse everything')));
    return;
  }

  const state = getState();
  const equiv = servingEquivalents(state.household.members, base.course);
  // An app nobody has entered a household into shows the recipe as written.
  // Defaulting to one serving turned every amount into a fraction of a
  // fraction — an eighth of a cup of flour — which reads as a broken page
  // rather than as a helpful default.
  let servings = equiv.total > 0 ? Math.max(1, Math.ceil(equiv.total)) : (base.servings || 1);
  // A fork that carries a flagged allergen starts switched off. It can still
  // be turned on by hand — the person tapping knows their own table — but the
  // app does not offer an allergen as the default.
  const avoid0 = avoidedSet(state.prefs);
  const { ingIndex: ingIndex0 } = getDb();
  let withOmnivore = !!base.omnivore && !forkConflicts(base.omnivore, avoid0, ingIndex0).length;
  let withVegSwap = !!base.vegetarianSwap && !forkConflicts(base.vegetarianSwap, avoid0, ingIndex0).length;

  const draw = () => mount(root, view());
  const view = () => {
    const st = getState();
    // Every number on this page — the ingredient amounts, the nutrition panel,
    // the heart score, the pantry count — reads the swapped recipe, so a swap
    // is a real change to the dish rather than a note beside it.
    const recipe = asCooked(base, { swaps: st.swaps, additions: st.additions });
    const swapped = swapCount(base, st.swaps);
    const added = st.additions?.[base.id] || [];
    const scale = servings / recipe.servings;
    const nut = nutritionFor(recipe, { withOmnivore: false, servings: recipe.servings });
    const nutOmni = recipe.omnivore ? nutritionFor(recipe, { withOmnivore: true, servings: recipe.servings }) : null;
    const heart = heartFor(recipe);
    const cov = pantryCoverage(recipe, st.pantry);
    const { ingIndex } = getDb();
    // The flavor profile of the dish as it will actually be cooked, and — when
    // something has been swapped — what that swap did to it.
    const profile = computeBalance(recipe, ingIndex);
    const delta = swapped ? balanceDelta(computeBalance(base, ingIndex), profile) : [];

    // A recipe that conflicts with the house's allergen list never comes up in
    // a roll or a suggestion, but it can be opened by hand — the collection is
    // a cookbook, and hiding pages helps nobody. Opened, it says so plainly.
    const avoid = avoidedSet(st.prefs);
    const baseConflicts = recipeConflicts(recipe, avoid, ingIndex);
    const omniConflicts = recipe.omnivore ? forkConflicts(recipe.omnivore, avoid, ingIndex) : [];
    const vegConflicts = recipe.vegetarianSwap ? forkConflicts(recipe.vegetarianSwap, avoid, ingIndex) : [];

    // The same color the card carried, so the page you land on is visibly the
    // dish you tapped.
    const look = cardLook(base, ingIndex);

    return h('section.view.recipe', { style: look.style },
      h('button.linkish', { type: 'button', onclick: () => history.back() }, '← Back'),

      h('header.recipe__head',
        h('div',
          h('h1.view__title',
            look.look
              ? h('span.color-dot', { title: `${look.look.group.name} — from ${look.look.from.join(' and ').toLowerCase()}` })
              : null,
            recipe.title),
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
        asksPill(recipe),
        ...(recipe.tags || []).slice(0, 3).map(t => pill(t.replace(/-/g, ' ')))
      ),

      // The warning first. Nothing below it matters to somebody who cannot eat
      // the dish at all.
      baseConflicts.length
        ? h('div.allergy-alert', { role: 'alert' },
            h('strong', `⚠️ This dish ${conflictPhrase(baseConflicts)}`),
            h('p',
              'That is flagged in this household, so it never comes up in a roll or a suggestion — ',
              'it stays in the collection because hiding pages from a cookbook helps nobody. ',
              'The call comes from the ingredient list; packages can carry more than a list says, so read labels.'))
        : null,

      // Then what this kitchen already knows about the dish, because it changes
      // how the rest of the page is read. A dish you have cooked three times is
      // not one you are evaluating; the question you arrived with is what you
      // did last time.
      memoryBlock(base, st, ingIndex, { draw }),

      // And the one technique it is worth cooking to learn — the reason to pick
      // it over the other 241, stated in a line.
      teachesLine(base, st, navigate),

      servingControl(recipe, servings, equiv, (n) => { servings = n; draw(); }),

      cov.total
        ? h('p.muted.small', `You already have ${cov.have} of ${cov.total} ingredients.`)
        : null,

      // Swaps change the numbers on this page, so the page says so rather than
      // letting a nutrition panel quietly describe a dish nobody is cooking.
      swapped || added.length
        ? h('div.swap-banner',
            h('span',
              [swapped ? `${plural(swapped, 'ingredient')} swapped` : null,
                added.length ? `${plural(added.length, 'thing')} added` : null].filter(Boolean).join(' and '),
              '. Everything below — amounts, nutrition, the flavor panel, the shopping list — follows your version.'),
            h('button.btn.btn--small', {
              type: 'button',
              onclick: () => {
                clearSwaps(base.id); clearAdditions(base.id);
                play('uncheck'); toast('Back to the recipe as written'); draw();
              }
            }, 'Back to as written')
          )
        : null,

      ingredientList(recipe, st, scale, draw),

      // The flavor panel sits directly under the ingredients, because that is
      // where a swap happens and the whole point of it is to answer "is this
      // still balanced" in the same breath as the change.
      balanceBlock(profile, ingIndex, {
        delta,
        added,
        // Accepting a suggestion has to be a real change to the dish. The first
        // version only put it on the shopping list, so tapping it looked like
        // nothing happened and the panel went on saying there was no crunch.
        onAdd: (fix, item) => {
          addToDish(base.id, {
            ing: fix.ing, qty: fix.qty, unit: fix.unit, prep: fix.prep || null, per: fix.per || 'dish'
          });
          play('add');
          toast(`${item.name} added to this dish — everything below follows it`);
          draw();
        },
        onRemove: (ing) => { removeFromDish(base.id, ing); play('uncheck'); draw(); }
      }),

      recipe.omnivore ? forkBlock(recipe.omnivore, 'omnivore', scale, withOmnivore, (v) => { withOmnivore = v; draw(); }, st, draw, omniConflicts) : null,
      recipe.vegetarianSwap ? forkBlock(recipe.vegetarianSwap, 'veg', scale, withVegSwap, (v) => { withVegSwap = v; draw(); }, st, draw, vegConflicts) : null,

      proteinBlock(base, ingIndex, {
        pantry: st.pantry,
        scale,
        onSwap: (current, option) => {
          const next = proteinSwapLine(current.line, current.protein, option.protein, ingIndex);
          if (!next) { toast('That one cannot be converted cleanly — use it by eye.'); return; }
          setSwap(base.id, current.line.ing, option.protein.ing);
          play('check');
          toast(`Using ${option.protein.name.toLowerCase()} instead`);
          draw();
        }
      }),

      stepsBlock(recipe, ingIndex, scale, draw),

      teachesBlock(recipe),
      tipsBlock(recipe),
      kidsBlock(recipe),

      recipe.variations?.length
        ? block('Variations', h('ul.tight', ...recipe.variations.map(v => h('li', v))))
        : null,

      notesBlock(recipe),

      tableBlock(recipe, { perServing: nut.perServing, balance: profile }),

      nutritionBlock(recipe, nut, nutOmni, heart, st),

      h('div.recipe__actions',
        // Cook mode is the one action taken with your hands already dirty, so
        // it leads — reading the page again is what the rest of it is for.
        recipe.steps?.length
          ? h('button.btn.btn--primary', {
              type: 'button',
              onclick: () => navigate(`#/cook/${recipe.id}`)
            }, '🔥 Start cooking')
          : null,
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
          onclick: () => {
            // The same record cook mode writes, so a meal cooked from the page
            // rather than from the steps is remembered just as well.
            const logged = markCooked(base.id, new Date(), {
              servings,
              swaps: st.swaps?.[base.id] || {},
              added: st.additions?.[base.id] || [],
              fork: withOmnivore
            });
            play('cooked');
            askAboutIt(base, logged, draw);
          }
        }, '✓ Cooked it'),
        h('button.btn', {
          type: 'button',
          onclick: () => { setRecipeLike(recipe.id, st.recipeLikes[recipe.id] === 1 ? 0 : 1); toast('Favorited'); draw(); }
        }, st.recipeLikes[recipe.id] === 1 ? '★ Favorite' : '☆ Favorite'),
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
        h('button.btn', {
          type: 'button',
          title: 'One condensed page: ingredients and method, nothing else',
          onclick: () => printRecipe(recipe, servings, { withOmnivore, withVegSwap })
        }, '🖨 Print')
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

/**
 * The sheet behind the swap button.
 *
 * The old version listed substitute names and did nothing, which made "swap" a
 * label for a fact rather than a verb. Every option now shows the amount you
 * would actually use, and choosing one rewrites the line — and the nutrition,
 * and the shopping list — until you put it back.
 */
/**
 * The sheet behind the swap button, now with somewhere to go when the obvious
 * answers run out.
 *
 * The old version listed the two substitutes in the ingredient database and
 * stopped. If you had neither, it had handed you nothing. This one walks the
 * ladder: the direct answers, then their answers, then anything that plays the
 * same part, then making the thing out of what is in the house, and finally
 * leaving it out with an honest account of what that costs.
 *
 * Every option carries what the swap does to the balance of the dish, because
 * "loses the acid" is the single most useful thing to know before choosing.
 */
function openSwapSheet(recipeId, line, scale, draw) {
  const { ingIndex, recipeIndex } = getDb();
  const state = getState();
  const recipe = recipeIndex.get(recipeId);
  const originalId = line.swappedFrom || line.ing;
  const original = ingIndex.get(originalId);
  const source = originalLine(recipeId, originalId);
  if (!original || !source) return;

  const current = line.swappedFrom ? line.ing : null;
  const ladder = buildLadder(originalId, {
    ingIndex,
    recipe,
    line: source,
    diet: recipe?.diet || [],
    pantry: state.pantry,
    likes: state.likes,
    avoid: avoidedSet(state.prefs),
    limit: 6
  });
  if (!ladder) return;

  const amountFor = (subId) => {
    const next = swappedLine(source, subId);
    return next ? formatQty(next.qty * scale, next.unit) : null;
  };

  const choose = (subId) => {
    setSwap(recipeId, originalId, subId);
    play(subId ? 'check' : 'uncheck');
    dlg.close();
    draw();
    toast(subId ? `Using ${ingIndex.get(subId).name} instead` : `Back to ${original.name}`);
  };

  const row = (label, amount, note, { on, onclick, badges = [], effect = null }) =>
    h('button', { type: 'button', class: `swap-option ${on ? 'is-on' : ''}`, onclick },
      h('span.swap-option__head',
        h('span.swap-option__name', label),
        amount ? h('span.swap-option__qty', amount) : null,
        on ? h('span.pill.pill--green', 'in use') : null
      ),
      badges.length || effect
        ? h('span.swap-option__badges',
            ...badges.map(b => h('span.swap-badge', b)),
            effect
              ? h('span', { class: `swap-badge swap-badge--${effect.lost.length ? 'warn' : 'ok'}` }, effect.label)
              : null
          )
        : null,
      note ? h('span.swap-option__note', note) : null
    );

  const optionRow = (o) => row(o.item.name, amountFor(o.item.id), o.note, {
    on: current === o.item.id,
    onclick: () => choose(o.item.id),
    effect: o.effect,
    badges: [
      o.inPantry ? 'you have this' : null,
      o.via ? `by way of ${o.via.toLowerCase()}` : null,
      o.assumedRatio ? 'amount is a starting point' : null
    ].filter(Boolean)
  });

  const tier = (title, blurb, list) => (list.length
    ? h('div.swap-tier',
        h('p.swap-tier__title', title),
        blurb ? h('p.swap-tier__blurb', blurb) : null,
        h('div.swap-options', ...list.map(optionRow)))
    : null);

  const dlg = sheet(`Instead of ${original.name}`,
    h('div.swap-sheet',
      h('p.muted.small',
        'Amounts are converted, not copied — a few of these are nowhere near one for one. ',
        'Choosing one changes this recipe, its nutrition and your shopping list.'),

      h('div.swap-options',
        row(original.name, formatQty(source.qty * scale, source.unit), 'The recipe as written.',
          { on: !current, onclick: () => choose(null) })),

      tier('Use instead', null, ladder.direct),
      tier('One step further out',
        'What those substitutes themselves stand in for. Further from the original, still in the neighborhood.',
        ladder.second),
      tier(ladder.roles.length ? `Plays the same part — ${ladder.roles.map(r => r.name.toLowerCase()).join(', ')}` : 'Plays the same part',
        ladder.roles[0]?.does || 'Different ingredient, same job in the dish.',
        ladder.role),

      ladder.combos.length
        ? h('div.swap-tier',
            h('p.swap-tier__title', 'Or make it'),
            ...ladder.combos.map(c => h('div.combo',
              h('p.combo__head',
                h('strong', c.yield), ' from ',
                c.parts.map(p => `${p.amount} ${(p.item?.name || p.ing).toLowerCase()}`).join(' + '),
                c.ready ? h('span.swap-badge', 'you have everything') : null
              ),
              h('p.combo__how', c.how),
              h('p.combo__why', c.why)
            )))
        : null,

      ladder.omit ? omitBlock(ladder.omit, original) : null
    )
  );
}

/** Leaving it out, with what that costs stated plainly. */
function omitBlock(omit, original) {
  return h('div.swap-tier.swap-tier--omit',
    h('p.swap-tier__title', 'Or leave it out'),
    h('p.swap-tier__blurb',
      omit.say,
      omit.lost.length ? ` Without it there is no ${omit.lost.join(' or ').toLowerCase()} left in the dish.` : ''),
    ...omit.compensate.map(f => h('p.combo__how',
      h('strong', `${f.amount} ${(f.item?.name || f.ing).toLowerCase()}`), ' — ', f.how, ' ', h('em', f.why))),
    h('p.fine-print', `Nothing is removed for you — this is what happens if you skip the ${original.name.toLowerCase()}.`)
  );
}

/** The recipe's own line for an ingredient, before any swap was applied. */
function originalLine(recipeId, ingredientId) {
  const { recipeIndex } = getDb();
  return recipeIndex.get(recipeId)?.ingredients.find(l => l.ing === ingredientId) || null;
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
        const swapFrom = line.swappedFrom ? ingIndex.get(line.swappedFrom) : null;
        // The ladder means almost everything has somewhere to go now — a direct
        // substitute, a role group, or a way to make it — so the button shows
        // whenever any of the three has something in it.
        const fromId = line.swappedFrom || line.ing;
        const canSwap = substitutionsFor(fromId, { diet: recipe.diet || [] }).length > 0
          || rolesFor(fromId).length > 0 || combosFor(fromId).length > 0;

        return h('li', { class: `ing ${have ? 'is-have' : ''} ${swapFrom ? 'is-swapped' : ''} ${line.added ? 'is-added' : ''}` },
          h('label.ing__main',
            h('input', {
              type: 'checkbox', checked: have,
              onchange: (e) => { togglePantry(line.ing); play(e.target.checked ? 'check' : 'uncheck'); draw(); },
              'aria-label': `I have ${item.name}`
            }),
            foodIcon(item, { size: 24 }),
            h('span.ing__qty', formatQty(line.qty * scale, line.unit)),
            h('span.ing__name', item.name),
            line.prep ? h('span.ing__prep', `, ${line.prep}`) : null,
            line.optional ? h('span.ing__opt', ' (optional)') : null,
            swapFrom ? h('span.ing__swapped', ` — instead of ${swapFrom.name}`) : null,
            line.added ? h('span.ing__added', ' — you added this') : null
          ),
          h('div.ing__meta',
            item.heartNote ? h('button.tag-btn', { type: 'button', title: item.heartNote, onclick: () => sheet(item.name, h('p', item.heartNote)) }, '❤ note') : null,
            item.tips ? h('button.tag-btn', { type: 'button', onclick: () => sheet(item.name, h('p', item.tips)) }, '💡 tip') : null,
            // Almost every ingredient has a substitute, so the unswapped state is
            // a quiet icon rather than a labeled pill — seventeen copies of
            // "use something else" is a wall. Swapped, it says so in words.
            canSwap ? h('button', {
              type: 'button',
              class: `tag-btn ${swapFrom ? 'is-on' : 'tag-btn--icon'}`,
              title: swapFrom ? `Using ${item.name} instead of ${swapFrom.name}` : `Use something else instead of ${item.name}`,
              'aria-label': swapFrom ? `Change what replaces ${swapFrom.name}` : `Use something else instead of ${item.name}`,
              onclick: () => openSwapSheet(recipe.id, line, scale, draw)
            }, swapFrom ? '↔ swapped' : '↔') : null,
            line.added
              ? h('button.tag-btn', {
                  type: 'button',
                  title: `Take the ${item.name.toLowerCase()} back out`,
                  onclick: () => { removeFromDish(recipe.id, line.ing); play('uncheck'); draw(); }
                }, '× take it out')
              : null,
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

function forkBlock(fork, kind, scale, on, onToggle, state, draw, conflicts = []) {
  const { ingIndex } = getDb();
  return h('section', { class: `card fork-block fork-block--${kind}` },
    h('div.fork-block__head',
      h('h2.block__title', kind === 'omnivore' ? '🍽 Fork in the road — omnivores' : '🌱 Fork in the road — vegetarian'),
      h('label.switch-inline',
        h('input', { type: 'checkbox', checked: on, onchange: (e) => onToggle(e.target.checked) }),
        h('span', on ? 'Included' : 'Skipped')
      )
    ),
    conflicts.length
      ? h('p.allergy-note', `⚠️ This add-on ${conflictPhrase(conflicts)} — flagged in this household, so it starts switched off.`)
      : null,
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

/**
 * The method, either as sentences or as a diagram.
 *
 * The list is the default because it is the instruction. The table is the same
 * method with its structure visible — what meets what, and what is happening in
 * parallel — which is the thing a list genuinely cannot show. The choice is
 * remembered for the session, because somebody who prefers one prefers it for
 * every recipe.
 */
let methodAsTable = false;

function stepsBlock(recipe, ingIndex, scale, draw) {
  const table = ingIndex ? methodTableBlock(recipe, ingIndex, { scale }) : null;

  return h('section.card.block',
    h('div.balance__head',
      h('h2.block__title', 'Method'),
      table
        ? h('div.chip-row.chip-row--tight',
            chip('Steps', { on: !methodAsTable, onclick: () => { methodAsTable = false; play('tap'); draw(); } }),
            chip('Diagram', { on: methodAsTable, onclick: () => { methodAsTable = true; play('tap'); draw(); } })
          )
        : null
    ),
    methodAsTable && table ? table : h('ol.steps', ...recipe.steps.map(s => h('li', s)))
  );
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
    glancePanel(per, reference, { eaterName: eaters[0]?.name, course: recipe.course }),

    nutOmni
      ? h('p.muted.small', `With the omnivore add-on: ${Math.round(nutOmni.perServing.kcal)} kcal, ${Math.round(nutOmni.perServing.protein_g)} g protein, ${Math.round(nutOmni.perServing.sodium_mg)} mg sodium.`)
      : null,

    flags.length ? h('div.flag-row', ...flags.map(f => pill(f.text, f.kind === 'good' ? 'green' : 'warn'))) : null,

    h('details.explain',
      h('summary', 'Every number, per serving'),
      h('div.nutri-grid',
        ...['kcal', 'protein_g', 'carb_g', 'fiber_g', 'sugar_g', 'fat_g', 'satfat_g', 'sodium_mg', 'potassium_mg', 'cholesterol_mg', 'calcium_mg', 'iron_mg'].map(k =>
          h('div.nutri',
            h('span.nutri__value', Math.round(per[k]), h('span.nutri__unit', NUTRIENT_UNITS[k])),
            h('span.nutri__label', NUTRIENT_LABELS[k])
          ))
      )
    ),

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

/* ------------------------------------------------------------------ *
 * Browse
 * ------------------------------------------------------------------ */

let browseQuery = '';
let browseCourse = 'all';
let browseSort = 'heart';
let browseOccasion = null;
let browseCollection = null;
let browseCrave = false;
/** Which collection group's shelf is open. Null means the strip is collapsed. */
let browseGroup = null;

/**
 * The collection shelf: five groups of ways in — meal type, method, world
 * cuisine, American region, effort — with the chips for one group at a time.
 *
 * All fifty-odd collections shown at once is a wall nobody reads, and hiding
 * them behind a dropdown is a wall nobody finds. One row of group names, one
 * row of chips underneath.
 */
function collectionShelf(draw) {
  const groups = collectionsByGroup();
  if (!groups.length) return null;

  const open = groups.find(g => g.group.id === browseGroup);

  return h('section.shelf',
    h('div.shelf__groups',
      ...groups.map(({ group, collections }) => h('button', {
        type: 'button',
        class: `shelf__group ${browseGroup === group.id ? 'is-on' : ''}`,
        onclick: () => {
          browseGroup = browseGroup === group.id ? null : group.id;
          play('tap');
          draw();
        }
      }, group.name, h('span.shelf__count', collections.length)))
    ),
    open
      ? h('div.shelf__body',
          h('p.shelf__blurb', open.group.blurb),
          h('div.shelf__chips',
            ...open.collections.map(c => h('button', {
              type: 'button',
              class: `shelf__chip ${browseCollection === c.id ? 'is-on' : ''}`,
              title: c.blurb,
              onclick: () => {
                browseCollection = browseCollection === c.id ? null : c.id;
                browseOccasion = null;
                play('tap');
                draw();
              }
            },
              h('span.shelf__chip-icon', { 'aria-hidden': 'true' }, c.icon || '🍽'),
              h('span.shelf__chip-name', c.name),
              h('span.shelf__chip-count', c.count)
            ))
          ),
          browseCollection ? h('p.shelf__note', collectionById(browseCollection)?.blurb || '') : null
        )
      : null
  );
}

export function renderBrowse(root, { navigate }) {
  // A link like #/browse?occasion=thanksgiving arrives from the roll screen.
  const fromLink = location.hash.match(/[?&]occasion=([\w-]+)/)?.[1];
  if (fromLink) browseOccasion = fromLink;
  const fromCollection = location.hash.match(/[?&]collection=([\w-]+)/)?.[1];
  if (fromCollection) { browseCollection = fromCollection; browseGroup = collectionById(fromCollection)?.group || null; }

  const draw = () => {
    mount(root, view());
    requestAnimationFrame(() => {
      stagger(root.querySelector('.card-grid'), { step: 28 });
      // The group strip scrolls, so the chosen group can end up off-screen
      // behind the one you tapped. Pull it back into view.
      root.querySelector('.shelf__group.is-on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    });
  };
  const view = () => {
    const state = getState();
    let list = searchRecipes(browseQuery);
    if (browseCourse !== 'all') list = list.filter(r => r.course === browseCourse);
    if (browseOccasion) list = list.filter(r => (r.occasions || []).includes(browseOccasion));
    if (browseCollection) {
      const collection = collectionById(browseCollection);
      if (collection) list = list.filter(r => matchesCollection(r, collection));
    }
    if (browseCrave) list = list.filter(r => (r.tags || []).includes('crave'));

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
          h('p.eyebrow', 'The collection'),
          h('h1.view__title',
            browseCollection ? (collectionById(browseCollection)?.name || 'Recipes')
              : browseOccasion ? (occasionById(browseOccasion)?.name || 'Recipes')
                : 'Every recipe'),
          h('p.view__sub',
            browseCollection ? (collectionById(browseCollection)?.blurb || '')
              : browseOccasion ? (occasionById(browseOccasion)?.blurb || '')
                : `${list.length} of ${getDb().recipes.length} recipes`)
        )
      ),
      collectionShelf(draw),
      h('div.occasion-strip',
        h('button', {
          type: 'button',
          class: `occasion ${browseOccasion || browseCollection ? '' : 'is-on'}`,
          onclick: () => { browseOccasion = null; browseCollection = null; browseGroup = null; play('tap'); draw(); }
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
          ...['all', 'dinner', 'lunch', 'breakfast', 'snack', 'dessert', 'side', 'component'].map(c =>
            chip(c === 'all' ? 'All' : titleCase(c), { on: browseCourse === c, onclick: () => { browseCourse = c; draw(); } }))
        ),
        h('div.chip-row.chip-row--tight',
          ...[['heart', 'Heart score'], ['time', 'Fastest'], ['name', 'A-Z']].map(([k, label]) =>
            chip(label, { on: browseSort === k, onclick: () => { browseSort = k; draw(); } })),
          // The crave list sorted by heart score would bury itself, so this
          // flips the sort to A-Z on the way in unless you have chosen one.
          chip('🍯 Lick the plate', {
            on: browseCrave,
            onclick: () => {
              browseCrave = !browseCrave;
              if (browseCrave && browseSort === 'heart') browseSort = 'name';
              draw();
            }
          })
        ),
        browseCrave
          ? h('p.fine-print.filters__note',
              'The most delicious things here, chosen for that and nothing else. ',
              'Every one still shows its heart score, and the ones that score badly say why on the recipe.')
          : null
      ),
      h('div.card-grid',
        ...list.map(r => {
          const heart = heartFor(r);
          const cov = pantryCoverage(r, state.pantry);
          // The card takes the color of what the dish is made of, so a grid of
          // 242 of them can be scanned by sight rather than read in full.
          const look = cardLook(r, getDb().ingIndex);
          return h('article', { class: `card recipe-card ${look.className}`, style: look.style, title: look.look ? `${look.look.group.name} · ${look.look.texture?.name || ''}`.trim() : null },
            h('button.recipe-card__art', {
              type: 'button',
              'aria-label': `Open ${r.title}`,
              onclick: () => navigate(`#/recipe/${r.id}`)
            }, iconCollage(r, getDb().ingIndex, { size: 52 })),
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
              r.cuisine && r.cuisine !== 'any' ? pill(titleCase(String(r.cuisine).replace(/-/g, ' '))) : null,
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

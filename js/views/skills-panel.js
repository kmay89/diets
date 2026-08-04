/**
 * skills-panel.js — what this kitchen has picked up, on the Learn screen.
 *
 * Learn is the technique library: everything a recipe assumes you already know.
 * This sits at the top of it and turns the library from a reference into a map
 * with a "you are here" on it — the same notes, but sorted by whether you have
 * already done the thing they describe.
 *
 * Three deliberate refusals.
 *
 * No score. There is no percentage, no level and no bar filling toward a total,
 * because the moment there is one the honest answer "I cook six dishes and I am
 * happy" becomes a failing grade.
 *
 * No congratulation. It says "you have deglazed four times", not "achievement
 * unlocked". The cook did the work; the app noticed. Praising somebody for
 * cooking dinner is how software gets patronizing.
 *
 * No dead ends. A technique is only ever suggested with the count of dishes in
 * the collection that would teach it and a way to see them. An unreachable
 * suggestion is not encouragement, it is a reproach.
 *
 * ERRERLabs — MIT licensed.
 */

import { h, sheet } from '../ui.js';
import { skillGroups, nextSkills, craftLine, skillsFor, skillsIn } from '../skills.js';
import { getDb } from '../data.js';
import { tipById } from '../tips.js';
import { openTip } from './tips-panel.js';
import { play } from '../feedback.js';

export function skillsBlock(picture, recipes, navigate) {
  if (!picture.cooks) return null;

  const line = craftLine(picture);
  const shown = [...picture.have, ...picture.started];
  const next = nextSkills(picture, recipes);

  return h('section.card.block.craft',
    h('h2.block__title', 'What you have picked up'),
    h('p.muted.small', line),

    shown.length
      ? h('div.craft__grid', ...byGroup(shown).map(([group, entries]) =>
          h('div.craft__group',
            h('p.eyebrow', group.name),
            ...entries.map(e => skillChip(e, navigate))
          )
        ))
      : null,

    next.length
      ? h('div.craft__next',
          h('p.eyebrow', 'Next, if you like'),
          ...next.map(e => h('button.craft__lead', {
            type: 'button',
            onclick: () => { play('tap'); openSkill(e, navigate); }
          },
            h('span.craft__lead-name', e.skill.name),
            h('span.craft__lead-why', e.skill.short),
            h('span.craft__lead-count',
              `${e.recipes.length} ${e.recipes.length === 1 ? 'dish' : 'dishes'} here would teach it`)
          ))
        )
      : null
  );
}

/** Entries grouped in the order the model declares, empty groups dropped. */
function byGroup(entries) {
  return skillGroups()
    .map(group => [group, entries.filter(e => e.skill.group === group.id)])
    .filter(([, list]) => list.length);
}

function skillChip(entry, navigate) {
  const { skill, count, need, have } = entry;
  return h('button', {
    type: 'button',
    class: `craft__chip ${have ? 'is-have' : 'is-started'}`,
    onclick: () => { play('tap'); openSkill(entry, navigate); }
  },
    h('span.craft__mark', have ? '◆' : '◇'),
    h('span.craft__name', skill.name),
    h('span.craft__count', have ? countWords(count, skill) : `${count} of ${need}`)
  );
}

/**
 * "4 times". For a breadth skill the unit is not times but things — cuisines,
 * families, repeats of one dish — and calling nine cuisines "9 times" would be
 * the sort of small wrongness that makes a reader stop trusting the panel.
 */
function countWords(count, skill) {
  if (skill.kind !== 'breadth') return `${count} ${count === 1 ? 'time' : 'times'}`;
  if (skill.of === 'cuisine') return `${count} cuisines`;
  if (skill.of === 'technique') return `${count} families`;
  return `${count} times over`;
}

/**
 * One technique in full: what it is, why it matters, what it opens up, and
 * either the dishes that taught it or the dishes that would.
 */
export function openSkill(entry, navigate) {
  const { skill, count, need, have, dishes = [], recipes = [] } = entry;
  const tip = skill.tip ? tipById(skill.tip) : null;
  const offer = have ? dishes : recipes.map(r => r.id);

  const dlg = sheet(skill.name,
    h('div.craft-sheet',
      h('p.craft-sheet__short', skill.short),
      h('p.craft-sheet__state',
        have
          ? `You have cooked this ${countWords(count, skill)}.`
          : count
            ? `${count} of ${need} so far.`
            : 'Not yet — and that is a fine place to be.'
      ),
      h('p', skill.what),
      h('p.craft-sheet__unlocks', h('strong', 'What it opens up. '), skill.unlocks),

      tip
        ? h('button.btn.btn--small', {
            type: 'button',
            onclick: () => { dlg.close(); openTip(tip); }
          }, `Read: ${tip.title}`)
        : null,

      offer.length
        ? h('div.craft-sheet__dishes',
            h('p.eyebrow', have ? 'You cooked it in' : 'Dishes here that would teach it'),
            ...offer.slice(0, 6).map(id => h('button.linkish', {
              type: 'button',
              onclick: () => { dlg.close(); navigate(`#/recipe/${id}`); }
            }, nameOf(id, recipes)))
          )
        : null
    )
  );
  return dlg;
}

/**
 * A title if we have the recipe object, otherwise the id turned back into
 * something readable — the cook log can outlive a recipe leaving the
 * collection, and "rec.lentil-bolognese" in a list is worse than a guess.
 */
function nameOf(id, recipes) {
  const found = recipes.find(r => r.id === id);
  if (found) return found.title;
  return String(id).replace(/^rec\./, '').replace(/-/g, ' ')
    .replace(/(^|\s)\w/g, (m) => m.toUpperCase());
}

/**
 * The one technique a dish is worth cooking to learn, as a line on its page.
 *
 * A reason to pick this one over the other 241, and the only place in the app
 * where a recipe advertises what it will teach you rather than what it tastes
 * like. It names the technique the kitchen has done least, because that is the
 * one this particular dish would actually add — and it says so plainly, without
 * turning the recipe into homework.
 */
export function teachesLine(recipe, state, navigate) {
  const { recipeIndex } = getDb();
  const picture = skillsFor(state, recipeIndex);
  const here = new Set(skillsIn(recipe).map(s => s.id));
  if (!here.size) return null;

  // Least-practiced first: a dish teaching four things you already do well is
  // not teaching you anything, and should say nothing rather than boast.
  const candidates = picture.all
    .filter(e => here.has(e.skill.id))
    .sort((a, b) => a.count - b.count);
  const pick = candidates[0];
  if (!pick || pick.have) return null;

  return h('p.teaches-line',
    h('span.teaches-line__mark', '◇'),
    h('button.linkish', {
      type: 'button',
      onclick: () => { play('tap'); openSkill({ ...pick, recipes: [] }, navigate); }
      // Phrased so it works for every name in the model. "Cook this and you
      // will have fond" is not a sentence; "Worth cooking for: Fond" is.
    }, `Worth cooking for: ${pick.skill.name} — ${pick.skill.short}`)
  );
}

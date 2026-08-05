/**
 * step-picture.js — the same instruction, without the sentence.
 *
 * This is not a replacement for the words and it must never be shown instead of
 * them. It sits beside them, saying the same thing in pictures, because words
 * and an image of the same idea are held better together than either alone —
 * and because at a stove, three feet back, with steam in your face, a row of
 * pictures resolves in about a fifth of a second and a sentence does not.
 *
 * The failure mode to avoid is the pictogram that has to be *learned*. An icon
 * language nobody can read is a puzzle placed between a cook and their dinner.
 * So the vocabulary here is deliberately tiny — twelve actions — and every
 * picture is captioned with the action's name, which means it can be read on
 * first sight and recognized on the tenth.
 *
 * Everything is derived. The action comes from the verb the method diagram
 * already found; the things come from the ingredients the step already names,
 * drawn with the food icons the shopping list already uses. Nothing was
 * annotated, so it works on all 242.
 *
 * ERRERLabs — MIT licensed.
 */

import { labelFor, ingredientsIn } from './recipe-table.js';
import { stepShape } from './timeline.js';

/**
 * Twelve actions, because a kitchen only really does twelve things and a
 * vocabulary of forty would be a second language to learn.
 *
 * The mapping is from the diagram's verb labels, so the picture and the bracket
 * above it can never describe the same step differently.
 */
const ACTIONS = [
  { id: 'cut',    glyph: '🔪', name: 'Cut',      verbs: ['Chop', 'Slice', 'Dice', 'Grate', 'Shape', 'Divide', 'Press'] },
  { id: 'heat',   glyph: '🔥', name: 'Heat',     verbs: ['Heat', 'Melt', 'Warm', 'Sear', 'Brown', 'Sauté', 'Sweat', 'Fry', 'Crisp', 'Bloom', 'Toast', 'Wilt'] },
  { id: 'oven',   glyph: '🌡️', name: 'Oven',     verbs: ['Bake', 'Roast', 'Broil', 'Grill', 'Preheat'] },
  { id: 'stir',   glyph: '🥄', name: 'Stir',     verbs: ['Stir in', 'Mix', 'Combine', 'Fold in', 'Toss', 'Whisk', 'Beat', 'Whip', 'Mash', 'Blend', 'Knead'] },
  { id: 'liquid', glyph: '💧', name: 'Add wet',  verbs: ['Pour', 'Tip in', 'Bring up', 'Boil', 'Steam', 'Poach'] },
  { id: 'low',    glyph: '♨️', name: 'Simmer',   verbs: ['Simmer', 'Reduce', 'Braise', 'Cook'] },
  { id: 'wait',   glyph: '⏳', name: 'Wait',     verbs: ['Rest', 'Marinate', 'Chill', 'Cool', 'Freeze', 'Soften'] },
  { id: 'season', glyph: '🧂', name: 'Season',   verbs: ['Season', 'Taste', 'Scatter', 'Garnish'] },
  { id: 'drain',  glyph: '🫗', name: 'Drain',    verbs: ['Drain', 'Rinse', 'Strain'] },
  { id: 'flip',   glyph: '🔁', name: 'Turn',     verbs: ['Flip'] },
  { id: 'plate',  glyph: '🍽️', name: 'Plate',    verbs: ['Serve', 'Top with', 'Spread', 'Layer', 'Arrange', 'Transfer', 'Wrap', 'Cover', 'Finish'] },
  { id: 'then',   glyph: '▸',  name: 'Then',     verbs: ['Then'] }
];

const BY_VERB = new Map();
for (const action of ACTIONS) for (const verb of action.verbs) BY_VERB.set(verb, action);

export const actionFor = (verb) => BY_VERB.get(verb) || BY_VERB.get('Then');

/** Every action, for the legend — the thing that makes the vocabulary readable. */
export const allActions = () => ACTIONS.filter(a => a.id !== 'then');

/**
 * More than this and the row stops being glanceable and becomes a list with no
 * words, which is the worst of both. The overflow is counted rather than hidden,
 * so the picture never quietly claims a step has fewer things in it than it does.
 */
const MAX_THINGS = 5;

/**
 * One step, as a picture.
 *
 * @returns {{action:object, things:Array, more:number, minutes:number,
 *   kind:string, cue:string}} `things` are full ingredient records, ready for
 *   foodIcon(). `more` is how many were left off the end.
 */
export function stepPicture(text, recipe, ingIndex) {
  const shape = stepShape(text);
  const named = ingredientsIn(text, recipe, ingIndex);

  // The verb that owns the clock, not the first one in the sentence — the same
  // reading the timeline uses, so the picture and the chart can never disagree
  // about what a step is doing. "Bring to a simmer, cover, cook 30 minutes"
  // drew a splash of water before this; it is half an hour of simmering.
  const verb = shape.verb || labelFor(text).verb;

  return {
    // "Cook" is the most common verb in the collection and the least specific:
    // it covers a minute of blooming spices and half an hour of a covered pot.
    // The timeline already decided which, so ask it rather than guess again.
    action: verb === 'Cook'
      ? actionFor(shape.kind === 'away' ? 'Simmer' : 'Heat')
      : actionFor(verb),
    things: named.slice(0, MAX_THINGS).map(n => n.item),
    more: Math.max(0, named.length - MAX_THINGS),
    minutes: shape.minutes,
    kind: shape.kind,
    cue: shape.cue
  };
}

/**
 * The picture, said out loud — which is what a screen reader gets, and what the
 * caption under a picture says when somebody has the words turned on too.
 *
 * A row of icons with no text alternative is a decoration at best and a locked
 * door at worst, and the whole argument for showing a picture is that it says
 * the same thing as the sentence. If it cannot be written down it was not
 * saying the same thing.
 */
export function pictureWords(pic) {
  if (!pic) return '';
  const things = pic.things.map(t => t.name.toLowerCase());
  const list = things.length > 1
    ? `${things.slice(0, -1).join(', ')} and ${things[things.length - 1]}`
    : things[0] || '';

  const parts = [pic.action.name.toLowerCase()];
  if (list) parts.push(pic.more ? `${list} and ${pic.more} more` : list);
  if (pic.minutes) parts.push(`${pic.minutes} ${pic.minutes === 1 ? 'minute' : 'minutes'}`);
  if (pic.cue) parts.push(`until ${pic.cue}`);
  return parts.join(', ');
}

/** Worth drawing at all — a picture of nothing is noise on the screen. */
export const worthPicturing = (pic) =>
  !!pic && (pic.things.length > 0 || pic.minutes > 0) && pic.action.id !== 'then';

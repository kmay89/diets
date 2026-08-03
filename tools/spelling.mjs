/**
 * spelling.mjs — one dictionary of British spellings, and where they are allowed.
 *
 * Veg-Nourish is written in American English. This is the shared list behind
 * both the checker (`npm run spell`, and a test so a stray "flavour" fails CI)
 * and the one-off rewrite that applied it.
 *
 * The exceptions matter as much as the rules. A cited paper's title is a
 * bibliographic record — "a modelling study" published in The Lancet is called
 * that, and Americanising it would misquote the source. `aria-labelledby` is a
 * spelling defined by the ARIA specification, not by us.
 *
 * ERRERLabs — MIT licensed.
 */

/**
 * British → American. Stems, applied case-insensitively with the original
 * capitalisation preserved, so one entry covers colour/Colour/colours/coloured.
 *
 * Only stems that are unambiguous. `analyse` is deliberately absent: the two
 * spellings converge in `analysis` and `analyses`, which are American already,
 * and a stem loose enough to catch the verb would mangle the nouns.
 */
export const SPELLINGS = [
  ['colour', 'color'],
  ['flavour', 'flavor'],
  ['savour', 'savor'],
  ['favour', 'favor'],
  ['behaviour', 'behavior'],
  ['honour', 'honor'],
  ['labour', 'labor'],
  ['neighbour', 'neighbor'],
  ['humour', 'humor'],
  ['odour', 'odor'],
  ['vapour', 'vapor'],
  ['endeavour', 'endeavor'],
  ['fibre', 'fiber'],
  ['centred', 'centered'],
  ['centre', 'center'],
  ['theatre', 'theater'],
  ['litre', 'liter'],
  ['calibre', 'caliber'],
  ['sombre', 'somber'],
  ['defence', 'defense'],
  ['offence', 'offense'],
  ['pretence', 'pretense'],
  ['organise', 'organize'],
  ['organisation', 'organization'],
  ['realise', 'realize'],
  ['recognise', 'recognize'],
  ['apologise', 'apologize'],
  ['minimise', 'minimize'],
  ['maximise', 'maximize'],
  ['prioritise', 'prioritize'],
  ['customise', 'customize'],
  ['personalise', 'personalize'],
  ['summarise', 'summarize'],
  ['randomise', 'randomize'],
  ['randomisation', 'randomization'],
  ['caramelise', 'caramelize'],
  ['carbonise', 'carbonize'],
  ['programme', 'program'],
  ['modelling', 'modeling'],
  ['modelled', 'modeled'],
  ['labelling', 'labeling'],
  ['labelled', 'labeled'],
  ['travelling', 'traveling'],
  ['travelled', 'traveled'],
  ['fuelled', 'fueled'],
  ['cancelling', 'canceling'],
  ['cancelled', 'canceled'],
  ['marvellous', 'marvelous'],
  ['woollen', 'woolen'],
  ['grey', 'gray'],
  ['mould', 'mold'],
  ['smoulder', 'smolder'],
  ['draught', 'draft'],
  ['plough', 'plow'],
  ['aluminium', 'aluminum'],
  ['jewellery', 'jewelry'],
  ['storey', 'story'],
  ['kerb', 'curb'],
  ['ageing', 'aging'],
  ['judgement', 'judgment'],
  ['instalment', 'installment'],
  ['skilful', 'skillful'],
  ['wilful', 'willful'],
  ['sceptic', 'skeptic'],
  ['whilst', 'while'],
  ['amongst', 'among'],
  ['learnt', 'learned'],
  ['tinned', 'canned'],
  ['aubergine', 'eggplant'],
  ['courgette', 'zucchini'],
  ['mangetout', 'snow peas'],
  ['beetroot', 'beets'],
  ['coriander leaf', 'cilantro'],
  ['spring onion', 'scallion'],
  ['caster sugar', 'superfine sugar'],
  ['icing sugar', 'powdered sugar'],
  ['double cream', 'heavy cream'],
  ['cling film', 'plastic wrap'],
  ['kitchen roll', 'paper towels']
];

/**
 * Spellings that are correct where they appear and must be left alone.
 *
 * - `aria-labelledby` is the ARIA attribute; the spec spells it that way.
 * - `labelledby` covers the same token when written without the prefix.
 * - The rest are real words the stems above would otherwise chew into:
 *   `centred` is caught, but `concentrate` must not be.
 */
export const ALLOWED = [
  'aria-labelledby',
  'labelledby',
  'greyhound'
];

/**
 * Paths, and the JSON fields inside them, that quote someone else verbatim.
 * A published title keeps the spelling it was published with.
 */
export const VERBATIM_FIELDS = {
  'data/citations.json': ['title', 'journal', 'authors', 'publisher']
};

/** Files that are generated from other files — fix the source, rebuild these. */
export const GENERATED = [
  'data/graph.json',
  'r/',
  'icons/'
];

/** Longest stem first, so `centred` is tried before `centre` — both in the
 *  alternation and in the lookup, or "centred" becomes "centerd". */
const BY_LENGTH = [...SPELLINGS].sort((a, b) => b[0].trim().length - a[0].trim().length);
const PATTERN = new RegExp(`\\b(${BY_LENGTH.map(([f]) => f.trim()).join('|')})\\w*`, 'gi');

/** This file is the dictionary; every British spelling in it is a definition. */
export const SKIP_FILES = ['tools/spelling.mjs', 'test/spelling.test.mjs'];

/** Preserve the shape of the original: COLOUR → COLOR, Colour → Color. */
function matchCase(original, replacement) {
  if (original === original.toUpperCase() && original !== original.toLowerCase()) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

/** The American spelling of one matched word, or null if it should stand. */
function americanFor(found, before) {
  if (ALLOWED.some(a => (before + found).toLowerCase().includes(a))) return null;
  const entry = BY_LENGTH.find(([f]) => found.toLowerCase().startsWith(f.trim()));
  if (!entry) return null;
  return matchCase(found, entry[1] + found.slice(entry[0].trim().length));
}

/** @returns [{ index, found, suggestion }] for every British spelling in `text`. */
export function findBritish(text) {
  const hits = [];
  for (const m of String(text).matchAll(PATTERN)) {
    const before = text.slice(Math.max(0, m.index - 6), m.index);
    const suggestion = americanFor(m[0], before);
    if (suggestion) hits.push({ index: m.index, found: m[0], suggestion });
  }
  return hits;
}

/** Rewrite every British spelling in `text`. */
export function americanize(text) {
  return String(text).replace(PATTERN, (found, _stem, index, whole) =>
    americanFor(found, whole.slice(Math.max(0, index - 6), index)) ?? found);
}

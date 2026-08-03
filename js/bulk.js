/**
 * bulk.js — what is actually worth buying at a warehouse club.
 *
 * Costco and Sam's Club are not a cheaper supermarket, they are a different
 * trip: everything comes in a pack several times the size, and the saving is
 * only real if the food gets eaten. Six pounds of chicken at half the price is
 * a bargain if it goes into the freezer in meal-size bags on the way in, and a
 * loss if it sits in the fridge until Thursday. A pound of baby spinach is a
 * loss either way.
 *
 * So every ingredient gets one of three answers, and the shopping list says
 * which:
 *
 *   keeps    — a shelf or a freezer holds it for months. Buy the big pack.
 *   freezes  — worth it, but portion and freeze it the day you get home.
 *   perishes — a club pack is more than a household finishes in time.
 *
 * The classification reads the data the app already has: the aisle, and the
 * `pantry`, `storage` and `freezer` tags that were already on the ingredients
 * for other reasons.
 *
 * On pack sizes: this file deliberately does not pretend to know that a given
 * club sells chicken thighs in a 6.2 lb tray. Warehouse packs are described as
 * a *multiple* of the ordinary shopping unit, which is a rule of thumb and is
 * labeled as one wherever it reaches the screen. A wrong multiple makes the
 * advice a little conservative; an invented SKU would make it a lie.
 *
 * ERRERLabs — MIT licensed.
 */

export const KEEPS = 'keeps';
export const FREEZES = 'freezes';
export const PERISHES = 'perishes';

/** Aisles whose contents sit on a shelf for months unopened. */
const SHELF_STABLE_AISLES = new Set([
  'canned-jarred', 'dry-goods', 'baking', 'condiments',
  'oils-vinegars', 'spices', 'beverages', 'household', 'international'
]);

/** Sold frozen, so a bigger bag changes nothing but the shelf it needs. */
const ALREADY_FROZEN = new Set(['frozen']);

/** A home freezer genuinely rescues these — if it happens the same day. */
const FREEZABLE_AISLES = new Set(['meat-seafood', 'bakery', 'deli']);

/**
 * Dairy splits down the middle and the aisle cannot tell you which side.
 * Hard and semi-hard cheese and butter freeze and come back fine; fresh dairy
 * separates, goes grainy, or sours long before a club pack is finished.
 */
const DAIRY_FREEZES = new Set([
  'ing.cheese.parmesan', 'ing.cheese.pecorino', 'ing.cheese.cheddar',
  'ing.cheese.mozzarella', 'ing.butter.unsalted', 'ing.butter'
]);

/**
 * Produce that keeps for weeks in a cupboard or a crisper. The `storage` tag
 * already marks most of them; these are the ones it misses.
 */
const PRODUCE_KEEPS = new Set([
  'ing.potato.russet', 'ing.potato.yukon', 'ing.sweetpotato',
  'ing.squash.butternut', 'ing.squash.acorn', 'ing.cabbage.green', 'ing.cabbage.red',
  'ing.garlic', 'ing.ginger', 'ing.apple', 'ing.orange', 'ing.lemon', 'ing.lime',
  'ing.grapefruit', 'ing.beet', 'ing.winter-squash'
]);

/**
 * Nuts, seeds and whole-grain flours are shelf-stable but go rancid — months,
 * not years, and faster in a warm kitchen. Worth buying big, worth a note.
 */
const GOES_RANCID = new Set(['nuts-seeds']);

/** @returns KEEPS | FREEZES | PERISHES for one ingredient. */
export function keepability(item) {
  if (!item) return PERISHES;
  const tags = item.tags || [];
  const aisle = item.aisle;

  if (ALREADY_FROZEN.has(aisle)) return KEEPS;
  if (tags.includes('pantry') || tags.includes('storage')) return KEEPS;
  if (SHELF_STABLE_AISLES.has(aisle) || GOES_RANCID.has(aisle)) return KEEPS;

  if (tags.includes('freezer')) return FREEZES;
  if (FREEZABLE_AISLES.has(aisle)) return FREEZES;

  if (aisle === 'dairy-eggs') {
    // Eggs are the exception that looks like a rule: they hold for weeks.
    if (item.id === 'ing.egg' || item.id === 'ing.eggwhite') return KEEPS;
    return DAIRY_FREEZES.has(item.id) ? FREEZES : PERISHES;
  }

  if (aisle === 'produce') return PRODUCE_KEEPS.has(item.id) ? KEEPS : PERISHES;

  return PERISHES;
}

/**
 * How many ordinary shopping units a warehouse pack tends to hold.
 *
 * Deliberately coarse, and always presented as "about". Fresh categories run
 * smaller than dry ones because a club still cannot sell a pallet of lettuce.
 */
const PACK_MULTIPLE = {
  'meat-seafood': 3,
  'dairy-eggs': 2.5,
  bakery: 2,
  produce: 3,
  deli: 2.5,
  frozen: 2.5,
  spices: 4,
  household: 4
};
const DEFAULT_PACK_MULTIPLE = 3;

export function packMultiple(item) {
  return PACK_MULTIPLE[item?.aisle] ?? DEFAULT_PACK_MULTIPLE;
}

/** "a quarter of", "about half of" — a fraction people can picture. */
function fraction(pct) {
  if (pct >= 90) return 'nearly all of';
  if (pct >= 65) return 'most of';
  if (pct >= 40) return 'about half of';
  if (pct >= 20) return 'about a quarter of';
  return 'a small part of';
}

/**
 * What to do about one ingredient on a warehouse run.
 *
 * @param item          the ingredient record
 * @param gramsNeeded   what this plan actually calls for
 * @returns { verdict, usedPct, multiple, headline, note }
 */
export function clubAdvice(item, gramsNeeded = 0) {
  const verdict = keepability(item);
  const multiple = packMultiple(item);
  const unitGrams = item?.shop?.grams || 0;
  const packGrams = unitGrams * multiple;
  const usedPct = packGrams > 0 ? Math.round((gramsNeeded / packGrams) * 100) : null;

  const share = usedPct == null ? null : fraction(usedPct);
  const rest = usedPct != null && usedPct < 90;

  if (verdict === KEEPS) {
    return {
      verdict, usedPct, multiple,
      headline: 'Keeps',
      note: GOES_RANCID.has(item.aisle)
        ? 'Shelf-stable, but nuts and seeds go rancid in a warm cupboard — move what you will not use this month to the freezer.'
        : 'Sits on a shelf for months. The big pack is the whole point of the trip.'
    };
  }

  if (verdict === FREEZES) {
    return {
      verdict, usedPct, multiple,
      headline: 'Freeze it the same day',
      note: rest && share
        ? `This plan uses ${share} a warehouse pack. Portion the rest into meal-size bags before it goes in the fridge — once it is cold and loose in there, it gets forgotten.`
        : 'Portion into meal-size bags on the way in, not on the way out.'
    };
  }

  return {
    verdict, usedPct, multiple,
    headline: 'Will not keep',
    note: share
      ? `A club pack is roughly ${multiple}× the supermarket size and this plan uses ${share} it. The rest spoils before you get to it — buy this one at the regular store.`
      : `A club pack is roughly ${multiple}× the supermarket size, which is more than a household finishes in time.`
  };
}

/**
 * The ingredients on a list that are worth a warehouse trip, best first.
 *
 * Used to seed the picker, so somebody opening it is looking at a sensible
 * suggestion rather than a wall of 60 checkboxes.
 */
export function suggestForClub(items) {
  const rank = { [KEEPS]: 0, [FREEZES]: 1, [PERISHES]: 2 };
  return items
    .filter(i => i.kind === 'ingredient' && i.item)
    .map(i => ({ ...i, advice: clubAdvice(i.item, i.grams || 0) }))
    .sort((a, b) =>
      rank[a.advice.verdict] - rank[b.advice.verdict] ||
      a.name.localeCompare(b.name));
}

/** Warehouse clubs are a second stop, so the app has to know which ones are. */
export function isWarehouse(layout) {
  return layout?.kind === 'warehouse';
}

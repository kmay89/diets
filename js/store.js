/**
 * store.js — all application state, persisted to localStorage.
 *
 * Everything the app knows lives on this device. Nothing is sent anywhere;
 * there is no account, no server, and no analytics. See PRIVACY.md.
 *
 * ERRERLabs — MIT licensed.
 */

// Deliberately unchanged through the Veg-Nourish rename: this key is where
// real households' saved data lives, and renaming it would silently wipe
// every existing user's plan, pantry and preferences.
const KEY = 'errerlabs.diets.v1';
const SCHEMA = 1;

const listeners = new Set();

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function defaultState() {
  return {
    schema: SCHEMA,
    onboarded: false,
    household: {
      label: 'My household',
      members: []
    },
    prefs: {
      heartMode: true,
      /** Roll for the crave list instead of the heart list. Off by default,
       *  and never sticky across sessions in spirit — it is a Friday switch. */
      treatNight: false,
      maxActiveMin: 30,
      kidFriendlyOnly: false,
      seasonAware: true,
      preferPantry: true,
      avoidAllergens: [],
      store: 'default',
      /**
       * The stores this household actually shops at, in the order they get
       * driven. The first one is home base: anything with no opinion attached
       * ends up there, so a one-store household never sees a second section.
       *
       * `store` above stays as the home store so nothing that reads it breaks.
       */
      stores: [],
      /** Kept so an existing setup migrates cleanly. Superseded by `stores`. */
      bulkStore: null,
      rollSize: 4,
      theme: 'system'
    },
    /** ingredientId -> 1 (love) | -1 (never) | 0 (neutral) */
    likes: {},
    /** recipeId -> 1 | -1 */
    recipeLikes: {},
    /** recipeId -> { ingredientId: substituteId } — "use this instead, here" */
    swaps: {},
    /**
     * recipeId -> [ingredient lines] the household added to that dish, usually
     * from the flavor panel: the squeeze of lemon, the toasted almonds. Real
     * lines, so the nutrition, the score, the dials and the list all follow.
     */
    additions: {},
    /** ingredientId -> true when it is already in the house */
    pantry: {},
    /** planned meals */
    plan: [],
    /** manually added shopping items: {id, name, qty, aisle, note} */
    customItems: [],
    /** ingredientId or customId -> true when ticked off in the store */
    checked: {},
    /** ingredientIds the user removed from this week's list by hand */
    suppressed: {},
    /**
     * ingredientId -> storeId. Set by moving a row, never by a setup wizard:
     * the app learns where things come from by watching somebody sort their
     * list once, which is the only moment they are actually thinking about it.
     */
    assignments: {},
    /**
     * aisleId -> storeId. The generalization of the above — "we get all our
     * meat at Costco" rather than eleven separate facts about meat. Offered
     * only after the same aisle has been moved a few times, and only once.
     */
    aisleRules: {},
    /** aisleId -> true when the offer above was declined, so it stays declined. */
    declinedRules: {},
    /** Superseded by `assignments`; migrated on load. */
    bulkPicks: {},
    /** recipeIds recently cooked, newest first */
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (err) {
    console.warn('Could not read saved data; starting fresh.', err);
    return defaultState();
  }
}

function migrate(saved) {
  const base = defaultState();
  if (!saved || typeof saved !== 'object') return base;
  // Shallow-merge each top-level section so a new release adding a preference
  // never wipes someone's saved plan.
  return {
    ...base,
    ...saved,
    schema: SCHEMA,
    household: { ...base.household, ...(saved.household || {}) },
    // History used to be a bare list of recipe ids. Those entries are real —
    // they just have no date, so they count as "cooked at some point" and stay
    // out of anything that measures a window of time.
    history: (saved.history || []).map(e =>
      typeof e === 'string' ? { id: e, at: null } : e
    ).filter(e => e && e.id),
    ...migrateStores(base, saved)
  };
}

/**
 * The two-store version of this shipped before the many-store one, so a
 * household that already told the app "Kroger, and Costco for the chicken"
 * must not have to say it twice.
 *
 * `bulkStore` becomes the second entry in `stores`, and every `bulkPicks` id
 * becomes an assignment to it. The old fields are left in place rather than
 * deleted: they cost nothing, and a backup restored into an older build still
 * works.
 */
function migrateStores(base, saved) {
  const prefs = { ...base.prefs, ...(saved.prefs || {}) };
  const assignments = { ...(saved.assignments || {}) };

  if (!(prefs.stores || []).length) {
    prefs.stores = [prefs.store, prefs.bulkStore].filter(Boolean);
  }
  if (prefs.bulkStore && saved.bulkPicks) {
    for (const id of Object.keys(saved.bulkPicks)) {
      if (!assignments[id]) assignments[id] = prefs.bulkStore;
    }
  }

  return {
    prefs,
    assignments,
    aisleRules: { ...base.aisleRules, ...(saved.aisleRules || {}) },
    declinedRules: { ...base.declinedRules, ...(saved.declinedRules || {}) }
  };
}

let saveTimer = null;
function persist() {
  state.updatedAt = new Date().toISOString();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Saving failed — storage may be full.', err);
    }
  }, 120);
}

function emit() {
  for (const fn of listeners) fn(state);
}

export function getState() { return state; }

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Mutate state through a function, then persist and notify. */
export function update(mutator, { silent = false } = {}) {
  mutator(state);
  persist();
  if (!silent) emit();
  return state;
}

/* ------------------------------------------------------------------ *
 * Household
 * ------------------------------------------------------------------ */

export function newMember(partial = {}) {
  return {
    id: uid('m'),
    name: '',
    sex: 'female',
    age: 40,
    heightCm: null,
    weightKg: null,
    activity: 'moderate',
    diet: 'omnivore',
    goal: 'maintain',
    eats: true,
    isCook: false,
    ...partial
  };
}

export function addMember(partial) {
  const m = newMember(partial);
  update(s => { s.household.members.push(m); });
  return m;
}

export function updateMember(id, patch) {
  update(s => {
    const m = s.household.members.find(x => x.id === id);
    if (m) Object.assign(m, patch);
  });
}

export function removeMember(id) {
  update(s => { s.household.members = s.household.members.filter(m => m.id !== id); });
}

/* ------------------------------------------------------------------ *
 * Preferences: liked and disliked ingredients
 * ------------------------------------------------------------------ */

export function setLike(ingredientId, value) {
  update(s => {
    if (value === 0) delete s.likes[ingredientId];
    else s.likes[ingredientId] = value;
  });
}

export function likeValue(ingredientId) {
  return state.likes[ingredientId] || 0;
}

export function setRecipeLike(recipeId, value) {
  update(s => {
    if (value === 0) delete s.recipeLikes[recipeId];
    else s.recipeLikes[recipeId] = value;
  });
}

/* ------------------------------------------------------------------ *
 * Ingredient swaps
 * ------------------------------------------------------------------ */

/**
 * Use something else in one recipe. Keyed by recipe so swapping the garlic in
 * one dish does not quietly change every other dish that uses garlic.
 */
export function setSwap(recipeId, ingredientId, substituteId) {
  update(s => {
    s.swaps = s.swaps || {};
    const forRecipe = s.swaps[recipeId] || (s.swaps[recipeId] = {});
    if (!substituteId) delete forRecipe[ingredientId];
    else forRecipe[ingredientId] = substituteId;
    if (!Object.keys(forRecipe).length) delete s.swaps[recipeId];
  });
}

export function clearSwaps(recipeId) {
  update(s => { if (s.swaps) delete s.swaps[recipeId]; });
}

/**
 * Add something to a dish — the squeeze of lemon, the handful of toasted
 * almonds, the spoonful of miso the flavor panel suggested.
 *
 * The first version of that panel only put the suggestion on the shopping list,
 * which meant tapping it appeared to do nothing: the dish was unchanged, so the
 * panel went on saying there was no crunch in it. An addition is a real
 * ingredient line now, kept per recipe like a swap, and everything downstream —
 * the ingredient list, the nutrition panel, the heart score, the flavor dials
 * and the shopping list — reads it.
 */
export function addToDish(recipeId, line) {
  if (!line?.ing) return;
  update(s => {
    s.additions = s.additions || {};
    const forRecipe = s.additions[recipeId] || (s.additions[recipeId] = []);
    const existing = forRecipe.findIndex(l => l.ing === line.ing);
    // Tapping the same suggestion twice means "yes, more of it" rather than a
    // second identical line nobody can tell apart.
    if (existing >= 0) forRecipe[existing] = { ...forRecipe[existing], qty: forRecipe[existing].qty + line.qty };
    else forRecipe.push({ ...line, added: true });
  });
}

export function removeFromDish(recipeId, ingredientId) {
  update(s => {
    const forRecipe = s.additions?.[recipeId];
    if (!forRecipe) return;
    s.additions[recipeId] = forRecipe.filter(l => l.ing !== ingredientId);
    if (!s.additions[recipeId].length) delete s.additions[recipeId];
  });
}

export function clearAdditions(recipeId) {
  update(s => { if (s.additions) delete s.additions[recipeId]; });
}

export const additionsFor = (recipeId, s = state) => s.additions?.[recipeId] || [];

/* ------------------------------------------------------------------ *
 * Pantry
 * ------------------------------------------------------------------ */

export function togglePantry(ingredientId, force) {
  update(s => {
    const next = force ?? !s.pantry[ingredientId];
    if (next) s.pantry[ingredientId] = true;
    else delete s.pantry[ingredientId];
  });
}

export function clearPantry() {
  update(s => { s.pantry = {}; });
}

/* ------------------------------------------------------------------ *
 * Plan
 * ------------------------------------------------------------------ */

export function addToPlan(recipeId, { day = null, course = 'dinner', servings = null, withOmnivore = true } = {}) {
  const entry = { id: uid('p'), recipeId, day, course, servings, withOmnivore, locked: false, addedAt: Date.now() };
  update(s => { s.plan.push(entry); });
  return entry;
}

export function updatePlanEntry(id, patch) {
  update(s => {
    const e = s.plan.find(x => x.id === id);
    if (e) Object.assign(e, patch);
  });
}

export function removeFromPlan(id) {
  update(s => { s.plan = s.plan.filter(e => e.id !== id); });
}

export function clearPlan({ keepLocked = false } = {}) {
  update(s => { s.plan = keepLocked ? s.plan.filter(e => e.locked) : []; });
}

export function isPlanned(recipeId) {
  return state.plan.some(e => e.recipeId === recipeId);
}

/**
 * How many cooks are kept. A kitchen cooking five nights a week fills a
 * thousand entries in about four years, and an entry is a couple of hundred
 * bytes, so the whole record is smaller than one of the recipe files. The old
 * cap of 120 was three months — short enough that "we make this every winter"
 * was a thing the app forgot every spring.
 */
const HISTORY_MAX = 1000;

/**
 * Record that a meal actually got cooked, as it was actually cooked.
 *
 * Entries carry the date because "what have we been eating lately" is a
 * different question from "have we ever cooked this", and only the first one
 * is worth anything on the progress screen. The same recipe cooked twice in a
 * fortnight is two entries, not one moved to the top — otherwise the record
 * quietly rewrites itself every time you repeat a favorite.
 *
 * The swaps and additions are *snapshotted* rather than looked up later. They
 * live in state as current settings and a household changes its mind; a kitchen
 * that swapped the feta out in June must not be told it did that in March. Only
 * the swaps that touch this dish are kept, so an entry stays small.
 */
export function markCooked(recipeId, at = new Date(), extra = {}) {
  const entry = {
    id: recipeId,
    at: new Date(at).toISOString(),
    ...clean({
      servings: extra.servings,
      fork: extra.fork,
      swaps: Object.keys(extra.swaps || {}).length ? { ...extra.swaps } : undefined,
      added: extra.added?.length ? extra.added.map(l => ({ ...l })) : undefined,
      note: extra.note?.trim() || undefined,
      again: extra.again || undefined
    })
  };
  update(s => { s.history = [entry, ...s.history].slice(0, HISTORY_MAX); });
  return entry;
}

/** Drop the keys with nothing in them, so an entry carries only what happened. */
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));

/**
 * Attach a note, or an answer to "again sometime?", to a cook after the fact.
 *
 * Defaults to the most recent cook of that dish, because the moment somebody
 * has something to say about a meal is while they are eating it — and by then
 * the app has already moved on to another screen.
 */
export function annotateCook(recipeId, patch = {}, { at = null } = {}) {
  update(s => {
    const entry = at
      ? s.history.find(e => e.id === recipeId && e.at === at)
      : s.history.find(e => e.id === recipeId);
    if (!entry) return;
    if ('note' in patch) {
      const note = String(patch.note || '').trim();
      if (note) entry.note = note; else delete entry.note;
    }
    if ('again' in patch) {
      if (patch.again) entry.again = patch.again; else delete entry.again;
    }
  });
}

/** Cooked entries within the last `days`, newest first. */
export function cookedSince(days = 7, now = new Date()) {
  const cutoff = now.getTime() - days * 86400000;
  return state.history.filter(e => e.at && Date.parse(e.at) >= cutoff);
}

/* ------------------------------------------------------------------ *
 * Shopping list extras
 * ------------------------------------------------------------------ */

export function addCustomItem({ name, qty = '', aisle = 'other', note = '' }) {
  const item = { id: uid('c'), name: name.trim(), qty, aisle, note };
  if (!item.name) return null;
  update(s => { s.customItems.push(item); });
  return item;
}

export function updateCustomItem(id, patch) {
  update(s => {
    const it = s.customItems.find(x => x.id === id);
    if (it) Object.assign(it, patch);
  });
}

export function removeCustomItem(id) {
  update(s => {
    s.customItems = s.customItems.filter(i => i.id !== id);
    delete s.checked[id];
  });
}

export function toggleChecked(key, force) {
  update(s => {
    const next = force ?? !s.checked[key];
    if (next) s.checked[key] = true;
    else delete s.checked[key];
  });
}

export function suppressItem(key, on = true) {
  update(s => {
    if (on) s.suppressed[key] = true;
    else delete s.suppressed[key];
  });
}

export function clearChecked() {
  update(s => { s.checked = {}; });
}

export function resetList() {
  update(s => { s.checked = {}; s.suppressed = {}; s.customItems = []; });
}

/* ------------------------------------------------------------------ *
 * Backup / restore
 * ------------------------------------------------------------------ */

export function exportData() {
  return JSON.stringify({ app: 'errerlabs-diets', exportedAt: new Date().toISOString(), state }, null, 2);
}

export function importData(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  const incoming = parsed.state || parsed;
  if (!incoming || typeof incoming !== 'object') throw new Error('That file does not look like a Veg-Nourish backup.');
  state = migrate(incoming);
  persist();
  emit();
  return state;
}

export function resetAll() {
  state = defaultState();
  persist();
  emit();
  return state;
}

/* ------------------------------------------------------------------ *
 * Where things get bought
 *
 * There is no setup wizard here on purpose. The only moment somebody is
 * actually thinking about which store a thing comes from is the moment they
 * are sorting a list, so that is the moment the app listens: move a row, and
 * it remembers. Move three rows out of the same aisle and it offers to
 * generalize, once, and never asks about that aisle again either way.
 * ------------------------------------------------------------------ */

/** The stores this household shops at, home store first. */
export function shoppingStores(s = state) {
  const list = (s.prefs.stores || []).filter(Boolean);
  if (list.length) return list;
  // Nobody has set this up yet — fall back to the single store they already
  // chose, plus the old bulk store if that is how they had it configured.
  return [s.prefs.store, s.prefs.bulkStore].filter(Boolean);
}

export function setStores(ids) {
  update(s => {
    const next = [...new Set(ids.filter(Boolean))];
    s.prefs.stores = next;
    // The home store is the first one, and `prefs.store` is what the rest of
    // the app still reads for a single-store answer.
    if (next.length) s.prefs.store = next[0];
    // Anything pinned to a store that is no longer on the list goes back to
    // having no opinion, rather than silently vanishing from the trip.
    const live = new Set(next);
    for (const [k, v] of Object.entries(s.assignments)) if (!live.has(v)) delete s.assignments[k];
    for (const [k, v] of Object.entries(s.aisleRules)) if (!live.has(v)) delete s.aisleRules[k];
  });
}

/** Pin one ingredient to a store, or pass null to let the rules decide again. */
export function assignItem(ingredientId, storeId) {
  update(s => {
    if (storeId) s.assignments[ingredientId] = storeId;
    else delete s.assignments[ingredientId];
  });
}

/** "We get all our meat at Costco." Null clears it. */
export function setAisleRule(aisleId, storeId) {
  update(s => {
    if (storeId) s.aisleRules[aisleId] = storeId;
    else delete s.aisleRules[aisleId];
    delete s.declinedRules[aisleId];
  });
}

/** Said no to generalizing this aisle. Asked once, then dropped. */
export function declineAisleRule(aisleId) {
  update(s => { s.declinedRules[aisleId] = true; });
}

export function clearStoreMemory() {
  update(s => { s.assignments = {}; s.aisleRules = {}; s.declinedRules = {}; });
}

export function setPref(key, value) {
  update(s => { s.prefs[key] = value; });
}

export { uid };

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
      rollSize: 4,
      theme: 'system'
    },
    /** ingredientId -> 1 (love) | -1 (never) | 0 (neutral) */
    likes: {},
    /** recipeId -> 1 | -1 */
    recipeLikes: {},
    /** recipeId -> { ingredientId: substituteId } — "use this instead, here" */
    swaps: {},
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
    prefs: { ...base.prefs, ...(saved.prefs || {}) },
    // History used to be a bare list of recipe ids. Those entries are real —
    // they just have no date, so they count as "cooked at some point" and stay
    // out of anything that measures a window of time.
    history: (saved.history || []).map(e =>
      typeof e === 'string' ? { id: e, at: null } : e
    ).filter(e => e && e.id)
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
 * Record that a meal actually got cooked.
 *
 * Entries carry the date because "what have we been eating lately" is a
 * different question from "have we ever cooked this", and only the first one
 * is worth anything on the progress screen. The same recipe cooked twice in a
 * fortnight is two entries, not one moved to the top — otherwise the record
 * quietly rewrites itself every time you repeat a favourite.
 */
export function markCooked(recipeId, at = new Date()) {
  update(s => {
    s.history = [{ id: recipeId, at: new Date(at).toISOString() }, ...s.history].slice(0, 120);
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

export function setPref(key, value) {
  update(s => { s.prefs[key] = value; });
}

export { uid };

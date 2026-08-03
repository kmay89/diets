/**
 * shopping.js — turns the plan into a list you can actually shop from.
 *
 * Aggregates every planned recipe down to ingredient totals, subtracts what the
 * pantry already holds, converts grams into how the item is actually sold, and
 * groups the result by supermarket department in walking order.
 *
 * Exports are deliberately plain text first: a newline-separated list pastes
 * cleanly into AnyList, Apple Reminders, Google Keep, Todoist, or a text
 * message, which is how most grocery lists actually move between people.
 *
 * ERRERLabs — MIT licensed.
 */

import { getDb, gramsForLine } from './data.js';
import { formatQty } from './nutrition.js';

/* ------------------------------------------------------------------ *
 * Building
 * ------------------------------------------------------------------ */

/**
 * @param state application state
 * @returns { groups, items, meta }
 */
export function buildList(state, { includeOptional = false, includePantry = false } = {}) {
  const { recipeIndex, ingIndex, aisleIndex, storeLayouts } = getDb();
  const totals = new Map(); // ingredientId -> { grams, sources: [] }

  for (const entry of state.plan) {
    const recipe = recipeIndex.get(entry.recipeId);
    if (!recipe) continue;
    const scale = (entry.servings || recipe.servings) / recipe.servings;

    const lines = [...recipe.ingredients];
    if (entry.withOmnivore && recipe.omnivore?.add) lines.push(...recipe.omnivore.add);
    if (entry.withVegSwap && recipe.vegetarianSwap?.add) lines.push(...recipe.vegetarianSwap.add);

    for (const line of lines) {
      if (line.optional && !includeOptional) continue;
      const grams = gramsForLine(line);
      if (grams == null) continue;
      const rec = totals.get(line.ing) || { grams: 0, sources: [] };
      rec.grams += grams * scale;
      rec.sources.push({
        recipeId: recipe.id,
        title: recipe.title,
        qty: line.qty * scale,
        unit: line.unit,
        prep: line.prep || ''
      });
      totals.set(line.ing, rec);
    }
  }

  const items = [];
  for (const [id, rec] of totals) {
    const item = ingIndex.get(id);
    if (!item) continue;
    const inPantry = !!state.pantry[id];
    if (inPantry && !includePantry) continue;
    if (state.suppressed[id]) continue;

    items.push({
      key: id,
      kind: 'ingredient',
      ingredientId: id,
      name: item.shop?.label || item.name,
      aisle: item.aisle,
      grams: Math.round(rec.grams),
      buy: purchaseQuantity(item, rec.grams),
      detail: rec.sources.map(s => `${formatQty(s.qty, s.unit)} — ${s.title}`),
      sources: rec.sources,
      inPantry,
      checked: !!state.checked[id],
      tips: item.tips || null
    });
  }

  for (const c of state.customItems) {
    if (state.suppressed[c.id]) continue;
    items.push({
      key: c.id,
      kind: 'custom',
      name: c.name,
      aisle: c.aisle || 'other',
      buy: c.qty || '',
      detail: c.note ? [c.note] : [],
      checked: !!state.checked[c.id]
    });
  }

  const layout = storeLayouts[state.prefs.store] || storeLayouts.default;
  const order = layout.order;
  const groups = order
    .map(aisleId => ({
      aisle: aisleIndex.get(aisleId) || { id: aisleId, name: aisleId, icon: '🛒' },
      items: items.filter(i => i.aisle === aisleId).sort((a, b) => a.name.localeCompare(b.name))
    }))
    .filter(g => g.items.length);

  // Anything whose aisle is not in this store's layout still has to be bought.
  const placed = new Set(groups.flatMap(g => g.items.map(i => i.key)));
  const leftovers = items.filter(i => !placed.has(i.key));
  if (leftovers.length) {
    groups.push({ aisle: aisleIndex.get('other'), items: leftovers });
  }

  const meta = {
    store: layout.name,
    storeNote: layout.note || '',
    totalItems: items.length,
    checkedItems: items.filter(i => i.checked).length,
    pantrySkipped: [...totals.keys()].filter(id => state.pantry[id]).length,
    mealCount: state.plan.length
  };

  return { groups, items, meta };
}

/**
 * Convert a gram total into how the thing is actually sold.
 * Produce sold by the each gets rounded up; weights round to the quarter pound.
 */
export function purchaseQuantity(item, grams) {
  const shop = item.shop;
  if (!shop) return `${Math.round(grams)} g`;

  if (shop.unit === 'lb') {
    // "3 carrots" beats "0.25 lb carrots" at the produce bin. Only when the
    // count is small enough to actually pick up by hand.
    const each = item.units?.each;
    if (each) {
      const count = Math.ceil(grams / each - 0.12);
      if (count >= 1 && count <= 8) return String(count);
    }
    const lb = grams / 454;
    const rounded = Math.max(0.25, Math.round(lb * 4) / 4);
    return `${trimNum(rounded)} lb`;
  }

  const per = shop.grams || 1;
  const raw = grams / per;
  // Under a tenth over a whole unit, do not send someone back for another can.
  const count = Math.max(1, Math.ceil(raw - 0.12));
  if (shop.unit === 'each') return String(count);      // "3 avocados", not "3 each avocados"
  return `${count} ${count > 1 ? pluralize(shop.unit) : shop.unit}`.trim();
}

/** "jar (16 oz)" -> "jars (16 oz)": pluralise the noun, leave the size alone. */
const UNCOUNTED = new Set(['dozen', 'lb', 'oz', 'g']);

function pluralize(unit) {
  if (!unit || unit === 'each') return '';
  const [, noun, rest] = unit.match(/^(\S+)(.*)$/) || [];
  if (!noun || UNCOUNTED.has(noun)) return unit;
  if (/(?:s|x|ch|sh)$/.test(noun)) return `${noun}es${rest}`;
  return `${noun}s${rest}`;
}

function trimNum(n) {
  return String(Math.round(n * 100) / 100);
}

/* ------------------------------------------------------------------ *
 * Exports
 * ------------------------------------------------------------------ */

export const EXPORT_FORMATS = {
  plain: {
    label: 'Plain list',
    hint: 'One item per line. Pastes straight into AnyList, Apple Reminders, Google Keep, Todoist or a text message.',
    ext: 'txt', mime: 'text/plain'
  },
  grouped: {
    label: 'Grouped by aisle',
    hint: 'The same list with department headings, in the order you walk the store.',
    ext: 'txt', mime: 'text/plain'
  },
  markdown: {
    label: 'Markdown checklist',
    hint: 'Checkboxes for Notion, Obsidian, GitHub or anywhere that renders Markdown.',
    ext: 'md', mime: 'text/markdown'
  },
  csv: {
    label: 'CSV / spreadsheet',
    hint: 'Item, quantity, aisle, and which meals it is for.',
    ext: 'csv', mime: 'text/csv'
  },
  json: {
    label: 'JSON',
    hint: 'The full structured list, for anything that speaks JSON.',
    ext: 'json', mime: 'application/json'
  }
};

export function formatList(list, format = 'plain', { includeChecked = true, title = 'Shopping list' } = {}) {
  const groups = list.groups
    .map(g => ({ ...g, items: g.items.filter(i => includeChecked || !i.checked) }))
    .filter(g => g.items.length);

  switch (format) {
    case 'plain':
      return groups.flatMap(g => g.items.map(i => itemLine(i))).join('\n');

    case 'grouped':
      return groups.map(g =>
        `${g.aisle.icon || ''} ${g.aisle.name.toUpperCase()}\n` +
        g.items.map(i => `  - ${itemLine(i)}`).join('\n')
      ).join('\n\n');

    case 'markdown':
      return `# ${title}\n\n` + groups.map(g =>
        `## ${g.aisle.icon || ''} ${g.aisle.name}\n` +
        g.items.map(i => `- [${i.checked ? 'x' : ' '}] ${itemLine(i)}`).join('\n')
      ).join('\n\n') + '\n';

    case 'csv': {
      const rows = [['item', 'quantity', 'aisle', 'for', 'have']];
      for (const g of groups) {
        for (const i of g.items) {
          rows.push([i.name, i.buy || '', g.aisle.name, (i.sources || []).map(s => s.title).join('; '), i.checked ? 'yes' : 'no']);
        }
      }
      return rows.map(r => r.map(csvCell).join(',')).join('\n');
    }

    case 'json':
      return JSON.stringify({
        app: 'errerlabs-diets',
        title,
        generatedAt: new Date().toISOString(),
        store: list.meta.store,
        groups: groups.map(g => ({
          aisle: g.aisle.name,
          items: g.items.map(i => ({ name: i.name, quantity: i.buy, grams: i.grams, for: (i.sources || []).map(s => s.title), checked: i.checked }))
        }))
      }, null, 2);

    default:
      return formatList(list, 'plain', { includeChecked, title });
  }
}

function itemLine(i) {
  return i.buy ? `${i.buy} ${i.name}` : i.name;
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* ------------------------------------------------------------------ *
 * Handing the list to other apps
 * ------------------------------------------------------------------ */

/**
 * Deep links that open a store or list app with this item pre-searched.
 * These are ordinary public search URLs — no account is linked and nothing is
 * sent anywhere until you tap one.
 */
export const STORE_LINKS = [
  { id: 'instacart', name: 'Instacart', url: (q) => `https://www.instacart.com/store/s?k=${encodeURIComponent(q)}` },
  { id: 'kroger', name: 'Kroger', url: (q) => `https://www.kroger.com/search?query=${encodeURIComponent(q)}` },
  { id: 'walmart', name: 'Walmart', url: (q) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}` },
  { id: 'target', name: 'Target', url: (q) => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}` },
  { id: 'amazon', name: 'Amazon Fresh', url: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}&i=amazonfresh` },
  { id: 'giant-eagle', name: 'Giant Eagle', url: (q) => `https://www.gianteagle.com/search?q=${encodeURIComponent(q)}` },
  { id: 'heinens', name: "Heinen's", url: (q) => `https://www.heinens.com/search?q=${encodeURIComponent(q)}` }
];

export function mailtoLink(list, { subject = 'Shopping list' } = {}) {
  const body = formatList(list, 'grouped');
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function smsLink(list) {
  return `sms:?&body=${encodeURIComponent(formatList(list, 'plain'))}`;
}

export async function shareList(list, { title = 'Shopping list' } = {}) {
  const text = formatList(list, 'grouped');
  if (navigator.share) {
    await navigator.share({ title, text });
    return 'shared';
  }
  await copyText(text);
  return 'copied';
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  // Fallback for browsers without the async clipboard API.
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'absolute';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  return ok;
}

export function downloadFile(content, filename, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ------------------------------------------------------------------ *
 * Import
 * ------------------------------------------------------------------ */

/**
 * Parse a pasted list back in. Handles "2 cans chickpeas", "- [ ] milk",
 * "* 1 lb carrots" and aisle headings, which covers what the common list
 * apps put on the clipboard.
 */
export function parsePastedList(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    if (/^#{1,6}\s/.test(line)) continue;                       // markdown heading
    if (/^[A-Z0-9 &'’-]{3,}$/.test(line) && !/\d/.test(line)) continue; // ALL CAPS aisle heading
    line = line.replace(/^[-*•]\s*/, '').replace(/^\[[ xX]\]\s*/, '').replace(/^\d+\.\s*/, '');
    if (!line) continue;

    const m = line.match(/^((?:\d+(?:[.,]\d+)?|½|¼|¾|⅓|⅔)\s*[a-zA-Z().]*\s*)(.*)$/);
    let qty = '';
    let name = line;
    if (m && m[2] && /\d|½|¼|¾|⅓|⅔/.test(m[1])) {
      qty = m[1].trim();
      name = m[2].trim();
    }
    if (name) out.push({ name, qty });
  }
  return out;
}

/** Best-effort aisle guess for a free-text item, using ingredient names. */
export function guessAisle(name) {
  const { ingredients } = getDb();
  const n = name.toLowerCase();
  let best = null;
  for (const item of ingredients) {
    const label = item.name.toLowerCase();
    if (n.includes(label) || label.includes(n)) {
      if (!best || label.length > best.len) best = { aisle: item.aisle, len: label.length };
    }
  }
  return best?.aisle || 'other';
}

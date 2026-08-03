# Contributing

Recipes and better nutrition data are the most valuable contributions. The bar is simple: a recipe
should be one somebody would actually cook on a Tuesday, and every number should be traceable.

## Setup

No dependencies and no build step.

```bash
git clone https://github.com/kmay89/diets.git
cd diets
npm start        # http://localhost:8080
npm test         # unit tests + data verification
```

Serve it rather than opening `index.html` from disk — ES modules and service workers need an origin.

## Adding a recipe

Append to `data/recipes.dinners.json` (dinners) or `data/recipes.daily.json` (everything else), then:

```bash
npm run verify && npm run build:graph
```

```jsonc
{
  "id": "rec.kebab-case-name",
  "title": "What it is called",
  "blurb": "One or two sentences that make someone want to cook it.",
  "cuisine": "italian",
  "course": "dinner",            // breakfast | lunch | dinner | side | snack | component
  "servings": 4,
  "activeMin": 20,               // hands-on time
  "totalMin": 45,                // including hands-off time
  "difficulty": "easy",
  "diet": ["vegetarian"],        // what the BASE dish is, before any add-on
  "kidFriendly": true,
  "tags": ["one-pot", "freezer"],
  "season": ["summer"],          // or ["all"]
  "ingredients": [
    { "ing": "ing.onion.yellow", "qty": 1, "unit": "each", "prep": "diced" },
    { "ing": "ing.basil", "qty": 0.25, "unit": "cup", "optional": true }
  ],
  "steps": ["Numbered method. Say why, not just what."],
  "omnivore": {                  // the fork in the road
    "label": "Add browned turkey",
    "note": "Cooked in a separate pan so the vegetarian cook never handles it.",
    "add": [{ "ing": "ing.turkey.ground93", "qty": 0.5, "unit": "lb" }],
    "steps": ["What to do with it."]
  },
  "kidTweak": "…", "restaurantTouch": "…", "garden": "…", "leftovers": "…",
  "source": "ERRERLabs original"
}
```

Rules the verifier enforces:

- Every `ing` must exist, and its `unit` must have a gram weight in that ingredient's `units` map.
- A recipe labeled `vegetarian` may not contain meat or fish in its base; `vegan` may not contain
  any animal product. Honey is vegetarian, not vegan — this has caught real mistakes.
- `totalMin` ≥ `activeMin`, `servings` ≥ 1, method steps present and substantive.
- A non-vegetarian dinner without a `vegetarianSwap` gets a warning, because the cook this app is
  built for is a vegetarian.
- Per-serving nutrition outside plausible ranges gets a warning — look at it before shipping it.

House style for recipe text:

- **Say why.** "Do not salt the mushrooms until they brown" beats "cook the mushrooms".
- **The restaurant touch is one specific technique**, not a garnish suggestion.
- **The kid tweak assumes the kid wins sometimes.** Deconstructing a bowl is a legitimate answer.
- **Finish with acid.** If a recipe has no lemon or vinegar at the end, ask why.
- Salt lightly and let flavor come from spice, browning, umami and acid. That is the whole point of
  the collection.

Only add a recipe you have actually cooked.

## Adding an ingredient

```jsonc
{
  "id": "ing.category.name",
  "name": "Human-readable name",
  "aisle": "produce",                                   // must exist in data/aisles.json
  "units": { "each": 110, "cup": 160, "g": 1 },         // unit -> grams
  "shop": { "unit": "each", "label": "yellow onions", "grams": 110 },
  "per100g": [40,1.1,0.1,0.04,9.3,1.7,4.2,4,146,0,23,0.21],
  "diet": ["vegan","vegetarian","gluten-free"],
  "allergens": [], "tags": ["aromatic"], "subs": ["ing.shallot"],
  "garden": { "grow": true, "difficulty": "easy", "sow": "…", "harvest": "…" }
}
```

`per100g` is in the fixed order documented in
[docs/DATA-SOURCES.md](docs/DATA-SOURCES.md): kcal, protein, fat, saturated fat, carbs, fiber,
sugar, sodium, potassium, cholesterol, calcium, iron — per 100 g of the raw edible portion. Pull
values from [USDA FoodData Central](https://fdc.nal.usda.gov/) and round to one decimal. The
verifier runs an Atwater cross-check and will tell you if the calories and macros disagree.

## Correcting a number

Nutrition corrections are welcome and easy to review. Include the ingredient id, the current value,
the value you believe is right, and the FDC ID or other public source. Same for a garden date that
is wrong for zone 6a, or a store layout that does not match the actual store.

## Code

- Plain ES modules. No framework, no bundler, no dependencies — that is a design constraint, not an
  oversight, and a PR that adds a build step needs to argue for itself.
- Build DOM with the `h()` helper in `js/ui.js`. Never assemble HTML strings from user input.
- Shared math goes in `js/nutrition.js` so the browser and `tools/` cannot drift apart.
- Match the surrounding style: two-space indent, single quotes, semicolons, comments that explain
  reasoning rather than restating the code.
- Run `npm test` before opening a PR. Add a test for any new math.

## Pull requests

One change per PR. Describe what changed and why; for a recipe, say that you cooked it. Be decent
to each other — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

By contributing you agree your work is released under the [MIT License](LICENSE).

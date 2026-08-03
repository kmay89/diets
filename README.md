# Diets

**Roll dinner. Cook once. Feed everyone.**

A private, offline-first meal planner for a household where one person is vegetarian, everyone
else is not, someone in the family is managing heart disease, and nobody has ninety minutes on a
Tuesday. Every dinner has a vegetarian base the whole table eats and a **fork in the road** — one
extra pan for the omnivores — so nothing gets cooked twice.

Built by [ERRERLabs](https://github.com/kmay89). MIT licensed. No account, no server, no analytics.

```
npm run verify        # check the data
npm test              # unit tests + data checks
npm start             # serve at http://localhost:8080
```

Open `http://localhost:8080`, then use your browser's **Add to Home Screen** to install it. After
the first load it runs entirely offline.

---

## What it does

**🎲 Roll, don't browse.** Tell it how many meals you need — or hit *surprise* and let it pick the
number too. It weighs your tastes, the season, what is already in your pantry, your weeknight time
budget, the heart-forward score and the shopping overlap with what has already been rolled, then
deals you a hand. Lock the ones you like, re-roll the rest. Same seed, same roll, so re-rolling one
card never reshuffles the others.

**🌱 One dinner, two ways.** 24 of the 25 dinners have an omnivore add-on written into them — brown
the turkey in a separate skillet, roast the chicken on a third tray, sear the shrimp while the
tortillas warm. The vegetarian cook never handles meat, and nobody eats a compromise. Two recipes
run the other direction: a fish dinner with a vegetarian tray cooked alongside on the same sheet pan.

**❤️ Heart-forward by default.** Low-sodium broth, no-salt-added beans, salty things used as
finishers rather than filler, and acid doing the work salt usually does. Every serving is scored
0–100 on sodium, saturated fat, fiber, potassium-to-sodium ratio and cholesterol, and the score
shows its work — including which ingredients are driving it.

**🏠 It knows your kitchen.** Tick what you have; it drops off the shopping list and pulls matching
meals up the roll. Ingredient checkboxes on the recipe screen double as the pantry, so ticking
things off while you cook keeps everything in sync.

**🛒 A list you can actually shop.** Grams get converted into how things are sold ("1 can", "3
carrots", "¾ lb"), grouped by department in the order you walk the store, with layouts for Heinen's,
Giant Eagle, Acme, Aldi and a farmers-market run. Add and delete items by hand, paste a list in from
somewhere else, and export as plain text, aisle-grouped text, Markdown checklist, CSV or JSON — or
push it straight into AnyList, Reminders, Keep or a text message via the system share sheet.

**🌿 Grown here.** A zone 6a planting calendar for Northeast Ohio: what to sow this month, what is
coming out of the ground, and which recipe to cook with it.

**📴 Yours.** Everything is in your browser's local storage. There is no account and nothing is
uploaded. Back it up to a JSON file whenever you like.

---

## How it is built

No framework, no build step, no dependencies. Plain ES modules, one stylesheet, a service worker,
and JSON data files. It is a static site — put the folder on any web host and it works.

```
index.html              app shell
manifest.webmanifest    PWA manifest (install, shortcuts, icons)
sw.js                   service worker — precaches everything, offline-first
css/app.css             one stylesheet, light + dark + print
js/
  app.js                bootstrap, hash router, install prompt
  store.js              all state, persisted to localStorage
  data.js               data loading, indexes, graph queries
  nutrition.js          portion math, nutrient roll-up, heart score  ← shared with tools/
  roll.js               the dice: scoring, constraints, seeded sampling
  shopping.js           list building, purchase units, exports, import
  ui.js                 ~200 lines of DOM helpers
  views/                one module per screen
data/
  ingredients.json      188 ingredients: nutrition, units, aisle, subs, garden info
  recipes.dinners.json  25 dinners
  recipes.daily.json    19 breakfasts, lunches, sides, sauces and snacks
  aisles.json           department order + store layouts
  garden.json           zone 6a calendar for Hudson, Ohio
  graph.json            generated — the food graph
tools/
  build-graph.mjs       compiles the graph from the source data
  verify-data.mjs       integrity + plausibility checks
  make-icons.py         renders the PNG icons with no image library
test/                   unit tests for the math
```

### The food graph

`data/graph.json` is generated from the source files by `npm run build:graph`. It is a plain JSON
property graph — 479 nodes, 2,407 edges — with typed predicates:

| Predicate | Meaning |
|---|---|
| `CONTAINS` | recipe → ingredient, with quantity, unit and grams |
| `OMNIVORE_ADD` / `VEG_SWAP_ADD` | recipe → the fork-in-the-road ingredients |
| `SUBSTITUTES_WITH` | ingredient → what to use instead |
| `IN_AISLE`, `HAS_TAG`, `SUITS_DIET`, `CONTAINS_ALLERGEN` | classification |
| `YIELDS` | garden crop → the ingredient it produces |
| `SUGGESTS` | month → recipes worth cooking then |
| `SHARES_SHOPPING` | recipe ↔ recipe, weighted by non-staple ingredient overlap |

That last one is what powers "cheap to add" on the plan screen and the shopping-efficiency term in
the roll: it knows that if you are already buying the ingredients for one meal, a second one is
nearly free.

Recipe nodes carry precomputed per-serving nutrition and heart scores so filtering and sorting stay
instant; the app recomputes live whenever you scale servings or toggle the omnivore add-on.

### The numbers

Nutrition is computed from ingredients, never hand-entered per recipe — so scaling a recipe from 4
servings to 6, or adding the chicken, updates every number honestly.

- **Ingredient values** are per 100 g, rounded from [USDA FoodData Central](https://fdc.nal.usda.gov/)
  (public domain). See [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md).
- **Adult energy needs** use Mifflin-St Jeor with an activity factor; **children** use the Dietary
  Guidelines for Americans 2020–2025 reference tables.
- **Portions** convert each person's estimated needs into "serving equivalents" against a reference
  plate, so "serves 4" becomes "cook 4.9 servings for *this* family".
- **Targets** follow American Heart Association guidance in heart-forward mode: 1,500 mg sodium,
  saturated fat under 6% of calories, 14 g fiber per 1,000 kcal.
- **The heart score** is a transparent heuristic, documented in `js/nutrition.js` and shown in full
  on every recipe. Sides, sauces and snacks are deliberately not graded — a good olive oil
  vinaigrette would fail a meal's budget, which would be a bug in the measure, not the dressing.

> **This is a planning tool, not medical advice.** If someone in your house is managing heart
> disease, their cardiologist or a registered dietitian sets the real targets. Nothing here is a
> substitute for that.

---

## Making it yours

**Add a recipe.** Append to `data/recipes.dinners.json` or `data/recipes.daily.json`, then run
`npm run verify && npm run build:graph`. The verifier checks every ingredient reference, every unit,
diet labelling (a "vegetarian" recipe containing chicken is an error), time sanity, and flags
implausible nutrition.

**Add an ingredient.** Append to `data/ingredients.json` with per-100 g values in the documented
order, gram weights for each unit you want to use in recipes, an aisle, and how it is sold. An
Atwater cross-check will warn if the calories and macros disagree.

**Change the store layout.** `data/aisles.json` → `storeLayouts`. Reorder the aisle ids to match how
your store is actually laid out.

**Change the location.** `data/garden.json` carries the frost dates, planting calendar and local
sources. The rest of the app has no geography baked in.

---

## Browser support

Anything current: Chrome/Edge 111+, Safari 16.4+, Firefox 121+. The features it leans on —
ES modules, `<dialog>`, service workers, `color-mix()`, the Web Share API — degrade rather than
break: without Web Share, exports fall back to the clipboard; without a service worker, it still
works online.

## Docs

- [PRIVACY.md](PRIVACY.md) — what is stored and where (short version: on your device, only)
- [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) — where every number comes from
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to add recipes and ingredients
- [SECURITY.md](SECURITY.md) — reporting a vulnerability
- [CHANGELOG.md](CHANGELOG.md)
- [LICENSE](LICENSE) — MIT

---

Made in Hudson, Ohio, for a kitchen where the cook is vegetarian, the rest of the table is not, and
dinner still needs to be on it by six.

# Veg-Nourish

**Roll dinner. Cook once. Feed everyone.**

A private, offline-first meal planner for tables where people eat differently. Every dinner has a
base the whole table can eat and a **fork in the road** — one extra pan for anyone who wants meat —
so nobody cooks twice and nobody eats a compromise.

It starts from nourishment rather than restriction. Nothing here asks you to eat less; it asks what
could go *on* the plate to make it better. There are no streaks, no points and no red numbers,
because the meal you will happily cook again next month is worth more than the perfect meal you
cook once.

**Live: [veg-nourish.com](https://veg-nourish.com)** — open it on your phone and use
**Add to Home Screen**. After the first load it runs entirely offline.

Built by [ERRERLabs](https://github.com/kmay89). MIT licensed. No account, no server, no analytics.

```
npm run verify        # check the data
npm test              # unit tests + data checks
npm start             # serve at http://localhost:8080
```

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

**📤 Share a recipe and it looks like something.** Every recipe has a real page at
`/r/<slug>/` with its own preview card, its own description and schema.org Recipe data — so a link
dropped into iMessage, Messages, Slack or WhatsApp expands into a card with that recipe's title,
timing and numbers, not a bare URL. Tapping it opens a readable page that needs no app and no
JavaScript; if you already use the app, it deep-links you straight to that recipe instead.

**📅 Built for the whole year.** 70 recipes across the days that actually shape cooking:
Thanksgiving and the winter holidays, New Year, cookouts and Labor Day, potlucks, game days, bake
sales, picnics, brunch, feeding a family with a new baby — and fifteen-minute dinners for the nights
when none of that applies.

**📚 Every claim is sourced.** The health, cost and climate statements in this app live in a data
file with their citations attached, rendered with numbered markers you can open. Each source shows
what kind of evidence it is — randomised trial, meta-analysis, model, guideline — and what it *does
not* show. A claim that cannot be sourced cannot be displayed.

**🔊 It feels like something.** Quiet synthesised tones on the actions that deserve them, staggered
card entrances, a dice that tumbles. All of it obeys `prefers-reduced-motion`, none of it plays
before you touch the screen, and one switch turns it off.

**📴 Yours.** Everything is in your browser's local storage. There is no account and nothing is
uploaded. Back it up to a JSON file whenever you like.

---

## How it is built

No framework, no build step, no dependencies. Plain ES modules, one stylesheet, a service worker,
and JSON data files. It is a static site — put the folder on any web host and it works.

```
index.html              app shell
404.html                a friendly dead end that points back into the app
manifest.webmanifest    PWA manifest (install, shortcuts, icons)
netlify.toml            hosting: build checks, headers, CSP, caching, redirects
robots.txt sitemap.xml  crawler basics (sitemap is generated)
site.config.json        name, tagline and canonical URL — the one place identity lives
r/<slug>/index.html     generated — one shareable page per recipe
icons/cards/<slug>.jpg  generated — one link-preview image per recipe
sw.js                   service worker — precaches everything, offline-first
css/app.css             one stylesheet, light + dark + print
js/
  app.js                bootstrap, hash router, install prompt
  store.js              all state, persisted to localStorage
  data.js               data loading, indexes, graph queries
  nutrition.js          portion math, nutrient roll-up, heart score  ← shared with tools/
  roll.js               the dice: scoring, constraints, seeded sampling
  shopping.js           list building, purchase units, exports, import
  citations.js          the citation engine: markers, sources, references
  occasions.js          what is coming up, and what to cook for it
  feedback.js           synthesised sound and micro-animations
  ui.js                 ~200 lines of DOM helpers
  views/                one module per screen
data/
  ingredients.json      208 ingredients: nutrition, units, aisle, subs, garden info
  recipes.dinners.json  25 weeknight dinners
  recipes.daily.json    19 breakfasts, lunches, sides, sauces and snacks
  recipes.occasions.json 26 holiday, cookout, potluck, bake-sale and 15-minute recipes
  occasions.json        the occasion taxonomy
  citations.json        every source, with its evidence type and its caveat
  claims.json           every factual statement, attached to those sources
  aisles.json           department order + store layouts
  garden.json           zone 6a planting calendar (editable for any region)
  graph.json            generated — the food graph
tools/
  build-graph.mjs       compiles the graph from the source data
  verify-data.mjs       integrity + plausibility checks
  make-icons.py         renders the PNG icons with no image library
  build-share-pages.mjs generates /r/<slug>/ pages and the sitemap
  social-card.html      the site-wide link-preview card design
  make-social-card.mjs  renders that card to a PNG (needs a headless browser)
  make-recipe-cards.mjs renders the 44 per-recipe cards (needs a headless browser)
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

## Deploying

The site is static — every file in the repo root is the site. It is hosted on Netlify at
[veg-nourish.com](https://veg-nourish.com), deploying from `main`.

`netlify.toml` carries the whole configuration:

- **Build**: `npm run build:graph && npm run build:share && npm run verify`. There is no bundler;
  the "build" regenerates the food graph and the per-recipe share pages, then validates everything,
  so a bad recipe or an impossible nutrition figure fails the deploy instead of going live. Deploy
  previews and branch builds run the same checks.
- **Headers**: a strict `Content-Security-Policy` (`default-src 'self'`, no `unsafe-inline`
  anywhere), `nosniff`, `frame-ancestors 'none'`, HSTS, and a `Permissions-Policy` that turns off
  every sensor. The app loads nothing from any other origin, so the policy can be this tight and
  stay meaningful.
- **Caching**: `sw.js`, `index.html`, `manifest.webmanifest` and `data/*` are revalidated on every
  request so a release lands immediately; `icons/*` are immutable for a year.
- **Redirects**: a catch-all rewrite to `index.html` for mistyped paths (routing is hash-based, so
  real files always win), and a real 404 for anything under `/data/`.

To host it somewhere else, serve the repo root as a static directory over HTTPS — service workers
require a secure context, and nothing else is needed. `SECURITY.md` has an equivalent CSP for other
servers.

### Link previews

Hash routes never reach the server, so `/#/recipe/...` cannot carry per-recipe metadata — every
shared link would preview identically. Instead `npm run build:share` writes a real page per recipe
at `/r/<slug>/`, each with its own Open Graph tags, its own preview image and schema.org Recipe
data, and the whole recipe rendered into the HTML so it reads fine with no JavaScript.

The images are committed JPEGs (about 54 KB each). Regenerate them, and the site-wide card, after
changing a recipe or the card design:

```
npm i -D playwright
npm run build:cards      # the 44 per-recipe cards
npm run build:social     # the site-wide card, from tools/social-card.html
```

**Changing the domain** is one edit: `site.config.json`, then `npm run build` — every generated
page, card, sitemap entry and canonical URL follows, and `npm run verify` fails if the
hand-maintained files disagree. Whatever host it names must actually be serving the site, because
a link preview fetches `og:image` from that origin.

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

### How claims are handled

The rules the citation engine enforces, and that `npm test` checks:

1. **Claims are data.** Every factual sentence outside a recipe lives in `data/claims.json` with its
   sources attached. A claim with no source can only be displayed if it is explicitly labelled as
   editorial — our view, not a research finding.
2. **Every source carries its caveat.** `data/citations.json` requires a `caveat` field, and the UI
   always shows it. A citation that presents only the flattering half of a study borrows the
   authority of research while discarding what makes research trustworthy.
3. **Evidence types are labelled and not equal.** A randomised trial and a modelling study are
   marked differently, because treating them the same is misleading people politely.
4. **Ranges, not the most dramatic number in them.** Where credible estimates disagree — food's
   share of global emissions is 21–37% depending on the boundary — the app says so.
5. **The limits are stated.** The heart section explains what diet cannot do: it does not clear a
   blockage, does not replace a prescription, and cannot overcome inherited high cholesterol on its
   own. Leaving that out sets people up to feel that illness was a failure of willpower.

---

Built for tables where people eat differently, and dinner still needs to be on it by six.

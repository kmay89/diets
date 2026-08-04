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

**🎨 Every dish is the color of what it is made of.** A grid of identical cards is a grid nobody
scans. So each card takes its color from its own ingredient list, weighted by weight and by how hard
each thing actually stains what it is in: a pot of tomatoes is red, a dal is gold, a mushroom braise
is brown, and the runner-up ingredient tints the far corner so two red dishes still differ. On top of
that sits a pattern derived from how the dish is cooked — a crosshatch is a grill mark, a stipple is
browning, a ripple is a pot at a simmer. Nothing is random and nothing is stored: open the same
recipe next month and it is the same color, because it is made of the same things. The tint is mixed
into whichever theme is running, at a percentage the stylesheet chooses, so it never lands behind
body text and contrast stays the theme's decision rather than the tomato's.

**⚖️ Where the flavor comes from.** Six dials with numbers behind them — salt, fat, acid, savory
depth, sweet and chile heat — plus the two checks a cook makes in the last thirty seconds: is there
anything fresh on this, and is there anything that stays crisp. Salt and fat are counted from the
ingredient database; acid, depth and heat are weighted by how strong each ingredient actually is, so
a teaspoon of cayenne and a teaspoon of gochugaru are not treated as the same amount of anything. A
dial below its band is a prompt with a fix attached — *half a lemon, off the heat, then taste* — and
never a verdict. And when a substitution takes the last acid out of a dish, the panel says so and
hands the acid back.

**↔ Substitutions that keep going.** The old answer to "I don't have that" was the two substitutes
in the database, and if you had neither you had nothing. Now it walks a ladder: what the data says,
then what *those* say, then anything that plays the same part — every bright acid, every melting
cheese, every savory thing in the pantry — then making the missing thing out of what is in the
house, and finally leaving it out with an honest account of what that costs. Everything is ranked
pantry-first, converted to a real amount, and labeled with what it does to the balance of the dish.

**🍳 Pick the protein, then pick what happens to it.** Two decisions a recipe usually conflates. 24
proteins with a per-serving amount converted from the original, and 16 ways to cook them — each with
what it does, why it works, how you know it is done, and how it goes wrong, which is the part a
recipe never prints. Plus the five things worth doing before the heat: salting ahead, pressing,
marinating, drying the surface, and resting.

**🍽 At the table.** The twenty minutes on either side of the pan coming off the heat, which no
recipe covers. A countdown worked back from the recipe's own times, plating that says pile it rather
than spread it, what to eat first, and water guidance that adapts to a salty, sweet, fiber-heavy or
genuinely hot meal. The evidence-based parts carry their sources and their caveats; the myths get a
list of their own.

**🧑‍🍳 Who else can help.** Kitchen jobs matched to a recipe's own steps and sorted by age, from
tearing herbs at three to working the stove at ten — each one saying what it teaches, because a
five-year-old tearing basil is cooking rather than helping. Steps with heat or a blade in them are
named as a grown-up's, per step rather than per recipe, so one boiling pot does not put a whole
dinner out of reach.

**🔪 How cooking works.** The technique library: knife grip and how to cut an onion, what heat
actually is and why gas, electric and induction are three different stoves, which pan for what and
why food lets go when it is ready, the fats argument stated fairly, how much your oven lies to you,
first techniques to teach a child, why cookies do what they do, how to keep berries and lettuce
alive, and whether the dishwasher beats the sink. Matched to the recipe in front of you and
browsable in full.

**🌱 Sorted by what it asks, never by how good you are.** Recipes sit on a ladder from *short and
forgiving* through *one thing to get right* to *worth an afternoon*. Nothing here is labeled easy,
basic or for beginners — a dish that asks for less is not a lesser dish, it is a Tuesday.

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

**🔥 Cook mode.** One step at a time, full screen, on a dark field that does not glare in a dim
kitchen — at a size you can read from a step back with your hands full.

Three things it does that a printed recipe cannot. It tells you **how much of each ingredient this
step wants**, scaled to the servings you are actually cooking — half the oil now and the rest at the
end, a cup of the pasta water held back — because an ingredient list says "2 tbsp olive oil" once and
a method spends it twice. Where the words do not say how something is split, it says so rather than
inventing a fraction. Beside the instruction runs a **minimap** of the whole ingredient list, shrunk:
solid is already in, bright is going in now, faint is still to come, and a tap jumps to the step that
calls for it. And the **timers float above everything and outlive the screen** — start one, walk away,
open the shopping list, close the tab, and it is still counting, because the pot is.

**🧩 The method as a diagram.** Ingredients down the left, brackets to the right, each one swallowing
the ones before it under the thing you do — melt, mix, fold in, bake. It shows what a numbered list
cannot: that the dry ingredients never meet the wet until step four, that the pasta is boiling in
parallel rather than after, how many things are on the go at once. Derived from each recipe's own
method rather than drawn by hand, and a recipe whose steps cannot be traced to its ingredients with
enough confidence keeps its list instead of getting a diagram that guesses.

**🍽 Build a plate.** Start from the shape of a dinner rather than from a recipe: a whole grain, a
vegetable, a protein and something to finish. The heart-forward score and the fiber, sodium and
saturated fat move as you fill the quarters, and it says plainly when the plate does not work for
someone at your table. It never invents a recipe — once there is enough on the plate it finds the
dinners that already cook that combination.

**🌅 Today.** What is for dinner tonight, what is left on the shopping list, and how the week has
gone. The one screen worth opening at five o'clock.

**🌱 Progress without a scoreboard.** Sodium, fiber, saturated fat and plant variety over the last
seven days, counted from meals actually marked cooked. No streaks, no points, no red numbers — a
quiet week is allowed to look like a quiet week.

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

**📅 Built for the whole year.** 89 recipes across the days that actually shape cooking:
Thanksgiving and the winter holidays, New Year, cookouts and Labor Day, potlucks, game days, bake
sales, picnics, brunch, feeding a family with a new baby — and fifteen-minute dinners for the nights
when none of that applies.

**🍯 And a list that is just about being delicious.** Nineteen of those recipes are tagged *crave* —
brown butter and crisped gnocchi, forty-five minutes of caramelized onions under melted Gruyère,
cacio e pepe, birria tacos with a cup of consommé to dunk them in. They are filed under **Lick the
plate** in Recipes, and **Treat night** on the roll screen stops the heart score from steering the
dice for an evening. It never hides the score: a dish that grades an F still shows an F, and says in
plain numbers which ingredient put it there and what to change if you want it lower.

**↔ Swaps that are actually swaps.** No cilantro? Tap the arrow beside it and pick parsley — the
ingredient line changes, and so does the nutrition panel, the heart score and the shopping list. The
amounts are converted rather than copied, because a good number of these pairs are nowhere near one
for one: a clove of garlic is an eighth of a teaspoon of powder, a pound of ground turkey is a cup of
dry lentils. Anything that moves the amount by more than a factor of two has to say why, and the
substitutes offered are filtered to the diet the recipe claims — a vegan dish is never offered honey.

**🎯 Tastes, on every ingredient.** All 227 of them, one collapsed row per aisle with a search across
the lot, so telling the app you will never eat fennel does not mean scanning a wall of buttons. Loved
ingredients get pulled toward the top of every roll; anything marked never leaves the deck entirely.

**📚 Every claim is sourced.** The health, cost and climate statements in this app live in a data
file with their citations attached, rendered with numbered markers you can open. Each source shows
what kind of evidence it is — randomized trial, meta-analysis, model, guideline — and what it *does
not* show. A claim that cannot be sourced cannot be displayed.

**🥑 Every ingredient has a face.** 227 hand-drawn SVG icons, one per ingredient, on the
shopping list, in the pantry and beside every line of a recipe. They are named for the ingredient id,
so adding an ingredient and dropping `icons/food/<slug>.svg` next to it is the whole integration —
there is no manifest to regenerate. Anything without an icon falls back to its aisle, so a partial
set looks deliberate rather than broken.

**🔊 It feels like something.** Quiet synthesised tones on the actions that deserve them, staggered
card entrances, a dice that tumbles. All of it obeys `prefers-reduced-motion`, none of it plays
before you touch the screen, and one switch turns it off.

**📴 Yours.** Everything is in your browser's local storage. There is no account and nothing is
uploaded. Back it up to a JSON file whenever you like.

---

## How it is built

No framework, no build step, no dependencies. Plain ES modules, one stylesheet, a service worker,
and JSON data files. It is a static site — put the folder on any web host and it works.

The typefaces — Newsreader for anything with a voice, Karla for the interface — are self-hosted
variable fonts, subset to latin, about 310 KB in total and precached with everything else. Nothing
is fetched from another origin at runtime, which is what lets the `Content-Security-Policy` stay
`default-src 'self'` with no exceptions.

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
fonts/                  Newsreader and Karla, self-hosted (see fonts/README.md)
js/
  app.js                bootstrap, hash router, install prompt
  store.js              all state, persisted to localStorage
  data.js               data loading, indexes, graph queries
  nutrition.js          portion math, nutrient roll-up, heart score  ← shared with tools/
  roll.js               the dice: scoring, constraints, seeded sampling
  shopping.js           list building, purchase units, exports, import
  citations.js          the citation engine: markers, sources, references
  occasions.js          what is coming up, and what to cook for it
  collections.js        the saved filters behind the browse shelf
  theme.js              the auto/light/dark switch in the top right
  feedback.js           synthesised sound and micro-animations
  swaps.js              substitutions: the ladder, converted through grams
  balance.js            the six flavor dials and the two finishing checks
  proteins.js           which protein, and what to do to it
  table.js              the countdown, the plate, and what to drink
  kitchen.js            kitchen jobs by age, and what a recipe asks for
  tips.js               the technique library, matched to the dish in front of you
  palette.js            what color a dish is, and what pattern its card carries
  timers.js             timers that live outside every view and survive a reload
  cook-steps.js         how much of what, per step, scaled to your servings
  recipe-table.js       the method as a diagram of what meets what, and when
  ui.js                 ~200 lines of DOM helpers
  food-icon.js          the icon per ingredient, and which ones illustrate a step
  views/                one module per screen — today, create, plate, cook, plan,
                        day, recipe, pantry, list, progress, garden, settings, why,
                        learn — plus the panels the recipe screen is assembled from
data/
  ingredients.json      353 ingredients: nutrition, units, aisle, subs, garden info
  recipes.index.json    the table of contents — the one list of recipe part files
  recipes.dinners.json  37 weeknight dinners
  recipes.daily.json    31 breakfasts, lunches, sides, sauces and snacks
  recipes.occasions.json 30 holiday, cookout, potluck, bake-sale and 15-minute recipes
  recipes.world.json    42 dishes from the cuisines of the world
  recipes.regional.json 27 American regional, from the Lowcountry to Hawaii
  recipes.methods.json  20 by method: grill, air fryer, sheet pan, one pot, slow cooker
  recipes.sandwiches.json 12 sandwiches and handhelds
  recipes.snacks.json   16 snacks, dips and smoothies
  recipes.sweets.json   15 desserts, honestly scored
  recipes.easy.json     12 short, forgiving dishes with real jobs for small hands
  balance.json          the flavor model: dials, potencies, bands and the fixes
  substitutions.json    role groups, make-it-yourself combinations, ranking weights
  proteins.json         24 proteins, 16 ways to cook them, 5 things to do first
  table.json            the countdown, plating, eating order, water and the myths
  kitchen.json          age-banded kitchen jobs, the asks ladder, techniques taught
  tips.json             43 technique notes in 9 groups — knives, heat, pans, storage
  palette.json          12 color groups and 6 patterns, both derived from the recipe
  collections.json      54 saved filters in 5 groups — the ways into the collection
  occasions.json        the occasion taxonomy
  citations.json        every source, with its evidence type and its caveat
  claims.json           every factual statement, attached to those sources
  aisles.json           department order + eight store layouts
  garden.json           zone 6a planting calendar (editable for any region)
  graph.json            generated — the food graph
icons/
  food/                 353 ingredient icons, named <slug>.svg
  cards/                per-recipe link-preview images
tools/
  build-graph.mjs       compiles the graph from the source data
  verify-data.mjs       integrity + plausibility checks
  split-food-icons.mjs  cuts the icon contact sheet into per-ingredient SVGs
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

**Add a recipe.** Append to whichever part file fits — they are all listed in
`data/recipes.index.json`, which is the single place the app, the build scripts and the tests read.
A brand new part file is a one-line addition there. Then run `npm run verify && npm run build`. The verifier checks every ingredient reference, every unit,
diet labeling (a "vegetarian" recipe containing chicken is an error), time sanity, and flags
implausible nutrition.

**Add an ingredient.** Append to `data/ingredients.json` with per-100 g values in the documented
order, gram weights for each unit you want to use in recipes, an aisle, and how it is sold. An
Atwater cross-check will warn if the calories and macros disagree. Then run
`npm run build:icons.food`, which draws an icon for anything that does not have one so the set never
has a hole in it — and `npm run build:art`, which lists it in `docs/ART.md` as wanting real art.

**Add a way into the collection.** `data/collections.json`. A collection is a saved filter over
courses, tags and cuisines, so a recipe joins one by being tagged honestly rather than by being
added to a second list.

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
   sources attached. A claim with no source can only be displayed if it is explicitly labeled as
   editorial — our view, not a research finding.
2. **Every source carries its caveat.** `data/citations.json` requires a `caveat` field, and the UI
   always shows it. A citation that presents only the flattering half of a study borrows the
   authority of research while discarding what makes research trustworthy.
3. **Evidence types are labeled and not equal.** A randomized trial and a modeling study are
   marked differently, because treating them the same is misleading people politely.
4. **Ranges, not the most dramatic number in them.** Where credible estimates disagree — food's
   share of global emissions is 21–37% depending on the boundary — the app says so.
5. **The limits are stated.** The heart section explains what diet cannot do: it does not clear a
   blockage, does not replace a prescription, and cannot overcome inherited high cholesterol on its
   own. Leaving that out sets people up to feel that illness was a failure of willpower.

---

Built for tables where people eat differently, and dinner still needs to be on it by six.

# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Cook mode tells you how much.** An ingredient list says "2 tbsp olive oil" once; a method spends
  it twice. Each step now names its own ingredients with the amount *for that step*, scaled to the
  servings actually being cooked — half the oil now and the rest off the heat, a cup of the pasta
  water held back, the rest of the cilantro at the table. Anything that is not simply all of it is
  marked, because that is the case a glance at the ingredient list gets wrong.
- Where the words do not say how something is split, the app says so instead of inventing a fraction.
  A guess printed as a quantity is the exact error this feature exists to prevent.
- **A minimap of the ingredient list**, borrowed from a text editor: solid is already in, bright is
  going in now, faint is still to come, and tapping a row jumps to the step that calls for it. It
  answers the question cook mode could not — where am I, and what is still coming.
- **Timers that outlive the screen.** They now live outside every view, in their own store, written
  to storage on every change. Start one, move to the next step, leave cook mode, open the shopping
  list, close the tab entirely — it is still counting, because it counts against a wall-clock end
  time rather than accumulating in memory. Several at once, because a kitchen with one pot in it is
  not a kitchen, and they float above every screen in a dock that can pause, extend or dismiss them.
- A timer that finished while the app was closed rings on the way back in rather than disappearing.
- **The method as a diagram**, on a toggle beside the steps. Ingredients down the left, brackets to
  the right, each swallowing the ones before it under the thing you do. Derived from each recipe's
  own method — 228 of 242 produce one, and the rest keep their list rather than getting a diagram
  that guesses.

### Changed
- Timers used to stop at an hour, on the reasoning that anything longer was not something to stand
  and watch. That was true when a timer died the moment you left the screen. Now that they survive,
  a ninety-minute bake and a three-hour braise are exactly the things worth being told about.
- An app with no household entered into it shows recipes as written rather than scaling them to a
  single serving, which turned every amount into an eighth of a cup of something.

### Added
- **Every dish is the color of what it is made of.** A grid of 242 identical cards is a grid nobody
  scans, so each card now takes its color from its own ingredient list — weighted by weight and by
  how hard each ingredient actually stains what it is in. A pot of tomatoes is red, a dal is gold, a
  mushroom braise is brown, and the runner-up ingredient tints the far corner so that two red dishes
  are still told apart. Twelve color groups, and a saturated one gets a thumb on the scale against a
  pale one, because people say "the red one" and never "the beige one with red in it".
- **A pattern per way of cooking**, on top of the color. A crosshatch is a grill mark, a stipple is
  browning, a ripple is a pot at a simmer, a scatter is a dish that was never cooked at all. All six
  are CSS gradients — nothing to fetch and nothing for the content policy to argue with.
- Nothing is random and nothing is stored. Open the same recipe next month and it is the same color,
  because it is made of the same things. A recipe can override its own color for the rare dish whose
  identity its ingredients cannot see, and exactly one in the collection does.
- The roll screen's cards gained the art panel they never had, which is where four dinners dealt at
  once most need to look like four different dinners. The recipe page carries a dot of the same
  color, so the page you land on is visibly the dish you tapped.

### Changed
- The tint is mixed into whichever theme is running, at a percentage the stylesheet picks per theme,
  so it never lands behind body text — contrast stays the theme's decision rather than the tomato's.

### Added
- **Where the flavor comes from.** A panel on every recipe that says what is carrying the dish: six
  dials with real numbers behind them — salt, fat, acid, savory depth, sweet and chile heat — and the
  two checks a cook makes in the last thirty seconds, whether anything fresh goes on and whether
  anything stays crisp. Salt and fat are counted from the ingredient database. Acid, depth and heat
  are weighted by how strong each ingredient actually is, so a teaspoon of cayenne is not scored as a
  teaspoon of gochugaru, and a whole lemon is not scored as its weight in juice.
- A dial below its band is a prompt with a fix attached — *half a lemon, off the heat, then taste* —
  never a verdict. It also knows when a dial is being carried: a lightly salted pot with lemon and
  miso in it does not taste under-seasoned, and telling somebody to add salt to it would make the
  dish worse. And when the method says to salt the pasta water, the panel says out loud that it
  cannot count seasoning nobody wrote down.
- **Substitutions that keep going.** The old sheet listed the two substitutes in the database and
  stopped; if you had neither, it had handed you nothing. It now walks a ladder — what the data says,
  what *those* say, anything that plays the same part, making the missing thing out of what is in the
  house, and leaving it out with an honest account of what that costs. 31 role groups and 18
  make-it-yourself combinations, ranked pantry-first, with every option labeled by what it does to
  the balance of the dish: *keeps the acid*, *loses the acid*.
- Amounts across role groups are converted rather than copied. Dry chile heat scales by the heat
  intensities in the flavor model, dried herb against fresh by an explicit three-to-one, a spoon of
  miso against four cups of broth by its own table — and anything outside a plausible multiplier is
  refused rather than printed.
- **Pick the protein, then pick what happens to it.** 24 proteins with a per-serving amount converted
  from the original, and 16 ways to cook them, each carrying what it does, why it works, how you know
  it is done, and how it goes wrong — the part a recipe never prints. Plus the five things worth
  doing before any heat: salting ahead, pressing, marinating, drying the surface, and resting.
  Options are filtered to the recipe's own diet, except on the meat fork, which is the one place
  another meat is the answer.
- **At the table.** The twenty minutes on either side of the pan coming off the heat: a countdown
  worked back from the recipe's own times, plating that says pile it rather than spread it, what to
  eat first, and water guidance that adapts to a salty, sweet, fiber-heavy or genuinely hot meal.
  Five new sources — food order, eating rate, post-meal walking, reflux guidance and the water
  reference intakes — with their caveats attached, plus a short list of the confident nonsense that
  is not true.
- **Who else can help.** Kitchen jobs matched to a recipe's own steps and sorted into five age bands,
  each saying what it teaches, because a five-year-old tearing basil is cooking rather than helping.
  Steps with heat or a blade in them are marked as a grown-up's per step rather than per recipe, so
  one pot of boiling water does not put a whole dinner out of reach of a four-year-old.
- **How cooking works** — a technique library at `#/learn`, and matched to the dish in front of you.
  43 notes in nine groups: knife grip and cutting an onion, what heat is and why gas, electric and
  induction are three different stoves, which pan for what and why food lets go when it is ready, the
  fats argument stated fairly, how much an oven lies about its temperature, slow cookers and air
  fryers, first techniques to teach a child, why cookies do what they do, how to keep berries and
  lettuce alive, and whether the dishwasher beats the sink.
- **12 short, forgiving recipes** with real jobs for small hands in every one — pasta with peas,
  stovetop mac with cauliflower blended into the sauce, tortilla pizzas, a rice bowl with a fried
  egg, three-ingredient banana oat pancakes, smashed cucumbers, black bean and corn salad, and a
  two-minute banana soft serve. Two new collections to find them by: **Cook with kids** and
  **Short and forgiving**.
- Recipes now carry what they *ask for* — short and forgiving, one thing to get right, a few things
  at once, worth an afternoon — read off their own steps and times. Nothing is labeled easy, basic or
  for beginners: a dish that asks for less is not a lesser dish, it is a Tuesday. The vocabulary
  lives in `data/kitchen.json` so it can be argued with, and a test enforces it.
- **What this one teaches you** — the technique hiding in a recipe's own method, matched from its
  text: deglazing, blooming spices, emulsifying with pasta water, salting in layers, not crowding the
  pan. Nobody learns emulsification from a chapter about it; they learn it holding a ladle of pasta
  water.

### Changed
- Amounts now come out in units people count. Eight eggs rather than two and a bit cups of egg, one
  can of chickpeas rather than 2.6 cups, five portobellos rather than seven cups of mushroom.
- A direct substitution with no authored ratio is no longer assumed to be one for one when both sides
  sit in a role group that knows how to scale between them. Swapping a whole lemon for white wine
  vinegar used to suggest 5.6 tablespoons; it now suggests 1.8.
- The swap button appears wherever the ladder has somewhere to go, which is now nearly everywhere,
  rather than only where the database happened to list a direct substitute.
- Storage advice sits on the Pantry screen, where somebody is already looking at what they own.

### Added
- **Shop at as many stores as you actually shop at.** Kroger and Costco, Meijer and Costco, Marc's
  and Aldi — the list splits into a run per store, in the order you tap them, each in its own walking
  order, and prints as headed sections on one sheet. A store you shop at but need nothing from this
  week is left out rather than shown empty.
- **Nine more stores**: Marc's, Walmart, Target, Whole Foods, Trader Joe's and Amazon Grocery join
  Costco and Sam's Club, alongside the chains that were already there. Each carries a note about how
  its trip actually goes.
- **No setup screen, on purpose.** The app learns where things come from by watching somebody sort a
  list once, because that is the only moment they are thinking about it. Move a row and it remembers
  the item. Move three things out of the same aisle to the same store and it offers to generalize —
  *"You keep sending meat & seafood to Costco. Always?"* — inline in that aisle, ignorable, and asked
  once: a "just these" is remembered as firmly as an "always".
- Where an item gets bought resolves in one order: what you said about that exact thing, then what
  you said about its aisle, then home base. Dropping a store releases whatever was filed there rather
  than stranding it on a stop nobody is making.

### Changed
- The old Costco-only "bulk run" is now the general case. An existing two-store setup migrates on
  load — `bulkStore` becomes the second stop and every bulk pick becomes an assignment to it — so
  nobody has to say it twice. The warehouse advice is unchanged and now hangs off any club run.

### Added
- **Costco and Sam's Club, as a second stop rather than another supermarket.** Picking one splits the
  shopping list into two runs — the club first, because that is the trip with the frozen things in it
  — each laid out in its own walking order and printed as two headed sections on the same sheet.
- **A picker for what belongs on the bulk run**, sorted by whether it survives the pack: things that
  keep at the top, things that need freezing next, and the ones a club pack would outlast at the
  bottom with the reason attached. "Take the sensible ones" ticks the first two groups. Choices are
  stored per ingredient, so "we always get the chicken at Costco" only has to be said once.
- **The rot check.** A warehouse pack is only a saving if the food gets eaten, so every ingredient is
  classified from data the app already had — the aisle, and the `pantry`, `storage` and `freezer`
  tags: shelf-stable things are simply worth the big pack; meat, bread and hard cheese are worth it
  *if portioned and frozen the day you get home*; delicate produce and fresh dairy are flagged as
  buy-at-the-regular-store, with the share of a pack this plan actually uses. Forcing one onto the
  club run anyway is allowed — the row just says "will not keep".
- `js/bulk.js` and 12 tests covering the classification against the real ingredient data, including
  that an unknown ingredient fails safe as perishable rather than as a bargain.
- **141 new recipes, taking the collection from 89 to 230.** Whole cuisines rather than a token
  dish each: Sichuan mapo tofu and kung pao, Sapporo miso ramen, Japanese curry, okonomiyaki,
  japchae, kimchi jjigae, pad thai, green curry, pho chay, summer rolls, chana masala, palak paneer,
  dal tadka, mujaddara, falafel, tabbouleh, risotto, pasta alla norma, pesto, ratatouille, French
  onion soup, tortilla española, paella, pozole verde, enchiladas with a real chile sauce, tacos al
  pastor, jerk, feijoada, misir wot, tagine, pierogi, colcannon, adobo, pancit, congrí, paprikash.
  Each one carries the technique that makes it work — the cracked coconut cream, the dark roux, the
  bloomed spices, the one-second dip — and where a step is a shortcut it says so.
- **American regional cooking as ten cuisines rather than one.** The Lowcountry, the Gulf, Texas and
  New Mexico, New England, the Chesapeake, the Upper Midwest, California, the Pacific Northwest,
  Hawaii and Appalachia.
- **Recipes organized by the thing you cook them in** — grill, air fryer, sheet pan, one pot and
  slow cooker — plus sandwiches, snacks and smoothies, and fifteen desserts scored honestly.
- **126 new ingredients**, each with USDA-based per-100 g nutrition, gram weights per unit, aisle,
  substitutions and shopping units.
- **Collections**: 52 saved filters in five groups — what kind of meal, how it gets cooked, cuisines
  of the world, around the United States, and time and effort. A collection is a filter over
  courses, tags and cuisines rather than a second copy of the data, so a recipe joins one by being
  tagged honestly and no list can go stale.
- **An auto/light/dark switch in the top right of every screen.** Three states, not two: Auto
  follows the device and stays following it, which is different from picking light. It writes the
  same preference the Settings screen does, so the two can never disagree, and it moves the browser
  chrome color with it.
- **Recipe cards now carry artwork** — the three ingredients that say what the dish actually is,
  drawn from the icon set. No photography, which is not a thing a household app can maintain for 230
  recipes.
- **An entry hub at the end of setup.** Four named ways in — roll tonight, browse the collection,
  fill the pantry, see the garden plan — because a planner that opens on a dice screen assumes
  everybody wants the dice.
- `tools/make-food-icons.mjs`, which draws an on-style icon for any ingredient that does not have
  one, so the set can never have a hole in it.
- `docs/ART.md` and `tools/art-manifest.mjs`: a generated manifest of every visual asset, what state
  it is in, and the exact brief and prompt for the artwork still worth drawing by hand.
- `data/recipes.index.json`, the collection's table of contents. The app, four build scripts and
  three tests read the list of part files from one place instead of eight.

### Changed
- **The interface now uses the palette the food icons were drawn in** — charcoal ink on warm paper,
  deep green and clay, in both light and dark. Matching the art to the interface is most of why the
  two now look like one thing.
- The browse screen leads with a collection shelf: one row of groups, one row of chips, counts on
  everything.

### Added
- **A real printed page.** The 🖨 buttons no longer print the app. The shopping list becomes a
  single branded sheet — wordmark, one line of context, then checkboxes in aisle order, set in
  columns chosen from how much there is to fit. A week of dinners lands on one side of one piece of
  paper; a fortnight drops one type size and still does. Recipes print the same way: ingredients and
  method, nothing else. Whatever is already in the cart is left off, and the footer says so.
- **Step-by-step home-screen instructions** for every browser that has no install prompt to fire,
  naming the buttons people actually press: Share, then "Add to Home Screen".
- `js/routes.js`, so the router can be checked without a browser, plus a test that every link the
  app builds resolves to a screen.

### Changed
- **The palette and the type.** Warm paper rather than white, deep green, clay and cream, with
  Newsreader carrying the voice and Karla the interface. Same tokens and the same class names, so
  every existing screen inherits it; light, dark and print all still work.
- **The tab bar** is now Today · Plan · Create · List · More. Roll and Recipes moved into Create and
  the More sheet — the dice is the first thing on the Create screen, not a demotion.
- Cooked meals are recorded with the date they were cooked, and repeats are kept as separate
  entries. Existing dateless history is preserved and simply sits outside any window of time.

### Fixed
- `h()` silently dropped CSS custom properties passed in a `style` object — `Object.assign` on a
  `CSSStyleDeclaration` cannot set them — so any element styled through a variable rendered as
  though the value were absent.
- **The occasion card on the roll screen went nowhere.** It linked to `#/browse?occasion=picnic`
  while the route table matched `#/browse` exactly, so the one place advertising fifteen picnic
  recipes led to "That page does not exist." The router now matches on the path and leaves the query
  to the view.
- **The occasion card's title was invisible.** As a `<button>` it inherited the platform button
  color, which on a device set to dark with the app forced light is white on a pale green card.
- **The install banner could not be dismissed.** `[hidden]` loses to any class that sets `display`,
  so the ✕ set the attribute and the banner stayed put. Hiding now wins everywhere, dismissing takes
  the toolbar button with it, and the decision is remembered — with the way back in Settings.
- **Cook mode** (`#/cook/<recipe>`). One step at a time, full screen, deep green so it does not
  glare in a dim kitchen. The ingredients a step names are matched from its own text and drawn
  beside it; durations written into the step become a timer, taking the upper bound of a range.
  Reachable from the recipe page, the plan and tonight's card.
- **Today** (`#/today`) — tonight's dinner, what is left to buy, and the week's trend. It is now the
  screen the app opens on.
- **Create** (`#/create`) — the four honest ways into a meal (the dice, a plate, the pantry, the
  collection) gathered in one place instead of scattered across the tab bar and the More sheet.
- **The plate builder** (`#/plate`) — compose a dinner in four quarters and watch the heart-forward
  score, fiber, sodium and saturated fat move. Flags anyone at the table the plate does not suit,
  and finds the recipes that already cook the combination rather than inventing one.
- **A day view** (`#/day/<day>`) — every meal on one day, in the order it gets eaten, with the day's
  numbers against a whole-day target.
- **Progress** (`#/progress`) — sodium, fiber, saturated fat and plant variety across the last seven
  days, from meals marked cooked. No streaks and no points, in keeping with the rest of the app.
- **Newsreader and Karla**, self-hosted and precached. Three variable `.woff2` files, latin subset,
  about 310 KB, under the SIL Open Font License — see `fonts/README.md`.
- One source (McDonald 2018, American Gut) and the plant-variety claim it supports, so the figure
  quoted on the progress screen carries its evidence and its caveat like every other claim.
- 10 tests for the timer parser and the step-icon matcher, the two places cook mode guesses.

## [2.0.0] — 2026-08-03

Opened up: written for anyone's table, sourced throughout, and stocked for the whole year.

### Added
- **A citation engine.** `data/citations.json` and `data/claims.json` hold every factual statement
  the app makes about health, cost, climate or animals, with the source attached. Claims render with
  numbered markers that open the full record — authors, journal, DOI, the kind of evidence it is,
  and what it does not show. 14 sources, all verified against their publishers.
- **A "Why" screen** covering nourishment, what food does to a heart *and where its power ends*, the
  planet, the grocery bill, and animals. Every number carries its source and its caveat.
- **26 occasion recipes** — Thanksgiving, the winter holidays, New Year, cookouts and Labor Day,
  potlucks, game days, bake sales, picnics, brunch, and fifteen-minute dinners. 70 recipes total.
- **An occasion taxonomy** with an upcoming-occasion card on the roll screen and a filter strip in
  the recipe browser.
- **Sound and motion.** Synthesised tones (no audio files) on rolling, ticking off, adding and
  finishing; staggered card entrances; a tumbling dice. Obeys `prefers-reduced-motion`, never plays
  before a user gesture, and has one switch in Settings.
- 20 more ingredients for the holiday and cookout recipes; 9 new tests for the citation engine and
  the occasion taxonomy.

### Changed
- **The app speaks to everyone now.** The copy, the household templates, the garden calendar and the
  store layouts no longer assume one particular cook in one particular town. The garden data is
  labeled as zone 6a and documented as editable for any region.
- **The intro leads with nourishment**, not restriction: no streaks, no points, no red numbers.
- **Calmer interface.** One spacing scale, lighter elevation, quieter pills, more air. The tab bar
  went from eight items to five with the rest behind More — a row of eight icons is a wall nobody
  reads.
- Filter chips use a tinted "on" state rather than solid fill, so the primary action is the only
  solid green thing on the screen.

### Fixed
- `h()` silently dropped an id written as `tag.class#id`, which is how the More tab shipped without
  one during development. The helper now accepts both forms.
- "1 servings" — counts are pluralised through a helper.

## [1.2.0] — 2026-08-03

Renamed to **Veg-Nourish** and moved to [veg-nourish.com](https://veg-nourish.com).

### Added
- **A shareable page per recipe.** `/r/<slug>/` carries that recipe's own Open Graph and Twitter
  metadata, its own 1200x630 preview image, and schema.org `Recipe` structured data — so a link
  dropped into iMessage, Slack or WhatsApp expands into a card with the recipe's title, timing and
  numbers instead of a bare URL. Hash routes could never do this: a fragment is not sent to the
  server, so every shared link previewed identically.
- The whole recipe is rendered into that page's HTML, so it is readable with no JavaScript at all.
  Visitors who already use the app are forwarded straight to it (`#/recipe/<id>`); everyone else
  gets the page and an invitation.
- **Share** button on the recipe screen, using the Web Share API where it exists and the clipboard
  where it does not. Share links are built from the current origin, so they work from the live site,
  a deploy preview or a laptop.
- 44 per-recipe preview cards (`npm run build:cards`) and generated pages plus sitemap
  (`npm run build:share`).
- `site.config.json` — the one place the public identity lives. Change the URL there, run
  `npm run build`, and every page, card, sitemap entry and canonical follows; `npm run verify` fails
  if the hand-maintained files disagree.
- Service worker now handles a shared recipe link opened offline by bouncing into the app's route
  for that recipe, rather than dropping the visitor on the home screen.
- CI checks that the generated pages are committed and current, that every recipe has a card, and
  that the share pages stay CSP-clean.

### Changed
- App name, manifest, documentation and social card now read Veg-Nourish; the canonical origin is
  `https://veg-nourish.com`.
- The heart-score badge appears on a share card only when it is an A or a B. The score is an
  internal sorting heuristic with a page of caveats attached, and a letter on a public card would
  read as a verdict to someone who never sees that page.
- Netlify build now runs `build:share` too, so an edited recipe cannot ship with a stale share page.
- Service worker cache bumped to `v1.2.0`.

### Unchanged on purpose
- The `localStorage` key stays `errerlabs.diets.v1`. Renaming it would silently wipe every existing
  household's plan, pantry and preferences.

## [1.1.0] — 2026-08-03

Went live at [veg-nourish.com](https://veg-nourish.com).

### Added
- `netlify.toml`: build runs `build:graph` + `verify`, so invalid data fails the deploy rather than
  shipping. Strict `Content-Security-Policy` with no `unsafe-inline`, HSTS, `nosniff`,
  `frame-ancestors 'none'`, and a `Permissions-Policy` that disables every sensor. Immutable caching
  for icons, revalidate-always for `sw.js`, `index.html`, the manifest and the data files. Catch-all
  rewrite to the app for mistyped paths, and a real 404 under `/data/`.
- Open Graph and Twitter card metadata, plus a rendered 1200x630 link-preview card
  (`icons/social-card.png`, designed in `tools/social-card.html`).
- `404.html`, `robots.txt`, `sitemap.xml`, and a canonical URL.
- `npm run build:social` to regenerate the preview card.

### Changed
- Removed the inline `onclick` handlers from `index.html` and wired the install buttons in
  `js/app.js`, so the page needs no `unsafe-inline` in its script policy.
- The install banner can be dismissed for good, and the app bar's Install button now appears with
  the banner. Added an `appinstalled` handler.
- Service worker cache bumped to `v1.1.0`; it now precaches the favicon and the 404 page.

### Fixed
- `tools/make-icons.py` wrote a square PNG header regardless of the image's real dimensions, which
  corrupted any non-square output.

## [1.0.0] — 2026-08-03

First release.

### Added
- **Meal roll** — weighted, seeded selection across household tastes, season, pantry contents, time
  budget, heart score, variety and shopping overlap. Pick a count from 1 to 7 or roll a random
  number of meals. Lock cards, re-roll individual slots, hide recipes permanently.
- **Fork in the road** — 24 of 25 dinners carry an omnivore add-on cooked in a separate pan; two
  omnivore-primary dinners carry a vegetarian tray instead. Nutrition is computed for both.
- **Recipes** — 44 originals: 25 dinners, 6 breakfasts, 6 lunches, and 7 sides, sauces and snacks.
  Each with a restaurant touch, a kid tweak, a garden note and a leftovers plan.
- **Food graph** — 188 ingredients and 479 nodes / 2,407 edges of typed relationships, generated by
  `tools/build-graph.mjs`, covering containment, substitution, aisle, diet, allergens, garden crops
  and recipe-to-recipe shopping overlap.
- **Nutrition engine** — per-serving figures computed from ingredients, portion sizing from
  Mifflin-St Jeor (adults) and DGA reference tables (children), AHA-aligned targets, and a
  transparent heart-forward score that shows its arithmetic and names the ingredients driving it.
- **Pantry** — every ingredient by aisle, ticking through from the recipe screen.
- **Shopping list** — aisle-ordered with five store layouts, gram totals converted to purchase
  units, hand-added items, paste-in import, and export as plain text, aisle-grouped text, Markdown,
  CSV or JSON, plus share sheet, email, SMS, print and per-item retailer search links.
- **Garden** — zone 6a planting calendar for Hudson, Ohio, tied to the recipes each month unlocks.
- **Onboarding** — household, health focus, time budget, taste map and pantry in seven steps.
- **PWA** — installable, offline after first load, app shortcuts, maskable icons, light and dark
  themes, print stylesheets.
- **Privacy** — all state local to the device; JSON backup and restore; one-tap erase.
- Data verification (`npm run verify`) and unit tests (`npm test`).

[2.0.0]: https://github.com/kmay89/diets/releases/tag/v2.0.0
[1.2.0]: https://github.com/kmay89/diets/releases/tag/v1.2.0
[1.1.0]: https://github.com/kmay89/diets/releases/tag/v1.1.0
[1.0.0]: https://github.com/kmay89/diets/releases/tag/v1.0.0

# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Fixed
- **The occasion card on the roll screen went nowhere.** It linked to `#/browse?occasion=picnic`
  while the route table matched `#/browse` exactly, so the one place advertising fifteen picnic
  recipes led to "That page does not exist." The router now matches on the path and leaves the query
  to the view.
- **The occasion card's title was invisible.** As a `<button>` it inherited the platform button
  colour, which on a device set to dark with the app forced light is white on a pale green card.
- **The install banner could not be dismissed.** `[hidden]` loses to any class that sets `display`,
  so the ✕ set the attribute and the banner stayed put. Hiding now wins everywhere, dismissing takes
  the toolbar button with it, and the decision is remembered — with the way back in Settings.

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
  labelled as zone 6a and documented as editable for any region.
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

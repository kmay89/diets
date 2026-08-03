# Privacy

**Short version: everything stays on your device. There is no account, no server, and no analytics.
We cannot see your data because it never leaves your browser.**

Last updated: 2026-08-03 · Applies to: Veg-Nourish v2.0.0 (ERRERLabs)

---

## What the app stores

All of it lives in your browser's `localStorage` under a single key, `errerlabs.diets.v1`:

| What | Why |
|---|---|
| Household members — name, age, sex, height, weight, activity level, diet, goal | Portion sizing and calorie/nutrient targets |
| Preferences — heart-forward mode, time budget, allergens to avoid, store layout, theme | Filtering and sorting meals |
| Liked and disliked ingredients, favorited and hidden recipes | Weighting the roll |
| Pantry — which ingredients you have on hand | Removing them from the shopping list |
| Meal plan — recipes, servings, which night | The plan and shopping list screens |
| Shopping list — hand-added items, what is ticked off | The list screen |
| Cooking history — recipe ids you marked as cooked | Not repeating meals too soon |
| A flag if you dismissed the install banner | Not asking again |
| Whether sound is switched on | Remembering your choice |

That is the complete list. Health and household details are the most sensitive things here, which
is exactly why they are stored the way they are: locally, in one place, under your control.

## What the app does not do

- No account, login, email address or password.
- No server. There is no backend to send anything to.
- No analytics, telemetry, crash reporting, session recording, A/B testing or feature flags.
- No cookies. No advertising or tracking pixels. No third-party scripts of any kind — the app loads
  nothing from any other origin, and its service worker refuses to handle cross-origin requests.
- No background sync, no cloud backup, no "anonymous usage statistics".

## When the network is used at all

1. **The first load**, to download the app and its data files. After that the service worker serves
   everything from your device and the app works with no connection.
2. **Update checks** for the app files, when you open it while online.
3. **Only if you tap them:** the store links on a shopping-list item (Instacart, Kroger, Walmart,
   Target, Amazon Fresh, Giant Eagle, Heinen's) open that retailer's ordinary public search page in
   a new tab with the item name in the URL. Nothing else about your list, plan or household is
   included, and nothing is sent unless you tap. Once you are on their site, their privacy policy
   applies, not this one.
4. **Only if you use them:** *Email* and *Text* hand the list to your own mail or messaging app;
   *Send to my list app* and *Share* on a recipe use your device's share sheet. In every case the
   data goes where you send it, chosen by you at that moment.
5. **Sharing a recipe** sends nothing but a link. The messaging app you send it to — iMessage,
   Slack, WhatsApp — will fetch that page itself to build its preview card, the same as any link.
   The page it fetches is a public recipe page; it contains no information about you, your
   household or your plan.

## Who else can see it

Anyone who can use your unlocked device and open this site in your browser profile. `localStorage`
is not encrypted. If your device is shared, protect it the way you would protect anything else in
your browser.

## Deleting your data

- **In the app:** Settings → *Erase all my data*. This clears everything immediately.
- **In your browser:** clearing site data or cookies for this site deletes it just as completely.
- **Uninstalling** the home-screen app removes it on most platforms.

There is no copy anywhere else, so once it is gone it is gone. If it matters to you, use
Settings → *Download a backup* first, which writes a JSON file to your device and nowhere else.

## Data your browser stores on its own

The service worker keeps a cache of the app files and recipe data (a Cache Storage entry named
`errerlabs-diets-v2.0.0`). It contains only the app itself — no personal data — and is cleared with
your site data.

## Children

The app has no accounts and collects nothing, so there is nothing to collect from a child. If you
enter a child's age or weight for portion sizing, that stays on your device under exactly the same
terms as everything else.

## Hosting

The public copy at **veg-nourish.com** is served by Netlify as static files. Like any web host,
Netlify can see ordinary server request logs — IP address, time, and which files were requested —
for the initial download of the app. It never sees your household, your plan or your list, because
those are never sent anywhere. After the first visit the service worker serves the app from your
device, so even those request logs largely stop.

Netlify's own privacy practices are theirs, not ours: <https://www.netlify.com/privacy/>. The site
is configured with no Netlify Analytics, no forms, no serverless functions and no edge functions —
there is nothing on the server side to collect anything.

If you self-host or fork this, the same holds for whichever host you use. That is a property of the
host, not the app; the app itself sends nothing.

## Changes

Any change to what is stored or where it goes will be recorded in [CHANGELOG.md](CHANGELOG.md) and
reflected here, with the date above updated.

## Contact

Questions, or something here that does not match what you observe: open an issue at
<https://github.com/kmay89/diets/issues>. Please do not include personal health details in a public
issue.

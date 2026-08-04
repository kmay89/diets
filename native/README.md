# Veg-Nourish for iOS

The App Store shell around the web app. Everything in this folder exists so
that the site at the repo root does not have to change: it has no build step
and no runtime dependencies, and it keeps both.

## Why an app at all

Almost everything people ask an app for, this one already does in a browser.
It works offline, installs to the home screen, keeps all its data locally and
never talks to a server. Memory, the technique map and the cookbook are web
features and shipped as such.

Three things genuinely need the shell:

**Notifications.** A timer that only rings while the app is open is not a
kitchen timer, it is a stopwatch. iOS Safari cannot schedule a local
notification for a future time; a native shell can, and the timers now do —
scheduled with the OS at the moment they start, so they fire with the phone
locked and the cook in another room. This is the reason to be here.

**Haptics.** A tap you can feel is a tap you do not have to look at, which
matters with wet hands and a phone propped against the toaster.

**The status bar**, which the web cannot reach, and which is the most obvious
tell that an app is a website in a box.

## Building it

Requires macOS with Xcode. Nothing here builds on Linux, so CI does not try.

```sh
cd native
npm install
npm run add:ios      # first time only — creates native/ios
npm run ship         # assembles www, syncs, and opens Xcode
```

Then in Xcode: pick a team under **Signing & Capabilities**, choose a device or
simulator, and run.

Day to day, after changing anything in the web app:

```sh
npm run sync         # re-copies the site into www and syncs the native project
```

## What gets bundled

`scripts/sync-web.mjs` assembles `www/` from the repo root. The file list is
read out of `sw.js` rather than kept by hand — a hand-kept list goes stale the
week after somebody adds a module, and the symptom is a blank screen on a phone
rather than an error anybody sees at build time.

Left out on purpose: `icons/cards` and `icons/social-card.png`, which exist so
a pasted link looks right in a message. They are read by crawlers and preview
fetchers, never by the app, and they are 14 MB of what is otherwise a 6 MB
bundle. The food icons, which the app does render, come along in full.

`www/`, `ios/` and `node_modules/` are all generated and none are committed.

## How the app talks to the shell

`js/native.js`, in the web app, is the only file that knows any of this exists.
It uses the `window.Capacitor` global the native runtime injects into the
WebView rather than importing an npm package, which is what lets the site stay
build-step-free: in a browser the global is absent, every function is a no-op,
and the deployed site is byte for byte what it was.

Nothing else in the app branches on platform. `js/timers.js` calls `notifyAt`
when a timer's end moves and `cancelNotification` when it stops; on a phone
those become real alarms, and on the web they become nothing, because on the
web there is nothing they could become.

## Before submitting

- [ ] Bump `version` in the repo root `package.json` and `CFBundleShortVersionString`
- [ ] Check the notification permission prompt appears on the *first timer*, not at launch
- [ ] Start a timer, background the app, lock the phone, confirm it fires
- [ ] Tap the notification and confirm it opens that recipe at that step
- [ ] Check the status bar in both light and dark appearance
- [ ] Run once in airplane mode from a cold start — everything must work
- [ ] Privacy nutrition label: **no data collected**. That is not a
      simplification; the app has no network calls of its own and no analytics.
      See `PRIVACY.md`.

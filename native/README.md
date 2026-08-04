# Veg-Nourish, on Apple platforms

One repository, four places it runs. Three of them are the same code; one is not,
and the difference is worth being clear about before you open Xcode.

| Where | What it is | Built from |
|---|---|---|
| iPhone | Capacitor WebView app | the site at the repo root |
| iPad | the same target, universal | the same, with a sidebar past 768pt |
| Mac | the same target under Mac Catalyst | the same again |
| Apple Watch | a native SwiftUI app | `native/watch/` |

## Why the watch is different

**watchOS has no web view.** Not a restricted one — none. `WKWebView` does not
exist on the platform, so there is no version of "run the app on the watch". The
watch app is Swift, and it always will be.

That turns out to be the right constraint anyway. The watch is not this app made
small; it is the three things you want when your hands are in a bowl and the
phone is on the other counter:

- **the timers** — the reason to want a cooking app on a wrist at all
- **the step** — what goes in next, and how much of it
- **the list** — because a shopping list belongs on a wrist in a shop

The 242 recipes, the flavor panel, the technique map and the cookbook stay on the
phone, where there is room to read them. A watch app that tries to be a recipe
browser is one nobody opens twice.

## Building

Requires macOS with Xcode. Nothing here builds on Linux, so CI does not try.

```sh
cd native
npm install
npm run add:ios      # first time only — creates native/ios
npm run ship         # assembles www, syncs, opens Xcode
```

### iPhone and iPad

Works out of the box. In the target's **General** tab, check that **iPhone** and
**iPad** are both ticked under Supported Destinations. Nothing else to do — the
web app grows a sidebar past 768pt, which is iPad portrait.

### Mac

Add **Mac (Designed for iPad)** or **Mac Catalyst** under Supported Destinations
on the same target. Catalyst gives a real Mac app with a real title bar; the
"Designed for iPad" option is one checkbox and ships the iPad build unchanged.

Either way the web app already handles it: sidebar navigation, a readable
measure on long text however wide the window, hover states behind
`@media (hover: hover)`, and arrow keys and space to move through cook mode.

### Apple Watch

1. **File → New → Target → Watch App**, embedded in the Veg-Nourish app.
   Interface: **SwiftUI**. Life cycle: **SwiftUI App**.
2. Delete the generated `ContentView.swift` and `…App.swift`.
3. Drag every file from `native/watch/` into the watch target.
4. Add **WatchBridge.swift** and **WatchBridge.m** from `native/ios-app/` to the
   *iOS* target — not the watch one. That is the phone's half.
5. Build and run on a paired watch or the simulator.

`WatchBridge.m` is not optional. Capacitor discovers plugins through the
Objective-C runtime, so a Swift-only plugin compiles, loads, and is silently
absent from `window.Capacitor.Plugins` — a confusing way to spend an afternoon.

## How the pieces talk

```
   web app  ──  js/native.js  ──  Capacitor plugins  ──  iOS / iPadOS / macOS
                js/watch.js   ──  WatchBridge (Swift)
                                        │  WatchConnectivity
                                        ▼
                                  native/watch/  ──  watchOS
```

`js/native.js` and `js/watch.js` are the only two files in the web app that know
any of this exists, and both talk to the injected `window.Capacitor` global
rather than importing a package — which is what lets the site keep having no
build step and no runtime dependencies. In a browser both are no-ops.

State goes to the watch through `updateApplicationContext`: it coalesces and it
survives the watch being asleep, so the phone can push twenty times while nobody
is looking and only the last one is delivered. Commands come back through
`sendMessage`, which arrives now or not at all — which is what a button press on
a wrist is.

Timers cross as **`endsAt` wall-clock times**, never as seconds remaining, so the
watch counts on its own clock and stays right with the phone asleep, in another
room, or out of range. The watch also caches the last snapshot to disk: launched
cold and out of range it shows the timers it knew about a minute ago, because a
stale timer you can still read beats a blank screen.

The phone owns where the cook is. The watch sends "next step" rather than
tracking its own position — two devices each keeping their own idea of the
current step is two devices that will eventually disagree, in a kitchen, out
loud.

## What gets bundled

`scripts/sync-web.mjs` assembles `www/` from the repo root, reading the file list
out of `sw.js` rather than keeping its own copy — a hand-kept list goes stale the
week after somebody adds a module, and the symptom is a blank screen on a phone
rather than an error at build time.

Left out on purpose: `icons/cards` and `icons/social-card.png`, which exist so a
pasted link looks right in a message. They are read by crawlers and preview
fetchers, never by the app, and they are 14 MB of what is otherwise a 6 MB
bundle.

`www/`, `ios/` and `node_modules/` are generated. None are committed.

## Before submitting

- [ ] Bump `version` in the repo root `package.json` and `CFBundleShortVersionString`
- [ ] Notification permission appears on the **first timer**, not at launch
- [ ] Start a timer, background the app, lock the phone — it fires
- [ ] Tap the notification — it opens that recipe at that step
- [ ] On iPad: rotate both ways, check the sidebar and that nothing is clipped
- [ ] On Mac: resize from narrow to full screen, check the text measure holds
- [ ] On the watch: start a timer on the phone, confirm it appears and counts
- [ ] Put the phone in airplane mode — the watch keeps counting from `endsAt`
- [ ] Cook mode on the phone, "Next" on the watch — the phone moves
- [ ] Run once in airplane mode from a cold start — everything must work
- [ ] Privacy nutrition label: **no data collected**. Not a simplification — the
      app has no network calls of its own and no analytics. See `PRIVACY.md`.

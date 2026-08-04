//
//  VegNourishWatchApp.swift — the wrist app.
//
//  Two screens, because a watch is a glance and one button. Timers, which are
//  the reason to want a cooking app on a wrist at all, and the step you are on,
//  which is the thing you cannot read when your hands are in a bowl and the
//  phone is on the other counter. The shopping list is a third tab for a shop.
//
//  Everything else — 242 recipes, the flavor panel, the technique map, the
//  cookbook — stays on the phone, where there is room to read it. A watch app
//  that tries to be a recipe browser is one nobody opens twice.
//
//  ERRERLabs — MIT licensed.
//

import SwiftUI

@main
struct VegNourishWatchApp: App {
    @StateObject private var link = WatchLink.shared

    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(link)
        }
    }
}

struct RootView: View {
    @EnvironmentObject var link: WatchLink

    var body: some View {
        TabView {
            TimersView()
            StepView()
            ShoppingView()
        }
        .tabViewStyle(.page)
    }
}

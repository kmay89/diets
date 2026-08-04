//
//  TimersView.swift — the timers, on the wrist.
//
//  The whole reason this app exists. A timer that rings on a phone across the
//  kitchen is a timer you miss; one that taps your wrist is one you do not.
//
//  It keeps the phone's tone exactly. Nothing pulses, nothing turns red, and a
//  finished timer never says "done" — the timer is done, the food might not be,
//  and a watch that passes verdicts on food nobody has looked at is a watch that
//  teaches somebody to underbake things with confidence. It says "have a look",
//  and it says what to look for, in the recipe's own words.
//
//  ERRERLabs — MIT licensed.
//

import SwiftUI

struct TimersView: View {
    @EnvironmentObject var link: WatchLink

    /// Redraw once a second. The count itself is derived from `endsAt`, so this
    /// only moves the digits — a missed tick shows the right number anyway.
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    @State private var now = Date()

    var body: some View {
        ScrollView {
            if link.kitchen.timers.isEmpty {
                VStack(spacing: 6) {
                    Text("No timers")
                        .font(.headline)
                    Text("Start one on your phone and it appears here.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 24)
            } else {
                VStack(spacing: 8) {
                    ForEach(link.kitchen.ringing) { TimerCard(timer: $0, ringing: true) }
                    ForEach(link.kitchen.counting) { TimerCard(timer: $0, ringing: false) }
                }
            }
        }
        .navigationTitle("Timers")
        .onReceive(tick) { now = $0 }
    }
}

struct TimerCard: View {
    @EnvironmentObject var link: WatchLink
    let timer: WatchTimer
    let ringing: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(timer.label)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)

            if ringing {
                Text(timer.callToAction)
                    .font(.headline)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text(timer.clock)
                    .font(.system(.title2, design: .rounded).monospacedDigit())
            }

            HStack(spacing: 6) {
                if ringing {
                    Button("+2 min") { link.send("timer.more", ["id": timer.id, "seconds": 120]) }
                    Button("Got it") { link.send("timer.clear", ["id": timer.id]) }
                } else {
                    Button(timer.paused ? "Resume" : "Pause") {
                        link.send("timer.toggle", ["id": timer.id])
                    }
                    Button("Stop") { link.send("timer.clear", ["id": timer.id]) }
                }
            }
            .font(.caption2)
            .buttonStyle(.bordered)

            if timer.paused {
                Text("Paused — nothing is counting")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(ringing ? Color.orange.opacity(0.28) : Color.gray.opacity(0.16),
                    in: RoundedRectangle(cornerRadius: 12))
    }
}

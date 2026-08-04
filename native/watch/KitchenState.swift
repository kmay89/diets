//
//  KitchenState.swift — what the phone sends, and how the watch holds it.
//
//  The payload is deliberately small and deliberately absolute. Timers arrive
//  as `endsAt` wall-clock milliseconds rather than as seconds remaining, so the
//  watch counts on its own clock and stays correct with the phone asleep, in
//  another room, or out of Bluetooth range. A payload of "4:12 left" would be
//  wrong the moment it arrived late.
//
//  ERRERLabs — MIT licensed.
//

import Foundation

struct WatchTimer: Codable, Identifiable, Equatable {
    let id: String
    let label: String
    let cue: String
    /// Epoch milliseconds. Nil when paused — then `left` is the truth.
    let endsAt: Double?
    let left: Int
    let done: Bool
    let paused: Bool

    /// Seconds remaining, worked out here rather than trusted from the phone.
    var remaining: Int {
        guard let endsAt else { return max(0, left) }
        return max(0, Int((endsAt - Date().timeIntervalSince1970 * 1000) / 1000))
    }

    /// "12:04". Hours only appear when there are hours, so a 4-minute sear does
    /// not read as 0:04:00 on a screen this size.
    var clock: String {
        let s = remaining
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, m, sec)
            : String(format: "%d:%02d", m, sec)
    }

    /// Never the word "done": the timer is done, the food might not be.
    var callToAction: String {
        cue.isEmpty ? "Have a look" : "Have a look — until \(cue)"
    }
}

struct WatchStep: Codable, Equatable {
    let recipe: String
    let index: Int
    let total: Int
    let text: String
    let wants: [WatchAmount]

    var position: String { "Step \(index + 1) of \(total)" }
}

struct WatchAmount: Codable, Equatable, Identifiable {
    let name: String
    let amount: String
    var id: String { name + amount }
}

struct WatchListItem: Codable, Identifiable, Equatable {
    let key: String
    let name: String
    let qty: String
    let checked: Bool
    var id: String { key }
}

struct KitchenState: Codable, Equatable {
    var at: Double = 0
    var timers: [WatchTimer] = []
    var step: WatchStep?
    var list: [WatchListItem] = []

    static let empty = KitchenState()

    var ringing: [WatchTimer] { timers.filter { $0.done } }
    var counting: [WatchTimer] { timers.filter { !$0.done } }
}

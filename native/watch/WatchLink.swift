//
//  WatchLink.swift — the wire between the wrist and the phone.
//
//  WatchConnectivity, used the boring way: `updateApplicationContext` for state
//  because it is coalescing and survives the watch being asleep — the phone can
//  push twenty times while nobody is looking and only the last one is delivered,
//  which is exactly right for "here is the kitchen right now" — and
//  `sendMessage` for commands, which need to arrive now or not at all.
//
//  The last payload is also written to disk. A watch app launched cold with the
//  phone out of range should show the timers it knew about a minute ago rather
//  than an empty screen, because a stale timer you can still read is worth more
//  than a blank one.
//
//  ERRERLabs — MIT licensed.
//

import Foundation
import WatchConnectivity

final class WatchLink: NSObject, ObservableObject, WCSessionDelegate {
    @Published private(set) var kitchen: KitchenState = .empty
    @Published private(set) var reachable = false

    static let shared = WatchLink()

    private let cacheURL: URL = {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent("kitchen.json")
    }()

    override init() {
        super.init()
        kitchen = loadCached() ?? .empty
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: sending

    /// A command the wrist can give. Fire-and-forget: if the phone is not
    /// reachable there is nothing useful to say about it on a watch face, and
    /// an error alert about Bluetooth is not what somebody holding a hot pan
    /// needs to read.
    func send(_ type: String, _ extra: [String: Any] = [:]) {
        guard WCSession.default.isReachable else { return }
        var payload: [String: Any] = ["type": type]
        payload.merge(extra) { _, new in new }
        WCSession.default.sendMessage(payload, replyHandler: nil, errorHandler: nil)
    }

    // MARK: receiving

    private func absorb(_ raw: Any?) {
        guard
            let json = raw as? String,
            let data = json.data(using: .utf8),
            let next = try? JSONDecoder().decode(KitchenState.self, from: data)
        else { return }

        // Out-of-order delivery is possible and an older snapshot overwriting a
        // newer one would show a timer that has already been dismissed.
        guard next.at >= kitchen.at else { return }

        DispatchQueue.main.async {
            self.kitchen = next
            try? json.data(using: .utf8)?.write(to: self.cacheURL, options: .atomic)
        }
    }

    private func loadCached() -> KitchenState? {
        guard
            let data = try? Data(contentsOf: cacheURL),
            let state = try? JSONDecoder().decode(KitchenState.self, from: data)
        else { return nil }
        return state
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async { self.reachable = session.isReachable }
        absorb(session.receivedApplicationContext["state"])
    }

    func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        absorb(context["state"])
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        absorb(message["state"])
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { self.reachable = session.isReachable }
    }
}

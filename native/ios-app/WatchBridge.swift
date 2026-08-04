//
//  WatchBridge.swift — the phone's half of the wrist.
//
//  A Capacitor plugin defined inside the app target rather than shipped as a
//  package, because it exists for exactly one app and a whole npm module's worth
//  of scaffolding for two methods is scaffolding somebody has to maintain.
//
//  Drop this and WatchBridge.m into the iOS target in Xcode. The web app finds
//  it at window.Capacitor.Plugins.WatchBridge; js/watch.js is the only caller.
//
//  Two directions, two mechanisms, and the choice matters:
//
//    state    updateApplicationContext — coalescing, and it survives the watch
//             being asleep. The phone can push twenty times while nobody is
//             looking and only the last one is delivered, which is exactly
//             right for "here is the kitchen right now".
//
//    command  sendMessage — arrives now or not at all, which is what a button
//             press on a wrist is.
//
//  ERRERLabs — MIT licensed.
//

import Foundation
import Capacitor
import WatchConnectivity

@objc(WatchBridge)
public class WatchBridge: CAPPlugin, WCSessionDelegate {

    public override func load() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// Push the kitchen snapshot to the watch.
    ///
    /// Never an error when there is no watch. Most people do not own one, and a
    /// rejected promise on every state change in that case would be noise the
    /// web layer has to remember to swallow forever.
    @objc func sync(_ call: CAPPluginCall) {
        guard
            WCSession.isSupported(),
            WCSession.default.activationState == .activated,
            WCSession.default.isPaired,
            WCSession.default.isWatchAppInstalled,
            let state = call.getString("state")
        else {
            call.resolve(["delivered": false])
            return
        }

        do {
            try WCSession.default.updateApplicationContext(["state": state])
            call.resolve(["delivered": true])
        } catch {
            // A failed context update means the watch will get the next one.
            call.resolve(["delivered": false])
        }
    }

    // MARK: WCSessionDelegate

    public func session(_ session: WCSession,
                        activationDidCompleteWith state: WCSessionActivationState,
                        error: Error?) {}

    public func sessionDidBecomeInactive(_ session: WCSession) {}

    /// A paired watch can be swapped for another one. Reactivate rather than
    /// leaving the app talking to a wrist that is no longer on anybody.
    public func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }

    /// A command from the wrist, handed straight to the web layer, which owns
    /// every decision about what a command means.
    public func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        var event: [String: Any] = [:]
        for (key, value) in message {
            if value is String || value is NSNumber || value is Bool { event[key] = value }
        }
        DispatchQueue.main.async {
            self.notifyListeners("command", data: event)
        }
    }
}

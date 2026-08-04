//
//  WatchBridge.m — the registration macro.
//
//  Capacitor finds plugins through the Objective-C runtime, so a Swift plugin
//  still needs this file to declare itself and its methods. Without it the
//  plugin compiles, loads, and is simply absent from window.Capacitor.Plugins,
//  which is a confusing way to spend an afternoon.
//
//  ERRERLabs — MIT licensed.
//

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(WatchBridge, "WatchBridge",
    CAP_PLUGIN_METHOD(sync, CAPPluginReturnPromise);
)

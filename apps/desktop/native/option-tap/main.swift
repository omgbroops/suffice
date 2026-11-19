// Prints one JSON line per Option / other key event: {"key":"option"|"other","state":"down"|"up","t":<ms>}.
// A listen-only CGEventTap; needs Accessibility (Input Monitoring) permission. Without it prints {"status":"no-permission"} and exits 1.
import Cocoa
setvbuf(stdout, nil, _IOLBF, 0)
var optionDown = false
var tapRef: CFMachPort? // kept so the callback can re-enable the tap
let mask: CGEventMask = (1 << CGEventType.flagsChanged.rawValue) | (1 << CGEventType.keyDown.rawValue)
func emit(_ key: String, _ state: String, _ e: CGEvent) {
    print("{\"key\":\"\(key)\",\"state\":\"\(state)\",\"t\":\(e.timestamp / 1_000_000)}")
}
let callback: CGEventTapCallBack = { _, type, event, _ in
    // macOS disables a slow tap; without this the trigger goes silently dead until the app restarts.
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput { if let t = tapRef { CGEvent.tapEnable(tap: t, enable: true) }; optionDown = false; return Unmanaged.passUnretained(event) }
    if type == .keyDown { emit("other", "down", event); return Unmanaged.passUnretained(event) }
    let flags = event.flags
    let others: CGEventFlags = [.maskCommand, .maskControl, .maskShift, .maskSecondaryFn]
    if !flags.intersection(others).isEmpty { emit("other", "down", event); optionDown = false; return Unmanaged.passUnretained(event) }
    let now = flags.contains(.maskAlternate)
    if now != optionDown { optionDown = now; emit("option", now ? "down" : "up", event) }
    return Unmanaged.passUnretained(event)
}
guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly, eventsOfInterest: mask, callback: callback, userInfo: nil) else {
    print("{\"status\":\"no-permission\"}"); exit(1)
}
tapRef = tap
CFRunLoopAddSource(CFRunLoopGetCurrent(), CFMachPortCreateRunLoopSource(nil, tap, 0), .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
CFRunLoopRun()

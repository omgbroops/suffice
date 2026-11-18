// Suffice Keys: owns the macOS grants the Suffice desktop agent needs (Input Monitoring,
// Accessibility, Screen Recording). It is installed once at a fixed path and every build is
// signed with the same local identity, so macOS keeps the grant across rebuilds.
// Clients connect to the Unix socket and receive one line per event: "trigger <x> <y>".
import Cocoa
import ApplicationServices
import CoreGraphics

let support = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/Suffice")
let sockPath = support.appendingPathComponent("keys.sock").path
let statusPath = support.appendingPathComponent("keys-status.json")

func writeStatus() {
    let s: [String: Bool] = [
        "inputMonitoring": CGPreflightListenEventAccess(),
        "accessibility": AXIsProcessTrusted(),
        "screenRecording": CGPreflightScreenCaptureAccess(),
    ]
    if let d = try? JSONSerialization.data(withJSONObject: s, options: [.sortedKeys]) { try? d.write(to: statusPath) }
}

// ---- socket server: broadcast lines to every connected client ----
var clients: [Int32] = []
func broadcast(_ line: String) {
    let bytes = Array((line + "\n").utf8)
    clients = clients.filter { fd in bytes.withUnsafeBytes { write(fd, $0.baseAddress, bytes.count) } == bytes.count || { close(fd); return false }() }
}
func startServer() {
    unlink(sockPath)
    let fd = socket(AF_UNIX, SOCK_STREAM, 0)
    var addr = sockaddr_un(); addr.sun_family = sa_family_t(AF_UNIX)
    withUnsafeMutableBytes(of: &addr.sun_path) { raw in
        let p = Array(sockPath.utf8.prefix(raw.count - 1)); raw.copyBytes(from: p + [0])
    }
    let ok = withUnsafePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) } }
    guard ok == 0, listen(fd, 8) == 0 else { FileHandle.standardError.write("socket bind failed\n".data(using: .utf8)!); return }
    chmod(sockPath, 0o600)  // only this user's processes may read key events
    let src = DispatchSource.makeReadSource(fileDescriptor: fd, queue: .main)
    src.setEventHandler { let c = accept(fd, nil, nil); if c >= 0 { var on: Int32 = 1; setsockopt(c, SOL_SOCKET, SO_NOSIGPIPE, &on, 4); clients.append(c) } }
    src.resume(); _server = src
}
var _server: DispatchSourceRead?

// ---- double-tap Option: two clean Option press/release within 350 ms, no other key between ----
var lastTap = 0.0, optionDown = false, dirty = false
let modMask: CGEventFlags = [.maskShift, .maskControl, .maskCommand, .maskAlternate, .maskSecondaryFn]
func handle(_ type: CGEventType, _ e: CGEvent) {
    if type == .keyDown { dirty = true; lastTap = 0; return }
    guard type == .flagsChanged else { return }
    let f = e.flags.intersection(modMask)
    if f == .maskAlternate { optionDown = true; dirty = false; return }
    if f.isEmpty && optionDown {
        optionDown = false
        if dirty { lastTap = 0; return }
        let now = ProcessInfo.processInfo.systemUptime
        if now - lastTap < 0.35 { lastTap = 0; let p = e.location; broadcast("trigger \(Int(p.x)) \(Int(p.y))") } else { lastTap = now }
        return
    }
    optionDown = false; lastTap = 0  // another modifier joined: not a clean tap
}
var tap: CFMachPort?
func startTap() -> Bool {
    let mask = (1 << CGEventType.flagsChanged.rawValue) | (1 << CGEventType.keyDown.rawValue)
    tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly,
        eventsOfInterest: CGEventMask(mask), callback: { _, type, e, _ in
            if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput { if let t = tap { CGEvent.tapEnable(tap: t, enable: true) } }
            else { handle(type, e) }
            return Unmanaged.passUnretained(e)
        }, userInfo: nil)
    guard let t = tap else { return false }
    CFRunLoopAddSource(CFRunLoopGetMain(), CFMachPortCreateRunLoopSource(nil, t, 0), .commonModes)
    CGEvent.tapEnable(tap: t, enable: true)
    return true
}

if CommandLine.arguments.contains("--version") { print(buildStamp); exit(0) }
if CommandLine.arguments.contains("--selftest") {
    // shortcut: self-test covers only the tap logic with synthetic events, not the OS tap itself
    func ev(_ t: CGEventType, _ f: CGEventFlags) -> CGEvent { let e = CGEvent(source: nil)!; e.type = t; e.flags = f; return e }
    var got: [String] = []
    let real = broadcast; _ = real
    clients = []
    func tapOpt() { handle(.flagsChanged, ev(.flagsChanged, .maskAlternate)); handle(.flagsChanged, ev(.flagsChanged, [])) }
    var fired = 0
    let check = { (label: String, expect: Int) in got.append("\(label)=\(fired == expect ? "ok" : "FAIL(\(fired))")"); fired = 0; lastTap = 0 }
    // count broadcasts through a pipe client
    var fds: [Int32] = [0, 0]; pipe(&fds); clients = [fds[1]]
    func drain() { var buf = [UInt8](repeating: 0, count: 4096); let fl = fcntl(fds[0], F_GETFL); _ = fcntl(fds[0], F_SETFL, fl | O_NONBLOCK); let n = read(fds[0], &buf, 4096); fired += n > 0 ? String(decoding: buf[0..<n], as: UTF8.self).split(separator: "\n").count : 0 }
    tapOpt(); tapOpt(); drain(); check("double", 1)
    tapOpt(); handle(.keyDown, ev(.keyDown, [])); tapOpt(); drain(); check("keyBetween", 0)
    handle(.flagsChanged, ev(.flagsChanged, .maskAlternate)); handle(.flagsChanged, ev(.flagsChanged, [.maskAlternate, .maskCommand])); handle(.flagsChanged, ev(.flagsChanged, [])); tapOpt(); drain(); check("optCmd", 0)
    tapOpt(); drain(); check("single", 0)
    print(got.joined(separator: " ")); exit(got.allSatisfy { $0.hasSuffix("ok") } ? 0 : 1)
}

try? FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
if !CGPreflightListenEventAccess() { CGRequestListenEventAccess() }
if !AXIsProcessTrusted() { AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary) }
if !CGPreflightScreenCaptureAccess() { CGRequestScreenCaptureAccess() }
writeStatus()
startServer()
var tapOn = startTap()
// grants land while running; retry the tap and refresh status until all three are on
Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { _ in
    if !tapOn { tapOn = startTap() }
    writeStatus()
}
app.run()

// Frontmost-app accessibility helper. Usage: ax-snapshot snapshot | press <path> | set <path> <text> | scroll <path> up|down | click <x> <y> | screenshot
// Node ids are child-index paths from the app element ("0.3.1"). press/set go through AXPress/AXValue: no pointer move, no focus steal.
import AppKit
import ApplicationServices

func attr(_ e: AXUIElement, _ k: String) -> AnyObject? {
  var v: CFTypeRef?
  return AXUIElementCopyAttributeValue(e, k as CFString, &v) == .success ? (v as AnyObject?) : nil
}
func frame(_ e: AXUIElement) -> [String: Double]? {
  var p = CGPoint.zero, s = CGSize.zero
  guard let pv = attr(e, kAXPositionAttribute), let sv = attr(e, kAXSizeAttribute),
        AXValueGetValue(pv as! AXValue, .cgPoint, &p), AXValueGetValue(sv as! AXValue, .cgSize, &s) else { return nil }
  return ["x": p.x, "y": p.y, "w": s.width, "h": s.height]
}
var budget = 800
func node(_ e: AXUIElement, _ path: String, _ depth: Int) -> [String: Any] {
  budget -= 1
  var n: [String: Any] = ["id": path, "role": attr(e, kAXRoleAttribute) as? String ?? "", "actions": []]
  n["name"] = (attr(e, kAXTitleAttribute) as? String).flatMap { $0.isEmpty ? nil : $0 } ?? (attr(e, kAXDescriptionAttribute) as? String) ?? ""
  if let v = attr(e, kAXValueAttribute) as? String { n["value"] = v }
  var st: [String] = []
  if (attr(e, kAXEnabledAttribute) as? Bool) == false { st.append("disabled") }
  if (attr(e, kAXFocusedAttribute) as? Bool) == true { st.append("focused") }
  if (attr(e, kAXSelectedAttribute) as? Bool) == true { st.append("selected") }
  n["states"] = st
  if let f = frame(e) { n["bounds"] = f }
  var acts: CFArray?
  if AXUIElementCopyActionNames(e, &acts) == .success, let a = acts as? [String], a.contains(kAXPressAction as String) { n["actions"] = ["press"] }
  if depth < 25, let kids = attr(e, kAXChildrenAttribute) as? [AXUIElement] {
    n["children"] = kids.enumerated().compactMap { budget > 0 ? node($1, "\(path).\($0)", depth + 1) : nil }
  }
  return n
}
func find(_ app: AXUIElement, _ path: String) -> AXUIElement? {
  var e = app
  for part in path.split(separator: ".").dropFirst() {
    guard let i = Int(part), let kids = attr(e, kAXChildrenAttribute) as? [AXUIElement], i < kids.count else { return nil }
    e = kids[i]
  }
  return e
}
func out(_ o: [String: Any]) { print(String(data: try! JSONSerialization.data(withJSONObject: o), encoding: .utf8)!) }

let a = CommandLine.arguments
guard AXIsProcessTrusted() else { out(["ok": false, "error": "Accessibility permission missing"]); exit(1) }
guard let front = NSWorkspace.shared.frontmostApplication else { out(["ok": false, "error": "no frontmost app"]); exit(1) }
let app = AXUIElementCreateApplication(front.processIdentifier)
switch a.count > 1 ? a[1] : "" {
case "snapshot": out(["ok": true, "tree": node(app, "a", 0)])
case "press": out(["ok": a.count > 2 && find(app, a[2]).map { AXUIElementPerformAction($0, kAXPressAction as CFString) == .success } == true])
case "set": out(["ok": a.count > 3 && find(app, a[2]).map { AXUIElementSetAttributeValue($0, kAXValueAttribute as CFString, a[3] as CFString) == .success } == true])
case "scroll": // shortcut: scrolls the nearest AXScrollBar value, upgrade to scroll-area actions when needed
  out(["ok": a.count > 2 && find(app, a[2]).map { AXUIElementPerformAction($0, (a.count > 3 && a[3] == "up" ? "AXScrollUpByPage" : "AXScrollDownByPage") as CFString) == .success } == true])
case "click":
  let p = CGPoint(x: Double(a[2]) ?? 0, y: Double(a[3]) ?? 0)
  for t in [CGEventType.leftMouseDown, .leftMouseUp] { CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap) }
  out(["ok": true])
case "screenshot":
  let path = NSTemporaryDirectory() + "ax-shot-\(getpid()).png"
  let t = Process(); t.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture"); t.arguments = ["-x", path]; try? t.run(); t.waitUntilExit()
  out(["ok": t.terminationStatus == 0, "path": path])
default: out(["ok": false, "error": "usage"])
}

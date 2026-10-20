#!/usr/bin/env python3
"""Remove executable JavaScript from an HTML file without reserializing its markup."""
import html
import re
import sys


_TAG_NAME = re.compile(r"<\s*([A-Za-z][^\s/>]*)")
_ATTR = re.compile(r"\s+([^\s=/>]+)(?:\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]*))?")
_SCRIPT_OPEN = re.compile(r"<\s*script(?:\s|/?>)", re.IGNORECASE)
_SCRIPT_CLOSE = re.compile(r"</\s*script\s*>", re.IGNORECASE)
_SPACE_CTRL = re.compile(r"[\x00-\x20\x7f]+")


def _tag_end(source, start):
    """Return the index just after a tag's >, respecting quoted attributes."""
    quote = None
    i = start + 1
    while i < len(source):
        char = source[i]
        if quote:
            if char == quote:
                quote = None
        elif char in "\"'":
            quote = char
        elif char == ">":
            return i + 1
        i += 1
    return len(source)


def _decoded_url(value):
    # HTML entities are decoded by the browser before URL scheme processing.
    value = value.strip()
    for _ in range(3):
        newer = html.unescape(value)
        if newer == value:
            break
        value = newer
    return _SPACE_CTRL.sub("", value).lower()


def _attribute_is_unsafe(name, raw_value):
    name = name.lower()
    if name.startswith("on") and len(name) > 2:
        return True
    # srcdoc is an entire nested HTML document and can contain scripts.
    if name == "srcdoc":
        return True
    if raw_value is None:
        return False

    value = raw_value
    if len(value) >= 2 and value[0] in "\"'" and value[-1] == value[0]:
        value = value[1:-1]
    decoded = _decoded_url(value)
    if name in {"href", "src", "action", "formaction", "xlink:href", "data", "cite", "background", "poster", "manifest", "codebase"}:
        if decoded.startswith("javascript:") or decoded.startswith("vbscript:"):
            return True
        # Active HTML documents can be loaded through data URLs in navigable
        # contexts; do not allow these as a route to script execution.
        if decoded.startswith("data:text/html"):
            return True
    if name == "style":
        # Legacy CSS expression() and script URLs are executable in supported
        # browser modes. Strip just this attribute when either is present.
        css = decoded.replace("\\", "")
        if "expression(" in css or "javascript:" in css or "vbscript:" in css:
            return True
    return False


def _sanitize_tag(tag):
    match = _TAG_NAME.match(tag)
    if not match:
        return tag
    name_end = match.end()
    removals = []
    for attr in _ATTR.finditer(tag, name_end):
        attr_name = attr.group(1)
        raw = attr.group(0)
        equals = raw.find("=")
        value = raw[equals + 1:].strip() if equals >= 0 else None
        if _attribute_is_unsafe(attr_name, value):
            removals.append((attr.start(), attr.end()))
    for start, end in reversed(removals):
        tag = tag[:start] + tag[end:]
    # A meta refresh to a javascript URL is another URL-bearing attribute
    # combination; remove only its content attribute.
    if match.group(1).lower() == "meta":
        if re.search(r"\bhttp-equiv\s*=\s*(['\"]?)\s*refresh\s*\1", tag, re.I):
            def clean_refresh(m):
                value = m.group(2)
                if re.search(r"(?:^|[;\s])url\s*=\s*(['\"]?)\s*(?:javascript|vbscript)\s*:", _decoded_url(value), re.I):
                    return ""
                return m.group(0)
            tag = re.sub(r"\s+content\s*=\s*(['\"])(.*?)\1", clean_refresh, tag, flags=re.I)
    return tag


def sanitize(source):
    out = []
    pos = 0
    length = len(source)
    while pos < length:
        start = source.find("<", pos)
        if start < 0:
            out.append(source[pos:])
            break
        out.append(source[pos:start])
        if source.startswith("<!--", start):
            end = source.find("-->", start + 4)
            if end < 0:
                out.append(source[start:])
                break
            out.append(source[start:end + 3])
            pos = end + 3
            continue
        # Preserve declarations, processing instructions, and malformed text.
        if start + 1 >= length or source[start + 1] in "!?":
            end = _tag_end(source, start)
            out.append(source[start:end])
            pos = end
            continue
        end = _tag_end(source, start)
        tag = source[start:end]
        if _SCRIPT_OPEN.match(tag):
            close = _SCRIPT_CLOSE.search(source, end)
            if close:
                pos = close.end()
            else:
                pos = length
            continue
        if _TAG_NAME.match(tag):
            out.append(_sanitize_tag(tag))
        else:
            out.append(tag)
        pos = end
    return "".join(out)


def main():
    path = sys.argv[1]
    with open(path, "r", encoding="utf-8", newline="") as file:
        content = file.read()
    filtered = sanitize(content)
    with open(path, "w", encoding="utf-8", newline="") as file:
        file.write(filtered)


if __name__ == "__main__":
    main()

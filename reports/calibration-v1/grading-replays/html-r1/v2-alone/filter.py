#!/usr/bin/env python3
"""Remove executable JavaScript from an HTML file without reserializing it."""

import html
import re
import sys
from pathlib import Path


def _tag_end(source, start):
    """Return the offset just after a quote-aware HTML tag, or None."""
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
    return None


def _tag_name(source, start, end):
    i = start + 1
    if i < end and source[i] == "/":
        i += 1
    match = re.match(r"[A-Za-z][A-Za-z0-9:_-]*", source[i:end])
    return match.group(0).lower() if match else ""


def _attribute_ranges(source, start, end):
    """Yield (name, value, begin, finish) for attributes in a start tag."""
    i = start + 1
    while i < end and source[i] not in " \t\r\n/>":
        i += 1
    while i < end:
        while i < end and source[i] in " \t\r\n/":
            i += 1
        if i >= end or source[i] == ">":
            break
        begin = i
        while i < end and source[i] not in " \t\r\n=/>\"'":
            i += 1
        if i == begin:
            i += 1
            continue
        name = source[begin:i].lower()
        while i < end and source[i] in " \t\r\n":
            i += 1
        value = None
        if i < end and source[i] == "=":
            i += 1
            while i < end and source[i] in " \t\r\n":
                i += 1
            if i < end and source[i] in "\"'":
                quote = source[i]
                i += 1
                value_start = i
                while i < end and source[i] != quote:
                    i += 1
                value = source[value_start:i]
                if i < end:
                    i += 1
            else:
                value_start = i
                while i < end and source[i] not in " \t\r\n>":
                    i += 1
                value = source[value_start:i]
        yield name, value, begin, i


def _is_javascript_url(value):
    decoded = html.unescape(value)
    # Browsers ignore ASCII whitespace/control characters in URL schemes.
    compact = re.sub(r"[\x00-\x20\x7f]+", "", decoded).lower()
    return compact.startswith("javascript:")


def _sanitize(source):
    removals = []
    i = 0
    length = len(source)
    while i < length:
        if source.startswith("<!--", i):
            close = source.find("-->", i + 4)
            i = length if close < 0 else close + 3
            continue
        if source[i] != "<":
            i += 1
            continue
        if source.startswith("<!", i) or source.startswith("<?", i):
            end = _tag_end(source, i)
            i = length if end is None else end
            continue
        end = _tag_end(source, i)
        if end is None:
            i += 1
            continue
        name = _tag_name(source, i, end)
        if not name:
            i = end
            continue
        closing = i + 1 < end and source[i + 1] == "/"
        if not closing and name == "script":
            # HTML treats script contents as raw text; the first real end tag
            # closes it, even if that text appears inside a JS string.
            match = re.search(r"</script\s*>", source[end:], re.I)
            finish = end + match.end() if match else length
            removals.append((i, finish))
            i = finish
            continue
        if not closing:
            for attr, value, begin, finish in _attribute_ranges(source, i, end):
                # Standard event-handler attributes contain executable code;
                # don't discard unrelated names such as "only" or "once".
                event_names = (
                    "abort animationend animationiteration animationstart auxclick beforeinput "
                    "beforematch beforetoggle blur cancel canplay canplaythrough change click close "
                    "contextmenu copy cuechange cut dblclick drag dragend dragenter dragleave dragover "
                    "dragstart drop durationchange emptied ended error focus formdata input invalid "
                    "keydown keypress keyup load loadeddata loadedmetadata loadstart message mousedown "
                    "mouseenter mouseleave mousemove mouseout mouseover mouseup paste pause play playing "
                    "pointercancel pointerdown pointerenter pointerleave pointermove pointerout pointerover "
                    "pointerup progress ratechange reset resize scroll securitypolicyviolation seeked seeking "
                    "select slotchange stalled submit suspend timeupdate toggle touchcancel touchend touchmove "
                    "touchstart transitionend volumechange waiting wheel hashchange pageshow pagehide popstate "
                    "storage unload beforeunload online offline"
                ).split()
                dangerous = attr in {"on" + event for event in event_names}
                dangerous = dangerous or attr == "srcdoc"
                if value is not None:
                    dangerous = dangerous or _is_javascript_url(value)
                    if attr == "style":
                        decoded_style = html.unescape(value)
                        dangerous = dangerous or bool(re.search(
                            r"(?:expression\s*\(|-moz-binding\s*:|behavior\s*:|url\s*\(\s*['\"]?\s*javascript\s*:)",
                            decoded_style, re.I))
                if dangerous:
                    removals.append((begin, finish))
        i = end

    if not removals:
        return source
    removals.sort()
    output = []
    position = 0
    for begin, finish in removals:
        if begin < position:
            continue
        output.append(source[position:begin])
        position = finish
    output.append(source[position:])
    return "".join(output)


def main():
    path = Path(sys.argv[1])
    # surrogateescape keeps arbitrary existing bytes round-trippable.
    content = path.read_bytes().decode("utf-8", errors="surrogateescape")
    cleaned = _sanitize(content)
    if cleaned != content:
        path.write_bytes(cleaned.encode("utf-8", errors="surrogateescape"))


if __name__ == "__main__":
    main()

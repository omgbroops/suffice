#!/usr/bin/env python3
"""In-place, source-preserving removal of executable JavaScript from HTML."""
import html
import re
import sys
from pathlib import Path


_TAG = re.compile(r"<\s*(/?)\s*([A-Za-z][A-Za-z0-9:-]*)")
_ATTR_NAME = re.compile(r"[A-Za-z_:][A-Za-z0-9_.:-]*")
_URL_ATTRS = {
    "href", "src", "action", "formaction", "xlink:href", "cite", "background",
    "manifest", "data", "codebase", "classid", "usemap", "poster", "longdesc",
}
_SCRIPT_CLOSE = re.compile(r"</\s*script\b[^>]*>", re.I)
_STYLE_CLOSE = re.compile(r"</\s*style\b[^>]*>", re.I)
_CSS_DANGER = re.compile(
    r"(?:expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding\s*:|behavior\s*:)",
    re.I,
)


def _tag_end(source, start):
    quote = None
    i = start
    while i < len(source):
        c = source[i]
        if quote:
            if c == quote:
                quote = None
        elif c in "'\"":
            quote = c
        elif c == ">":
            return i + 1
        i += 1
    return len(source)


def _attrs(source, start, end):
    """Yield (name, value, removal-start, removal-end) for a start tag."""
    i = start
    while i < end and source[i].isspace():
        i += 1
    tag_match = _TAG.match(source, i, end)
    if not tag_match:
        return
    i = tag_match.end()
    while i < end:
        while i < end and (source[i].isspace() or source[i] == "/"):
            i += 1
        if i >= end or source[i] == ">":
            break
        match = _ATTR_NAME.match(source, i, end)
        if not match:
            i += 1
            continue
        name = match.group().lower()
        attr_start = match.start()
        # Include preceding whitespace when deleting an attribute, without
        # consuming the tag's initial formatting.
        remove_start = attr_start
        while remove_start > tag_match.end() and source[remove_start - 1].isspace():
            remove_start -= 1
        i = match.end()
        while i < end and source[i].isspace():
            i += 1
        value = ""
        if i < end and source[i] == "=":
            i += 1
            while i < end and source[i].isspace():
                i += 1
            if i < end and source[i] in "'\"":
                q = source[i]
                value_start = i + 1
                i = value_start
                while i < end and source[i] != q:
                    i += 1
                value = source[value_start:i]
                if i < end:
                    i += 1
            else:
                value_start = i
                while i < end and not source[i].isspace() and source[i] not in ">":
                    i += 1
                value = source[value_start:i]
        yield name, value, remove_start, i


def _dangerous_url(value):
    # HTML character references are decoded by browsers in attribute values.
    value = html.unescape(value)
    # Browsers ignore ASCII controls/whitespace around and within URL schemes.
    compact = re.sub(r"[\x00-\x20\x7f]+", "", value).lower()
    return compact.startswith(("javascript:", "vbscript:", "data:text/html", "data:text/javascript"))


def _dangerous_css(value):
    value = html.unescape(value)
    # Decode CSS hex escapes sufficiently to expose obfuscated dangerous tokens.
    value = re.sub(
        r"\\([0-9a-fA-F]{1,6})\s?",
        lambda m: chr(int(m.group(1), 16)) if int(m.group(1), 16) <= 0x10ffff else "",
        value,
    )
    return bool(_CSS_DANGER.search(value))


def sanitize(source):
    removals = []
    i = 0
    n = len(source)
    while i < n:
        start = source.find("<", i)
        if start < 0:
            break
        if source.startswith("<!--", start):
            close = source.find("-->", start + 4)
            i = n if close < 0 else close + 3
            continue
        # Declarations and processing instructions are not tags with attributes.
        if start + 1 < n and source[start + 1] in "!?":
            i = _tag_end(source, start + 2)
            continue
        match = _TAG.match(source, start)
        if not match:
            i = start + 1
            continue
        end = _tag_end(source, start + 1)
        closing, tag = match.group(1), match.group(2).lower()
        if not closing and tag == "script":
            close = _SCRIPT_CLOSE.search(source, end)
            stop = close.end() if close else n
            removals.append((start, stop))
            i = stop
            continue
        if not closing and tag == "style":
            # CSS can contain legacy script-capable constructs; retain normal
            # style blocks byte-for-byte, but drop a block containing them.
            close = _STYLE_CLOSE.search(source, end)
            stop = close.end() if close else n
            if _dangerous_css(source[end:close.start() if close else n]):
                removals.append((start, stop))
            i = stop
            continue
        if not closing:
            attrs = list(_attrs(source, start, end))
            attr_values = {name: value for name, value, _, _ in attrs}
            refresh = tag == "meta" and attr_values.get("http-equiv", "").strip().lower() == "refresh"
            for name, value, a, b in attrs:
                if name.startswith("on") or name == "srcdoc":
                    removals.append((a, b))
                elif name in _URL_ATTRS and _dangerous_url(value):
                    removals.append((a, b))
                elif name == "srcset" and re.search(r"(?:^|,)\s*(?:javascript|vbscript)\s*:", html.unescape(value), re.I):
                    removals.append((a, b))
                elif refresh and name == "content" and _dangerous_url(re.split(r"url\s*=", value, flags=re.I)[-1].strip().strip('"').strip("'")):
                    removals.append((a, b))
                elif name == "style" and _dangerous_css(value):
                    removals.append((a, b))
        i = max(end, start + 1)

    if not removals:
        return source
    # Apply non-overlapping spans from right to left so offsets remain valid.
    for start, end in sorted(removals, reverse=True):
        source = source[:start] + source[end:]
    return source


def main():
    path = Path(sys.argv[1])
    original = path.read_bytes()
    # surrogateescape makes the transformation byte-preserving for non-UTF8
    # input; only ASCII syntax is interpreted.
    content = original.decode("utf-8", "surrogateescape")
    result = sanitize(content).encode("utf-8", "surrogateescape")
    if result != original:
        path.write_bytes(result)


if __name__ == "__main__":
    main()

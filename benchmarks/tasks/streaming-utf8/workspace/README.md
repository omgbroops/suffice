# Streaming text survives arbitrary byte chunks

This is an AI-authored synthetic coding benchmark, not a real-world issue.

Repair the incremental UTF-8 line reader. feed receives Uint8Array chunks at arbitrary byte boundaries, including within multibyte characters. It returns completed lines. LF and CRLF delimit lines; a lone CR is content. Empty lines are preserved. end flushes decoder state and returns one unterminated nonempty final line, but does not invent a line after a trailing newline. The public readLines consumes an async iterable of byte chunks and returns all lines. Invalid UTF-8 uses standard TextDecoder replacement behavior.

Fix the implementation under src/. Preserve its public API and work across the complete contract. The visible tests are smoke checks rather than the full acceptance suite.

Run visible checks with:

```sh
node --test tests/visible.test.mjs
```

Use only built-in Node.js APIs; no dependencies or network access are needed.

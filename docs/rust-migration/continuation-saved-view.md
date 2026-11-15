# Rust saved transcript presentation — 2026-11-15

Continued after edge-to-edge merge `75b76c4`. The native viewer now uses Rust
for saved transcript presentation and usage, rather than displaying raw Pi
projection messages. This is an implemented native saved-view path; production
Electron browsing and live Pi resume remain unchanged.

Evidence: [`measurements/saved-view-04/summary.json`](measurements/saved-view-04/summary.json),
with intermediate/final logs, independent review, source/binary receipts and
SHA-256 hashes. Earlier evidence directories were not overwritten.
Raw evidence `.log` files now have a scoped ignore exception, and measurement
files disable Git text conversion so receipt bytes survive cross-platform
checkouts. Previously ignored logs already present beside the earlier receipts
are added without modifying their bytes; the index is checked against each
receipt before committing this checkpoint.

## Moved behavior

`crates/suffice-session/src/presentation.rs` ports the contracts implemented by
Electron's `transcript-messages.mjs`, `message-presentation.mjs`, `usage.mjs` and
the final outward mapping in `threads.mjs`. Tests call those actual Node modules
and installed Pi 1.5.2 as their oracle.

- Private compaction summaries become chronological compacted status markers.
  Automatic/manual reasons come from the selected projection, so an abandoned
  branch cannot change a selected checkpoint's label.
- Explicit and aborted-turn interruptions follow the existing ordering/dedup
  rules. Turn ancestry, latest end metadata and shared metadata backfilling
  preserve earlier user/assistant views; null/undefined/scalar/object turn-ID
  identity cases have differential fixtures.
- Prompt-hash display text and attachment metadata preserve the user-facing
  representation. Valid bounded legacy attachment records are converted without
  displaying their injected local-path context. Invalid/unmatched records retain
  the oracle behavior instead of fabricating display metadata.
- Saved usage follows the current Node/Pi cumulative and context arithmetic,
  including per-entry floating-point aggregation order and partial-field
  conventions. Missing usage stays null. Model resolution is still external;
  the caller can supply a numeric context window.

The JSON interface adds `present` and capability-relative `present_session`, both
returning `{ messages, usage }`. The latter returns neither raw entries nor raw
compaction summaries. `SessionStore` retains all existing no-follow and streaming
input budgets; this work does not widen filesystem authority or write sessions.

## Numeric compatibility

`js_json.rs` parses finite JSON numbers with ECMAScript binary64 rounding and
serializes their decimal representation through pinned ryu-js 1.0.3. This closes
tested unsafe-integer, negative-zero, decimal/exponent-threshold and pretty
tool-argument differences. Serde's round-trip float parser is enabled. Raw wire
tests compare strings at explicit boundaries and across a seeded set generated
from 2,048 binary64 patterns, excluding non-finite values; JavaScript reparsing
cannot conceal a formatting difference.

Opaque tool argument order still follows JavaScript integer-index enumeration
followed by insertion order. This is finite JSON compatibility, not a complete
JavaScript value engine: overflow literals, unpaired UTF-16 surrogates, non-JSON
reference aliases, broad legacy Date coercion and malformed records remain gaps.

## Native consumer and privacy

Native selection computes normalized messages and usage before committing them
with the selected session. Failed reads/projections preserve the prior view.
The viewer renders display prompts, tool argument details, attachment metadata,
compaction/interruption labels, available turn metadata and unknown usage as
`—`. It does not start a live session or load provider credentials.

Independent review caught a difference between the backend DTO and actual saved
UI: Electron transports thinking blocks but deliberately suppresses persisted
reasoning in `threads-ui.js`. The native render path now suppresses it too. The
backend DTO retains those fields for Node API compatibility; this is not blanket
redaction of all reasoning from memory or transport. Private compaction bodies
are suppressed by the presenter itself.

A real `State::select` plus egui `App::update` fixture verifies the selected view,
status labels, attachment context suppression, reasoning suppression, turn fields
and saved usage. It supplements the existing keyboard, symlink replacement and
oversized-history tests. It does not certify OS presentation/accessibility.

## Observed checks

Pinned Rust 1.92.0 and Node 24.22.2, macOS arm64:

| Check | Result |
| --- | --- |
| Session Rust tests | 15 passed |
| Node/Pi projection, number and desktop presentation comparisons | 42 passed |
| Native viewer tests | 9 passed |
| Existing Node presentation/checkpoint/usage tests | 6 passed |
| Session/native formatting, Clippy with warnings denied | Passed |
| Session/native locked release builds | Passed |
| Native release smoke | 1,000 messages, marker/layout verified, fixture bytes unchanged |

CI now runs all session `.test.mjs` files after rebuilding the executable. No
production Electron source changed in this continuation; the preceding combined
desktop/core/package qualification remains recorded in the edge integration.
No full-product performance measurement or Windows/Linux execution ran here.

Review also closed numeric turn-ID/end handling and missing/null property
distinctions. Checks were repeated after those fixes and the reasoning change.
Historical report/research/benchmark files remain unchanged. No live inference,
publication, deployment or user-profile session access occurred.

## Next migration boundary

Finish the remaining legacy/malformed/Unicode/date/discovery semantics and
platform qualification before making Rust authoritative for production browsing.
Then connect the raw saved-view adapter while retaining catalog authorization,
cache, model resolution and lazy resume behavior. Saved resume must not create
an agent or rewrite a user's only session copy merely to inspect history.

Continue native UI feature parity and Rust ownership of runtime/tools/state;
the read-only viewer still lacks live sending, images, math, Mermaid, PTY,
complete settings and broader failure recovery. Node/Pi/Electron remain in
production, and the full migration/performance/platform gates remain open.

Lanes: Terra High presentation implementation, Terra Medium native contract
discovery and integration, Sol High independent review; effective routing was
not exposed by runtime metadata and remains unverified. Root owned finite JSON
semantics, shared API wiring, additional regression cases, CI and final synthesis.
Depth one and disjoint source ownership were retained.

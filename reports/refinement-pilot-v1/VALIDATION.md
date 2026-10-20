# Refinement pilot validation

Branch: `codex/suffice-refinement-pilot`, based on the completed original campaign
at `526eee4`. Production `packages/cli/src` has no changes from that baseline.
The old campaign's source runtime, receipts and reports are not overwritten.

Windows focused pipeline/strategy/native-session tests: 23 passing before V3.
V3 accounting, read-only coordinator tool access, sequential delegation, shared
budget failure and unknown-cost tests: 3 passing. The later worker-output retrieval
test additionally verifies exact binary-byte recovery and rejection of arbitrary
receipt paths. Combined pipeline/strategy/V3 tests: 23 passing.

WSL focused executor/V3 tests: 17 passing. Full Windows suite: 153 passing, 2
failing. The failures are the previously documented native multi-package file
scope test and synthetic reference-patch exact-match test. Both were reproduced
on the pristine starting tree in the prior validation; they remain unresolved.
See the earlier `reports/shared-core-v1/VALIDATION.md`. They are not omitted or
claimed fixed here. Reporting/accounting regression tests: 4 passing.

Docker preflight: five negative controls and infrastructure probes passed, followed
by a successful Harbor runtime install-only trial with no model inference. The
first infrastructure probe found no system Python in the polyglot image. Its
initial manifest and failure are preserved. A separate read-only checker Python
mount was added for every arm before paid work; candidates still use task Python.
See `preflight.json`, `preflight-amendment.json`, and both manifests.

Source/check/task files are copied from this Windows repository to the separate
WSL pilot runtime and SHA-256 checked before admission. Dependency files reuse
the prior pinned tree via immutable hard links and are hashed as a complete tree.
No dependency install, hidden-test inspection, global skills or production default
change was required. Authentication remains in the existing private Eric Qin
campaign mount and is not exported. The Mohammed machine is offline; source is
committed/pushed for the user's later pull, not claimed live-synchronized.

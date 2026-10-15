# Blind integration and live contract review

Recorded 2026-10-15T07:19:36.177863+00:00. No actor outputs, patches, traces or scored result files were read before this report. Only new audit reports were written. No graders, task readiness flags, harness inputs or existing receipts changed.

Core checks are defensible; i04 is explicitly a partial core-scheduler grade. Native test-restoration guarantee is incomplete for root test.js/index.test-d.ts in i03,l02,l03. No actor outcomes considered.

| Task | Disposition | Native baseline/reference evidence |
|---|---|---|
| i01 | valid_with_environment_limits | 378 tests:371 pass,3 pending,4 identical baseline/reference failures. |
| i02 | valid_with_historical_symptom_limit | 384 tests:377 pass,3 pending,4 identical baseline/reference failures. |
| i03 | valid_contract_native_restoration_limited | 23 original AVA tests pass baseline/reference. |
| i04 | limited_core_contract_only | 187 original Tape assertions pass baseline/reference. |
| l01 | valid_live_contract_with_environment_limits | Build and build:types pass;73 Promise/Queues/environment tests pass; test:types passes. Full capacity-oriented Pool suite excluded after frozen-address-space failure. |
| l02 | valid_live_contract_native_restoration_limited | 49 original AVA tests and tsd pass. Ephemeral AVA cache config supports immutable dependencies; lint not graded. |
| l03 | valid_live_contract_native_restoration_limited | 77 original Node tests and tsd pass; lint not graded. |

The historical controls compare the exact archived pre-fix parent with actual upstream production files. All four archives match their recorded SHA256; all archived source files match the public base; reference file Git blob hashes match GitHub commit metadata. All seven public-body hashes match provenance; each public Git repository has one clean commit, with no hidden overlay in base. Live snapshots at07:04UTC were open, unassigned, with zero comments, and each exact inline reproduction was independently reproduced. No claim is made about unknown private work or updates after those snapshots.

The frozen filesystem grader reconstructs from base and ignores protected test changes, then applies the private overlay. Its matcher covers test/ and tests/ plus .test. or .spec. filenames, but misses root test.js and index.test-d.ts. This affects i03/l02/l03. An actor can weaken a native suite through those files; l03 Node test.js can even run zero tests with exit0. Package/runner configs also remain editable. Private acceptance remains independent, so this finding weakens native-regression protection rather than making the issue contract untested. Actual impact must be determined only after this blind report.

The node-fetch exceptions do not mask the issue check in the controls: both native runs have exactly the same four failing names, and the separate loopback-only issue check independently fails before the repair and passes afterward. i01 has378tests,371pass,3pending; i02 has384tests,377pass,3pending. The four ignored failures are message drift, a stream termination assertion, external DNS/network access, or custom lookup behavior; their exact names and reasons are recorded in the JSON. The evaluator also requires the exact failure-name set, preventing an extra distinct native failure from being silently accepted. It does not enforce identical test/pass counts or messages; runner/config edits need later review. Improving one of the four known failures can itself violate the frozen exact-name expectation.

Fastq i04 is defensible as a core scheduling task, not complete issue resolution. The original body explicitly calls1.2 nonsensical. The reference accepts any value satisfying value>=1 and the private check only rejects0,-1,NaN. Fractional constructor/setter cases, then pause/resume and submissions under that fractional value, are untested. This omission cannot be retroactively repaired in a frozen comparison. Infinity/type-coercion behavior is also untested, but no new required policy is invented for it. The check does cover the substantial integer scheduling cases from the public report, including no cancellation of active workers.

**i01** â€” Malformed redirect Location must reject through fetch promise; manual mode remains readable and valid redirects work.

Local HTTP statuses301,302,307,308: invalid default redirects reject Error, invalid manual returns original status/header/body, valid follow returns destination.

Baseline uncaught ERR_INVALID_URL at invalid301Location; exact upstream production file passes.

Limits: 303 is not exercised by private check. No exact Error subclass or message imposed. Original public report contains diagnosis; solution hints are retained. Four named native failures retained; full clean native suite is not claimed.

**i02** â€” Zero-byte deflate response must yield a response and empty text; ordinary zlib/raw deflate and gzip remain valid.

Empty content-length0, chunked and default framing; nonempty wrapped/raw deflate and gzip controls,1800ms outer timeout.

Baseline Node24 rejects undefined on successful pump completion, rather than reproducing the older indefinite wait. Reference fixes pump callback error guards and empty-stream end settlement; check passes.

Limits: Operational historical symptom differs on Node24; measured public postcondition remains faithful. Not an isolated test of only the missing end handler: successful pump completion rejection is also necessarily fixed on this base/runtime. Original issue includes a proposed diff, retained verbatim.

**i03** â€” Iterator failure keeps original error identity, promptly rejects, observes already scheduled mapper rejections, and preserves normal/shared queue behavior.

Strict-unhandled mode with1and4 yielded items, mapper-only failure, array-like input, queued work behind a gate and immediate iterator rejection.

Baseline fatal mapper failure; actual upstream index.js/index.d.ts reference passes.

Limits: No full XO/tsd run is claimed. Original issue supplies detailed cause and candidate fix, retained. Native root test.js and index.test-d.ts are not protected by frozen path matcher.

**i04** â€” Pause/resume and mutable concurrency respect existing workers, queued work, no cancellation, and positive concurrency transitions.

Repeated resume with one active worker; raise1to3; lower3to1; push/unshift ordering; paused increase; invalid0,-1,NaN throw and preserve previous setting.

Baseline first resume starts2workers despite limit1; upstream production reference passes core check.

Limits: Issue explicitly names fractional1.2 as nonsensical, but neither private acceptance nor upstream setter rejects it. Reference accepts value>=1 without finite/integer/type guard. A score can support core scheduler repair, not complete resolution of every original example. Fractional constructor/setter behavior and fractional pause/resume/new submissions are untested. Infinity and coercible values are also outside coverage, but the report does not invent a required policy for them. Promise wrapper scheduling paths and other positive limits beyond1/2/3 are not directly added to private check.

**l01** â€” Finally attached before settlement must complete with original success/rejection, cleanup executes once, and real pool.exec continues.

Pending and settled fulfillment/rejection, awaited cleanup, cleanup throw and one real thread worker. Cleanup behaviors are already part of original Promise native tests.

Original inline reproduction verified. Private baseline7checks:4pass,3fail at pending fulfillment/rejection and pool.exec. No reference repair exists or was inspected.

Limits: One-second worker completion bound can be affected by severe host contention; pure Promise pending cases distinguish core bug. No browser, process-worker or full high-worker Pool capacity CI claim. No reference-positive control for unresolved live task.

**l02** â€” Abort/timeout settle outer wait while condition remains pending, preserve abort reason or TimeoutError and observe late condition rejection; normal polling remains intact.

Explicit abort followed by late true; never-resolving timeout; late rejection after abort; ordinary async success/condition failure.

Original inline reproduction verified. Private baseline4checks:1pass,3fail because pending wait does not settle within300ms. No reference repair.

Limits: Numeric timeout20ms is allowed300ms, a practical finite guard rather than an exact timing equality. Timeout object/fallback, late timeout fulfillment/rejection, repeated abort cleanup and signal listener counts are not private-check coverage. Root test.js and index.test-d.ts are not protected by frozen path matcher.

**l03** â€” Same-window suppressed callers await slow leading result, and overlapping windows retain their own batch result without extra calls.

Three same-window callers; two overlapping pending batches resolved in reverse order; ordinary leading/trailing controls. Batch isolation is explicit in original public suggested direction.

Original inline reproduction verified. Private baseline3checks:1pass,2fail at premature fulfillment and undefined overlapping results. No reference repair.

Limits: Leading rejection, abort interaction, this-binding and longer overlap sequences are not added to private check. Root test.js and index.test-d.ts are not protected by frozen path matcher; empty Node test.js can exit0 without nativeParser count check.

The full input SHA256 map and per-task source checks are in the companion JSON. Live tasks have no reference-positive repair controls; they are evaluated by the public contract plus healthy selected native suites. Full CI is not claimed. Evidence was judged before any model outcome; subsequent trace review must be a separate append/report and cannot change these contract dispositions.

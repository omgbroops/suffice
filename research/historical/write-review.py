from pathlib import Path
import datetime
p=Path(r'C:\Users\Mohammed\Documents\GitHub\suffice-experiments\github-field-test\research\historical\review-pilot.md')
s='''# EVALUATOR ONLY: independent h02 pilot review

Do not expose this review, its reference/provenance details, or private grader to repair actors.

**Verdict:** The primary h02 oracle fairly operationalizes node-fetch issue #1446 on this controlled Windows/Node24 setup. The exact upstream repair passes and its immediate parent fails consistently. No source, grader, harness, or actor edits were made during this review. This is suitable for a bounded exploratory pilot once the private grading process has an enforced outer deadline and the known native-suite baseline failures are recorded. It is not evidence of a broadly difficult or long-horizon benchmark.

Reviewed: scripts/field-graders.mjs, generated .suffice/field/private/h02.test.mjs, exact original #1446 issue body and comments, fix commit metadata/patch, base src/index.js, reference src/index.js, current public bridge, private preflight receipts, native preflight receipt and field-native.mjs. Source engine and all guard/test implementations were not independently re-hashed by this reviewer; their unchanged status is supplied by the parent, not established here.

## Original contract and provenance

Original issue: https://github.com/node-fetch/node-fetch/issues/1446 . The original report loops over fetch calls with an explicit keepAlive HTTP agent, consumes response.text(), and reports memory working set that grows and is not freed; its plain node:http comparison is healthy. The original body contains reproduction code and no solution patch. Its comments identify a duplicate of #1295 and PR1474 as the fix; this linkage is weaker than an automatic closing-keyword relationship, and that limitation should remain in the task record.

Fix: https://github.com/node-fetch/node-fetch/commit/043a5fcfc82884155bcb2afba2a82333b2f29c02 (merged PR1474). Immediate parent: 004b3ac8324e6cdbfb5d04b8bbdc6664ea48fbcf . The upstream patch is one production file with 9 additions/7 deletions and explicitly removes retained data/close listeners after request close. It adds no upstream regression tests.

Independent byte verification: the prepared base src/index.js exactly matches the previously fetched parent source; SHA256 72f412faf6c67c0b1d6cc699d246611b57d821c17dc6520dabb8472f2902ccd7. Reference src/index.js has Git blob 513b05225e2f4aa83d5b8ee43e6c09a2eefc8a77, exactly the blob in the upstream fix metadata; SHA256 7aa943d40c2ab54a343c4bb71ef9b2410957c835427c66cde3aa7ea9802d2503. The base repository HEAD is a later synthetic bridge commit, 3c998965c1bb4fd7afcaf071fd3c8611e35d51bd; report that separately from the upstream parent revision instead of claiming identical repository HEADs.

Evidence: review-evidence/provenance-check.json . Exact original body remains node-fetch__node-fetch/1446/original-issue-body.md, with original JSON and body SHA256 alongside it.

## Independent controls

I ran the unchanged generated private test six times on Node v24.15.0, with an independent 20-second process timeout, three times against the prepared parent and three against the exact upstream reference. All three parent runs failed only the primary leak test; both regression cases passed. All three upstream reference runs passed all three tests. The controls took approximately 0.25 seconds per run.

Parent primary observations on the same reused socket: data listeners 1 through 24; close listeners 2 through 25. Upstream reference: data listeners remain 0, close listeners remain 1, across all 24 consumed responses. Thus the primary result has a clear causal contrast aligned with the real repair and is not merely inferred from patch shape.

Evidence: review-evidence/independent-control-repeats.json . These are local non-inference test executions, not actor attempts or benchmark model spend.

## Assertion review

1. **Consumed body and payload preservation are fair.** The original reproduction consumes each response body. Checking distinct payloads protects against a repair that hides the leak by skipping work, returning an empty body, or reusing stale responses.
2. **A real keepalive reuse witness is fair, with a narrow interpretation.** maxSockets=1/maxFreeSockets=1 and a local server make repeated reuse controlled. Requiring one socket prevents "fixing" memory by silently disabling reuse or discarding the supplied agent. This is a preservation check for the selected reproduction, not a claim that arbitrary HTTP agents must reuse exactly one socket. The asserted freeSockets availability after setImmediate depends on Node scheduling, but all six controls behaved consistently.
3. **Listener growth is an appropriate deterministic proxy.** The upstream fix and commit message directly identify these listeners as the leak, avoiding a noisy heap/RSS slope oracle. This does not prove absence of every memory leak. The bound final <= third + 1 accepts a small constant tolerance and rejects the actual linear growth. It is a short horizon: growth beginning after request24, or a different retained resource, can escape. Conversely, an unusual correct bounded cache that intentionally retains more than this tolerance could fail despite bounded memory. No plausible need for such a listener cache appears in the original architecture. Describe acceptance as passing this retained-listener regression, not a universal memory bound.
4. **The premature chunked-body case is a fair regression guard.** It exercises behavior in the same function the repair touches. It is not an added feature requirement and passes on both historical parent and reference. assert.rejects accepts any rejection, so it does not prove an appropriate error kind or that the expected path rejected. It may be satisfied by Node24's own stream errors even if the legacy workaround is bypassed. Do not claim it rules out every workaround-removal regression; the unchanged native full suite provides broader coverage.
5. **The abort case is a fair adjacent regression guard, but its title overclaims.** It verifies body consumption rejects when the request is aborted, passing on both controls. It does not verify resources are released: finally forcibly destroys the agent and closes every server connection. The title "still rejects and releases resources" should be interpreted/reported as rejection-only unless a separate resource assertion is added before freeze. Adding a new assertion is optional and would require fresh positive/negative controls, not a post-result grader change.

## Required operational check and limitations

**Ensure an outer private-grader process deadline before inference.** The generated node:test cases have no individual timeout. Awaiting fetch, response.text(), or server.close() can hang on a bad candidate, so a timeout at the grading-process layer must terminate the process and classify timeout as a recorded failed/unknown grading outcome. My review runs were externally limited to20 seconds. field-native.mjs separately enforces30 seconds for the external upstream suite, but that does not establish a deadline for the private h02 process. If the parent runner already applies such a deadline, this concern is resolved without altering h02 assertions.

The full native suite is not clean on this modern host. The inspected baseline preflight ran390 tests:385 passes,3 pending,2 failures. Existing failures were "node-fetch should handle chunked response with final chunk and EOM in separate packets" (expected false to be true) and "node-fetch supports supplying a famliy option to the agent" (Invalid IP address: undefined). Preserve these exact baseline receipts and compare newly introduced failure identities, not merely failure counts or exit code; swapped failures must not pass. A disappearing pre-existing failure is improvement, not a reason to demand an identical failure set. Keep original native tests and dependencies frozen.

The public bridge executes63 unchanged Headers/Request/Response tests and no private leak regression. This is honest if actor-facing instructions say precisely which public tests test() runs; do not describe that bridge as full native node-fetch coverage. The parent additionally plans an evaluator-side run of the full unchanged native suite on each patch. Current public bridge preflight proves63 actual native passes within its one outer node:test case.

The issue reports node-fetch3.1.0; selected immediate parent is later, still genuinely affected as independently reproduced. Pin both the reported version and actual chosen parent in provenance. node-fetch last push was2026-05-12, about five months before this check; it is unarchived but does not satisfy a strict recently-active-within-weeks filter. Keep that activity exception visible.

The patch is a meaningful asynchronous lifecycle repair, yet historically only16 changed source lines. Two compared systems could solve it in few turns. Do not equate it with cross-module implementation complexity, sustained autonomy, or sufficient workload to activate every Suffice mechanism. Public issue memorization/contamination remains possible for a known historical fix; original body itself is clean, and private fixing details must remain outside actor context/history.

## Seven-task historical quality cohort

This is a quality shortlist, not a seven-task ready-to-run cohort. It preserves diversity while making four hard adapter exclusions explicit.

| Issue | Engineering content | Frozen adapter disposition |
|---|---|---|
| node-fetch #1446 | consumed keepalive socket/listener lifecycle | Primary exploratory pilot; control reproduced3/3 vs3/3 |
| node-fetch #1386 | malformed redirect URL error across callback/promise boundary | Compatible src JS reserve; native host/runtime grading still needs independent preflight |
| node-fetch #1574 | redirect/socket-close timing and null response lifecycle | Compatible src JS reserve; smaller patch, deterministic genuine reproduction not yet established |
| p-queue #251 | rate limiter idle/new-window transitions | **Hard blocked:** runtime source lives source/, outside frozen src write scope; issue includes root-cause hints |
| p-queue #168 | simultaneous running/queued cancellation and pending capacity | **Hard blocked:** source/; historical native TS/build tooling and upstream fix also touch package/config |
| emittery #118 | async subclass overrides interacting with internal meta-event state | **Hard blocked:** root index.js; original issue links a proposed solution |
| nanostores #323 | computed cache invalidation across cleanStores lifecycle | **Hard blocked:** computed/index.js outside src/ |

All seven remain genuine issue candidates. Four cannot be admitted by moving files, wrapping a replacement implementation, or rewriting original requirements. The larger16-row screen records additional complexity/contamination and source-layout rejects. No statement that all seven are operationally ready is supported.
'''
p.write_text(s+'\nChecked at '+datetime.datetime.now(datetime.timezone.utc).isoformat()+'\n',encoding='utf-8')
print(str(p))

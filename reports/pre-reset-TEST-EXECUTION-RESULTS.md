# Intelligent test execution — bounded result

Live experiment is blocked. The first GPT-6.1 Sol low screening request returned the explicit Subscription Sharing usage limit. It made zero tool/test calls, left an empty patch, and failed independent hidden acceptance while public/upstream regression passed (286 checks). No additional inference was launched. **0 scored attempts**, 1 operationally failed screening attempt, **$0 known API-equivalent inference**, 1 unknown-cost attempt. Zero known usage is not proof of zero billing. No live policy activation, baseline repair difficulty, efficiency gain, or capability gain was measured.

Three matched arms are implemented: unrestricted testing; fixed tests after every two meaningful production edits; revision-aware selective execution. Deferred results explicitly report no execution and no cached pass. Selective chooses executions, not individual test cases. The same hidden acceptance plus visible/upstream final suites run unconditionally after every agent session.

Four fresh historical js-yaml issues, separate from A/B/C, were validated before screening: alias-merge validation (screen), merge sentinel leakage (four source files), flow alias/property-only key separation, whitespace-only scalar dedent. Every original baseline fails behavioral assertions and every pinned upstream reference passes. Original upstream suites pass 286, 290, 297 and 305 checks respectively. Source-only fixtures exclude docs/distribution; original fuzzing, distribution-build and stress tests remain outside regression. Public historical fixes can be training-known.

An **offline, deterministic mechanism trace** used the screening baseline and reference. This does not involve model-generated repairs or demonstrate model savings. Six scheduled requests included duplicate visible checks, a new failing behavioral suite on unchanged baseline bytes, and a passing suite after a real one-file reference repair.

| Policy | Executed | Deferred | Public test wall ms | Observed failing executions |
|---|---:|---:|---:|---:|
| unrestricted | 6/6 | 0 | 2020 | 2 |
| fixed | 1/6 | 5 | 299 | 0 |
| selective | 3/6 | 3 | 956 | 1 |

All arms independently detect baseline failure and reference success in unconditional final checks. Fixed scheduling deferred the first novel behavioral check and saw **zero** intermediate behavioral failures: a concrete feedback risk. Selective observed the baseline behavioral failure once and deferred its identical repeat; it executed after source changed. None of the deferred observations was scored as a pass. The observed subprocess wall-time reduction is local to this constructed trace; it is not CPU accounting, a model token reduction, or a general efficiency estimate. Final test time is recorded separately in JSON and remains mandatory.

**Validation:** 13/13 relevant harness tests pass; all fixture/reference/acceptance hashes and both archived freeze snapshots match. Broad inherited suite is 86/87: existing retry-idempotency reference patch exact-match failure, consistent with Windows line-ending sensitivity; this is not silently treated as passing. The screening runtime is preserved under its original manifest. After the quota stop, a documented freeze-only amendment added no-inference scored freezing; therefore current screening runner/protocol bytes differ from its archived snapshot, while the scored snapshot matches current bytes. Artifact footprint 83.30 MiB, C: free 9.61 GiB. No auth values were inspected/copied; no API-key fallback.

**Recommendation:** retain revision-aware execution as an experimental mechanism, and avoid enabling the fixed two-edit policy by default: offline evidence demonstrates lost novel failure feedback. Resume only after future authorization/provider reset, starting with real policy-activation/difficulty screening. At present both equal-budget capability and model-cost efficiency comparisons are inconclusive. Concurrent campaigns affect machine/provider latency/cache. Engineering work is excluded from benchmark inference accounting.

Commands: `node --test tests/test-execution-policy.test.mjs tests/workflow.test.mjs tests/workspace.test.mjs tests/codemode.test.mjs`; `node scripts/test-execution-offline.mjs`; `node scripts/test-execution-report.mjs`. Frozen protocol: docs/TEST-EXECUTION.md. Data/receipts: reports/TEST-EXECUTION-RESULTS.json, reports/test-execution-offline.json, reports/test-execution-verification.json. Private raw artifacts: .suffice/test-execution-runs/.

# Completed integration attempt review

Recorded 2026-10-15T07:24:50.634528+00:00, after the blind contract report was saved and hashed. No tests, installs, inference or original artifact edits were performed.

All reviewed completed attempts failed final grading before executing native tests or private behavioral assertions because dependency container roots were linked as node_modules. Each reviewed actor also encountered missing dependencies and spent effort on workarounds. These are operationally invalid outcome measurements, not demonstrated coding failures.

| Attempt | Source retrieval | Actor dependency failure | Final grader |
|---|---|---|---|
| i01-suffice | critical_source_retrieved_and_relevant_change_applied | Observed | MODULE_NOT_FOUND before behavior |
| i01-stock-pi | critical_source_retrieved_and_relevant_change_applied | Observed | MODULE_NOT_FOUND before behavior |
| i02-suffice | critical_source_retrieved_and_relevant_change_applied | Observed | MODULE_NOT_FOUND before behavior |
| i02-stock-pi | critical_source_retrieved_and_relevant_change_applied | Observed | MODULE_NOT_FOUND before behavior |
| i04-suffice | critical_source_retrieved_and_relevant_change_applied | Observed | MODULE_NOT_FOUND before behavior |
| i04-stock-pi | critical_source_retrieved_and_relevant_change_applied | Observed | MODULE_NOT_FOUND before behavior |

Every reviewed submitted test edit is under test/ and is protected in v1; line-addition/removal details are in JSON. The root-test restoration gap found blind did not affect these six reviewed submissions. i03 and live attempts without completed results were not inspected.

**i01-suffice** â€” Submitted redirect try/catch, FetchError rejection, finalize/return and manual-mode exception match upstream production behavior structurally (comments differ).

Actor-side errors: sh: 1: mocha: not found; Error: Cannot find module '/workspace/node_modules/node_modules/mocha/bin/mocha.js' /   code: 'MODULE_NOT_FOUND',

Modified paths: src/index.js, test/main.js, test/utils/server.js

The source was retrieved and a relevant implementation was applied; no observed final explanation states a contrary invariant. Actor-reported test results remain trace evidence, not an independent healthy final grade.

**i01-stock-pi** â€” Submitted redirect try/catch, FetchError rejection, finalize/return and manual-mode exception match upstream production behavior structurally (comments differ).

Actor-side errors: sh: 1: mocha: not found; Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'chai' imported from /workspace/test/external-encoding.js

Modified paths: src/index.js, test/main.js, test/utils/server.js

The source was retrieved and a relevant implementation was applied; no observed final explanation states a contrary invariant. Actor-reported test results remain trace evidence, not an independent healthy final grade.

**i02-suffice** â€” Submitted hasData plus empty raw-end response settlement matches its stated public-issue approach; upstream also guards successful pump callbacks. Correctness is unmeasured by broken final grader; no contrary invariant established.

Actor-side errors: sh: 1: mocha: not found;   throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base), null); / Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'data-uri-to-buffer' imported from /workspace/src/index.js /   code: 'ERR_MODULE_NOT_FOUND'

Modified paths: src/index.js, test/main.js, test/utils/server.js

The source was retrieved and a relevant implementation was applied; no observed final explanation states a contrary invariant. Actor-reported test results remain trace evidence, not an independent healthy final grade.

**i02-stock-pi** â€” Submitted hasData plus empty raw-end response settlement matches its stated public-issue approach; upstream also guards successful pump callbacks. Correctness is unmeasured by broken final grader; no contrary invariant established.

Actor-side errors: sh: 1: mocha: not found; Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'chai' imported from /workspace/test/external-encoding.js

Modified paths: src/index.js, test/main.js, test/utils/server.js

The source was retrieved and a relevant implementation was applied; no observed final explanation states a contrary invariant. Actor-reported test results remain trace evidence, not an independent healthy final grade.

**i04-suffice** â€” Submitted refill/startAvailable and >= checks address live worker accounting; constructor and setter reject fractional1.2 as positive-integer guards, going beyond reference implementation but matching the public example.

Actor-side errors: sh: 1: nyc: not found;   code: 'MODULE_NOT_FOUND', / sh: 1: standard: not found / sh: 1: snazzy: not found

Modified paths: .nyc_output/5d16a7a3-0ed7-4eeb-8fcb-c691064fe3d6.json, .nyc_output/processinfo/5d16a7a3-0ed7-4eeb-8fcb-c691064fe3d6.json, .nyc_output/processinfo/index.json, README.md, queue.js, test/test.js

The source was retrieved and a relevant implementation was applied; no observed final explanation states a contrary invariant. Actor-reported test results remain trace evidence, not an independent healthy final grade.

**i04-stock-pi** â€” Submitted refill/startAvailable and >= checks address live worker accounting; constructor and setter reject fractional1.2 as positive-integer guards, going beyond reference implementation but matching the public example.

Actor-side errors: sh: 1: standard: not found / sh: 1: snazzy: not found; sh: 1: nyc: not found

Modified paths: .nyc_output/dba4e921-1f1a-4420-966e-a57a73160734.json, .nyc_output/processinfo/dba4e921-1f1a-4420-966e-a57a73160734.json, .nyc_output/processinfo/index.json, README.md, queue.js, test/test.js

The source was retrieved and a relevant implementation was applied; no observed final explanation states a contrary invariant. Actor-reported test results remain trace evidence, not an independent healthy final grade.

A second environment mismatch exists: isolated integration controls disable networking, while final grading inherits network=true. Fixing only the dependency link can make the exact expected native failure set differ because GitHub/httpbin tests start working. Match final grading policy to its validated controls in a separately versioned evaluator.

Fair rescue: a no-inference diagnostic regrade of existing patches can establish code behavior under corrected bindings; preserve it as supplementary evidence from environment-perturbed attempts. A fresh paired v2 run is needed for an uncontaminated environment comparison. Never silently replace v1 result bytes or count the recorded codingFailure flag as proved code failure.

Preflight:

- Normalize task dependencyDir to actual installed packages directory, not package/lock container; already-node_modules paths must not receive another suffix.
- Create disposable actor using exact scored actor helper and bind policy; verify node_modules realpath and native runner/production import resolution there.
- Run baseline issue-fail, healthy native, and historical reference issue-pass through exact final reconstruction and matching network policy. Verify failure signature is the public issue, never module resolution.
- Compare every tracked initial actor byte to admitted base, including supplemental lock manifests; require Git worktree commit and current base hashes agree before any model request.
- Restore all original native tests, type-test files, fixtures and runner/config inputs; root test.js and *.test-d.ts require explicit handling. Compare native test counts as well as allowed failure names.
- Preserve v1 receipts, manifests and result bytes; record any v2 evaluator/adapter input changes separately from unchanged14 frozen harness inputs.

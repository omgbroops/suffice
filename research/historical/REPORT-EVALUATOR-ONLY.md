# EVALUATOR ONLY - Historical GitHub screening

Do not place this directory, fixing commits/PRs, timelines, patches, grading notes, or report in any repair actor workspace/context. The raw original issue body is separate and exact UTF-8 (SHA256 recorded). A later worker packet should contain only permitted original requirements and the pre-fix source tree, with solution history unavailable.

Checked: 2026-10-15T04:41:49.384685+00:00. Sixteen resolved issues across five unarchived repositories were screened through live GitHub API; raw issue, comments/timeline, fix commit and parent, package metadata, tree and native source/test evidence are retained. **No benchmark model calls, implementations, installs, builds, tests, or harness edits were performed.**

## Recommendation

First pilot: [node-fetch #1386](https://github.com/node-fetch/node-fetch/issues/1386). Original requirements are a concrete malformed-Location redirect crash and catchable error; original body has no solution patch. Pre-fix `2d5399ed5605fb1b2e887f6e7953bc02e6194d52`, merged [PR1387](https://github.com/node-fetch/node-fetch/pull/1387), fix `6e4c1e4f67b7b6b8de13bbbf88991894dc003245`. PR1395 is **unmerged** and must not be used as the fix oracle. Runtime source is ESM JS in src/ and native Mocha tests import it directly. This is a medium integration task despite a small source patch.

Second provisional pilot: [node-fetch #1446](https://github.com/node-fetch/node-fetch/issues/1446), keepalive listener/memory retention. Pre-fix `004b3ac8324e6cdbfb5d04b8bbdc6664ea48fbcf`, [PR1474](https://github.com/node-fetch/node-fetch/pull/1474), fix `043a5fcfc82884155bcb2afba2a82333b2f29c02`. The issue was closed as a likely duplicate of1295 and comments identify this fix, so linkage confidence is lower. No native regression was added by the fix; verify resource/listener retention behavior deterministically before committing scored model spend. Avoid memory slope alone. #1574 is a smaller reserve whose nondeterministic reproduction also needs proving.

## Native test and host feasibility

node-fetch declares `^12.20.0 || ^14.13.1 || >=16.0.0`, so Node24 satisfies the metadata. The source is direct ESM and has three pure JS production dependency ranges (data-uri-to-buffer, fetch-blob, formdata-polyfill), no build step. Native test script is `mocha` (Mocha9), using chai and local test/utils/server.js. TestServer uses listen(0); test/main.js reads test/utils/dummy.txt. The inspected test/main.js and server.js contain no child_process/spawn/exec. An evaluator-owned visible.test.mjs could potentially instantiate Mocha in-process and load its unchanged native files using Mocha programmatic API, while hidden grading remains external. This is a feasibility observation, not a verified runner or permission proof. Full native tests on this host were not run. No lockfile is present in the fetched tree, so dependency closure must be frozen separately before scoring. Node24 historical stream behavior may require a baseline-failure policy; do not silently change original tests.

Only node-fetch has relevant runtime source under literal src/. p-queue uses source/, emittery and p-limit root index.js, nanostores atom/, computed/, listen-keys/. Those are hard frozen-adapter exclusions; do not relocate or copy their code under src, shim their implementation, or rephrase the original issue into an artificial replacement task. Their inclusion provides a diverse task-quality shortlist for later tooling decisions, not permission to change the architecture. AVA and build/lint tooling also use orchestration outside the current in-process test route.

Repository activity at check: node-fetch last pushed2026-05-12 (about five months ago, modest activity); p-queue2026-10-12; emittery2026-09-26; nanostores2026-10-14; p-limit2026-09-18. All report archived=false. A last push is weaker than sustained maintenance; node-fetch is a compatibility exception to a strict recent-activity filter.

Seven tasks form a quality shortlist (2provisional pilots,1reserve and4 source-layout-blocked reserves): node-fetch1386/1446/1574, p-queue251/168, emittery118, nanostores323. They are not seven runnable tasks under the frozen adapter. Many other real issues supply precise implementation code or fix links in the original body. Keep bodies unchanged and mark contamination; do not delete supplied hints to create a harder synthetic issue.

## Sixteen candidate rows

| Issue | Complexity | Disposition | Fix | Pre-fix |
|---|---|---|---|---|
| [node-fetch/node-fetch#1386](https://github.com/node-fetch/node-fetch/issues/1386) | medium | pilot-1 | [1387](https://github.com/node-fetch/node-fetch/pull/1387) | [2d5399ed5605](https://github.com/node-fetch/node-fetch/commit/2d5399ed5605fb1b2e887f6e7953bc02e6194d52) |
| [node-fetch/node-fetch#1574](https://github.com/node-fetch/node-fetch/issues/1574) | medium-small | reserve-3 | [1578](https://github.com/node-fetch/node-fetch/pull/1578) | [a92b5d5cf445](https://github.com/node-fetch/node-fetch/commit/a92b5d5cf4457c2da95d8404b08cfd06a426a2fa) |
| [node-fetch/node-fetch#1446](https://github.com/node-fetch/node-fetch/issues/1446) | medium | pilot-2 | [1474](https://github.com/node-fetch/node-fetch/pull/1474) | [004b3ac8324e](https://github.com/node-fetch/node-fetch/commit/004b3ac8324e6cdbfb5d04b8bbdc6664ea48fbcf) |
| [node-fetch/node-fetch#1442](https://github.com/node-fetch/node-fetch/issues/1442) | medium | reject-score-contaminated | [965](https://github.com/node-fetch/node-fetch/pull/965) | [92dee097c6a9](https://github.com/node-fetch/node-fetch/commit/92dee097c6a99d47f06c03c8a9c10b83c68d5b81) |
| [sindresorhus/p-queue#255](https://github.com/sindresorhus/p-queue/issues/255) | medium | reject-adapter-and-contamination | [22edad49b4](https://github.com/sindresorhus/p-queue/commit/22edad49b42214b9b5add8312391401c063d8b27) | [180ab9e25cd1](https://github.com/sindresorhus/p-queue/commit/180ab9e25cd10b6f548767d7176076b50d25e188) |
| [sindresorhus/p-queue#256](https://github.com/sindresorhus/p-queue/issues/256) | medium | reject-adapter-and-contamination | [507e7eeab7](https://github.com/sindresorhus/p-queue/commit/507e7eeab74970b991f1335b3f08cb5e08207ca3) | [de565c42a271](https://github.com/sindresorhus/p-queue/commit/de565c42a271bd3c2f8c69d3b6bce33f49f9d344) |
| [sindresorhus/p-queue#251](https://github.com/sindresorhus/p-queue/issues/251) | medium | reserve-blocked-4 | [08a012ac3a](https://github.com/sindresorhus/p-queue/commit/08a012ac3ae20093ea90676a5b788ec4b73c58f6) | [98ccb4887710](https://github.com/sindresorhus/p-queue/commit/98ccb488771059368b21cc2356234a70dc961c8b) |
| [sindresorhus/p-queue#249](https://github.com/sindresorhus/p-queue/issues/249) | medium | reject-adapter | [d9cf2be011](https://github.com/sindresorhus/p-queue/commit/d9cf2be011f3b7f127cac476de2d9927ed723491) | [cfa917af261f](https://github.com/sindresorhus/p-queue/commit/cfa917af261fb6db9eb1281221ba21093eb49e3d) |
| [sindresorhus/p-queue#168](https://github.com/sindresorhus/p-queue/issues/168) | medium-high | reserve-blocked-5 | [8184655027](https://github.com/sindresorhus/p-queue/commit/81846550274256011a2d55b06aeb36b23877eb43) | [c905aaf2a826](https://github.com/sindresorhus/p-queue/commit/c905aaf2a826c4581a604ee6bbb1ae41b062a598) |
| [sindresorhus/emittery#126](https://github.com/sindresorhus/emittery/issues/126) | medium-small | reject-adapter-and-contamination | [a3c04ca97d](https://github.com/sindresorhus/emittery/commit/a3c04ca97d9ebb13d04c8ba06031aa24d6f3382e) | [cfde903357cc](https://github.com/sindresorhus/emittery/commit/cfde903357ccfa6fb4d7e1888da17aa84dc2c009) |
| [sindresorhus/emittery#118](https://github.com/sindresorhus/emittery/issues/118) | medium | reserve-blocked-6 | [dd6d78befb](https://github.com/sindresorhus/emittery/commit/dd6d78befbf664268471c61a8363884e96777cff) | [c5e99b898b05](https://github.com/sindresorhus/emittery/commit/c5e99b898b05a67fbbb8bcb6cf34d2d35f582aff) |
| [sindresorhus/emittery#113](https://github.com/sindresorhus/emittery/issues/113) | small | reject-adapter-and-complexity | [fad52b902d](https://github.com/sindresorhus/emittery/commit/fad52b902de9a91fd6c0ca934c3a610e17a57908) | [fc902058a1fc](https://github.com/sindresorhus/emittery/commit/fc902058a1fc66a2601c6ba71a9d957e6a88622f) |
| [nanostores/nanostores#416](https://github.com/nanostores/nanostores/issues/416) | medium | reject-adapter-and-contamination | [419](https://github.com/nanostores/nanostores/pull/419) | [fd78b3d86a86](https://github.com/nanostores/nanostores/commit/fd78b3d86a8667bd0126e12cb1724f863348f097) |
| [nanostores/nanostores#371](https://github.com/nanostores/nanostores/issues/371) | medium | reject-adapter-and-contamination | [396](https://github.com/nanostores/nanostores/pull/396) | [8ad031dcde95](https://github.com/nanostores/nanostores/commit/8ad031dcde958413cf722b0fe46ceb65b547c747) |
| [nanostores/nanostores#323](https://github.com/nanostores/nanostores/issues/323) | medium | reserve-blocked-7 | [400](https://github.com/nanostores/nanostores/pull/400) | [dce1af0bd838](https://github.com/nanostores/nanostores/commit/dce1af0bd83802f03bad51dfb77c8ebc7019c836) |
| [sindresorhus/p-limit#110](https://github.com/sindresorhus/p-limit/issues/110) | medium | reject-adapter-and-contamination | [9df0d27f82](https://github.com/sindresorhus/p-limit/commit/9df0d27f82ab3cb6d7e1087f5bda94ce911d33ca) | [783068bb9e96](https://github.com/sindresorhus/p-limit/commit/783068bb9e967fd7bea8642e1bf5a3627fe38bdf) |

## Requirements, evidence, and exclusions

### node-fetch/node-fetch#1386: Uncatchable error when server redirects to invalid URL

Malformed Location URLs must reject the fetch promise with an appropriate error so caller try/catch works; avoid an uncaught process-level URL parse error.

Native test/main.js plus test/utils/server.js gained regression coverage. Source is direct ESM src JS; original issue has reproduction and expected behavior without solution patch. Native Node24 execution remains unverified; 2021 dependency ranges lack a repository lockfile; freeze resolved dependency closure. Full suite may have Node24 stream behavior drift.

Native: Mocha9, npm test=mocha; pre-fix test/main.js imports ../src/index.js directly; local HTTP server and filesystem test fixture. Contamination: clean.

### node-fetch/node-fetch#1574: TypeError: Cannot read properties of null (reading 'body') after update from 3.2.4 to 3.2.5 on 302 status code

Follow 302 redirects and return response.text without an uncaught null-body error, including Windows/Linux behavior.

Original report is explicit Windows/Linux regression after3.2.5; comments confirm1578 restored stability. Direct src JS. Fix adds3 lines and no native regression. Original public reproduction does not specify a deterministic server timing sequence, so validate a genuine reproduction before spending model budget.

Native: Mocha9, npm test=mocha; pre-fix test/main.js imports ../src/index.js directly; local HTTP server and filesystem test fixture. Contamination: clean-original-body.

### node-fetch/node-fetch#1446: Mem leak when keepalive is used

Repeated fetches through a keepAlive HTTP agent, consuming each body, should not retain memory/listeners indefinitely relative to plain node:http.

Merged fix PR1474 explicitly addresses leaked listeners (primary issue1295); comments on1446 identify duplicate/fix. Stateful socket lifecycle and listener cleanup. No native regression added by this fix. Weaker issue-to-fix linkage than1386; memory working-set slope alone is noisy. Need deterministic evaluator-only retained-listener/resource oracle and native suite compatibility before scoring.

Native: Mocha9, npm test=mocha; pre-fix test/main.js imports ../src/index.js directly; local HTTP server and filesystem test fixture. Contamination: clean-original-body.

### node-fetch/node-fetch#1442: Fetch never resolves on empty response with `deflate`

An empty HTTP200 body marked content-encoding:deflate must settle fetch and response.text like gzip.

PR965 adds native server fixture and regression test, direct src JS; issue release bot ties resolution to3.2.0. Original issue includes an explicit implementation diff. Preserve the issue unedited, but do not use as a blind repair scored task.

Native: Mocha9, npm test=mocha; pre-fix test/main.js imports ../src/index.js directly; local HTTP server and filesystem test fixture. Contamination: solution-patch-in-original.

### sindresorhus/p-queue#255: Adding tasks from an active listener exceeds the concurrency limit

Adding work reentrantly from an active listener must respect configured concurrency and pending counts.

Modern Node24 reproduction and native node:test TypeScript regression. Canonical source lives source/, outside frozen src-only write allowlist. Original body contains tested fix and implementation directions.

Native: node:test+tsx; full npm test additionally xo/build/tsd. Contamination: tested-fix-linked-in-original.

### sindresorhus/p-queue#256: Abort during task setup is missed before the running listener is registered

Synchronously aborting during task setup must reject add and release capacity even before the running listener exists.

Modern Node24 reproduction and native tests exercise cancellation/microtask ordering. Canonical source source/ is unwritable. Original issue describes exact fix.

Native: node:test+tsx; full npm test additionally xo/build/tsd. Contamination: implementation-directions-in-original.

### sindresorhus/p-queue#251: Fixed-window rate limiter incorrectly delays tasks in a new interval when `intervalCap > 1` and queue went idle mid-window

After an interval window expires, tasks must start with fresh capacity even if earlier work consumed slots at different times and the queue went idle.

Meaningful rate-limiter state transition, regression coverage across advanced/rate-limit/strict suites. Frozen adapter cannot edit source/. Original includes root cause diagnosis; any use must explicitly disclose supplied solution hints rather than remove them.

Native: node:test+tsx; full npm test additionally xo/build/tsd. Contamination: root-cause-in-original.

### sindresorhus/p-queue#249: onSizeLessThan() resolves late when the queue drains without a completion

onSizeLessThan must settle when start, concurrency changes, aborts or clearing drain the queue below the threshold, without waiting for unrelated completion.

Meaningful queue observer lifecycle,123 regression lines added. Canonical source source/ is unwritable. Full package test invokes build/lint/tsd and cannot run through frozen test tool without an evaluator-side allowed native in-process entry.

Native: node:test+tsx; full npm test additionally xo/build/tsd. Contamination: diagnosis-in-original.

### sindresorhus/p-queue#168: Aborting pending and waiting tasks at the same time hangs the queue

Aborting both running and queued tasks must not leave pending counts stuck or permanently block the queue.

Clear historical concurrency repro; substantial source refactor in closing commit. source/ blocked; native tests were AVA4 with build, nyc, TS4.5. Closing commit also changes package.json and tsconfig, outside actor scope. Whole commit is not an admissible source-only oracle.

Native: AVA4+TypeScript build+nyc. Contamination: clean-original-body.

### sindresorhus/emittery#126: `emitSerial()` doesn’t deliver events to async iterators

emitSerial must deliver to events and anyEvent async iterators as ordinary emit does.

Genuine async iterator integration bug;42 native AVA regression lines. index.js lives repository root, outside src/. Original body supplies missing enqueue call and local fix description.

Native: AVA4+nyc+tsd; root JS runtime, zero production deps. Contamination: solution-in-original.

### sindresorhus/emittery#118: `emitMetaEvent` assumes synchronous operation

Meta-event operations must work when a subclass emit override yields asynchronously, without resetting permission state before the override runs.

Async subclass/internals interaction;356 native AVA regression lines. Root index.js is blocked. Original links a proposed solution in another issue; classify as hinted if used under a future adapter.

Native: AVA4+nyc+tsd; root JS runtime, zero production deps. Contamination: solution-reference-in-original.

### sindresorhus/emittery#113: Wrong listener count for Symbol event names

listenerCount(Symbol()) must report that symbol event count rather than the sum of all events.

Concrete public Symbol-vs-string functional regression with native tests. Root index.js blocked; narrow type-dispatch correction below preferred engineering complexity.

Native: AVA4+nyc+tsd; root JS runtime, zero production deps. Contamination: clean-original-body.

### nanostores/nanostores#416: listenKeys stopped firing on whole-store set() for deepMap dot-path keys (regression from #406)

listenKeys must fire for deepMap dot paths after a whole-store set changes those paths.

Cross-module key path/change detection, native TS tests added. Source listen-keys/index.js outside src/. Original body gives detailed implementation diagnosis; native toolchain has oxlint native packages but pure JS runtime has zero production dependencies.

Native: better-node-test+TS; full test includes lint/types/size. Contamination: detailed-diagnosis-in-original.

### nanostores/nanostores#371: Issue with "epoch" Global Variable Across Multiple Module Instances

Independent module instances must share a consistent epoch so computed state does not silently stop updating in split/tree-shaken bundles.

Real multi-module bundler integration; atom and computed both touched. atom/ and computed/ outside src/. Original body proposes Symbol.for globalThis implementation. Fix also changes package.json and adds no regression test, so incomplete source-only oracle evidence.

Native: better-node-test+TS; full test includes lint/types/size. Contamination: solution-code-in-original.

### nanostores/nanostores#323: `cleanStores` doesn't reset values of `computed`

cleanStores must clear cached computed values between tests so later subscriptions cannot reuse stale derived state.

Interaction across clean-stores and computed; native24-line regression. computed/index.js outside src/. Native runtime tests are TS/node-test via better-node-test; full npm test additionally runs lint/types/size process tooling.

Native: better-node-test+TS; full test includes lint/types/size. Contamination: clean-original-body.

### sindresorhus/p-limit#110: limit.map can leave unhandled rejections when iteration throws

When an input iterator throws, map must reject that error while observing already-scheduled mapper rejections so Node does not terminate from an unhandled rejection.

Meaningful iterator/scheduler/error-lifetime interaction;106 native AVA regression lines, modern Node24 report. Root index.js outside src/. Original includes cause and proposed fix; package whole fix also touches types/docs.

Native: AVA6+xo+tsd; one production dependency yocto-queue. Contamination: proposed-fix-in-original.

## Additional discarded leads

node-fetch1123 was closed after the author found application inspection code caused the behavior; no product fix exists. p-queue200 actually reports p-limit behavior, so it is not a p-queue issue task. Emittery102 points to PR103 but GitHub currently returns410 for that disabled PR and no fix commit was established, so it is not counted among the16. Emittery51 has extensive competing design proposals, no clean original standalone requirements or verified fix commit; excluded. Mitt/eventemitter3 closed issues are often usage/design semantics or type/package questions, and their canonical runtime source also fails either the source-root or desired-complexity/activity screen. No unresolved issue was mislabeled a historical resolved task.

Machine-readable full record: screened-candidates-evaluator-only.json. Raw API provenance and exact original bodies: <owner>__<repo>/<issue>/. The initial harvest includes rejected exploratory records too.

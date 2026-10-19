# Cohort B preparation and safety review

These three tasks were selected before actor inference. Original issue title and body are the only issue discussion content placed in the public specification; fix commits, reference patches, contract notes, and acceptance files belong to evaluator preparation only.

| Task | Public issue | Base | Reference fix | Production diff |
| --- | --- | --- | --- | --- |
| b04 | ljharb/qs #510 | 7ebf48b42a4780b3b0b18f12be727bd57a49256b | 1bf9f7a7f5efb3888f3653137f90a96f32fe95ff | lib/parse.js |
| b05 | ljharb/qs #357 | cbd246947c235b51d706811cc9f6f8c55b6522dd | a80b84a87d3e41425ac5f5777c615fe744988f7c | lib/parse.js |
| b06 | isaacs/minimatch #157 | 9c7c4bcd9abe9d2de9139383d6f69fd50a0cd990 | a979c0663b393f50bd18689d59b29b3163d3b61b | minimatch.js, package.json |

Discovery data is archived under `.suffice/broad-discovery/b`: Git clones, issue API/HTML data, original issue objects, full reference diffs, pinned package manifests, and commit metadata. HTML includes discussion for discovery provenance, but `publicBody` is extracted specifically from the top-level Issue object, never comment objects. API rate limiting required read-only Git clone and public HTML fallback; no tokens or credential files were read.

## Static execution assessment

- No downloaded project scripts, package installation, native tests, or actor inference were executed on this Windows machine.
- Git clone/show/diff and Python standard-library HTTPS/JSON/file operations were used for discovery and specification authoring. No repository hooks or build lifecycle commands were invoked.
- Selected packages contain pure JavaScript production code. No task needs a compiler, build, network service, shell command, credential, or persistence feature.
- Native commands call project test entrypoints directly, bypassing package pretest/posttest/publish hooks. In particular qs npm scripts can run lint, README evaluation, an npm audit network command, and distribution builds; those are deliberately outside the native commands.
- qs native tests import tape, encoding/fixture/property-mocking libraries and local source; static searches found no subprocess, network, or filesystem mutation commands. Property-mocking tests restore mocked properties through their test cleanup.
- minimatch native tests use tap and local source. A no-path-module test mocks the built-in path import. The existing ReDoS regression test allocates bounded strings around 15 KiB and 64 KiB and evaluates matching; it does not invoke an exploit against external services. No subprocess/network/filesystem mutation calls were found in the test sources. Tap itself may spawn local test processes; run within the benchmark isolation/resource boundary.
- Acceptance scripts use Node assert, load only the actor workspace package through `process.cwd()`, print totals, and set exit status. They do not read evaluator files, use network, create files, or start processes. They are intended for evaluator execution after actors stop.
- Install with `--ignore-scripts`. Selected dev dependencies are explicitly listed in the specs. Dependency installation and runtime validation must still occur on Sonion before the cohort is frozen or dispatched.
- The minimatch reference package.json diff only adds the `snap` test script. It changes no dependencies. It is included because changedPaths represents the complete non-test reference diff.

## Acceptance contract

b04 has 10 cases covering the reported empty-array round trip under both options, nested and encoded keys, independent arrays, and unchanged scalar-null/nonempty behavior. b05 has 11 cases covering comma splitting for dictionary input and preserving scalar, default/disabled-option, non-string, string-input, and immutability behavior. b06 has 12 cases covering zero/one/many directory globstars, relative and leading patterns, adjacent globstars, and existing dot/nocase/noglobstar constraints. All assertions use public APIs and issue/documentation contracts; they do not require the reference implementation's internal structure.

## Preflight amendment before inference

The initial b06 preflight failed for two evaluator reasons. The original hidden case that required `makeRe('/path/**/*.html')` to reject `/path/.hidden/page.html` also fails on the upstream reference: that is a pre-existing, unrelated makeRe limitation. It was removed, leaving the reported issue and supported option behavior intact. The initial reference native run failed one exact-RegExp-rendering assertion at baseline `test/basic.js:54` for `**/.x/**`; all 290 other assertions in that subtest passed. This is an obsolete implementation snapshot, since a valid zero-directory globstar fix changes RegExp source.

The amended public native command evaluates the same pinned `test/basic.js` source in memory, omitting only the historical `t.equal(tapOpts.re, expectRe, null, tapOpts)` assertions for all patterns. It keeps the actual public matching assertions, consistency between public makeRe APIs, and the rest of that file's behavior tests. It reads one fixed public test file and compiles it as the same module path; no disk write, network, or process launch is added. The other nine native test files still run unchanged through tap. The old failed preflight receipts must remain preserved under their original revision; repeat controls use a distinct fixture revision. No paid inference or actor feedback influenced this amendment.

These are small historical library fixes, not a representative sample of all open-source issue complexity. Fresh means unused by this benchmark campaign, not necessarily absent from model training data. Baseline native-pass/acceptance-fail and reference native-pass/acceptance-pass are mandatory Sonion preflight gates, not claimed here.

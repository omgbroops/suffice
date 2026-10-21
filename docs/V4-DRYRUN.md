# V4 polyglot dry run

Command: `node scripts/v4-dryrun.mjs <taskId>` once per manifest task (no model calls). Stub = untouched exercise with acceptance tests hidden and restored in a throwaway copy. Reference = `.meta` example files copied over the stub.

| task | lang | stub-result | reference-result |
|---|---|---|---|
| cpp/linked-list | cpp | compile_error | pass |
| javascript/space-age | javascript | test_fail | pass |
| rust/gigasecond | rust | test_fail | pass |
| cpp/clock | cpp | compile_error | pass |
| go/forth | go | test_fail | pass |
| java/simple-linked-list | java | test_fail | pass |
| java/ocr-numbers | java | test_fail | pass |
| javascript/react | javascript | test_fail | pass |
| python/dot-dsl | python | test_fail | pass |

toolchain_missing: none. Toolchains present: cmake, c++, go, node/npm (polyglot-node/node_modules), cargo, gradle/gradlew + java, pytest.

Note: java/ocr-numbers passed only after `applyReference` also copied the extra example `Digit.java` (config `example` list is longer than `solution`; the first run without it gave reference compile_error).

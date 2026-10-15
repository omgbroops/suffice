# Prepared live packages

Three unresolved live issues are runnable on Sonion with frozen source snapshots, dependency locks, private grader hashes, native test receipts, and independently executed original inline reproductions. See READY.json and each l01/l02/l03 directory. No scored inference, source fixes, or upstream actions occurred.

All three selected issues were refreshed through the live GitHub API at preparation: open, unassigned, no comments or timeline events. p-wait-for and p-debounce had no open PRs. Workerpool open PR bodies were reviewed; none implement this finalization issue. The issue author's diagnostic explanation or suggested direction alone is not an implementation claim.

## Exclusions

The earlier research screen remains valid for async-mutex90 (already scored), ofetch632/620 (open fixes), Chokidar1493 (open fixes), Vitest11571 (existing local fix), Fastify7090 (open fixes), and Arquero329 (stale/unverified). This preparation additionally rejected ttlcache44 (PR45), fastq86 (PR87), fast-glob528 (PR529), Fastify7113 (PR7114), Fastify7098 (PR7099 and claimed work), fast-json-stringify866 (PR867/870), fast-json-stringify896 (PR897), p-memoize62 (author explicitly tested a local fix), Workerpool411 (contributor claims investigation), Workerpool588 (author uses a local patch), tinyglobby188 (PR207), and fast-json-stringify621/740 (open fixes). Vitest11585 remains an untouched but large dependency/build reserve; three smaller stateful tasks were validated instead.

## Scope and caveats

Workerpool build, the complete Promise/Queues/environment suites (73 tests), and types pass under the unchanged sandbox. Full npm test failed in high-worker-count Pool tests with CodeRange virtual-address reservation exhaustion; that complete failure receipt is retained. Acceptance includes an actual single-worker pool execution, not only custom Promise probes.

p-wait-for's 49 original tests and tsd pass with AVA caching disabled via a generated runner-only config, because dependency directories are read-only. AVA ignored its CLI --no-cache flag; both failed attempts are retained. p-debounce's 77 original native tests and tsd pass. Lint and unrelated broad CI orchestration are not claimed.

Grader requirements come from each public issue contract. They assert results, settlement and invocation counts, not implementation shape, exception text, or undocumented requirements. There are no solution references for unresolved live tasks.

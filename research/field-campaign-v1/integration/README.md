# Evaluator-private integration task preparation

These four tasks were selected before actor execution by engineering scope and their original public requirements. No scored model calls or upstream writes were performed in preparation.

| Task | Public issue | Contract exercised |
| --- | --- | --- |
| i01 | node-fetch/node-fetch#1386 | Malformed HTTP redirect locations reject through the fetch promise; manual responses remain readable; healthy redirects follow. |
| i02 | node-fetch/node-fetch#1442 | Empty deflate responses settle under common framing; healthy wrapped/raw deflate and gzip decode. |
| i03 | sindresorhus/p-limit#110 | Throwing iterators reject promptly with original error identity while already scheduled mapper failures remain observed. |
| i04 | mcollina/fastq#80 | Pause/resume, changing concurrency, queue insertion, and worker completion share a consistent scheduling policy. |

Each `iNN` directory contains original issue API data/body, the exact pre-fix archive, fix metadata, private production reference files, private acceptance tests, dependency installation logs, and control execution receipts. Actor requirements are the original issue body only. Source archives are extracted and locally initialized as a new repository with the pre-fix tree and a generated frozen npm dependency lock; no future Git objects are imported. Native dependencies are installed from the original unmodified package manifest with lifecycle scripts disabled. The public repositories did not track npm lockfiles for these revisions; generated lockfiles record the actual resolution used for both treatments.

Acceptance assertions are derived from issue reproductions and existing public APIs. They avoid exception-message coupling. HTTP tests use loopback servers, never the historical third-party sites. The empty-response timeout detects the original promise settlement failure. The limiter test runs with strict unhandled rejection handling and waits for queued work to complete. The fastq test uses explicit completion callbacks so scheduling assertions do not depend on timing.

Scope notes retained before scoring:

- node-fetch#1574 was considered but excluded because its upstream fix is a tiny null guard; #1386 and #1442 offer richer redirect and stream lifecycle behavior. node-fetch#1446 was already scored and was not reused.
- fastq#80 mentions fractional concurrency values. The merged upstream reference continues accepting fractional values, so the independently justified acceptance test covers 0, -1, and NaN validation, plus the issue's concrete scheduling defects; it does not assert an unsupported integer-only policy.
- p-limit#110 explicitly proposes hardening beyond the then-documented `Array.from` equivalence. Its original public body states immediate iterator rejection, observation of already scheduled work, shared-queue behavior, and array-like support. The task retains that body exactly, including the author's assistance disclosure and linked candidate fix.
- Full original runtime suites run before private overlays. Existing Node 24 native failures, if present, are retained by exact test identity and matched baseline/reference, never silently treated as acceptance successes.


## Completed Sonion validation

All four packages are ready on Sonion. Original runtime native suites run before grader overlays. i01 and i02 each have four identical baseline/reference Mocha failures under Node 24; task metadata records exact identities and exit codes. i03 passes all 23 original AVA tests; i04 passes both original tape test files. Every private acceptance test fails on the unchanged pre-fix source and passes with upstream production files only.

`sonion-summary.json` records native summaries, original API-body equality, private test/reference hashes, disk usage, and source audits. Each base matches every regular source archive file byte-for-byte, has exactly one locally initialized pre-fix Git commit, tracks its frozen generated npm lock, and contains no private overlay.

All installs and controls completed on the remote EXT4 filesystem sequentially, using the original package declarations. Two setup issues and failed attempts remain recorded: Mocha 9 uses `bin/mocha` (not `bin/mocha.js`); AVA needs its empty cache directory staged before the dependency tree is mounted read-only. AVA catches attempted cache writes itself. No source, test selection, or harness changes were required for these repairs. Local Windows metadata backups are retained as `task.windows.json`; current task metadata uses Sonion Linux paths.

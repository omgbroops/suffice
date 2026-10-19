# Implementation validation

Canonical source: `C:\Users\Eric Qin\Documents\GitHub\suffice`, branch
`codex/shared-core-ablations`, based on `2ddc5d043928d8dbfe8614bbc5afdc412b475f10`.

* `node --test tests/execution-strategies.test.mjs tests/pipeline-*.test.mjs`:
  **54 passing**, zero failing. Covers actual Pi prompt/tool/effort parity,
  preserved codemode/AST, large and binary output recovery, cancellation,
  concurrent isolation, source freshness, notice behavior, accounting stops,
  actual exit-status checks, contract coverage, same-model repairs and selective
  Sol assistance when a public contract fails. No inference is used by these tests.
* Full Windows `npm test`: **146 passing, 2 failing, 148 total**. Failures are
  `packages/cli/test/cli.test.mjs`'s native multi-package tool test (repository path
  rejection) and `tests/tasks.test.mjs`'s synthetic reference repair test (exact
  replacement mismatch). Both reproduce in a pristine archive of the starting
  commit: targeted baseline run **6 passing, the same 2 failing**. They are retained
  rather than fixed as part of this experiment or omitted from the full-suite result.
* The production `packages/cli/src` tree has no diff from the starting commit.
  Existing V1 CLI defaults, model settings, codemode, AST and cache behavior remain.
  No previous benchmark source or report is edited.
* WSL staging copies canonical source bytes and verifies SHA-256 for every copied
  file. It creates only `/home/eric_qin/suffice-shared-core-v1/app`; old WSL runtime
  and campaign directories remain unchanged. Credentials are mounted from existing
  Eric Qin state, not transferred or published. Frozen staging hashes are in the
  campaign manifest. The Mohammed machine was offline; the user chose commit/push
  and later pull, rather than live synchronization.
* The OS boundary probe verifies private campaign state and graders are masked,
  while public reproducer scripts are visible and read-only. Grading restores
  original public tests and runs separately, with no hidden feedback to workers.
* Fresh fixture preparation uses no model calls or package lifecycle scripts.
  All four unrepaired baselines fail issue acceptance and all four focused positive
  controls pass existing project checks plus public and independent issue checks.
  Failed preparation probes and the p-memoize upstream compatibility regression are
  retained. See the protocol for loader and focused-reference amendments, all made
  before any paid actor inference.

The shared entry point is experimental `npm run execute`, taking JSON on stdin;
it is not a replacement installed CLI or a production default switch.

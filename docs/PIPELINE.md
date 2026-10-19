# Experimental execution pipeline

This implements decomp-inspired execution policies on the existing Pi harness. Original CLI, packet executor, and frozen packet benchmark sources are preserved. The normal `npx suffice` interface is unchanged. This is an opt-in research entrypoint, not a default product release or a promise of benchmark savings.

## Single task

Write a request JSON using absolute paths and run `npm run pipeline < request.json` in a POSIX shell, or `Get-Content -Raw request.json | npm run pipeline` in PowerShell. Use a new receipts directory outside the repository for each invocation. Existing receipts are never reused. Node must run a standalone entrypoint: do not invoke with `--input-type`, which leaks into codemode children.

```json
{
  "experimental": true,
  "profile": "thin",
  "workspace": "/absolute/path/to/repository",
  "runDir": "/absolute/path/to/new-receipts",
  "prompt": "Implement the requested change and preserve public compatibility.",
  "authPath": "/absolute/path/to/existing/suffice/auth.json",
  "model": "gpt-6-luna",
  "effort": "high",
  "maxCostUsd": 0.25,
  "timeoutMs": 300000,
  "maxTurns": 40,
  "maxCalls": 160,
  "maxRepairAttempts": 1,
  "checks": [{"command": ["npm", "test"], "expectedExitCode": 0}],
  "contracts": ["Preserve existing default behavior and documented error handling."],
  "guidance": ["Use the repository's existing test framework."],
  "features": {
    "outputControl": true,
    "preparedContext": true,
    "guidance": true,
    "notices": true,
    "advice": "on_failure",
    "repairs": true,
    "solTakeover": true,
    "effortScheduling": false,
    "runbooks": false
  }
}
```

The controller runs initial implementation, configured public checks, optional Sol Low advice, bounded Luna repair, and optional Sol Low takeover. Checks that already pass do not trigger escalation. Missing checks are explicitly `not_configured`; successful commands are not independent acceptance. Every implementation/advice stage receives refreshed prepared evidence; model summaries do not substitute for source.

Feature flags default off. `profile: baseline` selects the original session; set Sol Low and all features off for the original no-routing comparison. `profile: thin` uses a smaller task prompt and retains codemode plus all original native/AST tools. There is no keyword-based model routing in this executor. `advice: upfront` is a separate experimental setting; advice is tool-free, has a one-response allowance and a short requested output, and its complete response/cost is archived even when only a bounded excerpt is forwarded. `effortScheduling` explicitly selects Low for repairs; otherwise worker effort stays fixed.

## Output and evidence

Output control intercepts native Bash bytes before Pi's own truncation and retains them outside the actor repository. Codemode programs receive the original structured results. Only final model-facing presentation is condensed, including codemode script printouts. Short responses remain intact; long ones contain status/diagnostics/head/tail and an opaque `command_output` handle. Retrieval supports bounded byte pages, literal search and exact binary base64. Streaming previews are bounded too. Artifacts remain on disk; there is no automatic retention cleanup policy.

Prepared context is deterministic bounded filename ranking with source previews and SHA256 references, not semantic retrieval. It is navigation evidence, not a claim to find every relevant file. Optional `contextPaths` supplies explicit public paths. Existing repository instructions continue to load; automatic skills/plugins remain disabled. Guidance and contracts are explicit request values. Notices are soft and session-local: rereads require unchanged source actually retained in the model context, and repeated failures require a stable observed source fingerprint. They never deny tools or reset a session.

## Fleets

Use the same entrypoint with `mode: fleet`, `experimental: true`, a new `runDir`, an empty `coordinatorWorkspace` outside worker repositories, and at least two `tasks: [{id,workspace,prompt,checks,features}]`. Supply top-level runtime/auth, overall `maxCostUsd`, `timeoutMs`, `concurrency: 1|2` and `batchedAdvice: true|false`. Default worker is Luna High. Task workspaces must not overlap, including symlinks.

Fleet execution makes one tool-free Sol Low request for bounded JSON advice covering every task. Known advice cost is allocated equally, then remaining worker budgets are disjoint reservations. It launches at most two workers, never decomposes one task into competing writers, and never borrows another task's reservation. Failure-specific advice is possible inside the worker's allocation. Unknown costs, malformed advice, receipt failures or overspending stop unlaunched tasks; already running tasks settle with their costs preserved. The nine-attempt system comparison does not exercise fleet batching.

## Runbooks and handoffs

`knowledge.mjs` exposes `createRunbook`, `promoteRunbook`, `getReusableRunbooks` and `createTaskHandoff` for explicitly supplied artifacts. A runbook needs a successful source-task verification receipt and a distinct successful fresh-replay receipt before reuse; source hashes are revalidated. With `features.runbooks: true`, pass `runbooks` in the request to select verified lessons. This protocol validates receipt structure and freshness; it does not authenticate an arbitrary caller's assertions or invent verification runs.

Handoffs require `boundary: true`, preserve a complete JSON history snapshot plus source references, and refuse oversized snapshots. They do not clear, compact, rewrite or automatically replace a Pi session. No automatic learning, background indexing or hidden model calls are installed.

## Allowances and receipts

Worker, advice, repair and takeover use one dollar/time/response/tool allowance. Costs are checked between responses: a single response can exceed the nominal cap and is then ineligible. Missing or aborted usage is unknown, never free. `worker.json`, stage records, request/preparation/check records and raw provider/assistant events distinguish operational completion, public verification and budget eligibility. Reasoning is included in output usage, not added a second time.

Local execution has the existing CLI's user permissions. The Sonion benchmark separately uses the existing bubblewrap/resource boundary and independent protected-test grader. Local source is canonical; remote runtime and local hashes are checked, and remote artifacts are copied back. See `benchmark/pipeline-plan.md` for the predeclared Codex Sol Low / v1 Sol Low / mixed-model v2 comparison.

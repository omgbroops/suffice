# Suffice v2 — packet execution experiment

An additional opt-in execution pipeline now lives in `src/pipeline/`, launched with `npm run pipeline`. It supports prepared public context, recoverable output control, deterministic verification, Luna implementation/repair, selective Sol advice/takeover, independent-task fleets, and explicit knowledge/handoff artifacts. See [PIPELINE.md](docs/PIPELINE.md) for flags, JSON requests, evidence boundaries and limitations. Original packet code and frozen results below remain preserved.

This is a separate research prototype copied from Suffice CLI `af06ce5`. The original checkout, Pi interface and frozen benchmark artifacts are unchanged. `SOURCE-PROVENANCE.json` records every copied file's original hash. No credentials or session histories were copied.

Normal `npx suffice` still uses the existing Pi-native interface and lean agent. Experimental execution is opt-in through `npm run packet`, which reads a JSON request on stdin. Requests select `mode: "baseline"`, `"routing"` or `"packets"`; routing and packets additionally require `experimental: true`. This prototype does not change the interactive agent's default behavior.

The completed 18-attempt Sonion comparison and decision are in [ASSESSMENT.md](reports/packet-bench-v1/ASSESSMENT.md), with every result in [RESULTS.md](reports/packet-bench-v1/RESULTS.md). All modes accepted 5/6 issues. Routing alone cost less than packets; neither improved acceptance. Both remain experimental.

For experimental execution, create a JSON request using absolute paths:

```json
{
  "mode": "packets",
  "experimental": true,
  "workspace": "/absolute/path/to/project",
  "prompt": "Implement the requested repair and verify existing behavior.",
  "runDir": "/absolute/path/outside-project/packet-run",
  "authPath": "/absolute/path/to/.suffice/auth.json",
  "maxCostUsd": 0.5,
  "timeoutMs": 600000,
  "checks": [{"command": ["npm", "test"], "expectedExitCode": 0}]
}
```

Use your existing Suffice login file; do not put credentials into the request. From this checkout, run `node src/packets/entry.mjs < request.json` in a POSIX shell, or `Get-Content -Raw request.json | npm run packet` in PowerShell. Set the real task and its appropriate check commands. Standalone local runs have the existing CLI's user permissions; the Sonion benchmark separately supplied its existing OS execution boundary.

- **Baseline:** existing Sol Low prompt, codemode, native tools and AST navigation in one session.
- **Routing only:** deterministic public-task complexity rules choose Sol Low for complex work or Luna High for simpler work. One Sol repair is permitted when predeclared public project commands fail.
- **Packet routing:** same classifier and public-failure escalation. Simple tasks remain one Luna session. Complex tasks use a read-only Sol Low planning stage, at most two cohesive Luna High implementation packets, then deterministic project verification. Packet workers retain exact repository access, source references and version hashes; summaries do not replace source. Each packet has append-only history; earlier stages are archived unchanged.

Luna High is an explicit experimental effort choice, not the previous Luna XHigh baseline. The experiment measures model routing and decomposition together; it does not isolate the value of each model independently. Baseline-versus-routing also includes the public-failure repair policy; routing-versus-packets shares that policy and is the cleaner packetization comparison.

There is no local model, token decryption, learned router, automatic history rewriting, forced output compression, speculative cache warmup or blanket per-tool model call. Stable worker prefixes and tool schemas are reused where possible. Cache hits are observed from provider receipts, never assumed. Planning, handoffs, retries and escalation count toward the same total allowance.

## Bounded Sonion benchmark

Six real historical issues reused for development: Axios #7192, json-schema-ref-parser #370, fast-xml-parser #874, Commander #2342, PostCSS #2168 and Undici #5728. They cover streams/errors, recursive schemas, byte-input compatibility, inherited settings, source mappings and redirect-body lifecycle. They are not fresh held-out tasks and remain largely repairs rather than long feature builds.

All three arms receive identical task text, public workspaces, dependencies and command lists. Independent scoring restores original tests, applies only production patches, and adds private contract tests after actors have finished. Actors cannot access graders, references, other attempts or parent reports. Before scoring, the adapter reruns baseline/reference controls and verifies native checks under both actor and grading network conditions.

There are 18 planned attempts, counterbalanced ABC/BCA/CAB twice, with at most two actors running on Sonion. Every attempt has the same $0.50 API-equivalent inference allowance, 600-second total worker time, 60 assistant responses, 240 model tool calls, and the existing 4 GiB process-tree RSS ceiling. Checks use the same remaining wall-clock allowance. Costs are checked between responses, so a response can cross the nominal allowance; such attempts are not budget-eligible. Maximum nominal campaign allowance is $9, with a preference to spend substantially less. Engineering inference, offline checks and actual subscription spending are separate.

All task inputs, prompts, source files and dependency identities freeze before live dispatch. The original Sonion execution boundary and task materializer are reused; no new VM/container infrastructure is introduced. Raw receipts, model identities, cache/input/output tokens, reasoning usage, stage costs, patch capture, independent grades, failures and partial attempts remain under `.suffice/packet-bench-v1/`. Do not modify frozen runtime or inputs while the campaign runs. No PRs are submitted upstream.

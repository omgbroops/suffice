# Suffice Benchmark v1 competitor readiness

2026-10-14. Offline installed-source inspection and bounded official-document browsing only. No inference, executable launch, CLI help execution, install, build, login, credential inspection, auth change, or shared dependency/root write. Commands below are reserved for later, not results. This report complements `prime-comparison-protocol.md`.

## Readiness matrix

| Arm | Interface verified | Ready for scored runs? | Blocking work |
|---|---|---|---|
| Pi 1.2.0 stock tools | Installed CLI/SDK entry paths; default read/bash/edit/write; isolation/resource and event contracts | **No** | Adapter/supervisor, sandbox and restricted subprocess environment, catalog/model availability, read-only or memory-only credential refresh behavior, complete usage/error receipts, dry checks |
| Pi 1.2.0 shared fixture tools | SDK `customTools` registration and explicit allowlist supported | **No; implementation feasible from installed declarations** | Register exactly the benchmark tool contract, instrumentation and budgets; validate parity. Label as **Pi with benchmark tools**, not unmodified stock CLI |
| Prime pinned 5f218f780dabc51e26b039580da5d0686cc5616a | Twelve manifest-hash-verified public files describe REPL, compaction, refinement, children and usage | **No** | No installed binary or tested adapter; exact headless/config/schema and desired subscription/model/effort/transport controls remain unknown; isolation and full accounting need proof |
| Codex eventual | Local npm package 0.162.1 metadata/native binary path and official current CLI/config docs | **No** | Pin binary and schema, verify local flags/model access, contamination suppression, single-agent mode, transport/usage parity, budget enforcement and fixture-tool bridge |

No arm has head-to-head results. “Source-supported” is not “runtime verified.”

## Pi paths and two honest comparisons

Installed package: `C:/Users/Mohammed/Documents/GitHub/suffice-experiments/research-prime/node_modules/@earendil-works/pi-coding-agent/`, version **1.2.0**. CLI entry: `dist/bundle/cli.js`; SDK export: `dist/index.js`; RPC export: `dist/bundle/rpc-entry.js`. `package.json` declares these exact paths. Shared node_modules is read-only for this work.

`scripts/pi.mjs` is a Suffice launcher that selects `openai/gpt-6.1-sol` and points agent storage at `.suffice/pi`; it is not an isolated benchmark adapter and must not be used unchanged. `src/runtime.mjs` creates directories and file-backed credentials/catalog; it also must not be invoked unchanged when shared writes are prohibited.

**Native-tool product track:** stock Pi's default tools are `read`, `bash`, `edit`, `write`; codemode/tool_search are off until enabled. It can operate on the same source fixture using those native tools and a visible test command, but it does not natively provide Suffice `files`, `file_read`, `file_edit`, `file_write`, `test`, AST symbol operations, or controller/checkpoint tools. The test contract, filesystem permissions, accepted patch scope and external grader can be identical while tool affordances differ. Report those differences as part of the product comparison.

**Shared-tool harness track:** installed SDK `createAgentSession({customTools, tools})` accepts the benchmark's exact schemas/executors, including AST and bounded test results. Set `tools` to the full exact fixture-tool list so built-ins cannot bypass restrictions. Run the Pi default system prompt unless a declared matched-prompt ablation requires otherwise; omit Suffice controller/watcher/planning instructions. If codemode is part of both arms, explicitly add `createCodemodeExtension` through the loader and label it. The SDK does not automatically load CLI built-ins. This track isolates harness behavior more closely but is not stock Pi with defaults.

Tool names alone do not establish parity: hash descriptions/schemas, raw and surfaced output limits, errors, read ranges, allowed mutations, test command/environment, AST parser version and supported syntax, cancellation behavior, concurrency and whole-program failure semantics. Record native-tool differences rather than remapping names and calling them equivalent.

## Pi configuration contract for a later adapter

Use installed SDK objects, not CLI global settings. `SettingsManager.inMemory` supplies settings and `SessionManager.inMemory(fixture)` supplies history. `DefaultResourceLoader` accepts `noExtensions`, `noSkills`, `noPromptTemplates`, `noThemes`, `noContextFiles` all true. Supply no explicit resource paths or unreviewed factories. Additionally use `systemPromptOverride: () => undefined` and `appendSystemPromptOverride: () => []` to suppress discovered SYSTEM/APPEND_SYSTEM replacement content while preserving the SDK's generated default prompt; verify the effective prompt hash. `noContextFiles` only suppresses AGENTS/CLAUDE discovery. Use an empty task-local agentDir and untrusted project configuration; no project `.pi` settings or ancestor instructions may enter. A completely host-owned ResourceLoader is another feasible option, requiring its own validation.

Required explicit settings: `transport: 'sse'`, `cacheWarming: 'off'`, `compaction: {enabled:false}` for the short static track, and `retry: {enabled:false, provider:{maxRetries:0}}` for a supervisor-owned retry policy. If a retry-enabled stratum is desired, freeze identical counts/delays first. Disabling retries is a benchmark control, not a claim about stock defaults (agent retry default is 3; default cache warming is streaming; transport defaults auto). Cache warming disabled does not mean provider cache cold.

Select exactly `runtime.getModel('openai','gpt-6.1-sol')` and `thinkingLevel:'low'`; reject missing model or `!runtime.isUsingSubscription('openai')`. Installed `pi-ai/dist/providers/openai.js` explicitly supports ChatGPT subscription OAuth and the Responses API. Do not silently use the legacy `openai-codex` provider or an API key. Static generated files searched here did not contain this model ID; restore the approved frozen catalog metadata via a memory store or task-local read-only copy before runtime selection, then validate resolved model/provider/API/effort and actual request metadata. No catalog/auth was opened or resolved in this review. Availability/entitlement and exact OAuth endpoint behavior are **not verified** by reading declarations.

`ModelRuntime.create` supports `credentials`, `modelsPath:null`, `modelsStore`, `allowModelNetwork:false`, `refreshOnCreate:false`. It uses an in-memory models store when no models path/store is supplied, so no default shared catalog is necessary. `AuthStorage.inMemory` and `ReadOnlyAuthStorage` exist in installed auth-storage declarations; avoid `AuthStorage.create(sharedAuthPath)`, which is file-backed. A later credential bridge must load the already-authorized credential privately, never log it, and refresh only in memory or approved isolated storage. Read-only storage may fail on refresh; capability is not proven until adapter validation. Do not copy a shared auth directory as an isolation shortcut.

Disable incidental catalog/version/telemetry traffic in the spawned harness environment (`PI_OFFLINE=1`, `PI_SKIP_VERSION_CHECK=1`, `PI_TELEMETRY=0`) and use `allowModelNetwork:false`; these controls do **not** block arbitrary `bash` network calls or inference. Expose no MCP/extensions/subagent tools. Isolate the worker OS environment: no shared repo/home/dependency writes, no credential-bearing child environment, no actor network egress, no arbitrary nested AI CLIs. Only the harness process may access the chosen inference service. Native stock `bash` needs external enforcement; a prompt prohibition or tool allowlist is insufficient. Keep hidden graders outside every actor-readable root.

Budgets belong in the supervisor: fixed per-task wall clock, model turns, tool executions, aggregate tokens/cost and process-tree lifetime. Subscribe before prompt; capture every `message_end` including `error`/`aborted`, retry/compaction events, tool events and stop reasons. `agent_end` may precede retry; wait for `agent_settled`/prompt completion and drain. Abort at ceiling, await idle/dispose, terminate subprocess trees, retain partial patch/logs. Post-response token checks can overshoot by one response; disclose and bound this with output ceilings/admission checks. Provider missing failed-call usage remains unknown, not zero. JSON CLI mode can exit zero after failed/aborted messages; exit code is not acceptance.

## Commands reserved for later

These are exact stock CLI argument forms from installed docs, but require an isolated working directory and task-local, prevalidated configuration/credential bridge before inference. The CLI alone does not provide the aggregate budget enforcement above.

```powershell
# Future read-only interface check (not executed here):
node 'C:/Users/Mohammed/Documents/GitHub/suffice-experiments/research-prime/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js' --help

# Future native-tool run, only inside the prepared isolated runner:
node 'C:/Users/Mohammed/Documents/GitHub/suffice-experiments/research-prime/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js' --provider openai --model gpt-6.1-sol --thinking low --mode json --no-session --no-approve --no-extensions --no-mcp --no-skills --no-prompt-templates --no-themes --no-context-files --tools read,bash,edit,write '<frozen task prompt>'
```

Set task-local `PI_CODING_AGENT_DIR` through the supervisor environment; do not point it at the existing shared `.suffice/pi`. The SDK is preferred for strict controls and complete receipts. No new adapter filename or executable command is claimed to exist yet.

## Prime adapter specification and unresolved gaps

Preserve its pinned source revision and all 12 source hashes. A later discovery phase must verify native headless protocol, task-local config/storage roots, explicit model/provider/effort/output/transport controls, no unrequested refinement/skills/schedules/heartbeats/children, and clean shutdown with late usage reconciliation. Match fixture production edit permissions/test access and process/network constraints. Keep Python persistent state as a declared native capability; do not secretly give it persistent cross-task learned stores.

Pinned sources establish persistent Python variables, bounded snapshots, automatic compaction, refinement scope and child usage mechanisms; they do not establish the needed CLI/config contract or subscription interchangeability. No Prime inference command is supplied because its flags have not been established. Do not invent `--model`, budget or disable-refinement flags from other products. The earlier report covers full tree/refinement/cache accounting. Its `valid_assistant_usage` helper excludes error/aborted messages, so native aggregates alone cannot establish total spend.

## Eventual Codex adapter specification

Local package metadata is `@openai/codex` **0.162.1** at `C:/Users/Mohammed/AppData/Roaming/npm/node_modules/@openai/codex/package.json`. JS entry: `bin/codex.js`. Native executable exists at `C:/Users/Mohammed/AppData/Roaming/npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe`. PATH resolves npm wrappers; package metadata is not a successful launch or model-access check.

Official [CLI documentation](https://learn.chatgpt.com/docs/developer-commands?surface=cli) documents `exec`, JSON events, ephemeral sessions and ignoring user configuration while retaining auth lookup. Official [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) documents reasoning effort, project instruction limits, web search and multi-agent controls. These live documents may be newer than the local binary. Future help/schema inspection must confirm every selected flag and feature key against 0.162.1 before use.

Reserved first command (not executed): `& 'C:/Users/Mohammed/AppData/Roaming/npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe' exec --help`. Candidate run arguments, contingent on that validation: `exec --ignore-user-config --ephemeral --json --model gpt-6.1-sol -c 'model_reasoning_effort="low"' -c 'project_doc_max_bytes=0' -c 'web_search="disabled"' -c 'features.multi_agent=false' -c 'features.memories=false' -c 'features.hooks=false' --sandbox workspace-write -`. Supply stdin prompt from the frozen task. This is **not runnable approval or demonstrated local flag support**.

Use a clean isolated home/config boundary with an approved private credential bridge; ignoring user config alone does not establish no project config/skills/plugins/hooks contamination. Capture resolved model, instructions, tool set and effective config. Native shell/patch tools differ from fixture tools; classify as native-tool track unless an explicitly validated MCP/tool bridge gives equivalent fixture semantics. Disable external MCP/plugins and all subagent tools; block nested AI launches. Verify network denial and writable roots under the actual Windows sandbox rather than trusting a setting name. GPT-6.1 Sol entitlement, SSE equivalence, raw error usage and strict aggregate limits are still unresolved; no fallback model is allowed.

## Minimum acceptance before launching the difficulty pilot

1. Offline adapter checks prove no hidden-test access, no writes outside isolated roots, no implicit resources/children/network, deterministic tool contracts, cancellation and process cleanup; external graders recognize known-good and known-bad patches.
2. Freeze adapter/version/config/tool/environment manifests; reconcile synthetic success/error/cancel/late-child receipt fixtures without a live model. Unknown usage survives summaries.
3. Only subsequently, under separate authorized inference scope, verify exact provider/model/effort/transport and receipts with a bounded calibration request, then run disjoint difficulty pilot. Preserve all failures and avoid an all-pass final benchmark.

Until those steps pass, the dependable outcome is a preregistered benchmark and honest readiness report, not a competitor ranking.

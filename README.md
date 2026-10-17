# Suffice

An installable **Suffice CLI alpha** is now available separately in [packages/cli](packages/cli/README.md). It has its own terminal interface, login and repository tools, and launches through `npx` with a local package tarball. The research scripts below and frozen benchmark worktrees are unchanged. The preview uses Pi's engine with attribution; it does not launch the stock Pi interface.

Newest completed investigations: [Nemotron retrieval and revision-aware evidence](reports/EVIDENCE-EXPERIMENTS-RESULTS.md). Semantic retrieval improved offline region coverage but cost 6.3% more in scored repairs; the evidence record cost 85.2% more, and record plus directed checks 105.5% more. Every scored arm passed. No new policy was enabled by default. These are bounded observations, not general accuracy or cost guarantees. Independent saved-patch audits and isolated exported-layout replays passed; see [status](STATUS.md).

Earlier completed investigations: [architect workflow and five parallel experiments](reports/PARALLEL-EXPERIMENTS-RESULTS.md). Delegation cost more than solo, dynamic history retention cost 43.8% more, and fixed test checkpoints showed a narrow 16.5% efficiency signal with a feedback-loss risk. Harder tasks now expose real baseline failures, but no capability-frontier gain is established. [Full project handoff](docs/CHATGPT-HANDOFF.md) and [status](STATUS.md) include model settings, preserved failures and limitations.

Earlier positive evidence: [Sol tool-efficiency findings](reports/TOOL-EFFICIENCY-RESULTS.md). All 48 attempts passed the frozen checks. On 11 common complete-cost task/repetition groups, navigation-only cost 24.8% less, compact responses 19.8% less, and both together 19.4% less than Sol/core. These are narrow historical-replay results, not general performance guarantees. [Protocol](docs/TOOL-EFFICIENCY.md) and [per-run data](reports/sol-tools-v1.md) document the comparison.

The completed real-repository experiment uses npm/node-semver: [conclusions](reports/SEMVER-RESULTS.md), [protocol](docs/REAL-EXPERIMENT.md), [per-run results](reports/semver-control-v1.md), and [current status](STATUS.md). All 42 runs finished. Sol/core and Luna + Sol review/repair passed 6/6 each; review/repair cost more. State, pruning, and reproduction-first did not establish an accuracy-preserving efficiency gain. Earlier synthetic findings remain documented below.

An experimental Pi-based coding harness studying how proactive context retrieval changes task success, latency, and total computation.

This repository contains controlled diagnostic experiments, not a validated learned control policy. Pi 1.2.0 supplies the benchmark agent loop and native programmatic JavaScript tool execution. Each frozen protocol specifies its models and effort; recent baselines use GPT-6.1 Sol low, while early integration runs used medium. The coordinating development session is separate from these benchmark actors.

Initial experiments are complete. Read [the results summary](reports/RESULTS.md). The final pilot and held-out campaigns use low reasoning; initial integration campaigns used medium. Comparisons remain separated by campaign.

## Setup

Requires Node.js 24+. Install the locked dependencies:

```powershell
npm ci --ignore-scripts
npm run login
npm run preflight
```

`login` opens OpenAI's browser OAuth flow. Credentials and a stable installation ID are stored under ignored `.suffice/pi/`. The experiment never reads the existing Codex credential cache. Subscription access is required for main-agent runs; there is no silent OpenAI API-key fallback. `npm run pi` starts the pinned upstream CLI using this same isolated Pi credential directory; the experimental policies are selected through the experiment runner.

Put `OPENROUTER_API_KEY` and `JEV_API_KEY` in `.env`. These keys are read only by the watcher adapters, never passed to worker models or test subprocesses. `.env`, auth, and run evidence are Git-ignored. Each new process reloads the repository keys over any inherited values.

## Experiment

```powershell
npm test
npm run experiment -- --campaign=my-pilot --split=pilot --variants=pi,core,rules,luna,jev,lightning,nemotron --repetitions=1
npm run report -- my-pilot --ledger=.suffice/jev-budget.jsonl
```

For a longer campaign with bounded provider cooldowns, use `node scripts/run-pilot.mjs` with the same experiment arguments. It preserves failed runs and resumes only unattempted scheduled entries after verifying frozen hashes. `--effort=low` selects a separate lower-reasoning experiment; the default is medium. Never pool results across these settings.

Campaign names are unique. A manifest freezes the schedule and input hashes before any task runs. Each execution copies only its public workspace; hidden acceptance and reference repairs stay outside worker-accessible paths. Run evidence remains in `.suffice/runs/<campaign>/`; aggregate reports go in `reports/`.

| Arm | Behavior |
| --- | --- |
| `pi` | Pi SDK default prompt and direct tools |
| `core` | Short fixed prompt, Pi codemode-only execution, stable tool surface |
| `rules` | Core plus direct-import retrieval rule |
| `luna` | Core plus GPT-6 Luna watcher |
| `jev` | Core plus pinned Jev decision watcher |
| `gemma` | Core plus `google/gemma-4-26b-a4b-it:free` |
| `lightning` | Core plus `nvidia/nemotron-3.5-lightning:free` |
| `nemotron` | Core plus `nvidia/nemotron-3-super-120b-a12b:free` |
| `jev-gated` | Core plus Jev, skipping evidence already named in the current read program |

All arms use the same restricted workspace tools. The baseline is therefore controlled Pi SDK, not an unrestricted stock Pi CLI benchmark. Core versus Pi measures a bundle of changes. Watcher versus core isolates the added observer. The watcher selects at most one supplied evidence candidate or abstains. It cannot edit code or control verification.

Jev reserves one cent durably before every request, including failed/unknown calls, and stops after 200 reservations ($2). The reserve is deliberately more conservative than measured spend. Never reset the ledger to continue a campaign. OpenRouter adapters require exact free model IDs and zero-price metadata and provider ceilings. Free endpoints can be unavailable or rate limited; unavailable calls remain explicit in reports.

Resource limits: four minutes, 24 model turns, 80 tool calls, and four watcher decisions per run. Tests execute with Node filesystem/process permissions, clean environment, 128 MiB heap and a time limit. These controls are not an OS sandbox; tasks are authored pure-JavaScript fixtures. No arbitrary shell tool is exposed. No Docker image, model-weight or benchmark-dataset download is needed. Runs stop below 5 GiB available disk space.

## Reading results

Success comes from frozen acceptance checks, not the agent's final message. Token counts include cached reads. OpenAI costs are API-equivalent estimates from the pinned Pi model catalog, not subscription invoices. Watcher charges/estimates and Jev reservations are reported separately. Unknown telemetry remains unknown. Provider cache warmth is observed rather than controlled.

The eight tasks are AI-authored synthetic exercises with four pilot and four held-out tasks. They are intentionally small; high success on them does not establish performance on real repositories. Keep integration checks separate from pilot results, and use fresh campaign names after any harness modification.

See [the frozen protocol](docs/EXPERIMENT.md) and [research notes](docs/RESEARCH.md).
# Context/control experiments

Completed experiment findings: [58-run context/control report](reports/CONTEXT-RESULTS.md). Aggressive pruning lost work state; conservative selectors stayed inactive on short tasks. Luna was much cheaper but missed one acceptance case in four transfer runs. Graph and routing work mechanically, with no established real-repository advantage. All figures are exploratory.

The v4 exploration adds replacement context (`select-rules`, `select-luna`, `select-jev`, and the three `select-*` OpenRouter arms), threshold pruning (`compact`), a cache-cost forecast (`cache-select`), import/reverse-dependency retrieval (`graph`), bounded read-only Sol assistance (`delegate`), a Luna worker and Luna-to-Sol routing (`luna-worker`, `route`). `short-direct` and `default-code` separate prompt and tool-program effects; `bounded` changes the default file-read window to 35 lines. These are experimental options, not established improvements.

Run a controlled cohort with, for example:

```powershell
node scripts/run-pilot.mjs --campaign=my-context-trial --split=context --variants=core,select-rules,select-luna,graph,luna-worker,route --effort=low
node scripts/context-summary.mjs my-context-trial
```

Source/configuration inputs freeze at campaign start. Use a fresh campaign name after changing them; do not modify source during a running or resumable campaign. Original conversations remain in ignored artifacts and can be recovered by the worker through `history_read`. Auxiliary requests count toward total usage. No learned controller has been trained.


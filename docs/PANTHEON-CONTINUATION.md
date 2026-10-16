# Resume Suffice experiments in Pantheon Dev

**Completion update, October 14:** the continuation below is historical. The unchanged A/B/C campaign finished all 27 attempts; the five bounded child investigations also finished their measurements. No campaign process remains live. Read [current status](../STATUS.md), [consolidated results](../reports/PARALLEL-EXPERIMENTS-RESULTS.md) and the [handoff addendum](CHATGPT-HANDOFF.md) before starting anything new. Recovery's prepared follow-up was not launched after its engineering turn was stopped by an automatic content-safety check.

This note supplements the native full-history Codex fork; it does not replace conversation history.

## User's latest instructions

The user wants this work continued inside Pantheon Dev because the Codex desktop app is too heavy on their PC. Use **Codex as the harness, GPT-6 Astra at high reasoning effort for the parent**, and **GPT-6.1 Sol for each research/engineering subagent**. Keep the models inside already-frozen benchmark campaigns unchanged. Subagent model selection and benchmark model selection are different.

Continue A/B/C and all five additional experiments: adaptive reasoning effort, retrieval tournament, intelligent test execution, cache-aware context retention, and failure recovery/checkpoints. User explicitly authorized concurrent live jobs, withdrawing an earlier proposed two-job cap. Preserve separate worktrees, independent artifact directories, frozen code, and candid reporting. No new sandbox/container infrastructure. Do not ask routine questions while they are away.

## Existing material

- Project: `C:/Users/Mohammed/Documents/GitHub/suffice`.
- Full project/results/context handoff: `docs/CHATGPT-HANDOFF.md` (already delivered to user for ChatGPT web).
- Shared five-agent brief: `docs/PARALLEL-EXPERIMENTS.md`.
- User's detailed proposal: `C:/Users/Mohammed/.codex/attachments/154cdd23-812c-4225-82f1-24c67f5426d4/Pasted text.txt`.
- Primary goals: equal correctness for lower total cost; more difficult tasks solved at equal total cost. Require actual baseline failures before capability claims. Screening is not an untouched holdout.

## A/B/C actual state at transfer

Campaign `.suffice/workflow-runs/yaml-workflow-v1`, frozen protocol `docs/WORKFLOW-EXPERIMENT.md`. Three new js-yaml historical tasks x three configurations x three repetitions = 27 scheduled attempts. All frozen inputs were rechecked unchanged after worktree setup. A/B/C uses Sol low throughout except the implementation worker in C uses Luna low. **Do not switch these benchmark models to Astra.**

Configurations: solo Sol/navigation; Sol architect + Sol worker + same parent review; Sol architect + Luna worker + same parent review. A Node runtime assembles versioned source packets and executes independent tests. TypeScript navigation uses existing Node stripping without new dependencies. The code and all prompts/tests are frozen.

Six attempts have final receipts; all passed:

| Run | Task/arm | Estimated cost |
|---|---|---:|
| 001 | mapping-boundaries solo | $0.0585688 |
| 002 | mapping-boundaries workflow-sol | $0.1454 |
| 003 | mapping-boundaries workflow-luna | $0.11570246 |
| 004 | folded-tabs workflow-sol | $0.1032952 |
| 005 | folded-tabs workflow-luna | $0.08205122 |
| 006 | folded-tabs solo | $0.0347936 |

No workflow-experiment Node process was found at transfer. User/app interruptions stopped the original execution session; no run 007 directory was present when checked. **Recheck process and directory state before resuming** to avoid duplicate runs. Resume using the unchanged command:

`node scripts/workflow-experiment.mjs --campaign=yaml-workflow-v1 --resume`

Run this in the Suffice checkout. Launch it in a durable hidden background process with redirected logs if native exec sessions may be canceled by UI interruptions. Do not overwrite any run. If a partial attempt exists without result.json, preserve it and explicitly account for its interruption/unknown usage before proceeding; do not silently retry it.

After completion: `node scripts/workflow-report.mjs yaml-workflow-v1` and `node scripts/verify-workflow.mjs yaml-workflow-v1`. The reports currently may contain only the earlier two-run snapshot; regenerate from evidence. Write final interpretation report, update STATUS/README and append a clearly dated results addendum to the ChatGPT handoff if useful. Do not rewrite history or tune frozen experiment code.

The current implementation passed 82 harness tests. Original upstream regression checks count 267,279,282 depending on task revision; all originals and reference repairs passed them. Hidden tests fail originals and pass reference repairs. Main source snapshot is 41 TypeScript files/~5800 lines per task, ~1MB compressed archive/~7.9MB full nonhidden tree. Campaign artifact cap350MiB/free-space floor1GiB/known inference stop$12. Actual API-equivalent estimates, not subscription bills.

`execution-conditions.json` records additional concurrent campaigns authorized after the first runs. Shared provider/machine load/cache can confound latency; report honestly.

## Five isolated worktrees

The root repository was previously unborn/all-untracked. A local snapshot commit **37fb5e2** was created from explicitly selected reviewable files to allow native Git worktrees. No secrets/raw private logs were committed; privacy comparison passed. No remote push was done.

| Worktree | Branch |
|---|---|
| `C:/Users/Mohammed/Documents/GitHub/suffice-experiments/adaptive-effort` | `experiment/adaptive-effort` |
| `C:/Users/Mohammed/Documents/GitHub/suffice-experiments/retrieval` | `experiment/retrieval` |
| `C:/Users/Mohammed/Documents/GitHub/suffice-experiments/test-execution` | `experiment/test-execution` |
| `C:/Users/Mohammed/Documents/GitHub/suffice-experiments/cache-retention` | `experiment/cache-retention` |
| `C:/Users/Mohammed/Documents/GitHub/suffice-experiments/failure-recovery` | `experiment/failure-recovery` |

Each has a node_modules junction to the pinned root dependencies and .suffice/pi junction to existing isolated Pi subscription state. Do not update shared dependencies or manually read/change credentials. Other .suffice files are independent per worktree. Main checkout remains `experiment/tool-efficiency`.

At transfer, all five worktrees had clean Git status. Only adaptive-effort and retrieval agents had confirmed starting; both were marked **interrupted** after the app/turn interruption. They had only begun reading context, with no tracked/untracked edits visible. A test-execution spawn was interrupted/ambiguous and did not appear in the live agent inventory; cache-retention and failure-recovery were not started. Thus **do not claim all five are running** without starting/verifying them in the new runtime.

The previous collaboration tool handles may not be reusable across app-server processes. Inspect first; otherwise launch fresh GPT-6.1 Sol subagents with these existing worktrees and the shared brief. Do not create duplicate worktrees. Explicitly set Sol for each child (use fresh rather than full-history model-inherited forks if required by current tools). The user authorized this delegation.

Each brief budgets <=$3 known API-equivalent inference including screening/smokes/retries, <=18 scored +4 screening/smoke attempts, <=100MiB new artifacts, and >=1GiB free disk. Report bounded pilots and limitations rather than uncontrolled large campaigns. User waived a conservative provider concurrency cap, not filesystem integrity or truthful cost accounting.

## Transfer mechanics

Original desktop thread: `01a13ad0-d907-77c2-82aa-5442d9bc8c03` (Check Latest Pantheon Session). Pantheon refused same-ID native resume because the desktop app holds an active writer. A supported native `thread/fork` operation created a full-history independent continuation: `01a13c4c-c126-76c1-ab4f-4b2798d33265`, parent-linked to the original, at the Suffice cwd. Its creation receipt confirmed model `gpt-6-astra`, effort `high`.

The fork preserves native history up to creation, not subsequent messages in the original chat. Original remains preserved. The new Pantheon continuation should own future work, with no competing old-app agents being restarted.

Private operational receipts/helpers: `.suffice/pantheon-fork-receipt.json`, `.suffice/pantheon-import-receipt.json`, `.suffice/pantheon-conversation.json`, `.suffice/pantheon-start-receipt.json`. They contain local IDs/receipts, not API credentials. Native Codex in Pantheon was connected, version0.162.1. Model catalog confirmed Astra high and Sol availability. Pantheon Dev API is localhost4318; web UI localhost5173.

# Public evidence pilot v1

This is a manually engineered, task-specific research pilot for i01 (node-fetch #1386) and q04 (Nano Stores #371). It adds behavioral context for a later cheap-actor comparison. No actor or provider model calls are made by this package; it is not a planner or harness feature.

Preparation used only original public issue bodies, allowed repository/base/dependency task-path fields, and Git-tracked files at the pre-fix base revisions. No fixing commits, reference patches, hidden acceptance checks, private graders, or prior actor patches/traces/results were inspected. Both tasks have been used during development; any later evaluation is development reuse, not held-out evidence.

Manual agent-assisted research and engineering time belongs outside the benchmark's actor inference cost. This package does not price that labor or the preparation model's inference. Preserve that distinction in reports of any later treatment gain.

Files `i01-context.txt` and `q04-context.txt` are the complete proposed extra context, with short executable reproducers, actual baseline stdout/stderr, expected behavior, and precise public references. Each is below 1500 tokens by conservative byte-count estimate (UTF-8 bytes / 3); no tokenizer/provider call was used. `*-evidence.json` holds concise structured records.

Run only on Sonion from the campaign root:

```powershell
python scripts/sonion-ssh.py --push experiments/public-evidence-v1/i01.mjs experiments/public-evidence-v1/q04.mjs experiments/public-evidence-v1/run.mjs experiments/public-evidence-v1/execution.mjs
'node experiments/public-evidence-v1/run.mjs' | python scripts/sonion-ssh.py --timeout 180
```

`run.mjs` enumerates source files with `git ls-files` and writes the committed `HEAD:path` bytes into fresh package copies under `.suffice/public-evidence-v1`. q04 imports two complete, independent copies with identical tracked-file manifests. i01 copies installed public dependencies into its clean source copy, normalizing a dependency-container path if necessary. No install was needed.

`execution.mjs` is a copy of the existing Sonion execution adapter with its ROOT adjusted for this directory and its canonical agent/auth bind removed. Existing source/runtime behavior is unchanged. Both probes use a new network namespace, existing Node/resource limits, and a local workspace containing only clean public source/deps and the probe. i01 creates only a loopback HTTP server; it has no external HTTP dependency. q04 uses synchronous `computed`, with no arbitrary sleep or injected scheduler. No private grader, reference, actor workspace, or actor credential mount is provided.

Full original execution receipts, manifests, stdout, and stderr are under `.suffice/public-evidence-v1/{i01,q04}`. Both expected failures were observed; the probes deliberately return nonzero on the pre-fix baseline. i01's dynamically chosen local port appears in the unedited error stack and has no assertion attached to it. No solution patch is included.

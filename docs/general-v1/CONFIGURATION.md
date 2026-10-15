# Suffice general v1

This separately versioned configuration replaces prototype workspace bindings, not the agent architecture. It does not inherit the earlier 28.9% result as a measured performance claim. The previous native-Pi campaign, its code, fixtures, receipts and review bundle remain untouched in `../external-pi`; `reports/general-v1/baseline-preservation.json` checks their original hashes.

## Diagnosis and change

Restrictions were present in both layers. `src/benchmark-agent.mjs` added an exact production-file allowlist and a snapshot-specific prompt. The shared `src/workspace.mjs` also enforced `src/` writes, hid all dot paths, capped files at 128 KiB and hardcoded `tests/visible.test.mjs` with a permission-limited Node runner. Main experimental harnesses reused those tools. Pi's underlying native tools already supported repository files and project commands.

The smallest separate binding therefore reuses Pi 1.2.0's native `read`, `edit`, `write`, `bash` tools and the existing AST navigation module. No frozen file is edited. General v1 permits existing and new repository files, multiple packages, tests, metadata and hidden CI configuration. File tools reject paths and resolved symlinks leaving the authorized repository. Commands may use repository and temporary files, with system/runtime mounts read-only. Public source snapshots contain no grading material.

The minimal prompt, Pi loop, codemode-only execution, deterministic tools, Sol low, no context rewriting, disabled Suffice compaction/cache warming and one SDK retry are retained. Bulk TypeScript symbol discovery is enabled through the existing parser's existing option. There are no new agents, review stages, routers, compression policies or memory mechanisms. Standard repository AGENTS context is loaded, matching the normal project instruction mechanism; the selected pilot snapshots have no such context files.

## Execution and boundaries

The installed native Windows executor failed its isolation probes. General v1 uses the already installed WSL Ubuntu/Bubblewrap executor, without a container image, daemon or sandbox service. Node 24.15.0 Linux x64 is checksum-verified against nodejs.org SHASUMS256; Pi is installed from the unchanged package lock into a separate runtime. Yarn 1.22.22 supports original project scripts. No root/shared Windows dependencies are modified.

Only `/workspace`, the attempt's `/receipts`, and canonical model authentication state are persistent writable mounts. `/tmp` and `/home` are ephemeral. Executable harness source, Linux tools and Node are read-only. Private graders, references, research and other worktrees are not mounted. Separate PID/user/mount namespaces drop capabilities; Windows interop executables and sockets are not mounted. Commands and descendants are tested against actual unmounted private canaries; this is not a working-directory-only policy. Do not place private evaluation files in an actor snapshot. The evaluation launcher rejects overlaps between explicitly declared private roots and workspace/Git mounts.

Authentication is available to the harness/native CLI in its mounted credential directory, as required for subscription inference; it is not included in review exports. This boundary does not promise to conceal the actor's own inference credentials from arbitrary code inside that actor. Host user environment variables, including API keys, are not inherited. Network access is explicit and identical for the compared agents; benchmark task instructions prohibit external solution retrieval. General commands are not inspected by a model-based safety stage.

Common process limits are 8 GiB virtual address space per process, 512 MiB default Node heap, 300 CPU seconds per process, 64 MiB per output file, 1,024 open descriptors and a whole-attempt timeout. These are not an aggregate cgroup RAM/CPU quota. Node's Wasm trap handler is disabled in both arms to make TypeScript parsing work under the virtual-address limit. Suffice commands additionally have a 180-second maximum, cancellation and native process-group cleanup. Output/process failures are retained. Native Pi keeps its default shell timeout behavior under the same outer limits.

## Compatibility and navigation

`node scripts/general-compatibility.mjs prepare` followed by `node scripts/general-compatibility.mjs run` runs deterministic compatibility checks with zero model calls. It exercises cross-package JS/TS edits, root/hidden configuration and new tests, npm tests, tsc builds, lint, navigation, symlink/path escape rejection, private reads from commands and descendants, read-only host writes and child cleanup on timeout.

AST navigation is syntactic, not a resolved TypeScript graph. Ordinary strippable TS is supported. Parameter properties, enums/namespaces requiring transformation, JSX/TSX, hidden directories and files exceeding the old navigator's 128 KiB read cap can require native read/search/compiler commands instead. Navigation may return `unparsed`, omit unsupported extensions, or fail on an oversized file. Such limits must be recorded if they prevent an attempt, not scored as model inability. Native tools still permit reading/editing/building these files.

## Run and compare

After preparing the separate Linux runtime, `node scripts/general-run.mjs WORKSPACE RECEIPTS PUBLIC_TASK.txt` launches the general configuration. Runtime staging copies an explicit source list, never benchmark directories. This checkout's runtime path is recorded in `scripts/general-execution.mjs`; the same pinned files can be installed on another machine with WSL, bwrap and the lockfile. Runtime dependency installation and task preparation occur before scored attempts.

Compare against the real pinned Pi CLI inside the same execution environment, not a direct-tool SDK substitute. Keep its native prompt, default read/bash/edit/write tools, retries, cache warming and compaction. Give identical public issue text, source/dependency snapshots, Sol low, pricing and total inference allowance. Preserve native tool/prompt differences, per-command timeout differences, cache warmth and operational failures. General v1's minimal prompt and AST/codemode interface remain intentional product differences.

All finalized assistant events, including failures pruned from SDK final history, are retained. Count every provider request and reconcile receipts; unmatched auxiliary calls or missing/error receipts make full cost unknown. Count input/cache/output tokens and costs, tools, latency, retries and failures. API-equivalent inference estimates are neither subscription charges nor total project expenditure; engineering and evaluation work are reported separately. Tool schemas and outputs are already included in inference usage; deterministic command time is measured separately.

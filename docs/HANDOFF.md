# Suffice handoff: everything tried, every run, what we learned, what to do next

Written 2026-10-23, at the weekly-usage stop (92%). HEAD before this doc was `8ebe607`, with 188 commits from 2026-10-14 to 2026-10-23.
Nothing has been pushed or deployed.

**How to read the numbers.** "Measured" means a results file in `reports/` backs the claim. "Inference" means it is my reading of the data and no run tests it directly.
Every benchmark here has fewer than 40 tasks, so a 1–2 task difference is noise (see §5).

---

## 0. One-paragraph state

Suffice is a harness that tries to get strong-model pass rates out of cheap models: Haiku first, escalating to Sonnet or Opus only when a check fails.
On the r27 dev set (27 polyglot tasks), the scores so far are:
- **Opus alone**: 22/27 for $5.90.
- **Best single clean run of our harness**: 19/27 for $1.21 (v7 + Opus rescue).
- **Cheapest clean run**: 17/27 for $0.17, Haiku with the self-test contract, at $0.006 per task.
- **Stitched across runs**: 22/27 (self-fix 17 plus 5 v8 ladder rescues). That number is not a clean run and must not be quoted as one.

Only `javascript_two-bucket` has never passed in any arm. 26 of 27 tasks are solvable by some arm.

What sets the ceiling is the **checker**, not the coder. Cheap model-written tests either:
- **false-alarm on correct code** (78–88% of checkpoints in v7), or
- **accept wrong code**: gate holes, and Haiku's own wrong test frozen as the anchor in v8.

The owner's target is ≥23/27 at low cost per task, with no tests or expected outputs ever reaching the model. It has **not been reached in a clean run**.

---

## 1. Phases, in order

| # | Dates | Phase | Harness / models | Outcome in one line |
|---|---|---|---|---|
| A | 10-14 → 10-17 | Original Suffice: Pi 1.2 harness, GPT-6.1 Sol / Luna / watchers | Pi SDK, OpenAI OAuth, OpenRouter free watchers, Jev | Small cost wins (nav-only −24.8%); no accuracy gain from any watcher, workflow, evidence or context policy |
| B | 10-16 → 10-18 | Gate-eval: can a cheap test gate stand in for a strong reviewer? (picomatch, ptr-425, shell-quote) | Claude Haiku/Sonnet subagents | Spec writers have blind spots; the cwd/CLAUDE.md location effect outweighed every variant; the gate added nothing measurable |
| C | 10-21 | v4 ladder on the Claude CLI: Haiku → Sonnet → Opus with a self-test verdict | `claude -p`, sandboxed | poly36: ladder 35/36 at $0.91 vs Sonnet 34/36 at $2.63 (contaminated set) |
| D | 10-21 → 10-22 | SWE-bench Pro, 8 tasks × 3 arms, plus 17 harness fixes | Docker envrun, official grader | 0/26 → 21/24 from harness fixes alone; clean rerun: single 7/8, v5-cheap 8/8, v5-strict 7/8 |
| E | 10-22 | Flint (local llama-server model) on SWE-Pro | local | 0/8 → 2/8; failures were a 64K context overflow; stopped by owner |
| F | 10-22 | v5: BM25 localization bundle, Haiku ×2 → Sonnet; variants v5b, strict, cheap | CLI | v5b on r27 17/27 for $0.46, the cheap baseline that held up |
| G | 10-22 | v6: blind test writer, K Haiku candidates, planner | CLI | 14/27; trails v5b |
| H | 10-22 → 10-23 | d36 dev set (36 tasks): baselines and ladders | CLI | h2o-strict and s2o both 28/36; s2o for $0.85 |
| I | 10-22 → 10-23 | v7 test-first pipeline with per-check scoring, then agree / indep / rescue / strict | CLI | Plain v7 17/27 for $3.28; v7 + Opus rescue 19/27 for $1.21 |
| J | 10-23 | Hint prompts, novel8, step trace (reports/v9) | CLI | The exercism hint recovered 5/10 fails; novel8 too easy (8/8 both arms) |
| K | 10-23 | Self-test contract (reports/v10) | Haiku | 17/27 for $0.17 ($0.006 per task) |
| L | 10-23 | v8 test ladder: self → Sonnet → Opus tests, Haiku fixes (reports/v11) | CLI | +5 rescues on the fail set (stitched 22); found the frozen-anchor and TESTBUG-judgment problems |

Report folder numbers are **not** arm versions:
- `reports/v8/` holds small s2o/sonnet subset runs.
- `reports/v9/` holds the hint/novel runs.
- `reports/v10/` holds the self-test fix run.
- `reports/v11/` holds the v8-arm ladder runs.

---

## 2. Phase detail

### A. Original Suffice (Pi + GPT-6.1 Sol), 10-14 → 10-17

Source docs: `README.md`, `STATUS.md`, `docs/CHATGPT-HANDOFF.md`, `docs/EXPERIMENT.md`, `docs/REAL-EXPERIMENT.md`, `docs/TOOL-EFFICIENCY.md`, `docs/WORKFLOW-EXPERIMENT.md`, `docs/EVIDENCE-EXPERIMENTS.md`, `docs/PARALLEL-EXPERIMENTS.md`, `docs/ESCALATION.md`, plus `reports/*.md`.

| Campaign | What it tested | Result (measured) |
|---|---|---|
| pilot-v1/v1b/v2, pilot-low-v3, holdout-low-v3 | 8 synthetic JS tasks; arms pi, core, rules, luna, jev, gemma, lightning, nemotron (watcher picks one evidence item or abstains) | High pass rates everywhere; no watcher showed an advantage. Tasks too small. |
| context-screen-v4, context-transfer-v5 (58 runs) | Replacement context, pruning, cache-select, graph retrieval, delegate, luna-worker, route | Aggressive pruning lost work state. Conservative selectors never fired. Luna was much cheaper but missed 1 acceptance case in 4. No real-repo gain. |
| semver-control-v1 (42 runs, npm/node-semver) | Real repo: Sol/core vs Luna + Sol review/repair, state, pruning, reproduction-first | Sol/core 6/6, Luna + Sol 6/6; review/repair cost more; no efficiency gain that kept accuracy. |
| sol-tools-v1 (48 attempts) | Tool surface: nav-only, compact responses | 48/48 passed. Nav-only −24.8%, compact −19.8%, both −19.4% cost on 11 matched groups. **The one positive result of phase A.** |
| yaml-workflow-v1 | Architect workflows | 27/27 accepted; workflows cost +52–140%. |
| parallel experiments (5) | Delegation, dynamic history, fixed test checkpoints | Delegation cost more. History retention +43.8%. Checkpoints −16.5% (narrow, with a feedback-loss risk). |
| evidence experiments | Nemotron semantic retrieval, revision-aware evidence record | Retrieval +6.3% cost; record +85.2%; record + directed checks +105.5%. All passed; nothing enabled. |
| external stock Pi comparison | Suffice core vs unmodified Pi CLI | Suffice 23.8–28.9% cheaper. |
| source presentation | How source is shown to the model | +5.2% cost, no gain. |
| benchmark-v1 qualification | Building a harder exported benchmark | Bundle/export validation files in `reports/BENCHMARK-V1-*.json`. |

**Lesson carried forward:** the tasks were too easy to separate arms, and the Pi/Sol stack was abandoned for the Claude CLI ladder.

### B. Gate-eval (picomatch, path-to-regexp-425, shell-quote-15, bytes-51, cookie-173), 10-16 → 10-18

Source: `docs/GATE-EVAL.md`, addenda 1–21. The question was whether a cheap blind spec/test writer can gate cheap patches as well as a strong reviewer.

- Blind spec writers (Haiku and Sonnet), on contract, clause-coverage and intent prompts, never closed the gap on #187. Intent writers over-rejected. Source access and "include uncertain cases" did not fix the blind spot (ptr-425).
- Forced-axis fan-out with behavioral consensus and the property gate showed no measurable gain.
- **Addendum 20 bug:** the property gate reused the `require` cache and re-checked old code. The iteration-10 V4 result was invalid and has been fixed.
- **Addendum 20–21 confound (the biggest finding of phase B):** workspace location changed Haiku pass rates more than any variant.
  - Workspaces under the repo: 6/48.
  - Workspaces in /tmp: 38/60, with p < 1e-7.
  - It is not a scoring artifact: 0 of 60 rescores were discordant.
  - It is not user settings or hooks.
  - Copied project files nearby are the leading suspect, but the mechanism is unverified.
  - Batch-to-batch drift in /tmp ran 11 → 5 of 12.
- **Rule from this:** compare only arms that run in the same location and are interleaved in time.

### C. v4 ladder on the Claude CLI, 10-21

Source: `docs/V4.md`, `docs/V4-DRYRUN.md`, `reports/v4/ANALYSIS.md`, `src/v4-*.mjs`.
The design: Haiku solves, declares a `SELFTEST:` command, and the harness re-runs it. A failure escalates to Sonnet, then Opus. The hidden grader runs once, only to record the verdict.

| Run | Arm | Pass | $ | Note |
|---|---|---|---|---|
| v4/smoke, smoke2, smoke3 | v4 | 0, 0, 1 of 1 | ~0 | harness_error, budget_exhausted, then working |
| v4/poly9-v4 | v4 | 9/9 | $0.07 | |
| v4/poly9-sonnet | Sonnet | 9/9 | $0.29 | |
| v4/poly27-v4 | v4 | 22/27 | $0.63 | 4 run_timeouts; redo of 4 → 4/4 $0.22 |
| v4/poly27-sonnet | Sonnet | 25/27 | $2.33 | |
| v4/poly36-merged | v4 + Sonnet | 69/72 | $3.54 | ladder 35/36 at $0.91 vs Sonnet 34/36 at $2.63 |
| v4/pilot-swebpro-{opus,sonnet,v4} | each | 1/2, 0/2, 1/2 | $0.81 / $0.75 / $0.35 | first SWE-Pro contact |

Polyglot is Exercism, so it is in the training data. The ladder ≈ Sonnet result here is about the harness, not model skill.

### D. SWE-bench Pro, 8 tasks × 3 arms, 10-21 → 10-22

Sources: `docs/V4-SWEBPRO.md`, `docs/V4-SWEBPRO-GOLD.md`, `docs/FIXLOG.md` (fixes #1–17), `reports/full/*`.
The arms were single (Sonnet), v5-cheap (Sonnet → Opus) and v5-strict (Haiku → Opus, escalating on any self-test fail).
Each task had a $0.5 budget and 30 turns.

| Run (reports/full/…) | single | v5-cheap | v5-strict | Main failure cause |
|---|---|---|---|---|
| 20261022-024003 | 0/10 $1.25 | 0/8 $0.43 | 0/8 $0.05 | 18 harness errors: symlink cp, git gc race |
| 20261022-034106 | 1/8 $1.01 | 2/8 $0.36 | 1/8 $0.35 | harness errors, budget exhausted |
| 20261022-044808 | 4/8 $1.05 | 4/8 $0.30 | 3/8 $0.15 | verify overlay |
| 20261022-055513 (2-task) | 2/2 | 2/2 | 2/2 | — |
| fix-072513 | 0/1 $0.62 | | | probe |
| fix-081611 | 0/2 | 0/2 | 0/3 | timeouts, pull error, self-test false-fail |
| fix-084319 | 0/2 | 0/2 | 0/3 | spec gap: prompt lacked requirements and interface |
| fix-085801 | 2/2 | 1/2 | 3/3 | after adding requirements and interface (6/7) |
| **20261022-092150 (full)** | **7/8 $0.80** | **7/8 $0.75** | **7/8 $0.74** | 2 gate holes, 1 grader collision |
| fix-103626 | 1/1 | 1/1 | provider_error | gate-hole fix f29de90 verified |
| fix-125840 | | | 1/1 $0.26 | grader-collision fix 413951c verified |
| **clean-20261022-215334** | **7/8 $1.00** | **8/8 $0.83** | **7/8 $0.37** | fresh clean run after all fixes |

- **Takeaway (measured):** every diagnosed SWE-Pro failure was the harness, the prompt or the gate. None was confirmed as a model-capability failure.
- The fixes, in `docs/FIXLOG.md`:
  - file-copy and symlink bugs;
  - the pytest summary used as the self signal;
  - the official prompt template, with requirements and interface (0/7 → 6/7);
  - keeping base-commit test files visible;
  - the diff excluding grader-owned paths;
  - re-running earlier failing SELFTESTs before a pass (0/2 → 2/2);
  - the envrun broker, so the agent has no docker socket;
  - lean CLI flags, which cut a Haiku call from ~$0.26 to ~$0.0004 of overhead.
- **Inference:** v5-strict, at $0.047 per task for 7/8, is the value pick on SWE-Pro. With n = 8 the confidence intervals run roughly 50–98%.

### E. Flint (local model) on SWE-Pro, 10-22

| Run | Pass | Note |
|---|---|---|
| flint-20261022-132819 | 0/8 | 3 budget_exhausted, 5 aborted_memory |
| flintfree-20261022-163546 | 2/8 | 4 provider_error = 64K context overflow; 2 timeouts |
| flint6-20261022-195058 | 2/2 | the "$3.39" is token-equivalent accounting, not money |

It was stopped by owner order (FIXLOG #17). `V4_MIN_FREE_PCT` was added because the local server needs a lower memory floor.

### F. v5: localization bundle, 10-22

Source: `docs/V5.md`, `reports/v5/loc-eval.md`. BM25 picks files and puts a bundle in the prompt. Haiku gets 2 tries, then Sonnet. Variants:
- **v5b**: the cheaper bundle.
- **--v5-strict**: escalate after any cheap self-test fail.
- **--v5-cheap**: a Sonnet-first ladder.

| Run | Pass | $ | Note |
|---|---|---|---|
| v5/harness-bug-run/polyglot-v5 | 0/9 | $0.28 | 9 harness errors (kept as evidence) |
| v5/harness-bug-run/polyglot27-v5 | 0/27 | $0.75 | 13 harness errors + cap aborts |
| v5/polyglot-v5 | 6/9 | $0.53 | |
| v5/polyglot-v5b | 6/9 | $0.22 | |
| v6/r27-v5b | **17/27** | **$0.46** | the cheap baseline every later arm is measured against |
| v6/r27-v5b-gatefix (13 + 14) | 16/27 | $0.87 | "≥1 test ran" gate; 24 escalations; dropped |

### G. v6: blind writer and K candidates, 10-22

Source: `src/v6-arm.mjs`, commits 861539f, dc326da, 887c8e8.

| Run | Pass | $ |
|---|---|---|
| v6/smoke | 1/1 | $0.01 |
| v6/sweep-v6-plan-k1 (poly9) | 3/9 | $0.15 |
| v6/sweep-v6-noplan-k2 (poly9) | 3/9 | $0.12 |
| v6/sweep-haiku-alone | 4/9 | $0.19 |
| v6/sweep-sonnet-alone | 6/9 | $0.32 |
| v6/polyglot9-v6 | 4/9 | $0.18 |
| v6/r27-haiku-alone | 16/27 | $0.52 |
| v6/r27-sonnet-alone | 14/27 | $1.10 (6 stopped at cap) |
| v6/r27-opus-alone-fair | **22/27** | **$5.90** (5 unfinished: timeout, harness, cap) |
| v6/r27-v6-noplan-k2 | 14/27 | $0.34 (3 provider errors) |
| v7/r27-v6-fixed-merged (s1 + s2 + s3) | 14/27 | $0.42 (0 errors after the max_turns fix) |

The blind writer's tests were sometimes wrong for every candidate, including Sonnet: cpp_sublist, cpp_phone-number, java_pig-latin.

### H. d36 dev set (36 tasks), 10-22 → 10-23

Files are `reports/v7/d36-*`. Runs with suffix `-b` or `-r2` are second halves or reruns. Pass counts below are summed across the files.

| Arm | Pass | $ | Note |
|---|---|---|---|
| Haiku alone (d36-haiku + haiku-b) | 14/36 | $0.62 | 8 cap aborts in -b |
| Haiku alone r2 | 19/36 | $0.73 | |
| Sonnet alone (d36-sonnet + sonnet-b) | 30/36 | $2.37 | |
| Opus alone (d36-opus + opus-b) | 30/36 | $6.04 | |
| v5b r1 (v5b + v5b-b) | 27/36 | $0.68 | |
| v5b r2 | 21/36 | $0.47 | same arm, −6: shows the run-to-run noise |
| v5b strict | 24/36 | $0.57 | 20 escalations |
| v5 → Opus (v5-opus + v5-opus-b) | 25/36 | $1.45 | |
| **s2o (Sonnet → Opus)** | **28/36** | **$0.85** | |
| h2o-strict (Haiku → Opus) | 28/36 | $1.90 | 23 escalations |

**Measured:** v5b moved 27 → 21 between two runs of the same arm on the same set. Any single-run difference under about 6/36 is not evidence.

### I. v7: test-first pipeline, 10-22 → 10-23

Sources: `docs/V7-PIPELINE.md`, `reports/v7/OVERNIGHT.md` (with follow-ups 1–2), `scripts/v7-stage-value.mjs`.
The stages are plan, blind, coder, probe, sblind and review. Each check's hidden verdict is logged per checkpoint, and no decision ever reads it.

| Run | Pass | $ | What changed |
|---|---|---|---|
| v6/r27-v7-run1-broken | 5/14 | $1.15 | 4 provider + 3 harness errors (max_turns thrown, EISDIR) |
| v6/r27-v7-{s1,s2,s3,all} → v7/r27-v7-merged | **17/27** | **$3.28** | all 6 stages |
| v7/r27-v7agree-{s1..s4} → merged | 15/27 | $0.79 | trimmed stages + agreement gate (both suites must fail) |
| v7/r27-v7indep-{s1..s3,rest} → merged | 17/27 | $0.79 | 2nd writer sees the task only (sblind = Haiku) |
| v7/r27-v7rescue-{s1..s3,rest} → merged | **19/27** | **$1.21** | 1 Haiku fix, then Opus rescue when the gate still fails (`--v7-rescue=opus`); offline replay predicted 22 |
| v7/r27-v7strict-{s1..s3} | 6/6 | $0.47 | partial; stopped at weekly 92% |

Per-check value, from 94 checkpoints of the full v7 run:
- blind (Haiku) and probe (Haiku) together missed 0 of 45 failing checkpoints.
- sblind (Sonnet) and review (Sonnet) were 70% of spend and caught nothing extra.
- **False alarms ran at 88%.** The agreement gate brought that to 81% live, and independent writers to 78%. Two Haiku writers are wrong *together*, even without seeing each other's inputs.

### J. Hints, novel8 and the step trace (reports/v9), 10-23

The constraint, from the owner: the model may get *more task information*, never tests or expected outputs. `V4_HINT=exercism` names the source suite and asks for canonical edge cases. `generic` gives generic interface and edge-case instructions.

| Run | Set | Pass | $ | Meaning |
|---|---|---|---|---|
| v9/fails-hint | the 10 v5b r27 fails, exercism hint | 5/10 | $0.39 | half recovered by better spec alone |
| v9/passes-hint | the 17 v5b passes, with hint | 15/17 | $0.53 | 2 regressions, so the hint is not free |
| v9/novel-off (+ rerun 1/1) | novel8, no hint | 8/8 | $0.28 | every task first-try pass by Haiku… |
| v9/novel-generic (+ rerun 2/2) | novel8, generic hint | 8/8 | $0.36 | …and every task escalated anyway: the set is too easy |
| v9/trace7 | 7 tasks with the step-trace tool | 3/7 | $0.22 | diagnosis data (`reports/v9/steps-pass.tsv`) |

### K. Self-test contract (reports/v10), 10-23

Commit dcd2fcd / 1f014b7. The contract has three parts:
1. The self-test must import every public name and cover the stated examples.
2. `selftest*` files are excluded from grading.
3. A run that executed zero tests is "unverified".

| Run | Pass | $ | $/task |
|---|---|---|---|
| v10/r27-selffix | **17/27** | **$0.17** | **$0.006** |

It ties v5b at 37% of v5b's cost. Its 10 fails were the input to phase L.

### L. v8 test ladder (reports/v11), 10-23

Source: `src/v8-arm.mjs`, `tests/v8-arm.test.mjs` (5 tests), commit ff7dd30.
- Haiku codes and self-tests.
- Each level that passes hands the code to a stronger *tool-less, one-turn* test writer: Sonnet with at most 10 tests, then Opus with at most 6. The writers see the task text only.
- Haiku fixes failures, at most 2 rounds per level, and decides whether the test or the code is wrong.
- A test edit counts only with a `TESTBUG:` tag.
- A level that stays red ships the last code that passed the level below.
- Haiku's own passing self-test is then frozen as an anchor.

| Run | Set | Pass | $ | Note |
|---|---|---|---|---|
| v11/ladder-fails | 10 self-fix fails | 1/10 | $0.54 | writers had tools: $0.05–0.10 per writer call; 6 cap aborts |
| v11/ladder2-fails | same 10 | 3/10 | $0.47 | tool-less one-turn writers; 4 cap aborts |
| v11/ladder3-rest | 7 not yet rescued | 2/7 | $0.47 | frozen self-test anchor added |
| v11/ladder4-rest | 5 left | 0/5 | $0.17 | 1 harness_error: EISDIR on java_all-your-base (`selftest/` dir), now fixed, not re-run |

The rescued tasks across the ladder runs were cpp_all-your-base, cpp_complex-numbers, cpp_sublist, java_affine-cipher and python_go-counting.
That gives 17 + 5 = **22 stitched**. Not a clean run.

What broke (measured from rows):
- **The frozen anchor is two-sided.** It stopped correct code from being bent to a wrong Sonnet test, which was the alphametics failure. But when *Haiku's own test* is wrong (two-bucket, alphametics, grade-school), the anchor locks the wrong behavior in, and Sonnet's correct test can't win.
- **Haiku is bad at "is the test or the code wrong".** On rust_accumulate a TESTBUG claim was accepted and the code was still wrong.
- **Tool-using writers were ~90% of task cost.** Making them tool-less and one-turn fixed the cost.

---

## 3. r27: every task × every arm (finalPass)

P = pass, - = fail, · = not run in that arm. `self` is v10, and `v8` covers only the fail-set ladder runs. Rebuild with `node scripts/r27-grid.mjs` (offline, reads the jsonl files listed in §2).

| task | haiku | sonnet | opus | v5b | v6 | v7 | v7ag | v7in | v7res | self | v8 | any |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cpp_all-your-base | - | - | P | - | - | - | - | - | P | - | P | P |
| cpp_complex-numbers | - | P | P | P | - | P | P | P | P | - | P | P |
| cpp_phone-number | - | - | - | P | - | - | P | P | - | P | · | P |
| cpp_sublist | - | - | P | P | - | - | - | - | - | - | P | P |
| go_alphametics | P | P | P | P | P | P | P | P | P | P | · | P |
| go_say | P | P | P | P | P | P | P | P | P | P | · | P |
| go_two-bucket | P | - | P | P | P | P | P | - | - | P | · | P |
| go_word-search | P | P | P | P | P | P | P | P | P | P | · | P |
| go_wordy | P | P | P | P | P | P | P | P | P | P | · | P |
| java_affine-cipher | - | P | P | - | - | - | - | - | P | - | P | P |
| java_all-your-base | - | - | P | - | - | - | - | - | - | - | - | P |
| java_pig-latin | P | - | P | P | P | P | P | P | P | P | · | P |
| java_satellite | P | - | P | P | - | - | P | P | P | P | · | P |
| javascript_alphametics | - | P | P | - | - | - | - | P | P | - | - | P |
| javascript_grade-school | - | - | - | - | - | - | - | - | P | - | - | P |
| javascript_house | P | P | P | - | - | P | - | - | - | P | · | P |
| javascript_two-bucket | - | - | - | - | - | - | - | - | - | - | - | - |
| python_affine-cipher | P | P | P | P | P | P | P | P | P | P | · | P |
| python_connect | P | P | P | P | P | P | P | P | P | P | · | P |
| python_go-counting | - | - | P | - | - | - | - | - | - | - | P | P |
| python_proverb | P | P | P | P | P | P | - | P | P | P | · | P |
| python_transpose | P | P | P | P | P | P | P | P | P | P | · | P |
| rust_accumulate | - | - | P | - | - | P | - | - | - | - | - | P |
| rust_book-store | P | P | P | - | P | P | - | P | P | P | · | P |
| rust_decimal | P | - | - | P | P | P | P | P | P | P | · | P |
| rust_parallel-letter-frequency | P | P | P | P | P | P | P | P | P | P | · | P |
| rust_pig-latin | P | - | - | P | P | P | P | P | P | P | · | P |
| **total** | 16 | 14 | 22 | 17 | 14 | 17 | 15 | 17 | 19 | 17 | 5 | 26 |

Reading the grid:
- **Always pass:** 11 tasks pass in every arm. They are free points and carry no signal.
- **Flip with noise:** cpp_phone-number, go_two-bucket, javascript_house, python_proverb, rust_book-store and java_satellite flip between arms of similar design. This is run noise.
- **Need a strong model or a good test:** java_all-your-base, python_go-counting, java_affine-cipher, cpp_all-your-base, cpp_sublist and rust_accumulate. Opus passes them; cheap arms only pass them with an Opus step (v7res, v8).
- **Never passed:** javascript_two-bucket, in any arm, including Opus.

---

## 4. Realizations

### The checker
1. **The checker sets the ceiling.** Every arm that improved did so by changing what counts as "done": SWE-Pro gate fixes, the self-test contract, Opus rescue. More samples, voters or rounds never helped.
2. **Cheap tests fail in both directions.** v7 false alarms ran at 78–88%. Gate holes (shipping wrong code) ran at 3–5 per r27 run. The gate is safe-ish, but useless as a stop signal.
3. **Same-family writers are correlated.** Two Haiku writers, with or without a shared plan, are wrong together at 32 of 41 checkpoints. Independence needs a different model or a different information source, not a second prompt.
4. **Anchors cut both ways.** Freezing a passing test protects correct code and also protects a wrong test. Any anchor needs an arbiter who is not the author.
5. **Haiku can't arbitrate test vs code.** Arbitration (TESTBUG, "which is wrong") must go to a stronger model. It can be one tool-less question, since it's cheap.

### The task
6. **The spec gap is the biggest single lever** (measured twice): SWE-Pro 0/7 → 6/7 from adding requirements and interface, and r27 fails 5/10 recovered by the exercism hint. Giving the model *more task information* is allowed and works. Giving it tests is forbidden.
7. **Interface errors dominate cheap misses:** missing constants, wrong type shape, throw vs return. The self-test must import every public name.

### Cost
8. **Tool-using sub-calls are the cost**, not tokens of thought: writers with tools ran $0.05–0.10 against ~$0.005 tool-less. Lean CLI flags removed ~$0.26 of overhead per call. Make every non-coding role tool-less and one-turn.
9. **Haiku with a good contract is very cheap:** $0.006 per task at 17/27. The remaining money is best spent only on the ~6 strong-model tasks.

### Measurement
10. **Noise is large.** The same arm on the same set moved 27 → 21 of 36. On /tmp, Haiku batches drifted 11 → 5 of 12. Below roughly 6/36 or 3/27, differences mean nothing.
11. **Location and ambient files matter** (GATE-EVAL addenda 20–21). Pin cwd, run interleaved, and keep workspaces under `realpath(tmpdir())`.
12. **Contaminated sets flatter us.** Polyglot is Exercism. Novel8 was too easy (Haiku 8/8 first try). A hard, unseen set is still missing.
13. **Most "model failures" were harness bugs.** In SWE-Pro, 30+ failed runs were harness bugs, and 0 were confirmed model incapability. Always look at the failure tail before blaming the model (`reports/v4/failures/<label>/`).

---

## 5. Tests

### Unit tests (offline, no model calls)

Run: `node --test tests/*.test.mjs`. On 2026-10-23 under Node v22.23.3: **245 tests, 240 pass, 2 fail, 3 skipped**.
- The 2 failures are phase-A Pi sandbox tests, `tests/workflow.test.mjs:16` and `tests/workspace.test.mjs:17`.
- Both fail with `ERR_ACCESS_DENIED … resource: '/var'`. Node's permission model rejects the `/var` → `/private/var` symlink, and the README requires Node 24+.
- They predate v4. They are not touched by v4–v8 code.

| Area | Test files |
|---|---|
| Phase A (Pi) | budget, code-graph, codemode, compare-policies, context-policy, context-waste-audit, control-policy, harness-policy, planned-reads, real-policy, report, tasks, tool-efficiency, watchers, workflow, workspace |
| Gate-eval | mutant-matrix, oracle-audit, spec-gate |
| v4 core | v4-arms, v4-bench, v4-bench-cli, v4-bench-symlink, v4-budget-flag, v4-docs, v4-escalation, v4-ledger, v4-ledger-wiring, v4-process (group kill), v4-runner, v4-tiers, v4-report, v4-transcripts, v4-workspace-cp, v4-verify-closure |
| v4 safety | v4-sandbox, v4-envrun, v4-selfcheck, v4-selfgate |
| Polyglot / SWE-Pro | v4-polyglot, v4-polyglot-smoke, v4-swebpro, v4-swebpro-hide, v4-swebpro-prompt, v4-v6-protocol |
| Arms | v5-arm, v5-escalation, v5-index, v6-arm, v7-arm, v8-arm |

### Benchmark sets

| Set | Manifest / root | Size | Notes |
|---|---|---|---|
| poly9 / poly27 / poly36 | `config/bench-manifest.polyglot*.json` | 9 / 27 / 36 | Aider polyglot (Exercism), contaminated |
| r27 | dev set of 27 polyglot tasks | 27 | the main dev set since 10-22 |
| d36 | 36-task dev set | 36 | used in phase H |
| novel8 | `~/bench-repos/novel`, `V4_POLY_ROOT` | 8 | hand-made, unseen, too easy |
| SWE-bench Pro | `config/bench-manifest.swebpro20.json` (8-task subset run), `swebpro2-fix`, `swebpro-fail3-*` | 8 | official grader, gold-checked |
| fail subsets | `config/r27-selffix-fails.json`, `r27-ladder-rest*.json` | 10 / 7 / 5 | for cheap re-runs |
| gate-eval tasks | picomatch #142/#187/#202, ptr-425, shell-quote-15, bytes-51, cookie-173 | 8 | phase B |

The scoring rule is the same everywhere: `finalPass` is the hidden grader's verdict, and the hidden tests are never visible to agents (chmod-000 `.hidden`, scorer-only).

---

## 6. How to improve it (ranked by expected value per dollar)

1. **Strong-model arbiter on conflicts.** This is the missing piece, from phase L.
   - **Trigger:** a writer test conflicts with Haiku's code or self-test, or any TESTBUG claim is made.
   - **Action:** ask Sonnet one tool-less question with the task text, the failing assertion and the relevant code: "Which is wrong per the task: test or code? Cite the task."
   - **Cost:** estimated $0.01–0.02 per conflict.
   - **Expected effect (inference):** fixes the two-bucket, alphametics and grade-school anchor lock-ins and the rust_accumulate false TESTBUG. Run the 10 self-fix fails first (~$0.5), then the full r27.
2. **Clean full-r27 run of the best design** instead of stitching: self-fix contract → v8 ladder with the arbiter → Opus rescue only on a red ladder. Report it as one number. Estimated $1–2.
3. **Keep the best checkpoint.** If fix rounds don't reduce the number of failing suites, ship the pre-fix code. It costs nothing in model calls, and would have saved rust_accumulate and javascript_alphametics (OVERNIGHT next-fix 1).
4. **Spec enrichment without tests.** The exercism hint recovered 5/10 but regressed 2/17. Next:
   - apply it only when the self-test is weak;
   - check expected values in failing tests against the task's own examples with a parser (free per task).
5. **Gate adds the existing tests of touched modules** (SWE-Pro FIXLOG next step). This closes the narrowed-SELFTEST gate hole class.
6. **Route the ~6 capability-bound tasks straight to Opus**, using a cheap signal: v8 sonnet-level red after 2 fixes, or the task looking like a known-hard family. Opus averages ~$0.21–0.27 per r27 task, so 6 tasks add ~$1.5.
7. **Harder, unseen benchmark.** Novel8 is saturated. Build 30–50 tasks with hidden API-shape traps, plus real SWE-Pro at N ≥ 50 per arm, before any marketing claim.
8. **Unverified state:** a self-test that ran 0 tests should neither pass nor count as a fail (rulebook 3.3; partly done in v10).
9. **Matched-budget comparisons:** compare every arm against "the same dollars of Opus or Sonnet resampling".
10. **Run discipline:**
    - same cwd;
    - arms interleaved in time;
    - fail subset first, full set only for a candidate;
    - a hard `--global-cap-usd` on every run;
    - the weekly 92% stop.
11. **Rust cold-build timeouts:** pre-build cargo before the coder starts (rust_book-store `RUN_TIMEOUT`).
12. **Later: tune the free tier on our own passes** (Terminal-RSI idea, ANALYSIS.md). Transcripts of passes are already saved (`29f5ed1`). It needs a few hundred passes on non-contaminated tasks first.

**Ceiling estimate (inference):** a clean 22–23/27 at ≤$2 for r27 (≤$0.08 per task) looks reachable with fixes 1 + 2 + 3 + 6. Opus alone is 22 for $5.90.

---

## 7. How to run

```bash
cd ~/suffice-v4
node --test tests/*.test.mjs                       # offline, free
node ~/.claude/hooks/usage-guard.mjs status --fresh # check weekly % before any model run
# r27 self-fix baseline (Haiku):
node scripts/v4-bench.mjs --help                    # flags: --arm, --manifest, --out, --global-cap-usd, --workers
# v8 ladder on a fail subset:
#   --arm=v8 --manifest=config/r27-selffix-fails.json --out=reports/v11/<label>.jsonl --global-cap-usd=0.6
# v7 with Opus rescue:
#   --arm=v7 --v7-rescue=opus
# stage value for a v7 results file:
node scripts/v7-stage-value.mjs reports/v7/r27-v7-merged.jsonl
```

Results go to `reports/<folder>/<label>.jsonl`, with a `.ledger.jsonl` (spend) and a `.log` beside each. Failure tails go to `reports/v4/failures/<label>/`.
Before quoting a run, check that every row has `status: completed`, then count `finalPass`.

## 8. Key files

| Path | What |
|---|---|
| `src/v4-claude.mjs` | CLI wrapper, process-group kill, lean flags |
| `src/v4-config.mjs` | tiers per arm (v4…v8) |
| `src/v4-selfsignal.mjs` | `parseSelfTest`, `testsRan` |
| `src/v4-ledger.mjs` | global spend cap |
| `src/v5-*.mjs`, `src/v6-arm.mjs`, `src/v7-arm.mjs`, `src/v8-arm.mjs` | arms |
| `scripts/v4-bench.mjs` | the bench driver |
| `RULEBOOK.md` | short rules distilled from all of this |
| `docs/FIXLOG.md` | every SWE-Pro failure and fix |
| `docs/GATE-EVAL.md` | phase B, addenda 1–21 |
| `reports/v7/OVERNIGHT.md` | v7 per-check analysis and follow-ups |
| `reports/v4/ANALYSIS.md` | v4 / SWE-Pro analysis |
| `STATUS.md`, `docs/CHATGPT-HANDOFF.md` | phase A detail |

---

## Appendix: every run file (generated from `reports/**/*.jsonl`)

Columns: results file, last row time, arm, rows, finalPass count, total $, $ per row, escalations, non-completed statuses. Phase for each file is in §2. Merged files repeat the rows of their shards.

| file | date | arm | n | pass | $ total | $/task | esc | other status |
|---|---|---|---|---|---|---|---|---|
| full/20261022-024003/swebpro-single.jsonl | 10-23 04:07 | single:claude-sonnet-5-5,undefined | 10 | 0 | 1.25 | 0.125 | 0 | harness_error:8 |
| full/20261022-024003/swebpro-v5-cheap.jsonl | 10-23 04:07 | v5 | 8 | 0 | 0.43 | 0.054 | 0 | harness_error:6 |
| full/20261022-024003/swebpro-v5-strict.jsonl | 10-23 04:07 | v5 | 8 | 0 | 0.05 | 0.006 | 0 | harness_error:4 budget_exhausted:2 |
| full/20261022-034106/swebpro-single.jsonl | 10-23 04:07 | single:claude-sonnet-5-5 | 8 | 1 | 1.01 | 0.127 | 0 | harness_error:2 |
| full/20261022-034106/swebpro-v5-cheap.jsonl | 10-23 04:07 | v5 | 8 | 2 | 0.36 | 0.045 | 0 | harness_error:2 |
| full/20261022-034106/swebpro-v5-strict.jsonl | 10-23 04:07 | v5 | 8 | 1 | 0.35 | 0.043 | 2 | budget_exhausted:2 harness_error:2 |
| full/20261022-044808/swebpro-single.jsonl | 10-23 04:07 | single:claude-sonnet-5-5 | 8 | 4 | 1.05 | 0.131 | 0 | harness_error:2 |
| full/20261022-044808/swebpro-v5-cheap.jsonl | 10-23 04:07 | v5 | 8 | 4 | 0.30 | 0.038 | 0 | harness_error:2 |
| full/20261022-044808/swebpro-v5-strict.jsonl | 10-23 04:07 | v5 | 8 | 3 | 0.15 | 0.018 | 1 | harness_error:2 |
| full/20261022-055513/swebpro-single.jsonl | 10-23 04:07 | single:claude-sonnet-5-5 | 2 | 2 | 0.25 | 0.127 | 0 |  |
| full/20261022-055513/swebpro-v5-cheap.jsonl | 10-23 04:07 | v5 | 2 | 2 | 0.05 | 0.027 | 0 |  |
| full/20261022-055513/swebpro-v5-strict.jsonl | 10-23 04:07 | v5 | 2 | 2 | 0.08 | 0.042 | 1 |  |
| full/20261022-092150/swebpro-single.jsonl | 10-23 04:07 | single:claude-sonnet-5-5 | 8 | 7 | 0.80 | 0.100 | 0 |  |
| full/20261022-092150/swebpro-v5-cheap.jsonl | 10-23 04:07 | v5 | 8 | 7 | 0.75 | 0.094 | 1 |  |
| full/20261022-092150/swebpro-v5-strict.jsonl | 10-23 04:07 | v5 | 8 | 7 | 0.74 | 0.093 | 4 |  |
| full/clean-20261022-215334/swebpro-single.jsonl | 10-23 04:07 | single:sonnet | 8 | 7 | 1.00 | 0.125 | 0 | budget_exhausted:1 |
| full/clean-20261022-215334/swebpro-v5-cheap.jsonl | 10-23 04:07 | v5 | 8 | 8 | 0.83 | 0.104 | 2 |  |
| full/clean-20261022-215334/swebpro-v5-strict.jsonl | 10-23 04:07 | v5 | 8 | 7 | 0.37 | 0.047 | 3 |  |
| full/fix-20261022-072513/single.jsonl | 10-23 04:07 | single:claude-sonnet-5-5 | 1 | 0 | 0.62 | 0.616 | 0 |  |
| full/fix-20261022-081611/cheap.jsonl | 10-23 04:07 | v5 | 2 | 0 | 0.04 | 0.020 | 0 | run_timeout:1 |
| full/fix-20261022-081611/single.jsonl | 10-23 04:07 | single:claude-sonnet-5-5 | 2 | 0 | 0.57 | 0.284 | 0 | run_timeout:1 |
| full/fix-20261022-081611/strict.jsonl | 10-23 04:07 | v5 | 3 | 0 | 0.21 | 0.070 | 1 | run_timeout:1 harness_error:1 |
| full/fix-20261022-084319/cheap.jsonl | 10-23 04:07 | v5 | 2 | 0 | 0.18 | 0.090 | 0 |  |
| full/fix-20261022-084319/single.jsonl | 10-23 04:07 | single:claude-sonnet-5-5 | 2 | 0 | 0.14 | 0.071 | 0 |  |
| full/fix-20261022-084319/strict.jsonl | 10-23 04:07 | v5 | 3 | 0 | 0.02 | 0.006 | 0 |  |
| full/fix-20261022-085801/cheap.jsonl | 10-23 04:07 | v5 | 2 | 1 | 0.14 | 0.071 | 0 |  |
| full/fix-20261022-085801/single.jsonl | 10-23 04:07 | single:claude-sonnet-5-5 | 2 | 2 | 0.12 | 0.061 | 0 |  |
| full/fix-20261022-085801/strict.jsonl | 10-23 04:07 | v5 | 3 | 3 | 0.02 | 0.006 | 0 |  |
| full/fix-20261022-103626/cheap.jsonl | 10-23 04:07 | v5 | 1 | 1 | 0.08 | 0.082 | 0 |  |
| full/fix-20261022-103626/single.jsonl | 10-23 04:07 | single:claude-sonnet-5-5 | 1 | 1 | 0.15 | 0.148 | 0 |  |
| full/fix-20261022-103626/strict.jsonl | 10-23 04:07 | v5 | 1 | 0 | 0.00 | 0.000 | 0 | provider_error:1 |
| full/fix-20261022-125840/strict.jsonl | 10-23 04:07 | v5 | 1 | 1 | 0.26 | 0.256 | 1 |  |
| full/flint-20261022-132819/swebpro-flint.jsonl | 10-23 04:07 | single:flint,undefined | 8 | 0 | 0.00 | 0.000 | 0 | budget_exhausted:3 aborted_memory:5 |
| full/flint6-20261022-195058/swebpro-flint.jsonl | 10-23 04:07 | single:flint | 2 | 2 | 3.39 | 1.694 | 0 |  |
| full/flintfree-20261022-163546/swebpro-flint.jsonl | 10-23 04:07 | single:flint | 8 | 2 | 0.91 | 0.114 | 0 | run_timeout:2 provider_error:4 |
| v10/r27-selffix.jsonl | 10-23 13:17 | v5 | 27 | 17 | 0.17 | 0.006 | 0 |  |
| v11/ladder-fails.jsonl | 10-23 13:37 | v8 | 10 | 1 | 0.54 | 0.054 | 1 | global_cap_refused:1 aborted_cap:6 |
| v11/ladder2-fails.jsonl | 10-23 13:43 | v8 | 10 | 3 | 0.47 | 0.047 | 3 | global_cap_refused:3 aborted_cap:4 |
| v11/ladder3-rest.jsonl | 10-23 13:50 | v8 | 7 | 2 | 0.47 | 0.067 | 2 | global_cap_refused:2 aborted_cap:1 |
| v11/ladder4-rest.jsonl | 10-23 13:55 | v8 | 5 | 0 | 0.17 | 0.034 | 1 | harness_error:1 |
| v4/pilot-swebpro-opus.jsonl | 10-21 23:52 | single:claude-opus-5-5 | 2 | 1 | 0.81 | 0.403 | 0 |  |
| v4/pilot-swebpro-sonnet.jsonl | 10-21 23:55 | single:claude-sonnet-5-5 | 2 | 0 | 0.75 | 0.375 | 0 | global_cap_refused:1 |
| v4/pilot-swebpro-v4.jsonl | 10-21 23:56 | v4 | 2 | 1 | 0.35 | 0.174 | 2 |  |
| v4/poly27-sonnet.jsonl | 10-21 18:18 | single:claude-sonnet-5-5 | 27 | 25 | 2.33 | 0.086 | 0 |  |
| v4/poly27-v4-redo.jsonl | 10-21 18:20 | v4 | 4 | 4 | 0.22 | 0.056 | 2 |  |
| v4/poly27-v4.jsonl | 10-21 18:06 | v4 | 27 | 22 | 0.63 | 0.023 | 6 | run_timeout:4 |
| v4/poly36-all.jsonl | 10-21 18:18 | v4,single:claude-sonnet-5-5 | 72 | 65 | 3.32 | 0.046 | 6 | run_timeout:4 |
| v4/poly36-merged.jsonl | 10-21 18:20 | v4,single:claude-sonnet-5-5 | 72 | 69 | 3.54 | 0.049 | 8 |  |
| v4/poly9-all.jsonl | 10-21 16:32 | v4,single:claude-sonnet-5-5 | 18 | 18 | 0.36 | 0.020 | 0 |  |
| v4/poly9-sonnet.jsonl | 10-21 16:32 | single:claude-sonnet-5-5 | 9 | 9 | 0.29 | 0.033 | 0 |  |
| v4/poly9-v4.jsonl | 10-21 16:31 | v4 | 9 | 9 | 0.07 | 0.008 | 0 |  |
| v4/smoke.jsonl | 10-23 04:07 | v4 | 1 | 0 | 0.00 | 0.000 | 0 | harness_error:1 |
| v4/smoke2.jsonl | 10-23 04:07 | v4 | 1 | 0 | 0.00 | 0.000 | 0 | budget_exhausted:1 |
| v4/smoke3.jsonl | 10-21 16:25 | v4 | 1 | 1 | 0.00 | 0.002 | 0 |  |
| v5/harness-bug-run/polyglot-v5.jsonl | 10-23 04:07 | v5 | 9 | 0 | 0.28 | 0.032 | 0 | harness_error:9 |
| v5/harness-bug-run/polyglot27-v5.jsonl | 10-23 04:07 | v5 | 27 | 0 | 0.75 | 0.028 | 0 | harness_error:13 global_cap_refused:2 aborted_cap:12 |
| v5/polyglot-v5.jsonl | 10-23 04:07 | v5 | 9 | 6 | 0.53 | 0.059 | 5 |  |
| v5/polyglot-v5b.jsonl | 10-23 04:07 | v5 | 9 | 6 | 0.22 | 0.024 | 6 |  |
| v6/polyglot9-v6.jsonl | 10-22 03:28 | v6 | 9 | 4 | 0.18 | 0.020 | 2 |  |
| v6/r27-haiku-alone.jsonl | 10-22 03:43 | single:claude-haiku-5-5 | 27 | 16 | 0.52 | 0.019 | 0 |  |
| v6/r27-opus-alone-fair.jsonl | 10-23 03:49 | single:opus,undefined | 28 | 22 | 5.90 | 0.211 | 0 | run_timeout:1 harness_error:2 global_cap_refused:1 aborted_cap:2 |
| v6/r27-sonnet-alone.jsonl | 10-22 03:38 | single:claude-sonnet-5-5 | 27 | 14 | 1.10 | 0.041 | 0 | budget_exhausted:2 global_cap_refused:1 aborted_cap:3 |
| v6/r27-v5b-gatefix-rest.jsonl | 10-23 04:03 | v5 | 14 | 8 | 0.42 | 0.030 | 12 | harness_error:1 |
| v6/r27-v5b-gatefix.jsonl | 10-23 04:00 | v5 | 13 | 8 | 0.45 | 0.035 | 12 |  |
| v6/r27-v5b.jsonl | 10-22 03:44 | v5 | 27 | 17 | 0.46 | 0.017 | 11 |  |
| v6/r27-v6-noplan-k2.jsonl | 10-22 03:42 | v6 | 27 | 14 | 0.34 | 0.013 | 7 | provider_error:3 |
| v6/r27-v6f-s1.jsonl | 10-23 04:36 | v6 | 1 | 1 | 0.00 | 0.005 | 0 |  |
| v6/r27-v6f-s2.jsonl | 10-23 04:37 | v6 | 3 | 2 | 0.06 | 0.021 | 1 |  |
| v6/r27-v6f-s3.jsonl | 10-23 05:24 | v6 | 23 | 11 | 0.35 | 0.015 | 5 |  |
| v6/r27-v7-all.jsonl | 10-23 04:28 | v7 | 11 | 6 | 1.41 | 0.128 | 0 |  |
| v6/r27-v7-run1-broken.jsonl | 10-23 04:16 | v7 | 14 | 5 | 1.15 | 0.082 | 0 | provider_error:4 harness_error:3 |
| v6/r27-v7-s1.jsonl | 10-23 04:29 | v7 | 1 | 1 | 0.04 | 0.042 | 0 |  |
| v6/r27-v7-s2.jsonl | 10-23 04:32 | v7 | 3 | 1 | 0.40 | 0.133 | 0 |  |
| v6/r27-v7-s3.jsonl | 10-23 04:35 | v7 | 12 | 9 | 1.43 | 0.119 | 0 |  |
| v6/smoke.jsonl | 10-22 03:22 | v6 | 1 | 1 | 0.01 | 0.011 | 0 |  |
| v6/sweep-haiku-alone.jsonl | 10-22 03:33 | single:claude-haiku-5-5 | 9 | 4 | 0.19 | 0.021 | 0 |  |
| v6/sweep-sonnet-alone.jsonl | 10-22 03:28 | single:claude-sonnet-5-5 | 9 | 6 | 0.32 | 0.036 | 0 | global_cap_refused:1 aborted_cap:1 |
| v6/sweep-v6-noplan-k2.jsonl | 10-22 03:33 | v6 | 9 | 3 | 0.12 | 0.013 | 2 | provider_error:1 |
| v6/sweep-v6-plan-k1.jsonl | 10-22 03:30 | v6 | 9 | 3 | 0.15 | 0.017 | 2 | provider_error:2 |
| v7/d36-h2o-strict.jsonl | 10-23 04:07 | v5 | 36 | 28 | 1.90 | 0.053 | 23 |  |
| v7/d36-haiku-b.jsonl | 10-23 04:07 | single:claude-haiku-5-5 | 31 | 11 | 0.49 | 0.016 | 0 | global_cap_refused:1 aborted_cap:8 |
| v7/d36-haiku-r2.jsonl | 10-23 04:07 | single:claude-haiku-5-5 | 36 | 19 | 0.73 | 0.020 | 0 | harness_error:1 run_timeout:1 |
| v7/d36-haiku.jsonl | 10-23 04:07 | single:claude-haiku-5-5 | 5 | 3 | 0.13 | 0.026 | 0 |  |
| v7/d36-opus-b.jsonl | 10-23 04:07 | single:claude-opus-5-5 | 22 | 19 | 4.22 | 0.192 | 0 | harness_error:1 |
| v7/d36-opus.jsonl | 10-23 04:07 | single:claude-opus-5-5 | 14 | 11 | 1.82 | 0.130 | 0 | budget_exhausted:2 harness_error:1 |
| v7/d36-s2o.jsonl | 10-23 04:07 | v5 | 36 | 28 | 0.85 | 0.024 | 0 |  |
| v7/d36-sonnet-b.jsonl | 10-23 04:07 | single:claude-sonnet-5-5 | 16 | 13 | 0.86 | 0.054 | 0 |  |
| v7/d36-sonnet.jsonl | 10-23 04:07 | single:claude-sonnet-5-5 | 20 | 17 | 1.51 | 0.075 | 0 |  |
| v7/d36-v5-opus-b.jsonl | 10-23 04:07 | v5 | 25 | 17 | 0.89 | 0.036 | 10 |  |
| v7/d36-v5-opus.jsonl | 10-23 04:07 | v5 | 11 | 8 | 0.56 | 0.051 | 5 |  |
| v7/d36-v5b-b.jsonl | 10-23 04:07 | v5 | 23 | 16 | 0.44 | 0.019 | 11 |  |
| v7/d36-v5b-r2.jsonl | 10-23 04:07 | v5 | 36 | 21 | 0.47 | 0.013 | 11 |  |
| v7/d36-v5b-strict.jsonl | 10-23 04:07 | v5 | 36 | 24 | 0.57 | 0.016 | 20 |  |
| v7/d36-v5b.jsonl | 10-23 04:07 | v5 | 13 | 11 | 0.24 | 0.018 | 5 |  |
| v7/r27-v6-fixed-merged.jsonl | 10-23 05:24 | v6 | 27 | 14 | 0.42 | 0.015 | 6 |  |
| v7/r27-v7-merged.jsonl | 10-23 04:35 | v7 | 27 | 17 | 3.28 | 0.122 | 0 |  |
| v7/r27-v7agree-merged.jsonl | 10-23 05:44 | v7 | 27 | 15 | 0.79 | 0.029 | 0 | run_timeout:1 |
| v7/r27-v7agree-s1.jsonl | 10-23 05:29 | v7 | 1 | 1 | 0.01 | 0.010 | 0 |  |
| v7/r27-v7agree-s2.jsonl | 10-23 05:31 | v7 | 3 | 1 | 0.08 | 0.028 | 0 |  |
| v7/r27-v7agree-s3.jsonl | 10-23 05:39 | v7 | 12 | 6 | 0.32 | 0.027 | 0 | run_timeout:1 |
| v7/r27-v7agree-s4.jsonl | 10-23 05:44 | v7 | 11 | 7 | 0.37 | 0.034 | 0 |  |
| v7/r27-v7indep-merged.jsonl | 10-23 06:02 | v7 | 27 | 17 | 0.79 | 0.029 | 0 | global_cap_refused:1 aborted_cap:1 |
| v7/r27-v7indep-rest.jsonl | 10-23 06:02 | v7 | 11 | 6 | 0.30 | 0.027 | 0 | global_cap_refused:1 aborted_cap:1 |
| v7/r27-v7indep-s1.jsonl | 10-23 05:49 | v7 | 1 | 1 | 0.01 | 0.007 | 0 |  |
| v7/r27-v7indep-s2.jsonl | 10-23 05:51 | v7 | 3 | 2 | 0.16 | 0.054 | 0 |  |
| v7/r27-v7indep-s3.jsonl | 10-23 05:58 | v7 | 12 | 8 | 0.33 | 0.027 | 0 |  |
| v7/r27-v7rescue-merged.jsonl | 10-23 14:35 | v7 | 27 | 19 | 1.21 | 0.045 | 0 |  |
| v7/r27-v7rescue-rest.jsonl | 10-23 14:35 | v7 | 11 | 7 | 0.61 | 0.055 | 0 |  |
| v7/r27-v7rescue-s1.jsonl | 10-23 14:20 | v7 | 1 | 1 | 0.01 | 0.010 | 0 |  |
| v7/r27-v7rescue-s2.jsonl | 10-23 14:23 | v7 | 3 | 2 | 0.21 | 0.070 | 0 |  |
| v7/r27-v7rescue-s3.jsonl | 10-23 14:30 | v7 | 12 | 9 | 0.38 | 0.031 | 0 |  |
| v7/r27-v7strict-s1.jsonl | 10-23 14:36 | v7 | 1 | 1 | 0.01 | 0.008 | 0 |  |
| v7/r27-v7strict-s2.jsonl | 10-23 14:39 | v7 | 3 | 3 | 0.38 | 0.127 | 0 |  |
| v7/r27-v7strict-s3.jsonl | 10-23 14:40 | v7 | 2 | 2 | 0.08 | 0.042 | 0 |  |
| v8/s2o.jsonl | 10-23 04:07 | v5 | 7 | 5 | 0.22 | 0.032 | 0 |  |
| v8/sonnet.jsonl | 10-23 04:07 | single:claude-sonnet-5-5 | 3 | 2 | 0.08 | 0.028 | 0 |  |
| v9/fails-hint.jsonl | 10-23 12:39 | v5 | 10 | 5 | 0.39 | 0.039 | 8 |  |
| v9/novel-generic-rerun.jsonl | 10-23 12:57 | v5 | 2 | 2 | 0.11 | 0.057 | 2 |  |
| v9/novel-generic.jsonl | 10-23 12:54 | v5 | 8 | 6 | 0.25 | 0.032 | 6 | global_cap_refused:2 |
| v9/novel-off-rerun.jsonl | 10-23 12:56 | v5 | 1 | 1 | 0.04 | 0.043 | 1 |  |
| v9/novel-off.jsonl | 10-23 12:52 | v5 | 8 | 7 | 0.24 | 0.030 | 7 | global_cap_refused:1 |
| v9/passes-hint.jsonl | 10-23 13:06 | v5 | 17 | 15 | 0.53 | 0.031 | 11 | global_cap_refused:1 |
| v9/trace7.jsonl | 10-23 13:09 | v5 | 7 | 3 | 0.22 | 0.032 | 6 |  |

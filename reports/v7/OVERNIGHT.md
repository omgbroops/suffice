# Overnight 2026-10-22/23: v7 vs v6 (fixed) on r27

Set: polyglot r27 (27 tasks: cpp, go, java, javascript, python, rust). Hidden tests are used for scoring only.
Weekly usage: 87% at the start, 88% at the end (stop line 92%, never reached).

## Results

| Arm | Pass | Cost | Escalated | Errors | Source |
|---|---|---|---|---|---|
| Opus alone | 22 | $5.90 | - | 5 not finished (timeout, harness, cap) | r27-opus-alone-fair |
| v5b (old gate) | 17 | $0.46 | 11 | 0 | r27-v5b |
| **v7 (all 6 stages)** | **17** | **$3.28** | - | 0 | reports/v7/r27-v7-merged.jsonl |
| Haiku alone | 16 | $0.52 | - | 0 | r27-haiku-alone |
| v5b gate-fix | 16 | $0.87 | 24 | 0 | r27-v5b-gatefix(+rest) |
| **v6 noplan k2, fixed** | **14** | **$0.42** | 6 | 0 | reports/v7/r27-v6-fixed-merged.jsonl |
| v6 noplan k2, old | 14 | $0.34 | 7 | 3 provider errors | r27-v6-noplan-k2 |
| Sonnet alone | 14 | $1.10 | - | 6 stopped at cap | r27-sonnet-alone |

What it means:

- **v6:**
  - The turn-limit fix removed all 3 provider errors, but the pass count stayed at 14.
  - The fixed run lost `javascript_alphametics` and gained `java_pig-latin`.
  - The 2 tasks that had errored now complete, but both fail.
- **v7:**
  - v7 ties v5b at 17, but costs 7× as much.
  - Compared with Haiku alone, v7 gains `cpp_complex-numbers` and `rust_accumulate` and loses `java_satellite`. That difference is noise-sized.
- **No cheap arm is clearly better than Haiku alone or v5b on r27.**
- **The gap to Opus is real, not a grader quirk.** Opus passed `cpp_sublist`, `cpp_all-your-base`, `java_all-your-base`, `java_affine-cipher`, `python_go-counting` and `java_satellite`. Every cheap arm fails all of them except `java_satellite`.

## Per-check value (v7, 94 checkpoints: after the coder and after each fix round)

| Check | Model | Caught | False alarms | Missed | Only check to catch | Cost |
|---|---|---|---|---|---|---|
| blind | Haiku | 37 | 30 | 8 | 0 | $0.10 |
| probe | Haiku | 37 | 34 | 8 | 1 | $0.11 |
| sblind | Sonnet | 41 | 26 | 4 | 0 | $0.96 |
| review | Sonnet | 12 | 1 | 33 | 0 | $1.35 |

- **blind+probe together missed 0 of 45 failing checkpoints.** Adding sblind and review caught nothing more.
- **Cut: sblind and review.**
  - They caused 70% of v7 spend ($2.31 of $3.28) and had no unique catch.
  - The new default is `--v7-stages=plan,blind,coder,probe`, set in `V7_DEFAULT_STAGES` in `src/v7-arm.mjs`.
  - Projected cost is about $0.97 for r27 (stage costs minus the cut stages). This was **not run**, and fix-round cost may shift because fixers no longer get review defects.
- **The real problem is false alarms.** Model-written tests flag correct code at 43 of 49 passing checkpoints (88%).
  - So the gate almost never says "pass", and fix rounds run on correct code.
  - That cost $0.68 in fix spend, caused 1 regression (`javascript_alphametics`: pass after the coder, fail after fixes) and produced 2 rescues (`cpp_complex-numbers`, `javascript_house`).
  - selfFinalPass agrees with hidden on only 16/27 rows. There were 11 "self fail, hidden pass" rows and 0 the other way.
  - The gate is safe (it never passes wrong code), but it is useless as a stop signal.

## Rate-limit reruns

None. All 27 v7 rows and all 27 v6 rows are `completed`, and no log has rate-limit, 429 or overloaded text. So nothing was marked.

## Bugs fixed

| Bug | Effect | Fix |
|---|---|---|
| Agent left its own `node_modules` | grader EEXIST | `rm` before the symlink (`src/v4-polyglot.mjs`) |
| `error_max_turns` was thrown as an error | v7 errors; the cause of v6's 3 PROVIDER_ERRORs | treated as a normal stop; v7 exec turns raised from 6 to 12 |
| New test directories were read as files | v7 EISDIR | expand dirs, filter build junk |
| Fixer deleted a test file | v7 ENOENT | `.catch(()=>null)` + `existsSync` guard |
| Timeout killed only the direct child | v6 run hung 45 min on an orphaned `cargo test` binary (rust_book-store) holding the pipe; killed by hand | spawn in its own process group, kill the group (`runProcess` in `src/v4-claude.mjs`); test `tests/v4-process.test.mjs` |

## Decisions and next steps

1. Keep v5b (old gate) as the cheap baseline: 17 for $0.46. Drop gate-fix v5b.
2. v7 is only worth more runs if pruned v7 (about $0.97 projected) keeps 17+. Even then it costs 2× v5b for the same score.
3. The lever that remains is test quality, not more checks. Next experiment: count a test failure only when 2 independent writers agree, or let the coder's code vote on a test (TESTBUG), to cut the 88% false-alarm rate.
4. The 6 Opus-only tasks are the target set for any future arm.

Spend tonight: v7 stage 3 + v6 rerun ≈ $1.8 at list prices.

---

# Follow-up 2026-10-23: agreement gate + trimmed v7 (plan, blind, coder, probe)

Agreement gate: with 2 Haiku test writers (blind, probe), the tests block only if both suites fail. Code: `agree` in `runV7Task`
(`src/v7-arm.mjs`), flag `--v7-agree=on`; offline test in `tests/v7-arm.test.mjs`. Run: 1 task, then 3, then the remaining 23
(12 + 11, 4 wide). Results: `reports/v7/r27-v7agree-merged.jsonl`. Weekly usage 88% before and after.

## Results (r27)

| Arm | Pass | Cost |
|---|---|---|
| v5b (old gate) | **17** | $0.46 |
| v7, all 6 stages, strict gate | 17 | $3.28 |
| Haiku alone | 16 | $0.52 |
| **v7 trimmed + agreement gate** | **15** | **$0.79** |
| v6 fixed | 14 | $0.42 |

- **It loses to both baselines:** 2 fewer than v5b at 1.7× the cost, and 1 fewer than Haiku alone at 1.5× the cost.
- **Against v7 with all 6 stages:**
  - Gained `java_satellite` and `cpp_phone-number`.
  - Lost `javascript_house`, `python_proverb`, `rust_accumulate` and `rust_book-store`.
  - Cutting `review` and adding the agreement rule happened in the same run, so the two effects can't be separated.
- **The agreement rule barely helped live.** In last night's replay it cut false alarms from 88% to 45%. Live, the gate still failed correct code at 38 of 47 checkpoints (81%).
  - Both Haiku writers read the same plan, so on correct code they tend to be wrong together. A second writer that shares the plan isn't an independent check.
- **The gate still costs too much and still lets bad code through:**
  - It shipped wrong code 5 times and held back correct code 6 times.
  - Fix rounds cost $0.50 of the $0.79.
- **Decision:** the agreement rule is off by default now (`--v7-agree=on` turns it on), because it showed no gain. v5b stays the cheap baseline.

## The 12 failing tasks, with causes

Categories are from `docs/FIXLOG.md`, plus "regression (fixer)" and "test correlation", which are new here. Every cause comes from row data (gates, coder-time hidden verdict, fix rounds); I didn't re-read transcripts.

| Task | Cause | Category | Evidence |
|---|---|---|---|
| javascript_house | the gate shipped wrong code | gate hole | only 1 suite failed at the coder checkpoint, so it shipped with 0 fixes |
| javascript_grade-school | the gate shipped wrong code | gate hole | same: shipped with 0 fixes |
| java_all-your-base | the gate shipped wrong code; Opus-only | gate hole + model capability | shipped with 0 fixes; every cheap arm fails it |
| javascript_two-bucket | fix 1 passed our tests but not the hidden ones | gate hole | self pass, hidden fail |
| java_affine-cipher | 3 fixes, own tests pass, hidden fail; Opus-only | model capability / spec gap | every cheap arm fails it |
| rust_accumulate | the coder's code was correct and the fixers broke it | regression (fixer) | hidden pass after the coder, fail at the end; both suites flagged correct code |
| python_proverb | the coder was wrong and 3 fixes didn't help | agent (noise) | v7 with all stages passed it |
| javascript_alphametics | wrong after 3 fixes | agent | fails in most cheap arms |
| python_go-counting | wrong after 3 fixes; Opus-only | model capability | every cheap arm fails it |
| cpp_sublist | wrong after 3 fixes; Opus-only | model capability | same |
| cpp_all-your-base | wrong after 3 fixes; Opus-only | model capability | same |
| rust_book-store | the coder's call hit the wall-clock limit at $0.007 | timeout | `RUN_TIMEOUT`; passed last night, probably a slow first cargo build |

By category: gate hole 4, model capability 4 (plus 1 shared with a gate hole), regression 1, agent 2, timeout 1. No harness errors.

## Fixes: which worked (this run and last night)

| Category | Fix | Worked? |
|---|---|---|
| gate false-fail (model tests wrong) | cut sblind and review | **cost yes** (no unique catches lost); pass rate can't be separated from the agreement rule |
| gate false-fail | agreement gate, 2 Haiku writers | **no**: false alarms 88% → 81% live; 15/27 |
| harness bug: orphaned grandchild holds pipe | kill the whole process group on timeout | **yes**: no hangs in 27 + 27 runs |
| harness bug: max-turns thrown as an error | treat as a normal stop | **yes**: 0 provider errors |
| regression (fixer) | fixers told tests may be wrong (TESTBUG) | **no**: rust_accumulate and, last night, javascript_alphametics still regressed |

## Next fixes, for after the weekly reset (each is one r27 run; costs are estimates)

1. **Keep the best checkpoint (no extra model cost):** if the fix rounds don't cut the number of failing suites, ship the coder's code. That would have saved rust_accumulate, and last night javascript_alphametics. One-line control-flow change plus one test; r27 run about $0.80.
2. **Make the two writers independent:** the blind writer gets only the task, with no plan, and runs on a different prompt or model. This tests whether the correlated wrong tests come from the shared plan. About $0.80.
3. **Check failing tests against the task's own examples:** a test failure counts only if the expected value appears in, or follows from, the task text. Costs nothing per task (a parser); about $0.80 run.
4. **Escalate to Opus after the cheap fix rounds fail:** the 4 to 5 Opus-only tasks need it. Opus averages about $0.27 per task on r27, so 6 to 8 escalations add about $2 for roughly +4 to 5 tasks. That would reach about 20/27 at about $2.8, still below Opus alone (22/27, $5.90).
5. **rust_book-store timeout:** pre-build `cargo` in the workspace before the coder starts, or raise the coder's timeout for rust. Code only.

**Ceiling:** 100% on r27 isn't reachable with what exists. Opus alone passes 22/27 and 5 never finished. A realistic target is Opus quality (22) at under half the Opus cost, using fixes 1 and 4.

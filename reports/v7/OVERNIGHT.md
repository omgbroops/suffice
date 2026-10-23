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

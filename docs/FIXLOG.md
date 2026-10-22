# Fix log — SWE-bench Pro 8 tasks × 3 arms

Every harness change tried on the SWE-Pro runs, with the failure it targeted and what happened next.
Runs live under `reports/full/<run>/`. Pass = hidden FAIL_TO_PASS + PASS_TO_PASS tests via the official run_script/parser.
Arms: **single** = Sonnet alone; **cheap** = Sonnet→Opus ladder; **strict** = Haiku→Opus ladder, escalating after any failed cheap self-test.
Agents can run `/run_tests.sh` (the grader's test-runner recipe; it contains no hidden tests) through envrun, with the network off.

## Failure categories

| Category | Meaning |
|---|---|
| harness bug | our code crashed or mis-copied the task (no agent verdict) |
| budget/turns exhausted | agent hit `--max-budget-usd` or `--max-turns` before finishing |
| timeout | agent run killed by the wall-clock limit |
| env/network | image pull or docker failure |
| can't run tests | agent had no way to run the repo's tests |
| gate false-fail | self-test passed but our check read it as failed |
| spec gap | prompt lacked information the hidden tests check |
| regression (hidden files) | harness hid existing test files, so the agent couldn't catch a regression |
| gate hole | self-check accepted a fix that hadn't proved itself |
| grader collision | agent's own files broke applying the hidden tests |
| model capability | none confirmed yet |

## Category table (failed task-runs per category, all SWE-Pro runs today)

| Category | Failed runs | Fix | Worked? |
|---|---|---|---|
| harness bug | 30 (18 + 6 + 6) | 96d9cde, 4e6a865, 8ff0cbe symlink/cp/gc fixes | yes: 0 since 055513 |
| budget/turns exhausted | 5 | per-task budget $0.11→$0.3→$0.5, turns 12→30 | yes: 0 since 044808 |
| timeout | 3 | run timeout 360 s→25 min (3fde8ff) | yes: 0 since |
| env/network | 1 | image pull retry (3fde8ff) | yes: 0 since |
| can't run tests | not counted per run (every run before 07:18) | envrun (9bba5be, f2b7d89, 6a6a8b8, da3c319) | needed, but no pass gain alone (0/7 after) |
| gate false-fail | ≥1 (xvfb exit code) | pass decided by the pytest summary line (3fde8ff) | yes on target; pass rate unchanged |
| spec gap | 7 (084319), plus most "completed" fails before it (inferred, logs not re-read) | prompt = official template with requirements + interface (02ce944) | **yes: 0/7 → 6/7** |
| regression (hidden files) | 1 (qute-9ed748) | keep base versions of test-patch files visible (0ee4256) | yes: passes in all 3 arms in 092150 |
| gate hole | 2 (qute-0b621c, single + cheap) | re-run earlier failed self-tests before accepting (f29de90) | **yes: 0/2 → 2/2** (rerun 103626) |
| grader collision | 1 (ansible-1ee70f, strict) | grader drops agent edits to test_patch paths (413951c) | yes: 0/1 → 1/1 (rerun 125840) |
| provider error (CLI exited nonzero) | 1 (103626 strict) | log the CLI's stderr (d537f6d) | did not recur; cause unknown |

## Every fix tried, in order

| # | Time | Commit | Fix | Category | Before → after | Cost of after-run | Disk before/after (GB free) | Result |
|---|---|---|---|---|---|---|---|---|
| 1 | 03:39 | 96d9cde | symlink cp, git gc race | harness bug | 024003 0/26 (18 harness_error) → 034106 4/24 (6) | $1.72 | not recorded | partial |
| 2 | 04:47 | 4e6a865 | absolute-symlink cp, dangling stat, strict budget | harness bug, budget | 034106 4/24 → 044808 11/24 (6 harness_error) | $1.50 | not recorded | partial |
| 3 | 04:48 | 8f88421 | swebpro per-task budget $0.11→$0.3 | budget exhausted | 2 budget fails → 0 | in #2 | not recorded | worked |
| 4 | 05:54 | 8ff0cbe | verify overlay replaces symlinks | harness bug | 6 harness_error → 0 (055513, 6/6 on a 2-task subset) | $0.39 | not recorded | worked |
| 5 | 07:18–07:44 | 9bba5be, f2b7d89, 6a6a8b8, da3c319 | envrun: agent runs commands in the task container, network off; `/run_tests.sh`; SELFTEST re-run in the agent sandbox | can't run tests | 072513 0/1 → 081611 0/7 | $0.62 / $0.82 | not recorded | unclear alone; it was a prerequisite for #9 and #10 |
| 6 | 08:16 | ba3d036 | free workspaces per task, share images, concurrent arms | disk/throughput | n/a | — | not recorded | worked (no disk alarms since) |
| 7 | 08:43 | 3fde8ff | pytest-summary signal, 25 min timeout, pull retry, turns 30, budget $0.5 | gate false-fail, timeout, env, turns | 081611 0/7 (3 timeout, 1 pull) → 084319 0/7 (0 timeout, 0 error) | $0.34 | not recorded | worked on target; pass unchanged |
| 8 | 08:57 | 02ce944 | prompt includes requirements + interface (official SWE-Pro template) | spec gap | 084319 0/7 → 085801 6/7 | $0.28 | not recorded | **worked** |
| 9 | 09:21 | 0ee4256 | keep base-commit test files visible, hide only new ones | regression (hidden files) | 085801 qute-9ed748 fail → 092150 pass ×3 | $2.30 (full 8×3: 21/24) | not recorded | worked |
| 10 | 10:33 | 7209724 | one failure-log dir per arm | logging | logs overwritten → separate | — | — | infra |
| 11 | 10:33 | 413951c | grader excludes agent edits to test_patch paths | grader collision | 092150 ansible-1ee70f strict fail → 125840 pass | $0.26 | 171 / 171 | worked (did not check whether the agent recreated the colliding file this time) |
| 12 | 10:40 | f29de90 | self-check re-runs earlier failing SELFTEST commands | gate hole | 092150 qute-0b621c single+cheap 0/2 → 103626 2/2 | $0.15 + $0.08 | 51 / 112 | **worked** |
| 13 | 12:50 | d537f6d | keep the CLI's stderr tail when it exits nonzero | harness bug (no cause logged) | 103626 strict ansible-1ee70f: provider_error after 23 min, $0, cause lost → 125840 no error to log | $0.26 | 171 / 171 | infra; the cause of the first error is still unknown |
| 14 | 13:28 | 92217d6 | Flint arm (local, llama-server); bench memory floor configurable | new arm / harness bug | flint-132819: 3 budget_exhausted (CLI prices the unknown model at about Sonnet rates, so $0.5 ≈ Sonnet's token budget), 5 aborted_memory (30% free floor, server uses 28GB) → rerun pending | $0 real (local) | 145 / 142 | 0/3 at Sonnet's token budget; 5 not run |

## Limitations

### Progress limits (agent can't reach a correct fix)

| Limit | Fixes that helped | Fixes that didn't (or not yet shown) |
|---|---|---|
| Missing spec (requirements/interface) | #8 official prompt template | — |
| Can't run the repo's tests | #5 envrun + `/run_tests.sh` | #5 alone moved nothing until #7–#9 |
| Can't see existing tests → silent regressions | #9 | — |
| Self-check trusts the agent's chosen command | #7 (false-fails), #12 (narrowing) | — |
| Harness/grader artifacts | #1, #2, #4, #11 | — |

### Token-usage limits (cost or turns run out)

| Limit | Fixes that helped | Fixes that didn't |
|---|---|---|
| Default CLI config loads ~262K tokens per call | lean flags (`--strict-mcp-config`, `--setting-sources project`, etc.): ~$0.26 → ~$0.0004 per Haiku call | — |
| Per-task budget too small on real repos | #3, #7 ($0.5) | — |
| Turn cap too low for test loops | #7 (12 → 30) | — |
| Reading whole files | v5 ranked excerpts + read-only-ranges prompt | not measured separately on SWE-Pro |

## Next fix, picked from this log

The remaining failures are all in the **self-check**: it runs only the command the agent names (gate hole, false-fail). The general fix is for the gate itself to add the **existing tests of each touched module** (found by path from the changed source files), so a pass can't skip them. #11/#12 reruns: 3/3 failed task-runs now pass ($0.49). All 24 task-runs have now passed at least once with the current fixes, but **not in one clean fresh 8×3 run**, which is still needed (~$3, owner approval).

Known open bug: the cost of a crashed attempt is recorded as $0 with costKnown=true, while the ledger flags it unknown_cost.

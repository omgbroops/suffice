# Suffice v4/v5 — analysis, 2026-10-21/22

## One page, plain words

**Question.** Can a cheap-first ladder (start with a cheap model, move up to Opus only when the agent's own tests fail) match Sonnet alone for less money?

**What we ran.**
- **Aider Polyglot**, 36 tasks, Sonnet alone vs the v4 ladder. These tasks are public and probably in the models' training data, so they show how the harness works, not how good the models are.
- **SWE-bench Pro**, 8 real repo tasks × 3 arms: Sonnet alone; Sonnet→Opus; Haiku→Opus with strict escalation. Each task got a $0.5 budget and 30 turns, and the whole run stayed inside the owner's $40 cap.

**Results.**

| Bench | Arm | Pass (95% interval) | Cost | Cost per solved task |
|---|---|---|---|---|
| Polyglot 36 | Sonnet alone | 34/36 (82–99%) | $2.63 | $0.077 |
| Polyglot 36 | v4 ladder | 35/36 (86–100%) | $0.91 | $0.026 |
| SWE-Pro 8 (run 092150) | Sonnet alone | 7/8 (53–98%) | $0.80 | $0.114 |
| SWE-Pro 8 | Sonnet→Opus | 7/8 (53–98%) | $0.75 | $0.107 |
| SWE-Pro 8 | Haiku→Opus strict | 7/8 (53–98%) | $0.74 | $0.106 |
| SWE-Pro, all arms | — | 21/24 (69–96%) | $2.30 | $0.110 |

**What it shows.**
- On Polyglot, the ladder matched Sonnet at about **one third of the cost per solve**.
- On real SWE-Pro tasks, all three arms tie at 7/8. The ladders cost about 7% less per solve. That small gap is within the noise.

**What it doesn't show.**
- Eight tasks is far too few to separate the arms: every arm's interval runs from about 50% to 98%.
- The Polyglot result is contaminated.
- No 24/24 has been shown yet. A clean, fresh 8×3 run is still needed. Until then, nobody should claim 100%.

**Why the numbers moved today.** Pass rates went from 0/26 to 21/24 almost entirely because of **harness fixes, not model changes**:
- broken file copies;
- a prompt missing the task's requirements;
- tests the agent couldn't run;
- test files our harness hid by mistake.

See `docs/FIXLOG.md` for every fix.

**Conclusion.**
- The cheap-first ladder is **at least as good as Sonnet alone in every run we have**.
- It is **much cheaper on small, self-contained tasks** (Polyglot).
- It is **only slightly cheaper on real repo tasks**, where the cheap model escalates more often.
- Our evidence for "same quality, a fraction of the cost" is strong on Polyglot. It is weak but consistent on SWE-Pro.

---

## Details

### Setup

| Item | Value |
|---|---|
| Dates | Polyglot 2026-10-21; SWE-Pro 2026-10-22 00:00–11:00 |
| SWE-Pro tasks | 8 from `config/bench-manifest.swebpro20.json`, each with a gold patch that passes the official grader |
| Grading | Official SWE-Pro run_script and parser. A task passes only if every FAIL_TO_PASS and PASS_TO_PASS test passes. Hidden tests are applied after the agent's diff. |
| Agent tools | Sandboxed Claude CLI. It can run commands in the task container through envrun, with the network off. |
| Disclosure | Agents can call `/run_tests.sh`, the grader's test-runner recipe. It contains no hidden tests. The hidden test_patch never reaches the agent. |
| Gate | The agent declares a `SELFTEST:` command, and the harness re-runs it. A failing self-test escalates the task. The hidden grader runs once, only to record the verdict. |
| Caps | Per task $0.5 and 30 turns, 25-minute timeout; per arm $3/$3/$2; owner's total cap $40 |

### SWE-Pro run history

| Run | Pass | Cost | Main cause of failures |
|---|---|---|---|
| 024003 | 0/26 | $1.73 | 18 harness errors (symlink copy, git gc race) |
| 034106 | 4/24 | $1.72 | 6 harness errors, budget exhausted |
| 044808 | 11/24 | $1.50 | 6 harness errors (verify overlay) |
| 055513 | 6/6 (2-task subset) | $0.39 | — |
| fix-081611 | 0/7 failing subset | $0.82 | timeouts, pull error, self-test false-fail |
| fix-084319 | 0/7 | $0.34 | spec gap: prompt lacked requirements and interface |
| fix-085801 | 6/7 | $0.28 | harness hid base-commit test files |
| **092150 full** | **21/24** | **$2.30** | 2 gate holes, 1 grader collision |

### Harness bugs and how they changed the numbers

| Bug | Effect | Fix |
|---|---|---|
| Symlink copy, git gc race, dangling stat, overlay symlinks | 30 runs with no verdict | 96d9cde, 4e6a865, 8ff0cbe |
| Self-test pass judged by the xvfb exit code | Passing tests counted as failing | 3fde8ff (read the pytest summary line) |
| Prompt omitted Requirements and New interfaces | 0/7 → 6/7 once added | 02ce944 |
| Removed every file the test_patch touches, including existing tests | qute-9ed748 failed one arm because the agent couldn't see the regression. That is the 6/7 → 7/7 step. | 0ee4256 |
| Grader applied test_patch on top of agent-created files with the same path | ansible-1ee70f strict failed with "already exists" | 413951c (rerun pending) |
| Self-gate trusted a narrowed SELFTEST | qute-0b621c failed in 2 arms | f29de90 (rerun pending) |

### Failure categories

The full table, with every fix tried, is in `docs/FIXLOG.md`. Totals for the day:

| Category | Failed runs | Still open? |
|---|---|---|
| harness bug | 30 | no |
| budget/turns exhausted | 5 | no |
| timeout | 3 | no |
| env/network | 1 | no |
| gate false-fail | ≥1 | no |
| spec gap | 7+ | no |
| regression (hidden files) | 1 | no |
| gate hole | 2 | fix pending rerun |
| grader collision | 1 | fix pending rerun |
| model capability | 0 confirmed | — |

Of the failures we could diagnose, **none were confirmed as the model being unable to do the task**. Every one traced back to the harness, the prompt or the gate.

### Targeted rerun of the 3 remaining failures

Qute-0b621c passed in both arms that failed it (Sonnet $0.15, Sonnet→Opus $0.08; run 103626). Ansible-1ee70f strict passed ($0.26; run 125840, after one provider error). Every task-run that failed in 092150 now passes, but a clean fresh 8×3 run is still needed before claiming 24/24.

### Next step

1. Make the gate run the existing tests of every touched module, not only the command the agent picks.
2. Then do one clean fresh 8×3 run, which needs about $3 of owner approval.
3. Getting meaningful intervals needs N ≥ 50 tasks per arm.

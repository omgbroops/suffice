# Rulebook: building cheap agent workflows that actually pass

Distilled 2026-10-23 from r27 runs (v5b, v6, v7, opus-alone, hint run), reports/v7/OVERNIGHT.md, and ~/rsi-papers. Each rule says where it came from. "Measured" means a run in this repo backs it; "inference" means it doesn't yet.

## 1. The checker sets the ceiling
1. **A workflow is only as good as its stop signal.** More samples, votes or rounds can't beat a checker that accepts wrong work. Measured: 4 of 12 r27 failures were gate holes (self-test passed, hidden failed).
2. **Measure the checker on known-wrong work before trusting it.** Record false-accept (shipped wrong) and false-alarm (flagged right) separately. Measured: v7 checks false-alarmed 88% of the time; 4 of 17 v5b passes escalated on correct code.
3. **Exact checkers beat judges.** Use compile, run, diff, schema and type checks first. LLM judges score near chance on "is this wrong". Inference from literature (reference-agent-failure-detection).
4. **Same-model checks are correlated.** A Haiku self-test shares Haiku's misreading of the spec. Cross-lab models still agree on the same wrong answer 42-60% of the time. A second writer from the same family was dead weight (OVERNIGHT, follow-up 2).

## 2. Writing the task (the "creation" side)
1. **Spec the interface, not just the behavior.** Most misses were API shape: a missing constant (`WHITE`), a non-generic type, throw vs return. The prompt must make the worker list every name, type and error mode before coding. Measured: the hint run recovered 5 of 10.
2. **Make implied edge cases explicit.** Empty input, zero, impossible goal, duplicates, bounds. Measured: cpp_all-your-base (zeros) and javascript_two-bucket (no throw) each failed on one unstated edge.
3. **Name the source of truth when it exists.** "Match Exercism's suite" worked because the model knows it. On unseen work, use generic rule 2.1-2.2 instead (V4_HINT=generic). Never pass expected outputs.
4. **No test leakage, ever.** The worker may see the statement, stub and examples. It may not see hidden tests, expected outputs or failure logs from the scorer. Hidden tests live in chmod-000 `.hidden` and only the scorer reads them.

## 3. Self-tests
1. **The self-test must import every public name the spec mentions.** A missing export should fail loudly at round 1, not at hidden scoring.
2. **Cover the spec's stated examples verbatim first, then edge cases.** Stricter self-tests flagged more and escalated more. They doubled cost on the hint run, so strictness trades cost for recall.
3. **A command that ran zero tests is "unverified", not "fail" and not "pass".** Known harness bug: this sticks in the failed set.

## 4. Escalation
1. **Cheap first, escalate on a real signal.** Haiku solved 9 of 17 passes alone at $0.002-0.008 each. Sonnet rescued 4 more at ~$0.03-0.05.
2. **Keep the best checkpoint, not the last.** A fix round can regress. Measured: grade-school went from 2 failing tests to 8 across rounds.
3. **Escalate only when a fix is likely.** Escalating on a false alarm wastes the most expensive call. Gate escalation on false-alarm rate (rule 1.2).
4. **Some tasks are capability-bound.** Opus-only tasks (java_affine-cipher, cpp_sublist, go-counting) don't yield to more cheap rounds. Route them to the strong model directly, or accept the miss.

## 5. Measuring a change
1. **n < 300 is a hint, not a result.** A 5-point gain needs ~300-600 items. r27 differences of 1-2 tasks are noise.
2. **Test on a set the model never saw.** Exercism is in training data. A gain there may be recall, not discipline. Hold out novel tasks (~/bench-repos/novel, V4_POLY_ROOT) and compare hint off vs generic.
3. **Matched budget or it doesn't count.** Compare against the same dollars spent on fresh sampling of the strong model. Self-improving harness gains mostly vanish under matched budget.
4. **A refuter pass is mandatory before claiming a win.** Refuters caught 4+ invalid wins overnight.
5. **Save failure tails per run label.** `reports/v4/failures/<label>/` is what made every diagnosis here possible.

## 6. Cost discipline
1. **Re-run only what changed.** Run the failing subset first ($0.40 for 10 tasks), and re-run the full set only for a candidate.
2. **Hard spend caps on every run** (`--global-cap-usd`), plus the weekly stop at 92%.
3. **Cache and dedupe are exhausted.** The remaining levers are less context, compiling repeat work into code, and cheaper escalation signals.
4. **Estimate before running:** tasks x (cheap cost + escalation rate x strong cost).

## 7. Process
1. One heavy job at a time on the Mac. Long drivers run with run_in_background, not nohup.
2. Change one thing per run, and give each run a label and a note.
3. Commit results with the code that produced them. Push nothing without asking.
4. The owner's eye is the final gate. AI critics score high.

## Open items
- [ ] Novel-set result (hint off vs generic): does the gain survive on unseen tasks?
- [ ] Self-test import check (3.1), best checkpoint (4.2), unverified state (3.3): build and measure each on the 5 still-failing tasks.
- [ ] Re-run the 17 passing tasks with the hint to check for regressions.

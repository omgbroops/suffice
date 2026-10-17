# Blind-spec gate: offline evaluation (no live models)

What was measured (own runs, `scripts/mutant-bank.mjs`, `scripts/spec-gate-eval.mjs`; results in `.suffice/mutant-bank-results.json`):
three real picomatch bugs (#142, #99, #187; `scripts/prepare-picomatch.mjs`), six spec files written blind by Claude subagents
(`symptom` = issue title only; `contract` = the task prompt, which leaks the key inputs). 84 single-edit mutants of the reference fix
were generated; 37 fail hidden acceptance (labelled wrong), the other 47 are UNLABELLED (no equivalence check; the weak PR test cannot tell equivalent from missed). Mutants are clustered (e.g. 3 on one line; 5 symptom escapes all in #187), so Wilson intervals assume independence they lack; effective n is ~3 tasks.

| spec set | reference passes | wrong mutants killed |
|---|---|---|
| symptom (3 specs) | 3/3 | 30/37 (81%, Wilson95 66-91%, optimistic) |
| contract (3 specs) | 2/3 (#142 spec asserts a wrong guess; it also rejects the reference) | 17/19 on #99+#187 (90%); #142 "18/18" is meaningless because that spec rejects everything |

Escapes: #187 `===` in the lone-negation check (both specs), #99 `===` bail-out (both), #187 guards (symptom only).

Cost model (`node scripts/compare-policies.mjs semver-control-v1 --gate-model`): with Luna pass 1/3, alpha=0.19, beta=0.17, Sol $0.0549,
Luna $0.0048, the gate escalates 60% of tasks, costs $0.043-0.058 and passes 87% vs Sol solo $0.0549 / 100%.
At this task size Sol solo is already cheap; a gate pays only when the cheap pass rate is high or the strong run is long.

Not supported: any claim about Sol/Luna (specs are Claude-written, picomatch is public), real cheap-model errors (mutants are not
model errors), cost of the spec writer, generalization beyond three tasks. #142's PR test kills none of the guard mutants, so its
acceptance is weak. A wrong-guess spec is undetectable at run time (no reference); false rejects cost a Sol call, false accepts cost correctness.
Prior art (read, see overnight notes prior-art-5): test-gated cheap-to-large escalation exists on HumanEval/MBPP with same-model tests (arXiv 2405.15842,
26% mean savings); generated tests as SWE patch filters exist (SWT-Bench 2406.12952 precision 47.8%/recall ~20%; Agentless 2407.01489 ~56% of valid-looking
repro tests reject the gold patch, inferred from 94/213; R2E-Gym 2504.07164 toxic tests up to 10%; Scrouting 2608.04804 only ~20% of cheap-model repro claims genuine).
Not found (absence of evidence only): blind stronger-model test gating model-tier escalation on repo-level tasks with $/resolve including spec cost.

## Real cheap-model attempts (Claude Haiku subagents, n=9, `scripts/score-attempts.mjs`, `reports/picomatch-haiku-attempts-v1.json`)
Three independent attempts per task, task README prompt only, own copy of the workspace. ~168k subagent tokens total (~19k/attempt); dollars unmeasured.
| task | hidden acceptance | visible smoke tests | symptom spec | contract spec |
|---|---|---|---|---|
| #142 | 3/3 | 3/3 | accepts 3/3 | accepts 3/3 |
| #99 | 3/3 | 3/3 | accepts 3/3 | accepts 3/3 |
| #187 | 0/3 | 3/3 (all wrong attempts pass) | accepts 3/3 (3 false accepts) | accepts 1/3 (1 false accept, 2 rejected) |

Agreement with hidden acceptance: visible tests 6/9, symptom spec 6/9, contract spec 8/9. No false rejects among attempts (n small).
Reading: visible tests are again a no-op selector; the contract-prompt spec caught 2 of 3 wrong real attempts, the issue-title spec none.
Saturation: Haiku solves #142 and #99 with the leaky prompts, so only #187 discriminates. Contract specs inherit the prompt's leaked inputs.
Caveat: the contract-142 spec rejects the upstream reference yet accepts all three Haiku fixes, so spec-vs-reference disagreement is not always the spec's fault or the fix's; acceptance (the PR test) does not cover that case.

### Symptom-only attempts (Haiku, README = issue title only, n=6)
| task | acceptance | symptom spec | contract spec |
|---|---|---|---|
| #142 s1,s2,s3 | pass, FAIL, pass | accepts s1,s3; rejects s2 | rejects all 3 (2 false rejects) |
| #99 s1,s2,s3 | 3/3 | accepts 3/3 | accepts 3/3 |

Pooled over all 15 real attempts (acceptance 11/15): visible tests agree 11/15 (4 wrong attempts all pass them), symptom spec 12/15 (3 false accepts, all #187, 0 false rejects),
contract spec 12/15 (1 false accept, 2 false rejects, both on the #142 contract spec that also rejects the reference). Agreement is equal, error types differ:
leaky-prompt spec = fewer escapes but spurious rejects; issue-title spec = no spurious rejects but weak on guard-heavy bugs (#187).
One wrong attempt (142-s2 widened strictSlashes) was correctly caught by both specs. n=15, 3 tasks, one model: direction only, no significance.


## Refuter-6 caveats (research/refuter-6.md)
- Cost model inputs are NOT from this data: p=1/3 and $ are semver-control; measured Haiku p=11/15. alpha .19 is mutant-based; on real wrong attempts symptom accepted 3/4 (.75), contract 1/4 (.25); with alpha .75 gate pass ~0.5. beta and g are unsourced. Treat the 87% as an artifact.
- Symptom escapes: 7 total, incl. #142 L1184 `===`.
- 187-a1/a3 identical diffs: 2 distinct wrong patches, 1 task. No symptom-only attempts on #187.
- Contract pooled 12/15 includes the broken 142 spec; excluding it contract 10/12 vs symptom 9/12 (no difference).
- Attempt reads (reference/hidden tests at absolute paths) unauditable; attempts are in gitignored .suffice. arXiv citations unverified.

## Addendum: symptom-only attempts on #187 (3 Haiku, ~38k tokens)
All 3 (s1-s3) make the same 2-line edit (drop the `opts.posix` guard), fail acceptance, pass visible. Symptom spec accepts 3/3 wrong; contract spec rejects 3/3. #187 totals: 6 wrong attempts, only 2 distinct patches. Symptom-spec real false-accept on wrong attempts is now 6/7 (wrong across tasks) vs contract 1/7; this confirms refuter-6's alpha warning (mutant alpha .19 understates it) but remains one task, one failure mode. Pooled acceptance 11/18.

## Addendum 2: #142 contract spec fixed
The spec's `test/utils/x.js` vs `test(/utils/**)/x.js` assertion contradicted the reference (reference: false); removed. Spec now passes reference (7/7). Rescored all 18 attempts (reports/picomatch-haiku-attempts-v2.json): acceptance 11/18, visible 18/18 agree only 11/18; symptom spec agrees 12/18; contract agrees 17/18 (misses 187-a2). Wrong attempts = 7 (142-s2, 187 x6): symptom accepts 6/7, contract accepts 1/7. Still 2 tasks that discriminate, spec fixed after seeing its failure (not blind).

## Addendum 3: gate model with measured p/alpha (refuter-6b: addenda numbers verified; framing = 2 distinct wrong patches on 1 task, contract spec fixed post-hoc, 38k tokens unverifiable)
`--gate-model` now also prints p=11/18, beta=0, g=$0.01 (invented), $ from semver-control: symptom gate $0.018 / pass 0.67; contract gate $0.033 / pass 0.94; Sol solo $0.055 / 1.0. Contract looks ~40% cheaper at ~94% pass, but alpha=1/7 rests on 2 distinct wrong patches and beta=0 on a spec tuned after the fact. UNVERIFIED as a Luna/Sol result.

## Addendum 4: picomatch-202 (newline in globstar, PR #202 applied to 4.0.7)
Task validated (baseline fails / reference passes). 3 symptom-only Haiku attempts: 3/3 pass acceptance, identical fix (`.` -> `[\s\S]`). Saturated, no gate information; no specs written for it. #197 considered and dropped (already fixed in 4.0.7 base). Pooled: 21 attempts, 14 correct; still only #187 (and 142-s2) produce wrong patches.

## Addendum 5: Haiku as spec writer (blind, contract prompt, ~9k subagent tokens each, no edits after writing)
Specs in reports/picomatch-haiku-specs/. All 3 are valid gates: fail baseline (assertion), pass reference. Verdicts on the 18 attempts: #142 and #99 agree with acceptance 12/12 (incl. rejecting 142-s2); #187 accepts all 6 wrong attempts (no assertion on the posix-off default path). Overall agreement 12/18, wrong accepted 6/7 — same as the Sonnet symptom spec, worse than the Sonnet contract spec (1/7). So a cheaper spec writer cut g but, on the one discriminating task, also lost the discrimination; the gate's value depends on the writer reading every stated option. n=1 task.

## Addendum 6: spec-writer variance on #187 (3 more blind Sonnet contract writers, reports/picomatch-sonnet187-specs/)
All 3 valid (fail baseline, pass reference, 8 tests each, ~26k subagent tokens each vs ~9k for Haiku). Against the 6 wrong 187 attempts: patch A (drop posix guard; 5 attempts) rejected by 3/3 specs; patch B (a2, adds literalBrackets) accepted by 2/3, rejected by w3. So Sonnet-contract false-accept per (spec, distinct patch): 2/6 = 33%; vs Haiku contract spec 100%, Sonnet symptom 100%. Spec-writer capability and prompt detail both matter; spec tokens are ~3x for Sonnet vs Haiku, so g is not negligible. n = 2 distinct patches, 1 task; alpha<=.3 kill bar from optimist-6 is NOT cleared with confidence.

Refuter-6c (all spec validity + scores reproduce): the 33% is 2/6 (spec, distinct-patch) pairs (per attempt 2/18 = 11%; per spec 2 of 3 accept patch B); the Haiku/symptom "100%" is 2/2 patches from one spec each. #202 is valid but saturated (one assertion; "21 attempts, 14 correct" inflates p). Token figures unverifiable. Conclusion unchanged: one task, one patch (a2) passes; kill bar neither cleared nor failed.

## Addendum (iter 7): bytes-51 and cookie-173, both saturated
Two new real tasks (`bytes` 3.1.0->3.1.1 thousandsSeparator; `cookie` 0.7.0->0.7.1 leading-dot Domain), validated by `scripts/prepare-picomatch.mjs bytes-51` / `prepare-cookie.mjs` (baseline fails, reference passes). Hidden acceptance tests were written by a Sonnet agent from the issue, NOT copied from upstream tests. Haiku symptom-only attempts: bytes 4/4, cookie 4/4 pass acceptance (`scripts/score-attempts.mjs`, now matches any `<pkg>-<n>`). Pooled real attempts: 29 total, 22 correct (+8 here); wrong patches still only from #187 and 142-s2. bytes' prompt contains the failing example verbatim and cookie is a one-regex change, so both are easy; no specs were written (no wrong patches to discriminate). Reading: on 3 of 5 tasks (202, bytes, cookie) the cheap model solves everything and any gate is pure overhead; gate value exists only where the cheap model produces wrong patches, so $/verified-resolve depends on P(task is hard for cheap model), not just alpha.
Housekeeping: while clearing scratch attempt dirs I deleted the gitignored raw workspaces picomatch-{142,187,202,99}-s3 by mistake (glob `*-s[3-6]`). Their scores/verdicts stay in reports/picomatch-haiku-attempts-v*.json; the raw patches (and any re-scoring against new specs) are lost.

## Addendum (iter 7): E7 spec-first loop on #187 (6 Haiku, ~190k tokens) — KILLED as a fix
Optimist-7 hypothesis: give the cheap model the frozen spec as its red->green target. Arms: e1-e3 get the Sonnet contract spec, h1-h3 the Haiku-written spec (plus the symptom README; prompt: run spec first, iterate until green, log first-run result). Patches in reports/e7-patches/.
Result: spec-green 6/6, hidden acceptance 0/6 (baseline without spec was also 0/6 for symptom-only on #187, so no gain). First-run red on all 6 (5/3 and 2/2). 4 distinct patches: h1-h3 are the familiar drop-the-posix-guard patch (the contract spec rejects it; the Haiku spec accepts it); e1, e2, e3 are three different NEW near-misses that pass the contract spec but break the literalBrackets / lone `[!]` cases (e3 is nearly the reference). So the contract spec's low false-accept (1/7) came from rejecting one common wrong patch; once the model optimizes against the spec, 3/3 loop-patches pass it. Held-out check (free, same day): e1-e3 ALSO pass all three other independent Sonnet contract specs (w1-w3) while h1 fails all three. So the earlier 'Goodhart' reading is NOT supported: the misses are a shared blind spot of Sonnet spec writers (the literalBrackets / lone `[!]` cases that the hidden test and the prompt both mention), not overfitting to one spec. Correlated spec errors mean multiple specs do not average the miss away. n=3 near-miss patches on one task; e1-e3 were optimised against spec A, so this says nothing about unoptimised attempts. Spec-first gave no acceptance gain over symptom-only (0/6 vs 0/6 baseline).

## Addendum (iter 7): clause-coverage spec writers (3 Sonnet, `reports/picomatch-clause-specs/`) do not close the gap
Prompt: split README into atomic clauses, >=2 assertions each incl. an adversarial varied input, sanity-check 'preserve' assertions against the baseline. All 3 specs fail baseline by assertion (8, 5, 8 fails) and pass the reference. Verdicts on the 9 known wrong #187 patches' distinct classes: drop-guard patch (h1, a1, a3, s1, s2): c1 and c3 reject, c2 ACCEPTS; e1-e3 and a2: all three c-specs ACCEPT. So clause-coverage prompting is no better than the earlier contract prompt (1 of 3 writers still accepts the common wrong patch; none catches the near-misses).
Mechanism (read from the writers' reports + the hidden test failures `isMatch('zx!y','*x[!]y')`, `isMatch('zx[!a]y','*x[!a]y',{literalBrackets:true})`): all three writers explicitly DROPPED assertions on `[!]` and literalBrackets+negation because the baseline behaves inconsistently there and they were told to verify 'preserve' assertions against baseline. The bug neighbourhood is exactly where the baseline is wrong, so baseline-validation steers writers away from the cases the hidden test checks. Hypothesis (untested): spec writers must be allowed to assert intended behavior that the baseline violates, then be filtered by 'reference-free' means (e.g. cross-writer agreement) rather than baseline agreement.

## Addendum (iter 7): 'intent' spec writers (3 Sonnet, told NOT to drop baseline-disagreeing cases) over-reject
Specs i1-i3 (same dir). They reject all 9 known wrong #187 patches' classes (e3 slips past i1 only) BUT each also fails the reference (3, 9, 3 failing tests), so they are invalid by our own rule (a spec must pass the reference). Cause in i1: it asserts `isMatch("!", "[!]")` is false (treating `[!]` as literal text); the reference/upstream treats a lone `[!]` as a class containing `!` (true). The README clause 'unterminated [!] staying literal' is ambiguous between the two, so this is an under-specified prompt, not a spec-writer fault.
Net of the 3 writer styles on #187 (contract, clause-coverage, intent): the spec either drops the ambiguous neighbourhood (accepts near-misses e1-e3/a2) or commits to a reading that the reference contradicts (rejects gold). No blind spec resolves an ambiguity the prompt leaves open; the near-miss-catching assertions are exactly the ones whose intended value is not derivable from the prompt. Implication for the product: the gate's real catch rate is bounded by prompt ambiguity, and 'spec rejects reference' should be surfaced as an ambiguity flag (ask a human / escalate) rather than discarded.

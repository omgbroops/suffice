# Blind-spec gate: offline evaluation (no live models)

What was measured (own runs, `scripts/mutant-bank.mjs`, `scripts/spec-gate-eval.mjs`; results in `.suffice/mutant-bank-results.json`):
three real picomatch bugs (#142, #99, #187; `scripts/prepare-picomatch.mjs`), six spec files written blind by Claude subagents
(`symptom` = issue title only; `contract` = the task prompt, which leaks the key inputs). 84 single-edit mutants of the reference fix
were generated; 37 fail hidden acceptance (labelled wrong), the rest are equivalent or untested by the PR test.

| spec set | reference passes | wrong mutants killed |
|---|---|---|
| symptom (3 specs) | 3/3 | 30/37 (81%, Wilson95 65-90%) |
| contract (3 specs) | 2/3 (#142 spec asserts a wrong guess; it also rejects the reference) | 17/19 on #99+#187 (89%); #142 "18/18" is meaningless because that spec rejects everything |

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

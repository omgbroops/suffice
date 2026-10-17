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
Prior art (unchecked here): CodeT, Agentless reproduction tests, SWT-Bench, FrugalGPT cascades.

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

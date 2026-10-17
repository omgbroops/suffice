# Blind-spec gate: offline evaluation (no live models)

What was measured (own runs, `scripts/mutant-bank.mjs`, `scripts/spec-gate-eval.mjs`; results in `.suffice/mutant-bank-results.json`):
three real picomatch bugs (#142, #99, #187; `scripts/prepare-picomatch.mjs`), six spec files written blind by Claude subagents
(`symptom` = issue title only; `contract` = the task prompt, which leaks the key inputs). 55 single-edit mutants of the reference fix
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

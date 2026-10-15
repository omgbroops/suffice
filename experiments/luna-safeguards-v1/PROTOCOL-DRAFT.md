# Luna safeguards versus extra-high reasoning

Superseded before inference by PROTOCOL.md: the first cohort now retries the original ten issues as development reuse, with a contemporaneous control. The proposed six-fresh-issue draft below was not launched.

Status: preparation only, blocked on Sonion connectivity. No model requests, new benchmark attempts, dependency installation or baseline modifications have occurred. This document is not an implemented or validated treatment. The human requested parent-only execution: do not deploy subagents for this experiment.

## Comparison

Use three fresh, independently executed arms on identical tasks:

| Arm | Model/effort | Intervention |
| --- | --- | --- |
| A | GPT-6 Luna low | Existing unchanged Luna baseline, as a contemporaneous control |
| B | GPT-6 Luna low | All three safeguards below, implemented in a separately versioned copy |
| C | GPT-6 Luna xhigh | Existing Luna baseline with only requested reasoning effort changed; none of B's safeguards |

`xhigh` is the requested extra-high setting, not `max`. Verify catalog support, actual request payloads, finalized response identity, tool schemas and usage. The official model page currently documents xhigh support: https://developers.openai.com/api/docs/models/gpt-6-luna . The catalog/actual-request checks must still run on the execution host.

The bundled B arm tests the package, not individual component effects. Do not claim which safeguard caused a gain. Do not add an xhigh-plus-safeguards arm or a subsequent optimization campaign automatically.

## The three safeguards in B

1. **Verification before accepting completion.** Code runs the prespecified, public project checks against the final production edit. Test and type/build commands have independent recorded exit status; a failed test must not silently prevent the type check from running. Required check commands must come from public repository configuration and validated public instructions, not the private grader. A missing, failing or stale check triggers at most one bounded continuation in the SAME Luna session with public command diagnostics. Re-run the gate after repair. If unresolved, record incomplete verification instead of treating termination as a verified fix. A gate failure is detection, not a successful repair. The independent scorer still grades every submitted patch, including gate failures and cap stops.
2. **A neighboring preservation case.** The same worker checks the changed behavior and one relevant existing behavior that should remain unchanged. Examples of generic patterns are alternate public API modes, a literal key versus a nested path, or a second operation on an existing object. Assertions require support in the original public issue, source, documentation or native tests. Never derive actor checks from hidden assertions, reference patches or previous actor results.
3. **An executable probe before a consequential edit.** Where a specific stateful assumption is uncertain, the same worker runs at most one small public-API experiment against the original source before its first production edit. Suitable patterns include overlapping calls, completion after changing capacity, or separate module instances. Record expected/observed behavior and whether the result changed the intended approach. If no discriminating uncertainty exists or the probe cannot run, record that rather than inventing one. A probe may also provide the preservation case if it genuinely serves both purposes; count that reuse explicitly.

Do not add a reviewer, planning agent, semantic index, new sandbox, compression, memory policy or routing layer. Preserve codemode, current deterministic tools/navigation and append-only history. The extra feedback and bounded repair must be included in B's full inference and latency; do not reset its budgets on continuation. Generated tests can be incorrect, and passing the gate is never independent acceptance.

## Cohort, controls and limits

Initial target: six fresh historical issues (18 attempts), screened from the retained candidate pool for meaningful stateful, asynchronous, compatibility or integration behavior. Freeze exact task IDs, pre-fix source, public task text, dependencies, public check commands, independently justified hidden contracts, schedule, configuration and input hashes BEFORE any actor inference. Do not label original ten Luna calibration issues fresh; any later reuse is a separate development-rescue table. Candidate selection and environmental validation are pending Sonion reconnection, so no fresh cohort is currently frozen.

Use the same provider, pinned Node/Pi/dependency environment and existing resource boundary for all arms. Rotate A/B/C order across tasks (ABC, BCA, CAB, then repeat). Run one actor at a time to avoid CPU contention. No subagents, containers, local WSL work or heavy local execution. Hidden graders/reference data remain outside every actor's mounts. Independent grading restores protected original tests; preserve actor test edits separately.

Prespecify a $0.25 API-equivalent cap for EACH task/arm, 60 finalized responses, 240 observed tool calls and 600 seconds, with the existing command timeout. Planned initial aggregate cap is $4.50, not a spending target. These are deliberately tighter than the human-authorized $10-per-task/per-harness ceiling. Cost caps act after responses, so preserve and report any overshoot. If development shows this allowance cannot exercise xhigh or B's gate, amend and freeze it before scored inference for all arms, rather than selectively giving a failing arm more resources. No unrecorded retries or replacements.

Validate the new copy with model-free checks and zero-inference startup first. Task controls must establish valid original native checks and the issue's baseline failure/reference success without exposing the private controls to actors. Tool/env incompatibility remains operational, not an agent coding failure. Report independent acceptance, budget-eligible acceptance, all-attempt cost per accepted task, fresh/cache/output components, turns, tool calls, latency and operational failures separately.

For B also count eligible and executed pre-edit probes, probes that actually discriminate, preservation cases attempted/passed, gate failures detected, repair continuations and independent rescues/regressions. Recording a safeguard is not evidence it activated usefully. For C record real xhigh payload verification and usage rather than inferring effort from its name.

## Decision and preservation

Compare B against A to test the bundled safeguards, C against A to test extra-high effort, and B against C to compare resource allocation. Report actual costs as well as equal allowances. Keep uncertainty explicit for six correlated, single-attempt issues. A larger inference allowance or passing self-authored checks alone is not an improvement. No baseline promotion or subsequent campaign is automatic.

All work belongs in this separate experiment directory and new attempt directories. Do not modify general-v1, the original ten-pair comparison, its review ZIP, Luna-baseline-v2 or luna-evidence-v1. Preserve every attempt, provider event, failure, unknown cost and unattempted task. Remote code changes must be reconciled into the local field-campaign-v1 worktree. Keep API-equivalent benchmark inference separate from subscription spending and engineering-agent inference.

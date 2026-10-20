# Shared execution strategies (experimental)

`npm run execute` accepts one JSON request on stdin. Set `experimental: true`,
`strategy: "flexible"`, `"efficient"` or `"orchestrated"`, `workspace`, `runDir` outside the workspace,
and `prompt`. This separate entry point does not change the installed CLI or its defaults.

For example, save a request JSON and pipe it with `Get-Content request.json -Raw |
npm run execute --silent` in PowerShell, or `npm run execute --silent < request.json`
in a POSIX shell. Supply `authPath` for existing Pi-compatible authentication, or
set `SUFFICE_AUTH_PATH`; credentials do not belong in the request body or repository.
Explicit `maxCostUsd`, `timeoutMs`, `maxTurns` and `maxCalls` control the shared task
allowance. The experimental controller falls back to $0.25, 300 seconds, 40
responses and 160 tool calls, independently of the unchanged installed CLI defaults.

Flexible keeps the V1 prompt, codemode, AST navigation, cache settings and native
session when enhancements are off. It accepts explicit model, provider and effort.
Its fallback model/effort is Sol/low, matching the original CLI. Efficient retains
the V2 thin prompt, Luna/high default and selective Sol/low advice/takeover. Both
use the same controller, tools, preparation, accounting and verification services.
Flexible never switches model or effort; an explicitly enabled repair uses the
same model and effort. No feature is being promoted into production defaults.

## V3 delegation experiment

`strategy: "orchestrated"` selects the separate V3 experiment. Its default is
Sol/high coordinating Luna/high workers. The coordinator can read source, navigate
ASTs, delegate, retrieve retained output and run fixed caller-supplied public
checks. It has no editing tools or general shell. Its prompt also prohibits
writing source in delegation briefs; that text instruction is not a semantic
guarantee about every generated token.

Luna receives the original task plus a focused brief and implements with the
existing codemode and recoverable output tools. Investigation-only delegates
have read-only source tools. Up to four sequential delegations share the same
workspace, deadline, response/tool allowance and cost budget with Sol. This is
not parallel editing or automatic interception of every tool call. Deterministic
reads and retained-output retrieval do not require another model delegation.

`worker_output` retrieves bounded original worker output directly, with base64
available for exact bytes. A worker summary is not proof: Sol can inspect source
and run `verify`, and the controller checks again after coordination completes.
Missing checks remain unverified. All model stages contribute to the total cost;
coordinator elapsed time includes nested worker time and must not be summed.
The initial five-task system comparison is in `reports/refinement-pilot-v1`.
Keep V3 opt-in pending broader evidence; delegation can add cost and latency.

For an already isolated task environment, `executionScope: "isolated-task"`
clarifies that the task defines authorized paths and operations. The default
remains `"repository"`. This is prompt guidance, not a sandbox or a relaxation
of the file tools' path guards. Configured but unexecuted verification is
`not_run`, and completion evidence is explicitly `unverified` until checks run.

Independent opt-ins under `features` are `outputControl`, `preparedContext`,
`guidance`, `notices`, and `runbooks`. Guidance and runbooks require scoped inputs;
neither loads skills globally. Model routing remains an Efficient policy.
Runbooks require successful fresh replay evidence and matching source hashes;
their receipts are caller-supplied evidence, not authenticated proof of correctness.

## Recoverable output

The existing observed Bash tool stores original bytes before native truncation.
Long model-visible output becomes bounded head/tail/diagnostic excerpts with an
opaque artifact identifier. `command_output` retrieves bounded byte pages,
base64 or literal search results. Exit status and structured codemode data are
preserved. Short output is unchanged. Receipts belong outside the actor repository.
This adds a tool schema and may cost more on small-output tasks; activation and
retrieval must be measured rather than assumed beneficial.

## Public contract verification

`contractVerification` is an optional plan with `requirements` and `checks`.
Each requirement has an `id`, `statement`, and `source` containing `kind`
(`issue`, `documentation`, or `user`), `reference`, and a supporting `excerpt`.
Each check has `id`, argv `command`, and `covers` referring to requirement IDs.
Every requirement needs a check before inference. Exit zero is required; a
claimed success boolean cannot override a missing or failing exit status.
The default total check allowance is 20 seconds, bounded by the task deadline.

Plans are explicit caller contracts, not automatically inferred completeness.
Provenance labels alone cannot establish that a caller's assertion is justified.
Review assertions against their cited sources before a run; missing or ambiguous
requirements should be reported as unverified. Keep evaluator scripts read-only
and outside the editable actor tree. A passed plan proves only its covered checks.
Independent grading is separate and never enters repair/escalation decisions.

Checks may declare up to four `prerequisites`, each with `purpose:
"infrastructure"`, argv `command` and optional `timeoutMs` (at most 10 seconds).
These describe checker infrastructure only. A missing prerequisite skips the
candidate check, records its exact diagnostic as `unavailable`, and leaves
completion evidence `unverified`. It cannot trigger paid advice, repair or
takeover. Required product installations or performance requirements belong in
the candidate check and still fail normally. No output-text heuristic decides
that a real failure was merely infrastructure. Mixed outcomes retain and repair
real candidate failures while leaving unavailable coverage unverified.

`communication: "concise"` is a separate opt-in prompt treatment for worker and
advisor communication. It requests short plans/finals without routine narration,
while retaining exact errors, exit codes and unverified requirements. Default
prompts, reasoning effort, tool access and output budgets are unchanged. Its
token, cost and correctness effects must be measured; shorter visible text does
not imply less internal reasoning or lower total cost.

The low-overhead path is: reuse project checks, then execute a small public issue
reproducer and a public compatibility check. On observed failure, allow one bounded
repair; Efficient may also request its existing concise Sol advice. Report uncovered
requirements explicitly. Do not pay for a generic planner or critic on every task.

## Why Sol never activated in the broad campaign

The controller escalates when configured deterministic checks return failure.
The independently incorrect V2 patches passed those public checks. Independent
grading was isolated, so there was no observable failure to trigger advice or
takeover. Empty checks likewise do not trigger a paid stage. This is a coverage
gap, not evidence that the escalation threshold malfunctioned.

## decomp source audit

Inspected original uploaded revision `ebc308a4f9e039f86fbe740e93711d1da8a352a9`
of `bycontinuity/decomp-v2`: `bench/v7.py`, `bench/v6.py`, THIN/A7 settings,
`guard/hook.py`, `guard/inject.py`, `guard/codex/cap.py`, language guidance and
`docs/ROUTER.md`.

* v7's thin agent, bounded output and compilation checks can be separated from
  its model choices. Its batched Opus advice is orchestration and must include
  coordination cost. Language exercise instructions need adaptation, not global use.
* Crucially, v7/v6 `checked` calls `harness_ok`; failed hidden-test acceptance
  controls subsequent phases and v7 tells the agent “Hidden tests failed”. Test
  contents stay sealed, but this is still hidden acceptance feedback. That retry
  policy cannot be reproduced under our no-hidden-feedback requirement.
* THIN enables only the Bash post-output hook. A7's additional hooks are a different
  configuration. Exact-reread and large-file denial are inappropriate defaults;
  existing AST navigation and soft retained-context notices are safer candidates.
* Retry/poll hints are advisory candidates, measured separately. The source
  brief generator invokes Haiku and is not free deterministic context. Transcript
  command/no-error heuristics must not be treated as proof that checks passed.
* Codex `cap.py` text decoding is weaker than our existing original-byte recovery.
  SQLite fact ledgers and compaction/session capsules need freshness and provenance.
  Claude event/config glue is not portable to Pi. ROUTER is a proposed design,
  not the measured v7 implementation. The complete recursive Git tree (207 entries,
  not truncated) at this revision contains no `SKILL.md`. No external skill package
  is installed here; packaged skills outside this repository remain uninspected.

Fresh ablation protocol and results live under `benchmark/shared` and
`reports/shared-core-v1`. All previous campaigns remain immutable.

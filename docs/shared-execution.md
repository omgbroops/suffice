# Shared execution strategies (experimental)

`npm run execute` accepts one JSON request on stdin. Set `experimental: true`,
`strategy: "flexible"` or `"efficient"`, `workspace`, `runDir` outside the workspace,
and `prompt`. This separate entry point does not change the installed CLI or its defaults.

Flexible keeps the V1 prompt, codemode, AST navigation, cache settings and native
session when enhancements are off. It accepts explicit model, provider and effort.
Its fallback model/effort is Sol/low, matching the original CLI. Efficient retains
the V2 thin prompt, Luna/high default and selective Sol/low advice/takeover. Both
use the same controller, tools, preparation, accounting and verification services.
Flexible never switches model or effort; an explicitly enabled repair uses the
same model and effort. No feature is being promoted into production defaults.

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

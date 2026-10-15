# Field evaluation operational correction v2

The frozen general-v1 Suffice implementation, model, prompt policy, stock Pi native interface and resource limits are unchanged. The $10 ceiling applies independently to each harness on each task, not to the campaign. It is a ceiling, not a target. The previous short-task benchmark and all v1 campaign files remain immutable.

Before v2 scoring, deterministic controls must execute through the exact actor preparation, namespace mounts and grading path used for scored attempts. Baseline native tests must match their documented expectations; private acceptance must fail for a behavioral reason. Historical reference production files must pass independent acceptance. No model is called by these controls.

Corrections are confined to the evaluator:

- Resolve `dependencyDir` metadata containing either an installed `node_modules` directory or its package container to the installed directory. V1 integration actors and graders mistakenly linked the container, causing module-not-found failures. All affected scored integration attempts are operationally invalid; retain their costs and traces, and repeat both arms with corrected environments. Do not count their provisional `codingFailure` labels as coding failures.
- Reproduce the physical frozen public bytes after creating an isolated Git worktree. Ignored staging dependency manifests in s01 differed between the committed snapshot and the admitted physical base. The first attempt stopped before inference. Preserve it; do not modify the admitted source or base Git history.
- Restore original tests including root `test.js`, `*.test-d.ts` and `test-d` directories during independent grading. Preserve actor test edits as patch evidence but do not let them replace original acceptance evidence. Replay any earlier result affected by this matcher separately, preserving its original verdict.
- Use network-disabled grading, as in preparation controls. Actor network access remains unchanged. This prevents external HTTPS availability from changing the documented legacy native-test exceptions.

Versioned files: `scripts/sonion-campaign-v2.mjs`, `scripts/sonion-data-v2.py`, this document. The existing host execution adapter remains byte-identical. V2 receipts use `.suffice/field-campaign-v2`; task packages stay at their immutable v1 paths. Valid unaffected v1 pairs remain part of the dataset and are identified by evaluator version. Do not silently pool environment-invalid attempts as valid comparisons. Report their expense separately and in an inclusive campaign-spend view.

q03 is held following a blind contract review: its private assertion requires aborting a noncooperative running function beyond the original documented behavior. A replacement q04 is prepared and reviewed independently before admission. This is an evaluation exclusion, not an agent failure, and must appear in the task accounting.

# V11 rerun of the same 27 exercises

This is a fresh paired V11/native Codex run on the exact same Aider/Exercism tasks and original public contracts used by V10. It is a development regression comparison, not held-out evidence or a SWE-bench Pro score. Prior contract ambiguities remain. Do not add canonical requirements learned from private results to either actor prompt.

The V11 fork preserves nonroot isolated actors, the model-only CONNECT relay, offline toolchains, two CPU/3 GiB limits, one lane per authentication client, a 50-minute deadline per attempt, no practical dollar cap, exact Luna/Sol model selection, immutable runtime/image bindings, source sealing, and grading only after all 54 actors close. Native Codex runs fresh on each task. The unchanged canonical grader runs in new offline containers. V10 files and result archives are preserved.

V11 uses the existing `.suffice-v10-checks` path only for compatibility with the unchanged six-language public check helper. The worker and native actor prompt is unchanged. V11's public context collector may expose more original helper source to its own reviewers; no hidden tests or reference implementations are inputs to its controller.

Raw canonical acceptance is the primary comparison. `policyValidAccepted` retains the frozen V10 outer-wrapper definition. The supplemental `strictPolicyValidAccepted` also excludes V11 controller-reported internal protected-file restorations; the summary records the affected attempt count explicitly. Neither metric silently substitutes for raw acceptance. Writer retries and verification recovery calls are recorded separately from implementation repairs/takeovers.

Use a new cohort directory. Commands below are PowerShell examples; image IDs must be full `sha256:` identities, obtained from the original plan or `docker image inspect`.

```powershell
$oldRoot = '.suffice/poly27-protocol-20261023-r2'
$runRoot = '.suffice/poly27-v11-20261023-r1'
$baseline = Get-Content "$oldRoot/plan.json" -Raw | ConvertFrom-Json
node scripts/v11-poly27-bench.mjs prepare $runRoot $oldRoot
node scripts/v11-poly27-build.mjs $runRoot $baseline.actorImage
$actorStage = Get-Content "$runRoot/v11-runtime-stage.json" -Raw | ConvertFrom-Json
docker tag $actorStage.baseImage $actorStage.baseTag
# Verify `docker image inspect $actorStage.baseTag --format '{{.Id}}'` equals $actorStage.baseImage.
docker build --pull=false --network none --tag suffice-v11-poly27-actor:20261023 "$runRoot/v11-build-context"
node scripts/v11-poly27-build.mjs $runRoot $baseline.graderImage --grader
$graderStage = Get-Content "$runRoot/v11-grader-stage.json" -Raw | ConvertFrom-Json
docker tag $graderStage.baseImage $graderStage.baseTag
# Verify `docker image inspect $graderStage.baseTag --format '{{.Id}}'` equals $graderStage.baseImage.
docker build --pull=false --network none --tag suffice-v11-poly27-grader:20261023 "$runRoot/v11-grader-build-context"
$graderImage = docker image inspect suffice-v11-poly27-grader:20261023 --format '{{.Id}}'
node scripts/v11-poly27-bench.mjs inspect $runRoot suffice-v11-poly27-actor:20261023
node scripts/v11-poly27-evaluate.mjs validate $runRoot $graderImage
node scripts/v11-poly27-bench.mjs canaries $runRoot
node scripts/v11-poly27-bench.mjs plan $runRoot $graderImage
node scripts/v11-poly27-bench.mjs run $runRoot
node scripts/v11-poly27-evaluate.mjs grade $runRoot $graderImage
```

Preparation reconstructs the pinned original source archive and verifies the public task inventories against the old cohort, excluding only relocated absolute workspace/evaluator paths. Inspection is read-only model discovery and isolation checking. Canaries are paid model/tool smoke checks; the cohort is paid model execution. Validation uses only original stubs/reference solutions before actors start. `plan` freezes V11 and shared runtime hashes plus source/evaluator hashes; edits afterward stop execution/grading. No candidate result reaches an actor.

Archive only an explicit allowlist of plan, public preparation/protocol, inspection, canary, execution, grading, source-sealing, and runtime evidence. Exclude `private-auth/`, `/run` credential inputs, local Pi/Codex auth stores, and build dependency caches. Preserve the full receipts under the ignored cohort root and authenticate archive entries by SHA256 after creating an archive. The old V10 audit script assumes V10 arm names and is not an authoritative V11 audit.

The existing arm-neutral packager checks all 54 terminal attempts, sealed patch hashes, frozen runtime/evaluator hashes, final grading receipts, secret patterns, and every ZIP entry's extracted SHA256/CRC. Its original top-level allowlist predates the V11 setup files; copy only these explicit public setup receipts into its allowlisted `preflight` directory before packaging:

```powershell
New-Item -ItemType Directory -Force "$runRoot/preflight/v11-setup"
Copy-Item -LiteralPath "$runRoot/cohort-origin.json", "$runRoot/v11-runtime-stage.json", "$runRoot/v11-grader-stage.json" -Destination "$runRoot/preflight/v11-setup"
Copy-Item -LiteralPath "$runRoot/v11-build-context/Dockerfile" -Destination "$runRoot/preflight/v11-setup/actor.Dockerfile"
Copy-Item -LiteralPath "$runRoot/v11-grader-build-context/Dockerfile" -Destination "$runRoot/preflight/v11-setup/grader.Dockerfile"
node scripts/poly27-archive.mjs $runRoot reports/poly27-v11-20261023-r1
```

Use a new report directory. Packaging writes `results-evidence.zip`, `runtime.zip`, `evidence-files.json`, `archive.json`, and the selected top-level receipts; it never opens auth stores or replaces prior artifacts. Verify archives independently with Python's `zipfile` and the recorded entry hashes before publishing benchmark conclusions.

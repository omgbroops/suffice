"""Local Suffice orchestration over the supported Model Learner adapter.

No provider, verifier process, Git operation or directory scan. All source/report
paths are explicit. Errors are content-free; stdout is a bounded JSON protocol.
"""

import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from model_learner.adapters import suffice
from model_learner.domain.models import (
    AcceptanceSpec,
    DatasetReference,
    Event,
    Observation,
    Outcome,
    Run,
    Task,
    Verification,
)
from model_learner.observations import build_real_observation
from model_learner.observations.resolution import resolve_assessment
from model_learner.storage.database import Database, Repository
from model_learner.verification import (
    JUnitReportBinding,
    assess_run,
    file_sha256,
    junit_criterion,
    verify_junit,
)

DATASET = DatasetReference(
    source_kind="real", dataset_id="personal-suffice", dataset_version="1"
)


def repository(data, initialize=False):
    db = Database(data["database"])
    if initialize:
        db.initialize()
    return Repository(db)


def current(repo, run):
    resolution = resolve_assessment(
        repo.list_records(Outcome), run_id=run.run_id, cutoff=datetime.now(UTC)
    )
    if resolution.issues:
        raise ValueError("conflicting assessments")
    return resolution.outcome


def describe(repo, run, observation=None):
    outcome = current(repo, run)
    events = [
        e
        for e in repo.list_records(Event)
        if e.session_id
        in {s.session_id for s in repo.list_sessions_for_run(run.run_id)}
    ]
    summary = (
        suffice.summary(suffice.projection(events[0])) if len(events) == 1 else None
    )
    return {
        "run_id": str(run.run_id),
        "task_id": str(run.task_id),
        "outcome": outcome.status.value if outcome else "unknown",
        "verification": outcome.verification_status.value if outcome else "unverified",
        "eligible": observation.eligible_for_configuration_learning
        if observation
        else False,
        "observation_id": str(observation.observation_id) if observation else None,
        "outcome_id": str(outcome.outcome_id) if outcome else None,
        "summary": summary,
    }


def operation(name, data):
    if name == "probe":
        if not hasattr(suffice, "RuntimeManifest"):
            raise ValueError("updated adapter required")
        return {"protocol": "suffice-learner/v1", "runtime_manifests": True}
    repo = repository(data, initialize=name == "prepare")
    if name == "prepare":
        task_id = UUID(data["task_id"])
        criterion = junit_criterion(required_test_ids=data["tests"])
        existing = repo.get(Task, task_id)
        if existing:
            if existing.metadata != {"junit_verifier": criterion}:
                raise ValueError("task identity conflict")
            task = existing
        else:
            task = repo.create_task(
                Task(
                    task_id=task_id,
                    description="Tracked Suffice task",
                    acceptance_spec=AcceptanceSpec(
                        identifier="suffice-independent-tests", version="1"
                    ),
                    task_group="coding",
                    metadata={"junit_verifier": criterion},
                )
            )
        return {
            "task_id": str(task.task_id),
            "acceptance_spec": task.acceptance_spec.model_dump(mode="json"),
        }
    run_id = UUID(data["run_id"])
    if name == "finish":
        manifest_path = Path(data["run_dir"]) / "manifest.json"
        if not manifest_path.exists():
            receipts, receipts_digest = suffice._read(data["receipts"])
            pi, pi_digest = suffice._read(data["pi_session"])
            startup = receipts[0]
            task = repo.get(Task, UUID(data["task_id"]))
            manifest = {
                "format": "suffice-task-import/v2",
                "source_version": startup["version"],
                "pi_schema_version": 3,
                "machine_id": data["machine_id"],
                "pi_session_id": pi[0]["id"],
                "receipts_sha256": receipts_digest,
                "pi_session_sha256": pi_digest,
                "linkage": "suffice_runtime",
                "runtime_id": data["runtime_id"],
                "scope": "single_task",
                "task_id": str(task.task_id),
                "run_id": str(run_id),
                "acceptance_spec": task.acceptance_spec.model_dump(mode="json"),
                "configuration": {
                    "provider": startup["provider"],
                    "model": startup["model"],
                    "reasoning_level": startup["effort"],
                    "harness": "suffice.cli",
                    "harness_version": "0.1.0-alpha.2",
                    "configuration_version": startup["profile"],
                },
                "started_at": data["started_at"],
                "ended_at": data["ended_at"],
                "declared_at": datetime.now(UTC).isoformat(),
                "final_artifact_fingerprint": "sha256:" + file_sha256(data["artifact"]),
            }
            suffice.RuntimeManifest.model_validate(manifest)
            fd = os.open(
                manifest_path,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                0o600,
            )
            with os.fdopen(fd, "w") as stream:
                json.dump(manifest, stream)
        imported = suffice.ingest_suffice(
            repo, manifest_path, data["receipts"], data["pi_session"]
        )
        run = repo.get(Run, run_id)
        outcome = current(repo, run)
        if outcome is None:
            outcome = assess_run(repo, run_id=run_id)
        observation = build_real_observation(
            repo, run_id=run_id, outcome_id=outcome.outcome_id, dataset=DATASET
        )
        return {
            **describe(repo, run, observation),
            "session_id": str(imported["session_id"]),
        }
    run = repo.get(Run, run_id)
    if run is None:
        raise ValueError("capture not imported")
    if name == "status":
        outcome = current(repo, run)
        observation = next(
            (
                o
                for o in repo.list_records(
                    Observation, source_kind="real", dataset_id=DATASET.dataset_id
                )
                if outcome and o.outcome_id == outcome.outcome_id
            ),
            None,
        )
        return describe(repo, run, observation)
    if name != "verify" or data.get("independent") is not True:
        raise ValueError("independent verification required")
    task = repo.get(Task, run.task_id)
    generated = datetime.fromisoformat(data["generated_at"].replace("Z", "+00:00"))
    binding = JUnitReportBinding(
        task_id=task.task_id,
        run_id=run_id,
        acceptance_spec=task.acceptance_spec,
        artifact_fingerprint="sha256:" + file_sha256(data["artifact"]),
        report_sha256=file_sha256(data["report"]),
        report_generated_at=generated,
        source="junit",
        execution_completed=True,
        command_exit_code=data["exit_code"],
    )
    # Always revalidate the selected bytes and binding before treating a repeat as replay.
    candidates = [
        v
        for v in repo.list_records(Verification)
        if v.run_id == run_id
        and v.metadata.get("binding") == binding.model_dump(mode="json")
    ]
    if candidates:
        from model_learner.verification import validate_evidence

        verification = candidates[0]
        if verification.metadata.get("report_observed_sha256") != file_sha256(
            data["report"]
        ):
            raise ValueError("report changed")
        validate_evidence(repo, run, task, verification)
    else:
        verification = verify_junit(
            repo,
            run_id=run_id,
            report=Path(data["report"]),
            artifact=Path(data["artifact"]),
            binding=binding,
        )
    outcome = current(repo, run)
    if outcome is None or outcome.evidence_ids != (verification.verification_id,):
        outcome = assess_run(
            repo,
            run_id=run_id,
            verification_id=verification.verification_id,
            supersedes_outcome_id=outcome.outcome_id if outcome else None,
        )
    observation = build_real_observation(
        repo, run_id=run_id, outcome_id=outcome.outcome_id, dataset=DATASET
    )
    return describe(repo, run, observation)


def main():
    try:
        raw = sys.stdin.buffer.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise ValueError("request size")
        data = json.loads(raw)
        result = operation(sys.argv[1], data)
        print(json.dumps(result, allow_nan=False))
    except Exception:  # noqa: BLE001 - never expose native input at this boundary
        print(
            json.dumps(
                {
                    "error": "Model Learner rejected the operation; check connection, task scope or independent artifact/report binding"
                }
            )
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

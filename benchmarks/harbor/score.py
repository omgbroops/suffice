#!/usr/bin/env python3
"""Strict single-attempt scorer for Harbor DeepSWE jobs.

This scorer deliberately does not infer or invent grades. It uses the task
verifier reward recorded by Harbor. Agent/verifier timeouts are zero. Missing
rewards and infrastructure exceptions are reported as incomplete rather than
silently converted into benchmark performance.
"""
import argparse
import csv
import json
import sys
from pathlib import Path

TIMEOUT_TYPES = {"AgentTimeoutError", "VerifierTimeoutError"}
INFRA_TYPES = {
    "EnvironmentStartTimeoutError",
    "AgentSetupError",
    "AgentInstallTimeoutError",
    "EnvironmentBuildError",
    "EnvironmentError",
    "DockerComposeError",
    "ComposeError",
    "CancelledError",
}


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def reward_of(result):
    rewards = ((result.get("verifier_result") or {}).get("rewards") or None)
    if not rewards:
        return None, None
    key = "reward" if "reward" in rewards else next(iter(rewards))
    value = rewards[key]
    if not isinstance(value, (int, float)):
        return key, None
    return key, float(value)


def iso_seconds(start, end):
    if not start or not end:
        return None
    from datetime import datetime
    try:
        a = datetime.fromisoformat(start.replace("Z", "+00:00"))
        b = datetime.fromisoformat(end.replace("Z", "+00:00"))
        return max(0.0, (b - a).total_seconds())
    except (ValueError, TypeError):
        return None


def benchmark_config_signature(result):
    config = result.get("config") or {}
    agent = config.get("agent") or {}
    kwargs = dict(agent.get("kwargs") or {})
    # Host-local locations change across otherwise identical reruns. The
    # package content hash is separately preserved in kwargs.version.
    for volatile in ("auth_dir", "package_tarball"):
        kwargs.pop(volatile, None)
    environment = config.get("environment") or {}
    verifier = config.get("verifier") or {}
    signature = {
        "agent": {
            "name": agent.get("name"),
            "import_path": agent.get("import_path"),
            "model_name": agent.get("model_name"),
            "kwargs": kwargs,
            "extra_allowed_hosts": sorted(agent.get("extra_allowed_hosts") or []),
        },
        "environment": {"type": environment.get("type")},
        "verifier": {"disable": verifier.get("disable"), "environment_mode": verifier.get("environment_mode")},
        "timeouts": {
            "timeout_multiplier": config.get("timeout_multiplier"),
            "agent_timeout_multiplier": config.get("agent_timeout_multiplier"),
            "verifier_timeout_multiplier": config.get("verifier_timeout_multiplier"),
        },
    }
    return json.dumps(signature, sort_keys=True, separators=(",", ":"))


def collect(job_dirs):
    rows = []
    for root in job_dirs:
        root = Path(root)
        for path in sorted(root.rglob("result.json")):
            result = read_json(path)
            if not isinstance(result, dict) or "task_name" not in result:
                continue
            task = result["task_name"]
            exception = result.get("exception_info") or {}
            exception_type = exception.get("exception_type")
            reward_key, reward = reward_of(result)
            agent_context = result.get("agent_result") or {}
            agent_seconds = iso_seconds(
                ((result.get("agent_execution") or {}).get("started_at")),
                ((result.get("agent_execution") or {}).get("finished_at")),
            )
            rows.append({
                "job_dir": str(root),
                "trial_dir": str(path.parent),
                "task": task,
                "trial_name": result.get("trial_name") or path.parent.name,
                "reward": reward,
                "reward_key": reward_key,
                "exception_type": exception_type,
                "exception_message": exception.get("exception_message"),
                "agent_seconds": agent_seconds,
                "input_tokens": agent_context.get("n_input_tokens"),
                "cache_tokens": agent_context.get("n_cache_tokens"),
                "output_tokens": agent_context.get("n_output_tokens"),
                "cost_usd": agent_context.get("cost_usd"),
                "mtime": path.stat().st_mtime,
                "agent_name": (result.get("agent_info") or {}).get("name"),
                "agent_version": (result.get("agent_info") or {}).get("version"),
                "model": ((result.get("agent_info") or {}).get("model_info") or {}).get("name"),
                "config_signature": benchmark_config_signature(result),
            })
    return rows


def classify(row):
    exception_type = row.get("exception_type")
    reward = row.get("reward")
    if exception_type in TIMEOUT_TYPES:
        return "timeout_zero", 0.0
    if exception_type == "AgentSafetyRefusalError":
        return "provider_refusal_incomplete", None
    if exception_type in INFRA_TYPES or exception_type:
        return "infrastructure_incomplete", None
    if reward is not None and reward >= 0:
        return "pass" if reward == 1 else "fail", reward
    if reward is not None and reward < 0:
        return "grader_error", None
    return "missing_reward_incomplete", None


def score_rows(rows, strict=False):
    latest = {}
    for row in rows:
        # Harbor retries produce repeated task rows. The newest surviving row is
        # the relevant candidate; older infrastructure rows remain in artifacts.
        if row["task"] not in latest or row["mtime"] >= latest[row["task"]]["mtime"]:
            latest[row["task"]] = row
    final = []
    incomplete = []
    for row in latest.values():
        status, score = classify(row)
        row = {key: value for key, value in row.items() if key != "mtime"}
        row["status"] = status
        row["score"] = score
        final.append(row)
        if score is None:
            incomplete.append(row)
    graded = [row for row in final if row["score"] is not None]
    denominator = len(graded)
    pass_count = sum(1 for row in graded if row["score"] == 1)
    config_count = len({row.get("config_signature") for row in rows})
    summary = {
        "tasks_seen": len(final),
        "configuration_count": config_count,
        "graded_tasks": denominator,
        "incomplete_tasks": len(incomplete),
        "pass_count": pass_count,
        "pass_rate": (pass_count / denominator) if denominator else None,
        "mean_score": (sum(row["score"] for row in graded) / denominator) if denominator else None,
        "timeout_zero_count": sum(1 for row in final if row["status"] == "timeout_zero"),
        "grader_error_count": sum(1 for row in final if row["status"] == "grader_error"),
        "input_tokens": sum(row["input_tokens"] or 0 for row in graded),
        "output_tokens": sum(row["output_tokens"] or 0 for row in graded),
        "cost_usd": sum(row["cost_usd"] or 0 for row in graded),
        "cost_coverage": (sum(1 for row in graded if row["cost_usd"] is not None) / denominator) if denominator else None,
        "agent_hours": sum(row["agent_seconds"] or 0 for row in graded) / 3600,
    }
    if strict and config_count != 1:
        summary["strict_config_error"] = "rows come from multiple benchmark configurations; score each configuration separately"
    if strict and incomplete:
        summary["strict_error"] = "incomplete infrastructure/missing-reward tasks are present; retry or void them deliberately before publishing"
    return summary, sorted(final, key=lambda row: row["task"]), sorted(incomplete, key=lambda row: row["task"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("job_dirs", nargs="+", help="Harbor job directories or parent directories containing them")
    parser.add_argument("--out", type=Path, help="write rows to CSV")
    parser.add_argument("--json-out", type=Path, help="write summary and rows to JSON")
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--expected-tasks", type=int, help="fail strict scoring unless exactly this many unique tasks are present")
    args = parser.parse_args()

    rows = collect(args.job_dirs)
    if not rows:
        print("ERROR: no per-trial Harbor result.json files found", file=sys.stderr)
        return 2
    summary, final, incomplete = score_rows(rows, strict=args.strict)
    payload = {"summary": summary, "rows": final, "incomplete": incomplete}
    print(json.dumps(summary, indent=2))
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(payload, indent=2) + "\n")
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        fields = sorted({key for row in final for key in row})
        with args.out.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(final)
    strict_failed = False
    if args.expected_tasks is not None and summary["tasks_seen"] != args.expected_tasks:
        print(f"ERROR: expected {args.expected_tasks} unique tasks, found {summary['tasks_seen']}", file=sys.stderr)
        strict_failed = True
    if args.strict and summary["configuration_count"] != 1:
        print(f"ERROR: expected 1 benchmark configuration, found {summary['configuration_count']}", file=sys.stderr)
        strict_failed = True
    if args.strict and incomplete:
        print(f"ERROR: {len(incomplete)} incomplete tasks", file=sys.stderr)
        strict_failed = True
    return 3 if strict_failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

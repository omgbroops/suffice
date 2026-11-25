import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

try:
    from benchmarks.harbor.agent import _proxy_models_json
except ModuleNotFoundError:  # harbor is installed by the benchmark environment setup
    _proxy_models_json = None
from benchmarks.harbor.score import collect, score_rows
from benchmarks.harbor.proxy.openai_proxy import credential_from, sanitize_inference_body


class HarborBenchmarkTests(unittest.TestCase):
    def test_proxy_models_preserves_catalog_metadata(self):
        if _proxy_models_json is None:
            self.skipTest("harbor package is not installed")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "catalog.json").write_text(json.dumps({
                "openai": {"models": [
                    {"id": "gpt-6.2-sol", "api": "openai-codex-responses", "contextWindow": 1000000, "cost": {"input": 1, "output": 2}},
                    {"id": "gpt-6-luna", "api": "openai-codex-responses", "contextWindow": 500000, "cost": {"input": 0.1, "output": 0.2}},
                ]}
            }))
            parsed = json.loads(_proxy_models_json(str(root), "gpt-6.2-sol", "gpt-6-luna", "http://127.0.0.1:8787/v1"))
        provider = parsed["providers"]["suffice-proxy"]
        self.assertEqual(provider["api"], "openai-codex-responses")
        self.assertEqual(provider["apiKey"], "$SUFFICE_PROXY_KEY")
        self.assertEqual(provider["models"][0]["contextWindow"], 1000000)
        self.assertEqual(len(provider["models"]), 2)

    def test_proxy_requires_oauth_shape(self):
        credential = credential_from({"openai": {"type": "oauth", "access": "a", "refresh": "r", "expires": 1, "clientId": "c"}})
        self.assertEqual(credential["access"], "a")
        with self.assertRaises(RuntimeError):
            credential_from({"openai": {"type": "api_key", "key": "x"}})

    def test_proxy_restricts_models_and_removes_chatgpt_unsupported_fields(self):
        body = json.dumps({
            "model": "gpt-6.2-sol",
            "temperature": 0.2,
            "max_output_tokens": 100,
            "prompt_cache_retention": "24h",
            "input": [{"type": "configuration_update"}, {"type": "message", "content": "x"}],
        }).encode()
        sanitized, rejection = sanitize_inference_body(body, {"gpt-6.2-sol"})
        self.assertIsNone(rejection)
        payload = json.loads(sanitized)
        self.assertNotIn("temperature", payload)
        self.assertNotIn("max_output_tokens", payload)
        self.assertNotIn("prompt_cache_retention", payload)
        self.assertEqual([item["type"] for item in payload["input"]], ["message"])
        _, rejection = sanitize_inference_body(body, {"gpt-6-luna"})
        self.assertEqual(rejection, "model is not allowed for this benchmark run")

    def test_scorer_counts_timeout_zero_and_marks_infra_incomplete(self):
        rows = [
            {
                "job_dir": "j", "trial_dir": "t1", "task": "pass-task", "trial_name": "pass-task", "reward": 1,
                "reward_key": "reward", "exception_type": None, "exception_message": None, "agent_seconds": 10,
                "input_tokens": 5, "cache_tokens": 1, "output_tokens": 2, "cost_usd": 0.1, "mtime": 1,
                "agent_name": "suffice", "agent_version": "x", "model": "m",
            },
            {
                "job_dir": "j", "trial_dir": "t2", "task": "timeout-task", "trial_name": "timeout-task", "reward": None,
                "reward_key": None, "exception_type": "AgentTimeoutError", "exception_message": "timeout", "agent_seconds": 20,
                "input_tokens": 5, "cache_tokens": 0, "output_tokens": 2, "cost_usd": 0.1, "mtime": 1,
                "agent_name": "suffice", "agent_version": "x", "model": "m",
            },
            {
                "job_dir": "j", "trial_dir": "t3", "task": "infra-task", "trial_name": "infra-task", "reward": None,
                "reward_key": None, "exception_type": "DockerComposeError", "exception_message": "boom", "agent_seconds": None,
                "input_tokens": None, "cache_tokens": None, "output_tokens": None, "cost_usd": None, "mtime": 1,
                "agent_name": "suffice", "agent_version": "x", "model": "m",
            },
        ]
        summary, final, incomplete = score_rows(rows)
        self.assertEqual(summary["pass_rate"], 0.5)
        self.assertEqual(summary["timeout_zero_count"], 1)
        self.assertEqual(len(incomplete), 1)
        statuses = {row["task"]: row["status"] for row in final}
        self.assertEqual(statuses["pass-task"], "pass")
        self.assertEqual(statuses["timeout-task"], "timeout_zero")
        self.assertEqual(statuses["infra-task"], "infrastructure_incomplete")


if __name__ == "__main__":
    unittest.main()

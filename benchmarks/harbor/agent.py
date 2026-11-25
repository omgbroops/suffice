"""Harbor agents for the clean Suffice benchmark harness.

The task container never receives the user's OpenAI OAuth credential. Pi and
Suffice use a local reverse-proxy provider with a dummy key; the separate proxy
container holds and refreshes the real credential.
"""
import json
import os
import shlex
from pathlib import Path, PurePosixPath
from typing import override

from harbor.agents.installed.base import BaseInstalledAgent
from harbor.agents.installed.node_install import nvm_node_install_snippet
from harbor.agents.installed.pi import Pi
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

_PROXY_HOME = PurePosixPath("/tmp/suffice-proxy-home")
_PI_HOME = PurePosixPath("/tmp/suffice-pi-home")
_SUFFICE_HOME = PurePosixPath("/tmp/suffice-home")
_RESULT_PATH = PurePosixPath("/logs/agent/suffice-result.json")
_OUTPUT_PATH = PurePosixPath("/logs/agent/suffice-output.txt")
_DUMMY_KEY = "suffice-benchmark-proxy-key"


def _model_id(model_name: str | None, fallback: str) -> str:
    if not model_name:
        return fallback
    return model_name.split("/", 1)[-1]


def _catalog_model(auth_dir: str | None, provider: str, model_id: str) -> dict:
    auth = Path(auth_dir).expanduser() if auth_dir else Path.home() / ".suffice"
    catalog_path = auth / "catalog.json"
    try:
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise RuntimeError(
            f"Benchmark model catalog is missing or invalid at {catalog_path}; run `suffice login` first"
        ) from exc
    models = (catalog.get(provider) or {}).get("models") or []
    if isinstance(models, dict):
        models = list(models.values())
    for model in models:
        if isinstance(model, dict) and model.get("id") == model_id:
            return dict(model)
    raise RuntimeError(
        f"Model {model_id!r} is absent from {catalog_path}; refresh the Suffice/Pi catalog before benchmarking"
    )


def _proxy_models_json(auth_dir: str | None, strong_model: str, cheap_model: str, proxy_url: str) -> str:
    entries = []
    seen = set()
    for model_id in (strong_model, cheap_model):
        if model_id in seen:
            continue
        seen.add(model_id)
        source = _catalog_model(auth_dir, "openai", model_id)
        entry = {key: value for key, value in source.items() if key not in {"provider", "baseUrl", "apiKey"}}
        entry["id"] = model_id
        entries.append(entry)
    api = entries[0].get("api") or "openai-responses"
    document = {
        "providers": {
            "suffice-proxy": {
                "baseUrl": proxy_url,
                "apiKey": "$SUFFICE_PROXY_KEY",
                "api": api,
                "models": entries,
            }
        }
    }
    return json.dumps(document, indent=2) + "\n"


async def _write_proxy_models(agent, environment: BaseEnvironment) -> None:
    content = _proxy_models_json(agent._auth_dir, agent._strong_model, agent._cheap_model, agent._proxy_url)
    for directory in (_PI_HOME, _SUFFICE_HOME):
        await agent.exec_as_agent(environment, command=f"mkdir -p {shlex.quote(directory.as_posix())} && chmod 700 {shlex.quote(directory.as_posix())}")
        await agent._upload_config_text(
            environment,
            content=content,
            remote_path=(directory / "models.json").as_posix(),
            filename="models.json",
        )


def _proxy_env(extra_env):
    return {
        "PI_CODING_AGENT_DIR": _PI_HOME.as_posix(),
        "SUFFICE_PROXY_KEY": _DUMMY_KEY,
        "OPENAI_API_KEY": _DUMMY_KEY,
        "OPENAI_BASE_URL": "http://127.0.0.1:8787/v1",
        "PI_OFFLINE": "1",
        **(extra_env or {}),
    }


class SufficePiAgent(Pi):
    """Stock upstream Pi, authenticated only through the credential-injecting proxy."""

    def __init__(self, *args, auth_dir: str | None = None, cheap_model: str = "gpt-6-luna", proxy_url: str = "http://127.0.0.1:8787/v1", extra_env=None, **kwargs):
        super().__init__(*args, extra_env=_proxy_env(extra_env), **kwargs)
        self._auth_dir = auth_dir
        self._cheap_model = cheap_model
        self._proxy_url = proxy_url
        self._strong_model = _model_id(self.model_name, "gpt-6.2-sol")

    def _build_custom_models_json(self, access, model_id):
        # Pi's stock custom-endpoint path normally records only {"id": ...},
        # losing context-window and cost metadata. Reuse the catalog-backed
        # proxy document but key it as harbor-endpoint because Pi.run() selects
        # that provider after writing custom configuration.
        document = json.loads(_proxy_models_json(self._auth_dir, self._strong_model, self._cheap_model, self._proxy_url))
        provider = document["providers"].pop("suffice-proxy")
        return {"providers": {"harbor-endpoint": provider}}

    @override
    async def install(self, environment: BaseEnvironment) -> None:
        await super().install(environment)
        await _write_proxy_models(self, environment)


class SufficeAgent(BaseInstalledAgent):
    """Suffice core/auto running inside the Harbor task environment."""

    def __init__(
        self,
        *args,
        arm: str = "core",
        effort: str = "xhigh",
        cheap_effort: str = "low",
        cheap_model: str = "gpt-6-luna",
        auth_dir: str | None = None,
        package_tarball: str | None = None,
        proxy_url: str = "http://127.0.0.1:8787/v1",
        workspace: str = "/app",
        extra_env=None,
        **kwargs,
    ):
        if arm not in {"core", "auto"}:
            raise ValueError("arm must be core or auto")
        super().__init__(*args, extra_env=_proxy_env(extra_env), **kwargs)
        self._arm = arm
        self._effort = effort
        self._cheap_effort = cheap_effort
        self._cheap_model = cheap_model
        self._auth_dir = auth_dir
        self._package_tarball = package_tarball or os.environ.get("SUFFICE_PACKAGE_TARBALL")
        self._proxy_url = proxy_url
        self._workspace = workspace
        self._strong_model = _model_id(self.model_name, "gpt-6.2-sol")

    @staticmethod
    @override
    def name() -> str:
        return "suffice"

    @override
    def get_version_command(self) -> str | None:
        return ". ~/.nvm/nvm.sh; suffice --version"

    @override
    def parse_version(self, stdout: str) -> str:
        return stdout.strip().splitlines()[-1].strip()

    @override
    async def install(self, environment: BaseEnvironment) -> None:
        if not self._package_tarball:
            raise RuntimeError("SUFFICE_PACKAGE_TARBALL or agent kwarg package_tarball is required")
        package = Path(self._package_tarball).expanduser()
        if not package.is_file():
            raise RuntimeError(f"Suffice package tarball does not exist: {package}")
        await self.ensure_system_dependencies(environment, ("curl", "bash", "git", "ca_certificates"))
        await self.exec_as_agent(
            environment,
            command=f"set -euo pipefail; {nvm_node_install_snippet()} && node --version && npm --version",
        )
        await environment.upload_file(package, "/tmp/suffice-package.tgz")
        await self.exec_as_agent(
            environment,
            command=". ~/.nvm/nvm.sh; npm install -g --ignore-scripts /tmp/suffice-package.tgz && suffice --version && command -v suffice-benchmark",
            timeout_sec=600,
        )
        await _write_proxy_models(self, environment)

    @override
    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        await self._upload_config_text(
            environment,
            content=self.render_instruction(instruction),
            remote_path="/tmp/suffice-instruction.md",
            filename="suffice-instruction.md",
        )
        command = " ".join([
            ". ~/.nvm/nvm.sh;",
            "mkdir -p /logs/agent;",
            "suffice-benchmark",
            "--mode", shlex.quote(self._arm),
            "--cwd", shlex.quote(self._workspace),
            "--home", shlex.quote(_SUFFICE_HOME.as_posix()),
            "--model", shlex.quote(self._strong_model),
            "--cheap-model", shlex.quote(self._cheap_model),
            "--effort", shlex.quote(self._effort),
            "--cheap-effort", shlex.quote(self._cheap_effort),
            "--result", shlex.quote(_RESULT_PATH.as_posix()),
            "--prompt-file /tmp/suffice-instruction.md",
            f"2>&1 </dev/null | stdbuf -oL tee {shlex.quote(_OUTPUT_PATH.as_posix())};",
            "status=${PIPESTATUS[0]};",
            f"cp -a {shlex.quote(_SUFFICE_HOME.as_posix())} /logs/agent/suffice-home 2>/dev/null || true;",
            "exit $status",
        ])
        await self.exec_as_agent(environment, command=command, cwd=self._workspace, timeout_sec=None)
        self.populate_context_post_run(context)

    def populate_context_post_run(self, context: AgentContext) -> None:
        path = self.logs_dir / "suffice-result.json"
        if not path.exists():
            return
        try:
            result = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        usage = result.get("usage") or {}
        input_tokens = int(usage.get("input") or 0)
        cache_read = int(usage.get("cacheRead") or 0)
        output = int(usage.get("output") or 0)
        cost = usage.get("estimatedApiUsd")
        context.n_input_tokens = input_tokens + cache_read
        context.n_cache_tokens = cache_read
        context.n_output_tokens = output
        if isinstance(cost, (int, float)) and cost > 0 and not usage.get("costUnknown"):
            context.cost_usd = float(cost)

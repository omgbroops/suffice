#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HARBOR="${HARBOR:-$HOME/.venvs/harbor/bin/harbor}"
if [[ ! -x "$HARBOR" ]]; then HARBOR="$(command -v harbor || true)"; fi
if [[ -z "$HARBOR" ]]; then echo "harbor executable not found" >&2; exit 1; fi

DATASET='datacurve/deep-swe-1-1@sha256:5affcd534fd90ac85d202d4c63f8b35ddc942140afdd5d60014a21365440a2f5'
AUTH_DIR="${SUFFICE_AUTH_DIR:-$HOME/.suffice}"
ARMS="${ARMS:-pi,core,auto}"
CONCURRENCY="${CONCURRENCY:-2}"
OUTPUT_ROOT="${OUTPUT_ROOT:-$ROOT/benchmarks/results/harbor-deepswe-v1.1}"
STRONG_MODEL="${SUFFICE_STRONG_MODEL:-gpt-6.2-sol}"
CHEAP_MODEL="${SUFFICE_CHEAP_MODEL:-gpt-6-luna}"
PI_VERSION="${PI_VERSION:-1.5.2}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

python3 "$ROOT/benchmarks/harbor/preflight.py"

STATE_DIR="$(mktemp -d /tmp/suffice-openai-proxy-state.XXXXXX)"
chmod 700 "$STATE_DIR"
cleanup() {
  rm -rf "$STATE_DIR"
}
trap cleanup EXIT
cp "$AUTH_DIR/auth.json" "$STATE_DIR/auth.json"
chmod 600 "$STATE_DIR/auth.json"
python3 - "$ROOT/benchmarks/harbor/proxy.compose.yaml" "$STATE_DIR" <<'PY'
from pathlib import Path
import sys
source = Path(sys.argv[1]).read_text()
state = sys.argv[2]
Path(state, 'proxy.compose.yaml').write_text(source.replace('SUFFICE_PROXY_STATE_DIR_PLACEHOLDER', state))
PY

docker build -q -t suffice-openai-proxy:local "$ROOT/benchmarks/harbor/proxy" >/dev/null
mkdir -p "$ROOT/benchmarks/harbor/dist"
rm -f "$ROOT/benchmarks/harbor/dist"/suffice-*.tgz
(cd "$ROOT" && npm pack --pack-destination "$ROOT/benchmarks/harbor/dist" >/dev/null)
PACKAGE="$(find "$ROOT/benchmarks/harbor/dist" -maxdepth 1 -name 'suffice-*.tgz' -print -quit)"
if [[ ! -f "$PACKAGE" ]]; then echo "npm pack did not produce a Suffice tarball" >&2; exit 1; fi
VERSION="$(sha256sum "$PACKAGE" | cut -c1-16)"

export PYTHONPATH="$ROOT${PYTHONPATH:+:$PYTHONPATH}"
export SUFFICE_PACKAGE_TARBALL="$PACKAGE"
mkdir -p "$OUTPUT_ROOT"
GIT_DIRTY=false
if [[ -n "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ]]; then GIT_DIRTY=true; fi
cat >"$OUTPUT_ROOT/manifest-$STAMP.json" <<EOF
{
  "benchmark": "deepswe-v1.1",
  "dataset": "$DATASET",
  "started_utc": "$STAMP",
  "arms": "$ARMS",
  "strong_model": "$STRONG_MODEL",
  "cheap_model": "$CHEAP_MODEL",
  "pi_version": "$PI_VERSION",
  "suffice_package_sha256": "$VERSION",
  "git_commit": "$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo unknown)",
  "git_dirty": $GIT_DIRTY,
  "attempts_per_task": 1,
  "agent_timeout_source": "pinned Harbor task definitions",
  "artifact_format": "harbor-0.22.0"
}
EOF

run_arm() {
  local arm="$1"
  local job_dir="$OUTPUT_ROOT/$arm/$STAMP"
  mkdir -p "$job_dir"
  local agent_import model provider_model
  provider_model="openai/$STRONG_MODEL"
  if [[ "$arm" == "pi" ]]; then
    agent_import='benchmarks.harbor.agent:SufficePiAgent'
  elif [[ "$arm" == "core" || "$arm" == "auto" ]]; then
    agent_import='benchmarks.harbor.agent:SufficeAgent'
  else
    echo "unknown arm: $arm" >&2
    return 2
  fi

  local args=(
    run
    --dataset "$DATASET"
    --agent "$agent_import"
    --model "$provider_model"
    --jobs-dir "$OUTPUT_ROOT/$arm"
    --job-name "deepswe-$STAMP"
    --n-attempts 1
    --n-concurrent "$CONCURRENCY"
    --quiet
    --max-retries 3
    --retry-exclude AgentTimeoutError
    --retry-exclude VerifierTimeoutError
    --retry-exclude RewardFileNotFoundError
    --retry-exclude RewardFileEmptyError
    --retry-exclude VerifierOutputParseError
    --retry-exclude ApiUsageLimitError
    --retry-exclude AgentAuthenticationError
    --retry-exclude ModelNotFoundError
    --enable-verification
    --yes
    --extra-docker-compose "$STATE_DIR/proxy.compose.yaml"
    --allow-agent-host api.openai.com
    --allow-agent-host auth.openai.com
    --ak "auth_dir=$AUTH_DIR"
    --ak "cheap_model=$CHEAP_MODEL"
    --ak "package_tarball=$PACKAGE"
  )
  if [[ "$arm" == "pi" ]]; then
    args+=(--ak thinking=xhigh --ak "version=$PI_VERSION")
  elif [[ "$arm" == "core" || "$arm" == "auto" ]]; then
    args+=(--ak "arm=$arm" --ak effort=xhigh --ak cheap_effort=low --ak "version=$VERSION")
  fi
  args+=("$@")

  echo "[$arm] writing Harbor job under $job_dir"
  "${HARBOR}" "${args[@]}" 2>&1 | tee "$job_dir/launcher.log"
  return "${PIPESTATUS[0]}"
}

status=0
IFS=',' read -r -a selected <<< "$ARMS"
for arm in "${selected[@]}"; do
  arm="${arm//[[:space:]]/}"
  run_arm "$arm" "$@" || status=$?
done
exit "$status"

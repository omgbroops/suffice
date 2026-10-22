#!/usr/bin/env bash
# One-command full blind benchmark. Dry by default: prints the plan and exits. Pass --go to spend.
set -euo pipefail
cd "$(dirname "$0")/.."

GO=0
for arg in "$@"; do
  case "$arg" in
    --go) GO=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

TOTAL_CAP="${TOTAL_CAP:-13}"  # remaining of the owner's $40 cap (~$27 spent 2026-10-21); override explicitly to spend more
JOBS=(polyglot-v5-cheap polyglot-v5-strict polyglot-single swebpro-v5-cheap swebpro-v5-strict swebpro-single)
read -ra CAPS <<< "${ARM_CAPS:-6 5 4 3 3 2}"  # one cap per JOBS entry, same order
SUITE="${SUITE:-all}"  # all|polyglot|swebpro
SWEPRO_MANIFEST="${SWEPRO_MANIFEST:-config/bench-manifest.swebpro20.json}"
SWEPRO_BUDGET="${SWEPRO_BUDGET:-0.5}"  # per task; the ~$0.11 default starved agents on real repos (2026-10-22 run)
if [[ "$SUITE" != all ]]; then
  KJ=(); KC=()
  for i in "${!JOBS[@]}"; do [[ "${JOBS[$i]}" == "$SUITE"-* ]] && { KJ+=("${JOBS[$i]}"); KC+=("${CAPS[$i]}"); }; done
  (( ${#KJ[@]} )) || { echo "unknown SUITE: $SUITE" >&2; exit 2; }
  JOBS=("${KJ[@]}"); CAPS=("${KC[@]}")
fi

# Sets ARGS to one job's node argv; --global-cap-usd and --results are added at launch.
job_args() {
  # swebpro agents run envrun loops, so they get 30 turns; polyglot keeps the lean default of 12.
  ENVP=()  # env prefix for the node command; jobs run in the background, so no export
  if [[ "$1" == swebpro-* ]]; then ENVP=(V4_MAX_TURNS=30 V4_RUN_TIMEOUT_MS=1500000 V4_KEEP_IMAGES=1); fi
  case "$1" in
    polyglot-v5-cheap)  ARGS=(--manifest=config/bench-manifest.polyglot36.json --protocol=pass1 --gate=self --workers=12 --budget-usd=0.6 --arm=v5 --v5-cheap=sonnet --v5-top=opus) ;;
    polyglot-v5-strict) ARGS=(--manifest=config/bench-manifest.polyglot36.json --protocol=pass1 --gate=self --workers=12 --budget-usd=0.6 --arm=v5 --v5-strict --v5-top=opus) ;;
    polyglot-single)    ARGS=(--manifest=config/bench-manifest.polyglot36.json --protocol=pass1 --gate=self --workers=12 --budget-usd=0.6 --arm=single:claude-sonnet-5-5) ;;
    swebpro-v5-cheap)   ARGS=(--provider=swebpro --manifest=$SWEPRO_MANIFEST --workers=1 --budget-usd=$SWEPRO_BUDGET --arm=v5 --v5-cheap=sonnet --v5-top=opus) ;;
    swebpro-v5-strict)  ARGS=(--provider=swebpro --manifest=$SWEPRO_MANIFEST --workers=1 --budget-usd=$SWEPRO_BUDGET --arm=v5 --v5-strict --v5-top=opus) ;;
    swebpro-single)     ARGS=(--provider=swebpro --manifest=$SWEPRO_MANIFEST --workers=1 --budget-usd=$SWEPRO_BUDGET --arm=single:claude-sonnet-5-5) ;;
    *) echo "unknown job: $1" >&2; exit 2 ;;
  esac
}

sum=0
for c in "${CAPS[@]}"; do sum=$((sum + c)); done
echo "TOTAL_CAP=$TOTAL_CAP  sum of arm caps=$sum"
if (( sum > TOTAL_CAP )); then
  echo "refusing to start: sum of arm caps $sum exceeds TOTAL_CAP $TOTAL_CAP" >&2
  exit 1
fi

echo "plan (${#JOBS[@]} arms, run concurrently under nice -n 19):"
for i in "${!JOBS[@]}"; do
  job_args "${JOBS[$i]}"
  echo "  ${JOBS[$i]} cap=\$${CAPS[$i]} node scripts/v4-bench.mjs ${ARGS[*]}"
done

if (( GO == 0 )); then
  echo "dry run: nothing launched. Pass --go to start the full benchmark."
  exit 0
fi

OUT="reports/full/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
PIDS=()
fails=0
for i in "${!JOBS[@]}"; do
  name="${JOBS[$i]}"
  job_args "$name"
  ARGS+=("--global-cap-usd=${CAPS[$i]}" "--results=$OUT/$name.jsonl")
  env ${ENVP[@]+"${ENVP[@]}"} nice -n 19 node scripts/v4-bench.mjs "${ARGS[@]}" >"$OUT/$name.out" 2>&1 &
  PIDS+=("$!")
done

for pid in "${PIDS[@]}"; do
  wait "$pid" || fails=$((fails + 1))
done

# swebpro arms ran with V4_KEEP_IMAGES=1 (shared images), so images are removed here
docker images --format '{{.Repository}}:{{.Tag}}' | grep swe-bench_pro | xargs -r docker rmi || true
rm -rf ~/.cache/v4-swebpro/work/*
colima ssh -- sudo fstrim -a || true
df -h /System/Volumes/Data | tail -1

python3 - "$OUT" "${JOBS[@]}" <<'PY'
import json, os, sys
out = sys.argv[1]
for name in sys.argv[2:]:
    path = os.path.join(out, name + '.jsonl')
    rows = [json.loads(l) for l in open(path) if l.strip()] if os.path.exists(path) else []
    passes = sum(1 for r in rows if r.get('finalPass') is True)
    cost = sum(r['costUsd'] for r in rows if isinstance(r.get('costUsd'), (int, float)))
    print(f"{name}: rows={len(rows)} finalPass={passes} cost=${cost:.4f}")
PY

echo "done: $fails arm(s) exited nonzero; output in $OUT"
(( fails == 0 ))

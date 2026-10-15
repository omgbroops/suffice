#!/bin/bash
set -euo pipefail
root=/home/eric_qin/suffice-field-v1
runtime=/home/eric_qin/suffice-general-runtime
ready="$root/.suffice/remote-ready"
archive='/mnt/c/Users/Eric Qin/suffice-workspace-20261015.tar'
auth_staging='/mnt/c/Users/Eric Qin/suffice-field-auth-staging.json'
if [ "${1:-}" != worker ]; then
  mkdir -p "$ready"
  cp "$0" "$ready/bootstrap.sh"
  nohup taskset -c 0,1 nice -n 10 bash "$ready/bootstrap.sh" worker >"$ready/bootstrap.log" 2>&1 </dev/null &
  echo "BOOTSTRAP_PID=$!"
  exit 0
fi
exec >>"$ready/bootstrap.log" 2>&1
trap 'rc=$?; printf "{\"exitCode\":%s,\"stage\":\"bootstrap\"}\n" "$rc" >"$ready/bootstrap-exit.json"' EXIT
actual=$(sha256sum "$archive" | cut -d' ' -f1)
test "$actual" = b7c9ffa5ade7a3a27cdf0de2ac83412eebeb1cfe9da873a4bfebfad43b7c02b8
tar -xf "$archive" -C "$root"
mkdir -p "$root/.suffice/pi"
chmod 700 "$root/.suffice/pi"
if [ -f "$auth_staging" ]; then
  mv "$auth_staging" "$root/.suffice/pi/auth.json"
  chmod 600 "$root/.suffice/pi/auth.json"
fi
python3 - "$root" <<'PY'
import pathlib,json,hashlib,sys,uuid
r=pathlib.Path(sys.argv[1]);m=json.loads((r/'reports/general-v1/frozen-configuration.json').read_text())
bad=[p for p,h in m['inputs'].items() if hashlib.sha256((r/p).read_bytes()).hexdigest()!=h]
if bad:raise SystemExit('Frozen source mismatch: '+','.join(bad))
host=r/'.suffice/pi/host-id'
if not host.exists():host.write_text(str(uuid.uuid4()));host.chmod(0o600)
print(json.dumps({'frozenCoreInputs':len(m['inputs']),'allMatch':True,'hostIdPreservedOrCreated':True,'credentialPresent':(r/'.suffice/pi/auth.json').exists()}),flush=True)
PY
SUFFICE_RUNTIME_ROOT="$runtime" bash "$root/scripts/setup-general-runtime.sh" "$root"
if [ ! -e "$root/node_modules" ]; then ln -s "$runtime/app/node_modules" "$root/node_modules"; fi
mkdir -p "$runtime/app/.suffice/pi" "$runtime/app/.suffice/empty-agent"
for p in package.json package-lock.json src/runtime.mjs src/workspace.mjs src/symbol-navigation.mjs src/external-pi-observer.mjs src/general/tools.mjs src/general/agent.mjs src/general/entry.mjs tests/general-compatibility.mjs scripts/general-boundary.sh; do
  mkdir -p "$runtime/app/$(dirname "$p")"
  cp "$root/$p" "$runtime/app/$p"
done
"$runtime/bin/node" --version
"$runtime/bin/node" "$runtime/app/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js" --version
sha256sum "$runtime/bin/node" "$runtime/app/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js" "$runtime/app/package-lock.json" >"$ready/runtime-sha256.txt"
printf '{"installed":true,"frozenCoreInputsMatch":true,"runtime":"%s","workspace":"%s","setupAffinity":"0,1","setupNice":10}\n' "$runtime" "$root" >"$ready/bootstrap-ready.json"

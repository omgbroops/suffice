#!/bin/sh
set -eu
task_runtime=${SUFFICE_RUNTIME_ROOT:-/home/mohammed/suffice-general-runtime}
task_source=$1
mkdir -p "$task_runtime/app"
cd "$task_runtime"
if [ ! -x bin/node ]; then
 curl -fLsS https://nodejs.org/dist/v24.15.0/SHASUMS256.txt -o SHASUMS256.txt
 curl -fLsS https://nodejs.org/dist/v24.15.0/node-v24.15.0-linux-x64.tar.xz -o node.tar.xz
 grep ' node-v24.15.0-linux-x64.tar.xz$' SHASUMS256.txt | sed 's/node-v24.15.0-linux-x64.tar.xz/node.tar.xz/' | sha256sum -c -
 tar -xf node.tar.xz --strip-components=1
fi
export PATH="$task_runtime/bin:/usr/bin:/bin"
cp "$task_source/package.json" "$task_source/package-lock.json" "$task_runtime/app/"
cd "$task_runtime/app"
npm ci --ignore-scripts --no-audit --no-fund
npm install --global --prefix "$task_runtime" yarn@1.22.22 --ignore-scripts --no-audit --no-fund
node --version
yarn --version
bwrap --version

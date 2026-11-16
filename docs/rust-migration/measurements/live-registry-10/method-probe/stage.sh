#!/bin/sh
set -eu
here=$(cd "$(dirname "$0")" && pwd)
stage=$(mktemp -d /tmp/suffice-attribution-stage.XXXXXX)
git archive HEAD apps/desktop apps/desktop-bridge apps/desktop-rust/owned-process-hook.cjs apps/desktop-rust/start-bridge.mjs scripts packages package.json | tar -x -C "$stage"
cp -cR node_modules "$stage/node_modules"
cp -cR apps/desktop/dist "$stage/apps/desktop/dist"
cp -cR apps/desktop-bridge/native "$stage/apps/desktop-bridge/native"
mkdir -p "$stage/apps/desktop-rust/target/release"
cp -c apps/desktop-rust/target/release/suffice-desktop-rust "$stage/apps/desktop-rust/target/release/"
echo "$stage" > "$here/staging-root"

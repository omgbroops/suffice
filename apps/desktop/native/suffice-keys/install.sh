#!/bin/zsh
# Build + sign Suffice Keys into its fixed path. Same identity every build => macOS keeps the grants.
set -e
SRC=${0:A:h}; A="$HOME/Library/Application Support/Suffice/Suffice Keys.app"
mkdir -p "$A/Contents/MacOS"; cp "$SRC/Info.plist" "$A/Contents/Info.plist"
echo "let buildStamp = \"$(date +%Y%m%d%H%M%S)\"" > "$SRC/stamp.swift"
swiftc -O "$SRC/main.swift" "$SRC/stamp.swift" -o "$A/Contents/MacOS/SufficeKeys"
codesign --force --sign "Suffice Local Signing" --identifier ai.suffice.keys "$A"
codesign -d -r- "$A" 2>&1 | grep designated

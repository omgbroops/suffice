#!/bin/sh
# Build the accessibility helper next to its source (gitignored). Usage: build-ax-snapshot.sh [out]
set -e
SRC=$(cd "$(dirname "$0")" && pwd)
swiftc -O "$SRC/ax-snapshot.swift" -o "${1:-$SRC/ax-snapshot}"

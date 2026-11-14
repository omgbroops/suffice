# ADR 0004: Test desktop changes on native Windows and macOS runners

Status: proposed
Date: 2026-11-14
Author: Codex

## Context
Native Windows passes did not expose macOS path and Electron launch failures.
## Decision
Run frozen Bun installs, builds and account-free tests on both hosted platforms,
with pinned actions, bounded runtime and retained failure logs. No packaging.
## Consequences
Private-repository runner minutes are consumed. Jobs have read-only repository
permissions, no provider secrets and no dependency on another agent being online.
## How we check it
Inspect both hosted job results and logs, including failures; local YAML checks
alone do not prove either runner can launch Electron.

# ADR 0008: Normalize native terminal setup and resize bursts

Status: proposed
Date: 2026-11-14
Author: Codex

## Context
Native CI exposed node-pty 1.1.0's missing macOS helper execute bits and duplicated
Windows scrollback during rapid resize. Inactive-tab changes also remounted the
active terminal unnecessarily, disturbing its input focus. Fixture diagnostics
also showed all key writes reaching Windows, followed by `rintf` instead of
`printf` during a redraw after another PTY closed. Suppressing focus reports
passed locally but did not resolve the hosted failure; that workaround is removed.

## Decision
During desktop setup, validate the known host spawn-helper files and add only
missing execute bits on macOS. Do not recurse through installed dependencies.
Coalesce ResizeObserver bursts for 75ms before fitting xterm and notifying the
PTY. Keep the active terminal DOM mounted when another tab closes. Buffer early Windows input
for a 300ms settling interval after focus, resize, startup or another PTY closing,
then send it once in order. Preserve all input, including VT focus reports. Unix
input does not have this settling interval. Closing/exiting discards unsent input.

## Consequences
The terminal grid settles shortly after a resize burst. No output is removed or
deduplicated heuristically. The setup workaround can be removed after adopting a
verified upstream release; no installer packaging is introduced. Early Windows
keystrokes can echo up to 300ms later around these lifecycle changes; ongoing
typing is immediate. A bundled-ConPTY/DA-response experiment did not fix the input
reordering and was not retained.

## How we check it
Real native PTYs must launch on each platform, accept input after an inactive tab
closes, exit normally, and retain all 90 unique fixture lines through ordinary and
rapid resizes. Keep the duplicate-output assertion strict.

Reference: [node-pty issue 919](https://github.com/microsoft/node-pty/issues/919).

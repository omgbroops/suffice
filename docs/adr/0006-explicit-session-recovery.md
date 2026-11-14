# ADR 0006: Recover transport without replaying interrupted actions

Status: proposed
Date: 2026-11-14
Author: Codex

## Context
An exited utility worker currently leaves the app transport permanently absent.
Interruptions can also leave a final partial JSONL record or a pending PTY start.
## Decision
Reject outstanding requests on exit and restart on a subsequent explicit request.
Never replay a failed prompt/tool. Recover saved complete transcript records and
preserve source bytes; dispose terminal processes at application shutdown.
## Consequences
Users can reopen their saved chat after a worker failure. Interrupted external
actions still have unknown delivery and require inspection. Whole-app force-kill
or power-loss cleanup is not equivalent to graceful shutdown.
## How we check it
Kill an isolated worker during a controlled request, verify rejection, then open
a saved transcript through a fresh worker. Exercise incomplete journal data and
terminal creation/shutdown races without paid model requests.

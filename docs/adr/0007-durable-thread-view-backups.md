# ADR 0007: Back up thread drafts outside browser storage

Status: proposed
Date: 2026-11-14
Author: Codex

## Context
A forced process-tree exit 500ms after typing preserved saved transcripts but
lost the unsent draft. localStorage acknowledgement does not imply a disk flush.
## Decision
Keep localStorage for immediate rendering and atomically back up thread view
states through validated Electron IPC into the application's profile directory.
Each write flushes a temporary file before rename. Restore a newer native backup
before mounting chats. Bound keys, state sizes and loaded file count; never accept
renderer filesystem paths. Keep source transcripts and credentials separate.
## Consequences
Normal typing remains asynchronous; only completed native writes are recoverable.
Disk-full errors and power loss are not a durability guarantee. The existing
180ms draft debounce remains, so input lost before that interval is not promised.
## How we check it
Atomic backup/reload and key validation tests, plus forced process-tree termination
after a draft write and subsequent recovery of the saved chat and unsent draft.

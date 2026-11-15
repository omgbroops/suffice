# 0025: Recoverable live thread presentation

The session router owns the active run independently of a renderer window. Retain the pre-run transcript, current prompt, sequenced live display events and pending approvals until the run finishes. Coalesce adjacent text/reasoning chunks. Return this snapshot when opening a live thread rather than an empty transcript. Emit an explicit completion event because a renderer reload loses the original IPC promise.

The renderer restores the selected thread, replays its snapshot, reconciles newer events by sequence and restores only currently pending approvals. Keep drafts in existing view storage. Reconnecting never starts another run, replays tools or approves a request. Discard live replay state after completion; saved engine history remains authoritative for idle transcripts.

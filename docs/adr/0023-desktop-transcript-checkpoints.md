# 0023: Desktop transcript checkpoints

Use engine compaction lifecycle events for live status and engine session custom entries for compact metadata. Display compaction and user interruptions as quiet fading dividers, preserving partial assistant text. Return a successful IPC envelope with `interrupted: true` for explicit user stops; preserve actual failures as errors. Legacy cancellation errors are recognized only by their specific cancellation messages.

Saved transcript presentation uses the canonical session projection, with compaction summaries replaced by checkpoints and custom interruption entries inserted in order. It never rewrites session history or supplies display-only checkpoints to the model. Persist automatic/manual reason against the actual compaction entry ID. Unknown historical reasons use the neutral Context compacted label.

This avoids confusing a deliberate stop with a provider failure and keeps live/reopened conversations consistent. Focused tests exercise worker events, interruption transport, projection and real Electron UI in both themes.

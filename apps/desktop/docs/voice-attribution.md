# Voice engine attribution

The Suffice voice engine is modelled on the voice engine of OpenAI Codex.

- Source: https://github.com/openai/codex, commit 540eb31
- Licence: Apache License 2.0
- Status: adapted and modified. Nothing was copied as code; Rust behaviour was re-implemented in JavaScript.

## What was adapted

Prompt text (electron/voice-prompts.cjs)
- `codex-rs/prompts/templates/realtime/backend_prompt.md`: working rules (delegate all work, `[USER]` and `[BACKEND]` prefixes, do not read out tables, diffs or code, progress only when brief and useful, task-level preferences). Codex persona, branding and user-name lines were removed; the product is named Suffice.
- `realtime_start.md` and `realtime_end.md`: shortened into the start and end notices.

Tool design (electron/voice-session.cjs), from `codex-api/src/endpoint/realtime_websocket/methods_v2.rs`
- Two tools only: `background_agent({prompt})` (starts a task if idle, steers it if working) and `remain_silent()`.
- Session settings: server VAD with 500 ms silence, interrupt and create response on, input transcription, near-field noise reduction.

Engine behaviours (src/voice/provider-realtime.js, conversation.js), from `core/src/realtime_conversation.rs` and `tui/src/chatwidget/realtime.rs`
- One response request at a time, deferred until the active response finishes, also on the "already has an active response" error.
- Barge-in: stop playback, send `conversation.item.truncate` with the milliseconds played.
- `[BACKEND]` progress messages without a response request, head and tail truncation with an "output truncated" marker.
- Tool output on completion ("Background agent finished...") and on steering, then a response request.
- End reasons: requested, transport_closed, error. Typing supersedes spoken output. A short "heard" state after an interruption and a hold on "speaking".

## Upstream NOTICE

OpenAI Codex
Copyright 2025 OpenAI

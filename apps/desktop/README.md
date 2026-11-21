# Suffice desktop

An Electron app on top of the same harness the CLI uses (`@suffice/harness`). It shares `~/.suffice` (or `SUFFICE_HOME`) with the CLI: sign-in, sessions, recent projects and the model catalog.

```sh
bun install          # from the repository root
bun run desktop      # Vite dev server + Electron
bun run desktop:build && bun run desktop:start   # built renderer
bun run test:desktop
```

## Layout

- `electron/main.mjs`: the window, and IPC from the renderer to the host.
- `electron/preload.cjs`: a small allowlisted bridge exposed as `window.suffice`.
- `electron/host/host.mjs`: the harness side, with no Electron imports. It covers ChatGPT sign-in (`runtime.login('openai', 'oauth')`), the model catalog, projects, threads (the harness's session files), runs and approvals.
- `shared/transcript.mjs`: one reducer that folds run events into a transcript. The renderer uses it to draw live runs; the host uses it to save `~/.suffice/desktop/transcripts/*.json` beside each session, so reopened threads look the same as they did live. Sessions with no saved transcript (CLI sessions, say) are rebuilt from the harness's message history.
- `src/`: the React renderer.

## How a run flows

1. The renderer calls `run:start` with the thread, project, prompt, model, effort and fast mode.
2. The host creates (or reuses) a `createSufficeSession` for that thread. It opens the existing session file when the thread has one.
3. Assistant text and thinking stream from `session.subscribe` (`message_update`). Tool calls, including the nested calls inside codemode, come from a harness extension listening to `tool_call` and `tool_result`.
4. With Bypass permissions off, the harness's `onApproval` hook becomes an Allow / Deny card in the thread. The codemode wrapper and session naming never ask.
5. Each event is sent to the renderer as `thread:event` and folded into the saved transcript.

Settings the desktop owns (selected project, model, effort per model, fast mode per model, approval mode) live in `~/.suffice/desktop/settings.json`.

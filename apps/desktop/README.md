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

### Efficient and Fast

These follow the harness's `/efficient` and `/fast` strategies but run in the host (`strategyRun` in `electron/host/host.mjs`), so every attempt is visible:

- Each attempt is a fresh in-memory harness session on a workspace copy (no `.git`, `node_modules` linked). Its events arrive as `attempt` events and fold into that attempt's own sub-transcript, which the thread opens as a sub-page.
- Fast races three low-effort attempts of the selected model (the hints in `RACE_ATTEMPTS`); the first to finish with changes wins and the rest are aborted. Efficient gives the cheap model two rounds, then escalates to the lead model on a fresh copy.
- Unless the approval mode is Full access, applying the winner's changes is an `apply_changes` approval. The changes are applied with the harness's `applyPatch`.
- The turn is recorded in the main session (the prompt, plus a `desktop-strategy` custom message with the outcome and the winner's report), so later Balanced turns know what happened.

Settings the desktop owns (selected project, model, effort per model, fast mode per model, approval mode) live in `~/.suffice/desktop/settings.json`.

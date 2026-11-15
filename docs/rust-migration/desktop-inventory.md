# Desktop migration inventory and baseline workload

Current desktop is an Electron host (`apps/desktop/electron/main.cjs`) and Vite renderer (`apps/desktop/src`) with the shared JS harness in an Electron utility process. The isolated preload (`electron/preload.cjs`) exposes a narrow bridge; main-frame validation, restricted navigation and HTTPS-only external links are part of the existing boundary. The harness shares the CLI's sessions and credentials in `~/.suffice` by default. Electron profile data is stored separately under the application data directory. A migration must account for compatibility with both stores and must not expose credentials to the renderer.

| Area | Current implementation | Existing verification | Compatibility obligations |
| --- | --- | --- | --- |
| Chat and presentation | `src/desktop.js`, `threads-ui.js`, `message-*`, `approvals.js`, `backgrounds/` | `ui-behaviors`, `message-presentation`, `approvals-ui`, `background` | Composer, streamed events, model and effort selection, markdown, code, tools, approvals, themes, search and navigation. |
| Sessions and projects | `electron/threads.mjs`, `thread-router.mjs`, `worker.mjs`, `projects.cjs`, `fork-thread.mjs`, `move-thread.mjs` | `threads`, `thread-router`, `fork-thread`, `concurrent-threads`, `recovery`, `background` | Existing session files and path-derived IDs, foreground and background runs, abort, steer, fork, move, delete, and recovery. |
| Settings, authentication and data | `electron/settings-store.mjs`, `view-state-store.cjs`, `provider-settings.mjs`, `resources.mjs`, `settings-data-actions.mjs` | `settings`, `view-state`, `provider-settings`, `resources`, `oauth-page-branding` | Shared credentials, provider login, drafts and per-thread views, resource settings, export, retention and trash behavior. |
| Workspace and Git | `electron/workspace-files.cjs`, `branches.cjs`, `chat-changes.mjs`, `chat-git.mjs`; panel components | `workspace-files`, `diff-view`, `panel`, `chat-changes` | Root confinement, file preview, changes/diffs, branch coordination and chat-scoped change summaries. |
| Attachments | `electron/attachments.cjs`, `src/attachments.js` | `attachments`, `composer` | 20 files and 20 MB total, image input, clipboard handling, sanitized local copies and retention policy. |
| Terminal | `electron/terminals.cjs`, `src/terminal-view.js` | `terminal` | Thread-scoped PTYs, Windows ConPTY, shell selection, resizing, bounded scrollback, sequencing and shutdown. |
| Native host | `electron/window-chrome.cjs`, `windows-app-details.cjs`, `main.cjs` | `electron`, `native-hit-test`, `windows-taskbar-details`, `desktop-profile` | Window behavior, project windows, taskbar identity, dialogs, clipboard, notifications, startup and platform-specific behavior. |
| Distribution | `scripts/desktop/{stage,package,smoke,verify}.mjs` | `bun run desktop:smoke` | Current preview packaging targets Windows x64 NSIS and macOS arm64 DMG; signing and notarization are not configured. |

Root commands include `bun run desktop:build` and `bun run test:desktop`. `node apps/desktop/test/live.mjs` is a separate provider-using test and is excluded from this measurement.

## Reproducible offline measurement

Build the baseline checkout and install its dependencies beforehand. From any directory with Node available:

```powershell
node scripts/rust-migration/measure-desktop.mjs C:\path\to\baseline C:\path\to\results\desktop-baseline.json C:\path\to\unpacked\Suffice.exe
```

The harness resolves Playwright from that checkout. The optional third argument selects an installed or unpacked packaged executable and verifies `app.isPackaged`; without it the harness launches the checkout with its Electron dependency and verifies an unpackaged app. A production renderer build alone is not a packaged application. It creates a temporary isolated home, project and profile, with 30 synthetic JSONL threads including one 1,000-message transcript. It sets `PI_OFFLINE=1`, never submits a model prompt, and removes `ELECTRON_RUN_AS_NODE`. Five launches are serial: the first uses a fresh profile and later launches reuse it. This is not an OS-cold benchmark: filesystem caches are not flushed. Each sample records launch to visible composer and 30 thread rows, click to the final transcript message, terminal create/write/marker/close, shutdown, errors, and Windows CIM process-tree snapshots at idle and after transcript rendering. Working set and private bytes are instantaneous process sums. Idle CPU core-percent derives from matching PID cumulative CPU time across two snapshots approximately two seconds apart; 100% means one fully occupied core. Output retains all samples, process records and temporary paths; treat it as potentially sensitive. The temporary sandbox is retained for audit and can be deleted after inspection.

Process-tree collection and observed-PID cleanup checking are Windows-only. Snapshots race short-lived processes, cannot prove no unobserved descendants survive, and PID reuse may produce false positives. Idle and active snapshots are distinct time points, not continuous peaks; no memory peak or energy claim is supported. The terminal measurement uses the exposed IPC bridge and marker event, not terminal UI rendering. Process cleanup uses a ten-second graceful shutdown deadline. Errors produce nonzero exit and partial output; do not aggregate incomplete samples as successful runs.

| Workload or metric | Coverage in this harness |
| --- | --- |
| Fresh-profile and warm-profile startup | Measured; no OS cache flush. |
| 30 session listing and 1,000-message transcript | Measured on deterministic fixtures; no large real-world content, images or tool events. |
| Idle and post-transcript process tree | Windows snapshots only; idle CPU uses matching PID deltas, with no peak or energy. |
| PTY round trip | IPC create, marker output and close; no xterm rendering or interactive typing benchmark. |
| Model inference, authentication and network | Excluded; no provider calls. |
| Streaming, concurrent runs, recovery, approvals | Not measured; existing tests cover selected correctness cases. |
| Packaging size, installer, signing, startup after installation | Not measured. |
| macOS process tree, platform UI and performance | Not measured. |
| File browsing, diff rendering, attachments, settings and search latency | Not measured. |

A useful first Rust experiment is a separate read-only native host that lists the same projects and sessions and opens the saved transcript while leaving the JS harness authoritative. Compare the same fixtures, launch boundary, platform, process-tree metrics and sample counts; retain the current security boundary and avoid claiming feature parity from this narrow slice.



The initial packaged baseline in measurements/desktop-baseline.json ran while NSIS compression was active at the start, so resource contention is possible. It is exploratory evidence, not a matched acceptance comparison.

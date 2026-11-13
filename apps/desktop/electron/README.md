# Desktop backend

The Electron main process. It creates the window, owns the harness process, and answers the renderer over IPC. The renderer is in `../src` and reaches this code only through `preload.cjs`.

## Modules

| File | Owns | IPC channels (`suffice:`) |
|---|---|---|
| `main.cjs` | Window, session permissions, navigation guards, wiring, shutdown | `window`, `abort`, `reset`, `status`, `models`, `usage` |
| `ipc.cjs` | `handle()`: rejects calls not from the app's own page in the main frame | all |
| `harness.cjs` | Viewed-session worker: requests, events, https-only login URL, restart with backoff | `login`, `logout`, `login-input`, `login-cancel`, `login-open`, `run`, `abort` |
| `background-tasks.cjs` | One worker per background task | `run-background` |
| `projects.cjs` | Saved project list, branch lookup | `projects`, `select-project`, `project` |
| `threads.mjs`, `worker.mjs` | Saved sessions and thread metadata (run inside the worker) | `threads`, `thread` |
| `github.cjs` | Read-only `gh` and git views, 60 s cache | `git-info`, `issues`, `prs`, `github-list`, `github-detail`, `branch-prs`, `git-branches`, `git-log`, `open-github` |
| `automations.cjs` | Scheduled prompts | `automations`, `automation-save`, `automation-delete`, `automation-toggle`, `automation-run-now` |
| `composer-ipc.cjs` | Worktree creation, offline dictation | `worktree-create`, `stt-available`, `transcribe` |
| `attachments.cjs` | Attachment files for a task, clipboard files | `clipboard-files` |
| `account-info.cjs` | Name, email and plan for the user menu; 30-day usage totals from saved sessions | `account-info` |
| `workspace-files.cjs` | File list, file read, changes, diff for the selected project | `files`, `file`, `changes`, `diff` |
| `git.cjs` | The only place git and gh are spawned | none |
| `paths.cjs` | Data root (`SUFFICE_HOME` or `~/.suffice`) | none |
| `json-store.cjs` | JSON read and write for every state file | none |
| `ttl-cache.cjs` | Promise cache with expiry | none |
| `busy.cjs` | One counter for foreground and background work | none |
| `known-paths.cjs` | Saved project paths and known thread folders | none |

Events go to the renderer on `suffice:event`.

## Trust boundary

The renderer is treated as untrusted. Folders on disk are treated as hostile.

| Input from the renderer | Check |
|---|---|
| Any call | Sender is the main frame and its URL is the app's own page, else `Untrusted frame` |
| Project folder for git, files, tasks | The main process picks it (folder dialog, saved project id, saved thread). The renderer never passes a path for these |
| `branch-prs` root | Absolute path that is a saved project or a folder of a thread already listed |
| Automation `projectPath` | Absolute, existing folder, saved project. Checked at save and again at each run |
| `github-list`, `github-detail` | Kind, state and number checked against allowlists; limit clamped to 1-100 |
| `open-github` | `github.com` https URLs only |
| `login-input` | String up to 10000 characters |
| `run`, `run-background` | Prompt up to 1 000 000 characters, effort from a fixed list, model and provider both strings |
| `window` | `minimize`, `maximize`, `close` |

| Boundary | Rule |
|---|---|
| Git | Every call runs with `core.fsmonitor=false`, `core.hooksPath=/dev/null`, `--no-optional-locks`; `GIT_DIR`, `GIT_WORK_TREE` and `GIT_CONFIG*` are removed from the environment; values from the renderer or repo go after `--` |
| Permissions | Only the microphone, only for the app's own page |
| Navigation | Window open denied; navigation, redirects and frame navigation cancelled unless the target is the app page |
| Page | CSP meta in `../index.html`: own scripts plus one hashed inline script, no network, no frames. If the inline theme script changes, update its hash |
| Instances | Single-instance lock; a second launch exits |
| Busy | Project switch, thread switch, logout, worktree creation and automations refuse while any task runs, foreground or background. Worktree creation checks again just before the reset |

## State on disk

| File | Location | Written by | Write strategy |
|---|---|---|---|
| `projects.json` | Electron user data | `projects.cjs` | tmp file, rename; file 0600, directory 0700 |
| `automations.json` | data root | `automations.cjs` | same |
| `thread-meta.json` | data root | `threads.mjs` | same; writes are serialized and re-read first |
| `sessions/` | data root | harness | append-only transcripts, read-only here |
| `attachments/<id>/` | Electron user data | `attachments.cjs` | one directory per task |
| `worktrees/` | data root | `composer-ipc.cjs` | `git worktree add` |

A state file that does not parse is renamed to `<file>.bad` and the store starts empty. It is never overwritten.

## Tests

From the repo root, one at a time:

```
node --test --test-concurrency=1 apps/desktop/test/*.test.mjs
```

`apps/desktop/test/backend.test.mjs` covers the git runner, path checks, the JSON store, the busy counter, the worktree re-check and the cache. The walks need a build first (`cd apps/desktop && npx vite build`):

```
node apps/desktop/test/<walk>.mjs <shots-dir> $HOME/suffice-desktop
```

Walks: `neon-walk`, `neon-threads-explore-walk`, `neon-github-walk`, `neon-auto-walk`, `neon-composer-walk`. They run Electron hidden against a fake harness and read GitHub only.

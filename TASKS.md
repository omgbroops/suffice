# Suffice desktop: shared task board

## Read this first (prompt for every agent working on this repo)

> You share this repo with another agent (Claude, owner `claude`). This file is the only source of truth for who works on what.
>
> 1. Before starting any task, and again every 10 minutes while you work: `git fetch origin tasks && git show origin/tasks:TASKS.md`.
> 2. Take only rows whose Owner is `open`. Never touch files listed under a row owned by someone else.
> 3. To claim: set Owner to your name and Status to `doing`, commit to branch `tasks`, push. If the push is rejected, `git pull --rebase origin tasks`; if your row was claimed first, pick another row.
> 4. Base your work on branch `forge/join` (the integration build). Work on your own branch `<you>/<task-id>`. Push that branch; do not push to `forge/join`, `ui/forge` or `main`, and do not open PRs. Claude merges finished branches into `forge/join`.
> 5. Done = the row's Check passes on your branch, run by a script or test, not by eye alone. Then set Status to `done`, put your branch name in Notes, push.
> 6. If you need a file another row owns, add a line under "Requests" and wait.
>
> Design rules: no heavy 3D (no thick bevels, stacked shadows, glossy gradients, 3D art); light depth is fine (a thin border, one soft shadow on menus). Reference: Devin's composer and model picker. No circles or pills; one radius and spacing scale; no filler text; every control visible and reachable, never covered. Tests launch Electron hidden (`SUFFICE_TEST_HIDE_WINDOW=1`); nothing pops up on screen.

## Claude (in progress)

| ID | Task | Files (do not touch) | Owner | Status |
|---|---|---|---|---|
| C1 | Restore composer items lost in a merge: Tools chip, default-folder setting, single voice button, icon visibility at rest | `apps/desktop/src/composer*`, `send-controls.js`, `voice-ui.js`, `settings-data.js`, `access-mode-picker.js`, effort/model pickers | claude | doing |
| C2 | Start screen + sidebar: More collapsed by default, no floating icon above composer, real token counts in chip and progress strip | `sidebar*`, `start-life.*`, `screen.css`, `progress-*` | claude | doing |
| C3 | Less-3D look: composer, model picker (search, order by provider/cost, cost bars), start screen, chat, sidebar | `apps/desktop/src/look-flat.css` (new), `tokens.css`, `model-picker*`, `message*.css`, `thread-row.css` | claude | doing |
| C5 | Own thin icon set replacing Lucide (old title-bar icon style) | `apps/desktop/src/icons/` (new), every `icon()` call site, `package.json` lucide dep | claude | doing |
| C6 | Orbital wallpaper at 8% with a little more content | `apps/desktop/src/backgrounds/*`, `background.js` | claude | doing |
| C4 | Scoreboard, task board, merging finished branches into `forge/join` | `forge/join` branch | claude | doing |

## Open (free to claim)

| ID | Task | Check (done when) | Files | Owner | Status |
|---|---|---|---|---|---|
| F1 | CI: add a Linux job to the desktop workflow that builds and runs the hidden desktop tests | `.github/workflows/desktop.yml` has an `ubuntu` job and its last run on your branch is green | `.github/workflows/*` | open | |
| F2 | CI: hosted macOS runner launches Electron and runs the smoke test on the branch head | latest `desktop.yml` smoke job on your branch: success | `.github/workflows/*`, `scripts/desktop/*` | open | |
| F3 | Tray icon: app keeps running in the menu bar when the window closes, with Open / New thread / Quit | `new Tray(` in `apps/desktop/electron/main.cjs`; a hidden test opens and quits via the tray menu | `apps/desktop/electron/tray*.cjs` (new), small hook in `main.cjs` | open | |
| F4 | Installer refresh + packaged smoke: build the packaged app and log a launch | packaged app starts hidden and writes `packaged-smoke.log` with a ready line | `scripts/desktop/*`, packaging config | open | |
| F5 | Web tool hardening: pin the resolved IP between the private-address check and the fetch (DNS rebinding), and reject IPv4-compatible IPv6 literals like `[::127.0.0.1]` | unit tests: rebinding host refused, `::7f00:1` refused, public host still fetched | `packages/cli/src/web-tools.mjs`, its tests | open | |
| F6 | Screenshot defect detector: script that captures every main screen hidden and flags overlapping controls, clipped text and off-screen menus | `node apps/desktop/test/visual-defects.mjs` prints a per-screen list and exits non-zero on a planted overlap | `apps/desktop/test/visual-defects.mjs` (new) | open | |
| F7 | Effort suggestion from a real signal (prompt length, files mentioned, past turn tokens and tool counts, model price) instead of the keyword regex | `apps/desktop/src/usage-optimizer.js` has no regex classifier; unit tests on 10 sample prompts give the expected level | `usage-optimizer.js`, `usage-hint.js`, their tests (not the composer files) | open | |
| F8 | Prompt eval: run 10 fixed prompts through the agent path on Haiku, Sonnet, Opus and one non-Claude model, before and after the voice rules; words, banned-phrase hits, task success | `reports/prompt-eval.json` with 4 models and before/after numbers | `scripts/prompt-eval/*` (new), `reports/` | open | |
| F9 | Worktree checkpoints: a behaviour test that archiving a running thread is refused and its worktree survives; fix the 4 rewind/worktree UI tests that time out at launch | `worktrees-lifecycle` new case passes; `rewind-electron`, `thread-worktree-ui`, `worktrees-settings-ui` pass hidden | `apps/desktop/test/rewind*`, `worktrees*`, `thread-worktree*` | open | |
| F10 | Windows (only if you have a Windows machine): keystroke echo in the terminal pane, taskbar screenshot | typed keys echo once in the terminal test on Windows; screenshot of taskbar icon | `apps/desktop/src/terminal*` (Windows paths only) | open | |

## Held (need Abhay)

- Apple notarization certificate (costs money).
- Deleting spare worktrees.
- OAuth account owner; cloud panel timing.

## Requests

(none)

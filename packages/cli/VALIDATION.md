# CLI alpha.1 validation — 2026-10-17

## Alpha.3 — routing-only integration

The routing release uses the frozen v2 first-task classifier to choose Luna High or Sol Low through Pi's native input/model events. It retains the existing prompt, codemode, navigation, tools, append-only history and cumulative per-task usage limits. `/routing auto|off`, manual-model/effort overrides, conservative complex-context retention and queued-input handling adapt the single-task policy to interactive conversations. No packet executor or benchmark-specific test/repair gate is included.

Fourteen automated CLI tests passed on Windows before publication was requested. They cover existing repository tools and project/session isolation plus routing defaults and overrides, first-task classification, short follow-ups, manual controls, deferred steering, restored history, images and failure handling. A real Pi dispatch check used deliberately disabled authentication and confirmed that failed routing made zero model calls and no provider request. No further tests, builds or benchmarks were run for the commit/push operation.

Live routed-provider calls, macOS hardware and a comparative benchmark of this interactive port remain unverified. The separately frozen v2 development experiment is not a product-performance certification. Original alpha.1/alpha.2 records below remain historical; no frozen benchmark artifact was changed.

## Alpha.2 follow-up — simpler launch and project selection

The clone now exposes its `suffice` executable directly: `npm ci` once, then `npx suffice`. The root bin entry and package-lock metadata were updated on the CLI branch; frozen experiment worktrees are untouched. A clean temporary clone layout installed all 120 dependencies successfully with ordinary `npm ci`; `npx suffice doctor` then passed without package-selection flags. `npx --offline suffice --version` also resolved the local CLI rather than an npm registry package.

Interactive launches now use Pi 1.2.0's `InteractiveMode` and `AgentSessionRuntime` directly, with Suffice's existing codemode/tools and prompt. A small extension supplies the Suffice header, usage display, and `/project`/`/cd` commands. Native login, model selection, settings, session switching and input/tool rendering are inherited. Project selection uses Pi's own selector/input dialogs and its session-switch API with a valid empty session header. Each runtime rebuilds repository tools and loads only its target project's instructions.

Windows terminal checks covered the native UI launch, selecting another directory through `/project`, and native quit. Automated checks cover path handling, recent projects, a valid Pi session target, invalid-path rejection, and distinct repository instructions/history with zero inference. Root `npx suffice` and fresh dependency installation were verified without the previous package flags. Helper state is directed to the selected Suffice home and embedded-engine update advertisements are disabled. Some upstream Pi wording and resume hints remain; use `npx suffice --continue` from the checkout or the native `/resume` picker.

macOS remains unverified on physical hardware. The original alpha.1 live-model receipts below remain unchanged; this UI follow-up does not claim a new benchmark result.

A Sonion Linux smoke run also called the session directly, as the native UI does, instead of going through the print wrapper. Codemode executed the verification command successfully; two responses cost $0.0042868 API-equivalent with complete usage. Its events include the native lifecycle task-end record. This checks that usage accounting remains active when Pi owns the input loop.

Final alpha.2: six automated tests pass. The native selector and directory-input dialog were also exercised through an actual terminal before successfully switching projects. The alpha.2 tarball contains thirteen allowlisted files, is 28,742 bytes compressed, and has SHA-256 `eaae7533b14065f0eb799a77a04cba7db3f76b9ff6b5c8027489a598304752b1`. Source, documentation and metadata decode as UTF-8.

## Original alpha.1 validation

This release packages a general-v1-derived agent for interactive use. No frozen benchmark source, configuration or artifact was modified. The main research launcher remains `npm run pi`; the new product is `packages/cli/bin/suffice.mjs`.

Verified:

- Three automated tests pass: launch outside the checkout and reject invalid options; edit across packages and root/dot configurations, navigate JS/TS and run native project verification; reject directory-link escapes for file operations.
- The packed tarball launches through `npx --package=<absolute tarball> suffice --version` on Windows, from outside the repository. Its installed dependency graph also passes `suffice doctor`, including Git Bash execution, without a VM.
- Windows terminal interaction starts with Suffice branding. `/effort xhigh`, `/new`, and `/exit` worked without invoking a model.
- On Sonion Linux, the packaged source completed a live Sol-low smoke repair using codemode, `symbols`, `symbol_read`, native editing and Bash verification: four responses, $0.0073408 API-equivalent. A subsequent `--continue` task recalled the previous work and reran its test: two responses, $0.002458. The parent also ran the test independently and it passed. These are smoke tests, not benchmark evidence.
- Both live tasks have complete assistant usage records plus provider usage events. Raw receipts were copied back to this checkout's ignored `.suffice/cli-smoke/receipts/`.
- A local live attempt failed before inference completion because the old research OAuth refresh returned `invalid_grant`. Its failed response/unknown cost remains in the local ignored event log. This is an authentication failure; it was not counted as a successful smoke test. New users must perform their own login.
- The tarball contains exactly eleven allowlisted files: executable entrypoint, six runtime modules, package metadata, shrinkwrap, README and third-party notices. No credentials, transcripts, benchmark tasks, graders, reference patches or research reports are included. The dependency shrinkwrap contains registry URLs/integrities and no local file references. Dependencies are downloaded separately by npm.

Artifact: `.suffice/releases/bycontinuity-suffice-0.1.0-alpha.1.tgz`

SHA-256: `439a4d95eaa344d6a7249c8e5b1f118410633898cba5d0666d43ad288c079ab4`

Compressed package size: 26,864 bytes, excluding dependency downloads.

Unverified: a fresh interactive OAuth login on a friend's machine, macOS execution, unattended long-running product use, and any performance equivalence to the frozen Linux benchmark. This alpha intentionally has no OS isolation: Bash runs with the user's permissions. It retains Pi attribution and license notices. It is not published to npm.

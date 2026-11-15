# Edge-to-edge chat integration — 2026-11-15

The user requested `experiment/edge-to-edge-chat` on the active Rust migration
branch. Upstream was fetched at `91646057d4a44b628aa9c164f374cadfb096328d`.
The local migration/session-store work was preserved in `801387e` before merging
the two histories. Migration-only crates, native hosts and historical evidence
were retained; the upstream branch did not replace the migration tree.

Evidence: [`measurements/edge-integration-03/summary.json`](measurements/edge-integration-03/summary.json),
with raw successes/failures, review, packaged screenshot, source receipts and
SHA-256 hashes in the same directory.

## Imported behavior

- Edge-to-edge shared wallpaper/glass chrome, content transitions, persisted
  sidebar presentation, native macOS caption layout and dedicated macOS icons.
- Queue/steer selection, editing queued prompts, remembered per-thread
  access modes and working-send preferences, per-turn changes and grouped tools.
- Local Markdown file links, native application choices, credential-free HTTP,
  HTTPS and mailto routing, editor preferences and custom accent previews.
- Suffice-specific resource discovery/isolation and deferred web research through
  pinned `pi-web-access` 0.47.0. No live inference or web research was exercised.
- Installer changes and explicit Actions dispatch behavior, with migration Rust
  toolchain checks and native addon build/staging/smoke checks retained.

The upstream policy makes the selected project a working directory for explicit
task-directed file access, rather than a general filesystem boundary. The Rust
traversal still supplies project-tree navigation through its JavaScript adapter
and fallback. The retained **session-store** capability remains independently
confined; this policy change does not authorize arbitrary session paths.

## Rust compatibility seams

The Wry host reads the checkout's actual preload and renderer. Its injected
preload now receives the compiled OS platform. The bridge implements the async
`app.getFileIcon` protocol so upstream application choices return normally when
the Rust host rejects unsupported icon extraction. The existing upstream nullable
icon fallback is used; no fake icon or native extraction parity is claimed.

The Rust external URL validator now accepts the same credential-free HTTP,
HTTPS and mailto schemes as the imported Electron policy, while rejecting other
schemes and URL userinfo. Tests exercise validation without opening external apps.
Real bridge fixtures cover a saved thread's file choices, a simulated icon reply,
unsupported icon replies, PTY output, unchanged session bytes and shutdown.

Node/Pi still own the agent runtime and the imported queue/resource/tool behavior.
The eframe viewer remains a read-only candidate and does not gain messaging,
settings, native glass or file-opener parity from this merge. The Wry product
experiment remains Windows-gated by process containment; macOS compilation and
unit tests do not establish a running macOS Wry product.

## Merge corrections

Retained deferred Pi SDK initialization and cancellation guards, Rust native
traversal/fallback, session capabilities, scroll-follow layout-clamp/upward-intent
handling, and the macOS clipboard/wallpaper qualification corrections.

Integration checks exposed actual shared-chrome regressions: toggling wallpaper
visibility had lost its fade, and dialogs retained the old material. Source
corrections restore the fade (including reduced-motion behavior) and shared
composer/dialog material. Exact persisted state, copy/deletion behavior and
dialog material assertions are retained.

Chat Git receipt identity now compares canonical directory identities, so macOS
`/var` and `/private/var` spellings do not hide a moved chat's provenance or create
a false project change. Receipts retain their original stored path spellings and
prior-context history. Tests retain the logical-path move case and a direct
directory-alias case.

Other test corrections follow actual native macOS controls, shared-glass tokens,
the new editor gap and activity-group behavior, and canonical fixture paths.
Earlier failing exploratory runs remain evidence, not final qualification.

The final run also fixed two test synchronization errors: the branch picker waits
for startup to register IPC before installing its fixture handler, and composer
color checks wait for the restored fade to reach its exact solid target. The
assertions were retained rather than bypassing these states.

## Verified integration

Node 24.22.2, Bun 1.4.4 and Rust 1.92.0 on macOS arm64:

| Check | Observed result |
| --- | --- |
| Frozen dependency install and renderer build | Passed |
| Full core/CLI suite | 127 passed, 0 failed, 3 skips |
| Full serialized desktop suite | **131 passed, 0 failed, 2 Windows-only skips** |
| Rust session tests / Pi differential tests | 13 / 22 passed |
| Native traversal adapter tests | 4 passed, 1 Windows-only skip |
| Transitional bridge tests | 4 passed, including new file-choice protocol |
| Rust Wry host fmt / Clippy / tests / release build | Passed; 7 applicable macOS tests |
| macOS unpacked production build | Passed, including Rust addon build/staging |
| Packaged app signature verification | `codesign --verify --deep --strict` passed (ad hoc) |
| Installed native navigation tools | Rust traversal, symbols, reads and references passed |
| Actual packaged Electron smoke | Transcript, providers, PTY marker, native addon; zero renderer errors |
| Current feature inventory check | Passed, 376 rows |

The unpacked app is `release/mac-arm64/Suffice.app`, preview version
`0.1.0-preview.20261115.1`. No DMG, publication, developer-certificate signing, notarization,
Windows rerun or installed-machine release qualification is claimed. The test
screenshot records renderer appearance; it does not establish native OS chrome
or accessibility parity. Test/build durations overlap and are not performance
measurements. Original frozen benchmark/report/research content is unchanged.

Agents used separate depth-one lanes: Terra Medium upstream inventory and Rust
contract discovery; Terra High UI merge, host/CLI merge and Rust bridge work;
Terra Medium macOS tests; and Sol High independent review. Effective runtime
model routing was not exposed and remains unverified. Root owned Git history,
configuration/packaging integration, combined verification, inventory and evidence.

## Migration inventory and remaining gates

The current source inventory was regenerated and checked: 376 rows, including
28 broad capabilities, 51 desktop IPC handlers, 58 preload members and 85
settings. Nine explicit capability rows track the new upstream obligations.
The preceding inventory remains recoverable from checkpoint `801387e`; frozen
measurements and original benchmark/report/research bytes were not regenerated.
Literal inventory/test matches remain leads, not coverage or parity proof.

Native icon extraction, clipboard/images, notifications/startup, complete native
presentation and accessibility, agent/runtime/tool ownership, session semantic
gaps, platform qualification and whole-app performance gates remain open.
Installer/renderer success cannot prove a full Rust rewrite or a footprint win.
No publication or deployment is part of this integration.

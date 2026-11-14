# Desktop integration validation — 2026-11-14

Executed on native Windows in the settings/terminal integration checkout.

| Check | Exit | Result |
| --- | --- | --- |
| `bun run desktop:build` | 0 | Built; existing large-chunk warning remains |
| `node --test --test-concurrency=1 apps/desktop/test/*.test.mjs` | 0 | 51 passed, 0 failed |
| `node --test tests/*.test.mjs packages/cli/test/*.test.mjs` | 0 | 105 passed, 2 skipped, 0 failed |
| `node --test packages/cli/test/*.test.mjs` | 0 | 10 passed, 2 skipped, 0 failed |
| `git diff --check origin/codex/desktop-sidebar-search-polish..HEAD` | 0 | No whitespace errors |
| `git grep -nE '^(<<<<<<<|>>>>>>>) '` | 1 | No conflict markers found |

The first combined run found exact-match fixture failures from Windows CRLF
checkout conversion. `.gitattributes` now preserves LF under `benchmarks/tasks`;
normalizing the working copies leaves their committed source bytes unchanged.
The complete suite subsequently passed. An initial desktop run had two launch/
fixture failures while the renderer build was being regenerated; both passed in
isolation and in the final complete run after the build finished.

Electron test launchers now resolve the executable from the `electron` package
instead of hard-coding `electron.exe`. This addresses that part of issue #21;
macOS realpath handling and native execution still require the offered macOS run.

These results apply to this integration head, not separate runs of the two parent
PR heads or Claude's alternative UI/backend branches. Third-party OAuth completion,
installer packaging, macOS/Linux behavior and the cloud panel are not proven here.
No paid model calls were required. The user's existing app was left running.

The ADRs and design document record accumulated implementation after the new
coordination rules arrived; they do not claim to have preceded the original work.

## Canonical-path follow-up

Claude's native macOS run of the original integration head did not finish within
1200 seconds (18 passed, 11 failed so far). No blanket macOS success is claimed.
The first follow-up canonicalizes receipt workspace containment and cross-alias
operation identity, and corrects two tests to expect canonical session paths.
Directory-link escape checks remain in place.

After that patch, native Windows targeted receipt/transcript tests passed 10/10;
the complete serialized desktop suite passed 53/53 (exit 0); the combined root/CLI
suite passed 105 with 2 skipped (exit 0). The two new tests exercise a directory
alias, cross-alias operation conflicts, and an escaping directory link. Native
macOS rerun and the remaining timeout diagnostics are still pending. No renderer
code changed in this follow-up, so the existing build remains applicable.

## Reliability follow-up, native CI

The source at 735eb59 built successfully on native Windows. Its full serialized
desktop suite passed 60/60, exit 0. The combined core/CLI command passed 113 with
2 skipped, exit 0; that local run includes one concurrent automation test excluded
from this PR. The exact published tree passed 112 core/CLI tests with 2 skipped
on both hosted platforms in [run 43617188907](https://github.com/sufficelabs/suffice/actions/runs/43617188907).

That hosted run intentionally remains failed: macOS passed 56/60 desktop checks,
Windows 59/60. It proved the macOS PTY helper repair and worker/crash recovery;
remaining failures exposed fixed-viewport assumptions, an overly broad provider
selector, a project-order-dependent assertion, and terminal focus after closing
an inactive tab. Follow-up changes target those causes without skipping checks
or relaxing terminal output counts. Focused native Windows reruns passed.
Latest hosted results belong in the PR conversation; this records the failed
run rather than replacing its evidence with a local pass.

The macOS hosted display is 1024 pixels wide. Tests requiring a 1440x900 CSS
viewport use Playwright viewport emulation only after checking real native
window resize behavior. This does not prove native hit testing on a physical
1440-pixel Mac display. The hidden-window flag is verified for the isolated
recovery test; keyboard/visual interaction suites require a visible test runner.
A hidden composer interaction experiment timed out and is not counted as a pass.

Recovery tests wait for an acknowledged native draft backup, force-terminate the
isolated app process tree, and recover saved transcript bytes and the draft on a
fresh launch. Normal shutdown disposes real PTYs. These are not power-loss or
arbitrary single-process orphan-cleanup guarantees. No paid calls, WSL, Linux
compatibility claim, installer build, cloud-panel merge or Rust change is included.

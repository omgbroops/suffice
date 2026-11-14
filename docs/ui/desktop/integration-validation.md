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

# 0031: Native preview installers

Package the current desktop runtime snapshot on a dedicated branch without moving or stashing the active development checkout. Build Windows x64 NSIS on Windows and macOS arm64 DMG on a current Apple Silicon macOS runner. The explicit packaging workflow produces private CI artifacts, not a public release.

Preserve the runtime's monorepo-relative imports in a fresh staging directory. Copy only desktop runtime/renderer/assets, CLI/harness sources and the installed production dependency closure. Resolve nested dependency versions from their original package context. Exclude accounts, environment files, development dependencies, benchmarks, tests and source checkouts. Include host native automation binaries and node-pty helpers. Validate them before packaging.

This preview deliberately uses unpacked resources for native executables and process workers. No developer certificates or notarization are configured. macOS receives the local ad-hoc signature needed by Apple Silicon. Preserve existing Suffice profile paths and never remove user data on uninstall. Smoke-test the packaged executable with an isolated account directory, saved transcript, provider page and real PTY before retaining artifacts.

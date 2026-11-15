# Desktop preview installers

Targets: Windows 11 x64 with an assisted per-user installer, and current macOS 27 on Apple Silicon with a drag-to-Applications DMG. The app includes Electron, the Suffice harness, Pi, native terminal support and host browser/desktop automation executables. It does not require Bun or Node to launch. Git for Windows supplies Git Bash; project developer tools and a browser remain machine prerequisites.

Preview builds do not use trusted publisher certificates or Apple notarization. They are intended for testing; operating-system trust prompts are expected. No public release or automatic update service is created. Install/uninstall must preserve ~/.suffice credentials and conversations and the existing desktop profile.

Run `bun run desktop:installer` on the target platform, then `bun run desktop:smoke`. Outputs live in ignored `release/`; each build uses a fresh ignored stage. A versioned runtime manifest records included dependency versions. The existing Desktop workflow can be dispatched with task=installers to build both targets, retain screenshots/smoke results and upload private installer artifacts with SHA-256 checksums.

The first Windows and Mac previews passed their native packaged-runtime checks. The Mac job mounted the DMG, copied the app out, verified its ad-hoc signature, and tested that copied app. The runtime audit found no auth.json, .env or .npmrc files.

The reviewed refresh uses version `0.1.0-preview.20261114.1`, includes the transcript toolbar and directory-scoped ignore fixes, and builds both targets in the private personal repository after pushing the same commits to the org. Use `com.suffice.app` consistently for the installer and installed Windows taskbar identity, retiring the old Electron-polluted group. Retain NSIS GUID `84dceb48-436e-541d-a121-ca8e8353d1f2` from the original `com.suffice.desktop` installer to update the same per-user installation. Native Windows smoke checks now inspect the actual window AppUserModelID and verify that its icon and relaunch shortcut agree.

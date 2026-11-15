# Desktop preview installers

Targets: Windows 11 x64 with an assisted per-user installer, and current macOS 27 on Apple Silicon with a drag-to-Applications DMG. The app includes Electron, the Suffice harness, Pi, native terminal support and host browser/desktop automation executables. It does not require Bun or Node to launch. Git for Windows supplies Git Bash; project developer tools and a browser remain machine prerequisites.

Preview builds do not use trusted publisher certificates or Apple notarization. They are intended for testing; operating-system trust prompts are expected. No public release or automatic update service is created. Install/uninstall must preserve ~/.suffice credentials and conversations and the existing desktop profile.

Run `bun run desktop:installer` on the target platform, then `bun run desktop:smoke`. Outputs live in ignored `release/`; each build uses a fresh ignored stage. A versioned runtime manifest records included dependency versions. The existing Desktop workflow can be dispatched with task=installers to build both targets, retain screenshots/smoke results and upload private installer artifacts with SHA-256 checksums.

Windows validation: the 163,317,649-byte installer passed its archive integrity check. The actual packaged executable loaded its saved transcript and Providers page and executed a terminal command. The runtime audit found no auth.json, .env or .npmrc files. The Mac artifact remains unbuilt until the native workflow starts and passes.

# Platform-aware desktop window controls

Use Electron's native traffic lights on macOS with a hidden title bar and an explicit position. Keep the current custom controls on Windows/Linux. A development-only `SUFFICE_WINDOW_CHROME=macos` flag previews traffic lights on Windows using the existing caption IPC; it changes presentation rather than spoofing the runtime platform.

Reserve the left caption area in the sidebar header. When collapsed, mirror the existing Windows cutout and border into the upper-left canvas corner. Both layouts share the sidebar surface tokens. Raise the sidebar minimum to 280px and clamp older saved widths so the controls, wordmark and toolbar remain separate.

Reference: [Electron custom title bars](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar).

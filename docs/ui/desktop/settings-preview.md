# Desktop settings

Settings reuses the existing sidebar, workspace, atmosphere and window controls.
Preferences persist in the harness home `desktop-settings.json`; a renderer cache
applies appearance before mounting the UI. Writes use an atomic cross-process lock.
Credentials remain in Pi's authentication store and never enter localStorage.

## Connected behavior

- Application: native startup registration, keep-running behavior, send shortcut,
  Escape-to-stop, close-panel-on-last-tab, thread titles and explicit project selection.
- Appearance: system/light/dark mode, all retained backgrounds, accent, glass,
  motion, interface/code fonts, type size and density.
- Notifications: completion, failure and approval notifications, background-only
  filtering, and optional synthesized sounds.
- Providers: connected and available sections, fixed-width connection controls,
  modal-only sign-in prompts, installed Pi provider registry and its native API-key/subscription flows,
  disconnection, available-model refresh and default model/effort.
- Models: connected-provider model groups, search, persisted per-model visibility
  in the composer picker, and model/effort defaults.
- Agent: approval gates, native command shell, browser/desktop capabilities,
  background agents, action collapsing, reasoning status and streaming Markdown.
- Context: automatic compaction and threshold, usage ring, project instructions,
  bounded Git context and optional prior-project response context.
- Projects: restore project, open in current/new window, current checkout/new
  worktree/ask-on-start, custom worktree location and detected-push confirmation.
- Editor: hidden/ignored files, file icons, sorting, wrapping, line numbers,
  tab size and unified/split diff defaults.
- Terminal: native shell and working directory, restored tabs, font/size,
  cursor/blink and scrollback. No WSL launch is involved.
- Data: session-only export, preview-cache clearing, attachment-copy retention,
  local error metadata and confirmed age-based session retention to Recycle Bin.

## Boundaries

System language currently resolves to English. No additional translations are
advertised. Background mode hides the window; relaunching Suffice reopens it.
Sign-off is an agent instruction. Push confirmation detects literal Git push
commands; it is not OS-level network isolation. Browser/desktop capability control
does not disable networking in native shell commands. Retention skips active and
currently viewed chats. New shell/worktree/agent policies apply on subsequent runs.

## Verification

Isolated Electron tests cover shared layout, both themes at 1440x900, persistence,
provider discovery and simulated secret prompts, live preferences, drafts and
navigation. Engine tests cover validation, concurrent persistence, credential-free
exports, retention exclusions, approval decisions and harness preference routing.
Third-party OAuth completion requires the account owner and is not automated.

Provider dialogs share header, field/choice body and action footer layouts. Device
verification codes use read-only segmented cells with copy feedback; the provider
still validates the code in its browser flow. Model provider pills collapse their
mounted lists with reduced-motion support. Shared menus cap at 420px (or the
available viewport space), keeping their heading fixed and fading scroll edges.

# Desktop renderer

Plain JS bundled by Vite. Preload APIs (`window.suffice` / `api`) are defined in `../electron/`; the renderer only calls them.

## Modules

| File | Owns | Depends on |
|---|---|---|
| `main.js` | Entry: wires the default skin, menus, composer, thread list | most of `src/` |
| `desktop.js` | Window-level events: settings shortcut, skin menu clicks | `settings-modal.js` |
| `threads-ui.js` | Thread list, thread view, markdown, send/submit, live events | `menu.js`, `code-highlight.js`, `thread-view-state.js` |
| `menu.js` | Compact menus with submenus and keyboard traversal (default skin and attachments) | none |
| `right-panel.js`, `panel-content.js` | Default-skin right panel and its content | `workspace-tools.js`, `panel-editor.js` |
| `settings-modal.js` | Neon Settings window (Account, Usage, Appearance, Shortcuts) | `neon-icons`, `neon-util`, `neon-user-menu` |
| `backgrounds/neon-chrome.js` | Neon skin mount and teardown: sidebar, project row, pane host | `neon-panes`, `neon-composer`, `neon-user-menu`, `neon-icons`, `neon-util` |
| `backgrounds/neon-composer.js` | Neon composer: model, files and effort popover | `neon-icons`, `neon-util` |
| `backgrounds/neon-user-menu.js` | Sidebar footer account button and popout | `neon-icons`, `neon-util` |
| `backgrounds/neon-panes.js` | Pane registry and host | none |
| `backgrounds/neon-threads-pane.js` | Threads pane | `neon-panes` |
| `backgrounds/neon-explore-pane.js` | Explore pane: file tree, viewer, branches, commits | `neon-panes` |
| `backgrounds/neon-github-panes.js` | Issues and Pull requests panes | `neon-panes`, `neon-util` |
| `backgrounds/neon-automations-pane.js` | Automations pane | `neon-panes` |
| `backgrounds/neon-dither.js` | Dithered canvas background | none |
| `backgrounds/neon-icons.js` | SVG wrapper `S`, icon sets `NX_ICONS`, `UM_ICONS` | none |
| `backgrounds/neon-util.js` | `esc`, `shortTime`, `ago`, `note`, `clearNotes`, `stateOf`, `matchesQuery` | none |

## Registering a pane

A pane file calls `registerPane(key, { title, mount(el, ctx) })` at import time and is imported by `neon-chrome.js`.

| Item | Detail |
|---|---|
| `mount` return value | Optional cleanup function. The host runs it on every close, including when another pane replaces this one. |
| `ctx` | `api`, `note`, `esc`, `ago`, `icons`, `pixelAvatar`, `userAv`, `fillComposer`, `actions`, `close` |
| Host | `createPaneHost(ctx)` returns `{ open(key), close(), current }` |
| Teardown rule | Every listener, observer, interval and timer a pane creates is released in its cleanup. Start an interval only after checking the pane is still open. |

## Skin mount and unmount

| Step | Behavior |
|---|---|
| Mount | `mountNeonChrome()` builds the chrome, passes its shared state `S` to `mountNeonComposer`, and returns a teardown function. |
| Unmount | The teardown runs the collected `undo` list (listeners, observers, the pending `more` timer), closes the open pane, and calls `clearNotes()` to drop live toasts. |
| Settings window | `later(fn, ms)` tracks its timeouts; `close()` clears them and removes the document listeners. |

## Shared helpers

| Need | Use |
|---|---|
| Escape text for HTML | `esc` in `neon-util.js` |
| Relative time | `ago` (from ms), `shortTime` (from Suffice's row label) |
| Toast | `note`; `clearNotes` on teardown |
| Issue/PR state and search | `stateOf`, `matchesQuery` |
| Icons | `S`, `NX_ICONS`, `UM_ICONS` |

## Left as is

| Item | Reason |
|---|---|
| `menu.js`, `right-panel.js`, `panel-content.js` | Used by the default skin (`attachments.js`, `main.js`, `workspace-tools.js`). |
| Entity escapes in `menu.js` and `main.js` | They emit different markup (named entities) from `esc`. |
| Two popovers (composer `.nx-pop`, user menu `.nx-um`) | Different DOM and submenu behavior. |
| UM `search` and `user` icons | Geometry differs from the NX versions. |
| `threads-ui.js` timers and listeners (`draftTimer`, `viewScrollTimer`, `codeTimers`, resize observers, `beforeunload`, document `click`, form `submit`) | They live for the whole app, not per mount. |
| Empty `catch` in `highlight()`, `localStorage` blocks, `JSON.parse` fallback | Failure is expected and harmless there. |

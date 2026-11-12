# Suffice Desktop

Electron host for the existing Suffice shell and local harness. Run commands from the repository root:

```sh
bun install
bun run desktop
```

`bun run desktop` builds the renderer, then launches Electron with the local harness in a utility process. No Vite server or separately installed Node runtime is required by the running Electron app. Bun is the package manager/script runner; Electron supplies Node for the harness.

## Shared implementation

- `packages/harness/index.mjs` provides the shared workspace entry to the existing tested CLI session implementation. Harness policies, tools, model setup, budgets, receipts and credentials have one source in `packages/cli/src`; none were copied into the desktop app.
- `electron/worker-entry.mjs` initializes the same Suffice state directory before loading the engine. `worker.mjs` owns the session and emits tool/text events.
- `electron/main.cjs` owns project selection and narrow IPC methods. The renderer has no Node integration or credential access; its bridge is exposed by an isolated, sandboxed preload.
- `src/desktop.js` connects the existing controls, leaving the shell's design tokens and layout intact. New conversation output uses those same styles.
- `bunfig.toml` selects hoisted workspaces. Install only at the root. `bun.lock` is the desktop workspace's canonical lock; older experiment lockfiles remain as historical files.

Use the project picker above the composer to select a trusted folder. Existing CLI authentication under `~/.suffice` is shared. If needed, sign in from the root with `node packages/cli/bin/suffice.mjs login` (CLI requires Node 24+). Choose a model and its supported effort level in the composer. Send becomes Stop while running; New session resets the foreground harness context. Ctrl+Enter or the new-session send menu starts a separate background session without navigating away.

Attach or paste files in the composer. Images have thumbnails and a full preview; other files show their type, name and size. Attachments are limited to 20 files and 20 MB total, with drafts saved locally. Sent files are retained in app storage; supported images also reach Pi's image input. Files and Changes provide read-only project browsing and syntax-colored previews.

The frameless window has a floating top-right minimize/maximize/close cluster. Drag the empty top strip or sidebar wordmark to move it. The original inset content, background choices, near-black surfaces and glass blur are preserved. Standard `backdrop-filter` must follow its prefixed fallback, or CSS minification can discard the working declaration in current Electron.

## Verification

```sh
bun run desktop:build
bun run test:desktop
node --test packages/cli/test/*.test.mjs
```

Desktop tests exercise the real Electron renderer, isolated preload, project selection, unauthenticated harness response, window controls, and computed blur. Controller tests inject an agent to check streaming, concurrent-run rejection, cancellation and disposal without inference. The optional `node apps/desktop/test/live.mjs` uses the existing account for a real read-only fixture task and may incur provider usage.

## Left for later

Archive UI, a native login screen, installer/signing/updating, and independently publishing the shared harness package are not implemented. The sidebar discovers saved harness threads under `~/.suffice/sessions`; opening one reads its transcript, and continuing it reopens the native session manager with the original context. New sessions appear immediately in the sidebar. Drafts, panel tabs, explorer widths, scroll positions, model choices, and panel visibility are saved per thread.

Dark mode and Moonlit Lake are the defaults for new users. Appearance choices persist across restarts; Background → None uses a solid surface. The start screen centers the composer, while transcripts place it at the bottom over a dimmed background.

No paid cloud backend, duplicate harness checkout, or nested app dependency tree is needed. A distributable installer is a later packaging step; it must include the production workspace packages and dependencies rather than copying source from another repository.

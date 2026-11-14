# Shared interaction behavior

Suffice uses `@ui-sdk/core` 0.1.0-beta.2 for collection keyboard behavior. The app remains a DOM-based Electron renderer; React and custom-element wrappers are not needed for this integration.

`src/components/ui/collection-navigation.js` adapts UI SDK's public `definePrimitive`, `createRovingFocus`, and `createTypeahead` APIs to existing DOM elements. It supplies arrow keys, Home/End, direction-aware horizontal movement, disabled-item handling, typeahead, and cleanup.

Used by:

- Workspace and sidebar menus, including submenus.
- Project and model picker controls.
- The panel tab menu and Files, Changes, and terminal tabs.

Existing styles, popup positioning, hover submenus, motion, and per-chat persistence stay in their current modules. UI SDK's optional styles are not imported. The integration does not register remote agent tools or grant filesystem access.

Use this adapter for another existing collection instead of copying keyboard handlers. Call `sync()` when rebuilding a tab strip, and `destroy()` when removing a menu. Editable inputs retain text editing and the effort slider retains native range keys. Tab navigation selects via the app's state store so pointer and keyboard selection persist identically.

For a new complete component, consult the installed package's `docs/llms.txt`, `docs/core.md`, and `skills/ui-sdk/SKILL.md` before implementing behavior. Import public entries only; keep Suffice's design tokens and styles.

Verify with `bun run desktop:build` and `bun run test:desktop`.

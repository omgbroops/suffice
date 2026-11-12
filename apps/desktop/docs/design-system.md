# Suffice design system

`src/tokens.css` is the source of truth. The prototype has selectable dark and light themes, a compact sidebar, the supplied React Bits ASCII gradient, saved background alternatives, and a `[suffice]` wordmark in Geist Pixel Square.

## Foundations

| Foundation | Shared rule |
| --- | --- |
| Branding | Geist Pixel Square font copied from `suffice-platform/docs/branding/geist-pixel/`, with its license. The sidebar uses the compact `[suffice]` wordmark; dialogs retain the existing SVG mark. |
| Typography | Inter Variable for the desktop interface, Geist Pixel for the wordmark, and local JetBrains Mono for code. |
| Sidebar | Solid `#0e0e0e` in dark and `#f6f6f6` in light; resizable with a saved width. Preserve navigation typography and spacing. |
| Glass | Composer: neutral `#0e0e0e` at 76% opacity in dark and `#f6f6f6` at 90% in light. Chat bubbles reuse that glass recipe. Menus remain translucent. |
| Blur | `--glass-filter`: 24px blur with `saturate(0)`, so background light passes through without tinting neutral surfaces blue. |
| Borders | Passive borders use 3% white, elevated borders approximately 5.5%. Sidebar separator approximately 2%. Focus states remain visible. |
| Spacing | Shared 4/8/12/16/20/24/32/40px scale. Widgets use 12px padding; composer uses 16px on desktop and 12px on mobile. Gutters stay 16px on desktop; controls stay 32px. |
| Radius | Compact utility buttons use 5–7px corners; menus use 14px, composer 20px, and both the chat canvas and editor surface 11px. |
| Menus | 208px wide, 30px single-line rows, 13px text, simple right-aligned checks. Descriptions stay available in tooltips and accessibility text. |
| Motion | 150ms color changes, subtle press feedback, 140ms menu entry. Keyboard-opened menus skip entry animation. All backgrounds honor reduced motion and offer pause controls where animated. |

## Reusable components

Import `button`, `panel`, `icon`, and `mark` from `src/ui.js`. The button helper supplies a safe non-submit type, accessible name, tooltip, and shared classes. Use the shared `ghost`, `subtle`, and `primary` variants. Buttons use weight 500, 3px vertical padding, and a 28px minimum height; hero actions use 32px. Field selection and trace controls inherit the same primitives with contextual selection indicators.


Use `.row-content`, `.row-title`, and `.row-meta` for session and PR hierarchy. All menus use `createMenu()` from `src/menu.js`. Items with `children` open a submenu alongside the parent on hover, click, or ArrowRight. Submenus flip to the left when space is limited. Hover has a short tolerance delay for diagonal pointer travel; parents remain open.

Menus support arrow keys, Home/End, Enter, and Escape. ArrowLeft returns to the parent; Escape closes the active level. Selected choices expose `menuitemradio` and `aria-checked`; actions expose `menuitem`. Clicking outside or resizing dismisses all levels.

## Background and layout

`src/background.js` selects a preset from `src/backgrounds/presets.js`. **ASCII gradient** is the default, integrating the actual user-supplied React Bits GradientASCII component in a small React mount. Source and license live in `src/vendor/reactbits/`; the rest of the app remains vanilla JavaScript. The WebGL canvas has its own context and is fully cleaned up when switching presets. It uses the component's light mode for the light theme, with a faint wash behind white surfaces. Local adaptations add pause support and real-time intro timing.

**Orbital** remains saved and selectable: a separate planetary arc with a 2.8-second particle formation, a rim sweep, then a much quieter glint on an 18-second cycle. The texture stays fixed; ambient frames composite only the cached image and a highlight at 24fps. Motion pauses in hidden documents, can be paused or replayed from the submenu, and becomes static under reduced motion.

**Sonar grid** is an additional prototype option (`/?background=sonar`). The user-supplied React component lives in `src/components/ui/sonar-grid.jsx`, with local CSS and a background lifecycle bridge in `src/backgrounds/sonar-grid.js`. It uses the existing blue theme token, ambient expanding rings, and pings on empty workspace clicks. Controls retain their normal behavior. Pause freezes the animation clock; hidden/offscreen content sleeps, reduced motion shows a still grid, and switching presets unmounts the React root and observers. No new dependencies or application-wide framework changes are required.

The earlier blue/amber horizon, Dusk, and Glacier also remain saved. Choose any through Sessions → … → Background, or preview with `?background=orbital`, `?background=horizon`, `?background=dusk`, or `?background=glacier`. The rejected terrain and ridged experiments are retained in source but omitted from the picker.

**Oceanic Shimmer** adds the supplied static grain/blue-gradient component, dimmed by its workspace wrapper. **Moonlit lake** adds original dithered scenery with cached-pixel water ripples and slow sky drift. Its land remains fixed; motion supports pause, offscreen/hidden suspension, and reduced motion. Both are additional choices. See `docs/background-components.md` for integration paths and optional Tailwind/TypeScript/shadcn setup.

## Themes

Sessions → … → Theme offers Dark and Light in the same hover submenu. The choice is stored locally under `suffice-theme`. A small head script restores it before the first paint. Both themes share layout, components, typography, spacing, and interaction rules; only semantic tokens and background treatment change. Use the tokens rather than adding per-component theme colors. Saved 2D backgrounds are inverted in light mode; the ASCII component uses its native light mode.

The main desktop content is up to 944px wide, with a 720px composer. Activity and recent sessions occupy equal halves of the upper row; the lower row uses 1:2:1 proportions. Small screens reflow to two columns and then full-width panels, with an overlay sidebar.

## Prototype boundaries

All metrics and history are sample data. Composer submission opens a local preview. Attachments stay local. There is no backend or live agent integration.

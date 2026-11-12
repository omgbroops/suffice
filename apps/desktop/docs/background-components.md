# Additional prototype backgrounds

Choose **[suffice] → … → Background**. Moonlit Lake is the default; every earlier preset remains available. **None** disables the artwork and animation in favor of a solid surface. The selected background is saved locally across restarts.

- **Oceanic Shimmer**: `/?background=oceanic`. The supplied gradient was pasted twice; it is integrated once. Its radial gradients, both grain passes, and original colors are preserved inside `src/components/ui/oceanic-shimmer.tsx`. The wrapper lowers exposure for the workspace and light theme. The grain filter ID is unique per React instance. The supplied effect is static.
- **Moonlit lake**: `/?background=lake`. Original procedural scenery: a dithered night sky, moon, ridges, pine shoreline, and reflected light. The image is built once per size, then cached sky/water pixels move slowly while land stays fixed. It paints at 24fps, pauses in hidden/offscreen content, supports the Background submenu's pause control, and becomes still under reduced motion. Rendering uses integer pixel offsets, not changing noise. No image downloads or external services are involved.


## Component and styling paths

Reusable React components belong in `src/components/ui/`; shared application primitives remain in `src/ui.js`. Tokens and general styles live in `src/tokens.css` and `src/styles.css`. Renderer-specific CSS stays beside its lifecycle bridge in `src/backgrounds/`.

This source-root layout keeps reusable UI discoverable and compatible with the conventional `@/components/ui/*` alias if shadcn is introduced. A separate root `/components/ui` would duplicate the existing source structure.

The current app is Vite with vanilla JavaScript and React islands. Vite already transpiles the supplied TSX component; the project does not currently run TypeScript type checking or use Tailwind/shadcn. The integrated component uses inline styles, so those packages are not prerequisites. [Vite TypeScript documentation](https://vite.dev/guide/features.html#typescript).

## Optional full Tailwind / TypeScript / shadcn setup

These are setup instructions, not changes applied by this background integration. For a fresh app, use `npx shadcn@latest init -t vite`. For this existing checkout:

1. Install the styling and checking packages:

   ```sh
   npm install tailwindcss @tailwindcss/vite
   npm install --save-dev typescript @types/react @types/react-dom @types/node
   ```

2. Add `tailwindcss()` to the existing Vite configuration and configure the source alias. Retain its current server/preview settings:

   ```js
   import tailwindcss from '@tailwindcss/vite';
   import { fileURLToPath } from 'node:url';

   // Fields to merge into defineConfig(...):
   plugins: [tailwindcss()],
   resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
   ```

3. Create a dedicated `src/tailwind.css` entry containing `@import "tailwindcss";` and import it before the existing styles. Keep the current design tokens and styles rather than replacing them. [Tailwind's Vite guide](https://tailwindcss.com/docs/installation/using-vite).

4. Add `tsconfig.json` for incremental checking of typed components:

   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "lib": ["ES2022", "DOM", "DOM.Iterable"],
       "module": "ESNext",
       "moduleResolution": "Bundler",
       "jsx": "react-jsx",
       "strict": true,
       "isolatedModules": true,
       "allowJs": true,
       "checkJs": false,
       "noEmit": true,
       "skipLibCheck": true,
       "baseUrl": ".",
       "paths": { "@/*": ["./src/*"] }
     },
     "include": ["src/components/ui/**/*.tsx"]
   }
   ```

   Run `npx tsc --noEmit`; expand the included paths as other files become typed.

5. Run `npx shadcn@latest init`, point its CSS setting at the dedicated entry, and keep UI components in `@/components/ui`. Add desired components with `npx shadcn@latest add <component>`. Map shadcn's semantic colors to the current Suffice tokens. [Official existing-Vite setup](https://ui.shadcn.com/docs/installation/vite#existing-project).

The supplied gradient's demo wrapper can be rendered with `<GradientBackground />` inside any explicitly sized parent; its demo's Tailwind classes merely provide sizing and rounding.

## Verification

Playwright captures in `artifacts/` include the first and refined scenery passes, an unobstructed artwork capture, final desktop, mobile, and light-theme views, and the supplied gradient. Animation checks compare canvas frames, confirm water movement, freeze/resume behavior, reduced-motion stillness, and renderer cleanup. The scenery intentionally differs from the reference: a moonlit lake with a compact blue/gray palette instead of reproducing its exact clouds and shoreline.

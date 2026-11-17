The app icon is `suffice-logo.png` (1024 x 1024 RGBA). `suffice-logo.svg` is its editable vector source.

The mark uses the exact outlines of the bundled Geist Pixel Square `[S]` glyphs, with an additional 5px stroke at the SVG's 512px viewBox size. The white tile has an 82px corner radius and transparent outer corners. The font license is in `../public/fonts/GeistPixel-LICENSE.txt`.

Electron uses the original PNG on Windows/Linux. macOS uses `suffice-logo-macos.png` for its runtime Dock icon. No application/profile rename is needed to change the icon.

Windows taskbar relaunch metadata uses `suffice-logo.ico`, containing PNG representations at 16, 24, 32, 48, 64, 128 and 256 pixels rendered from the SVG. The taskbar app ID stays `com.suffice.desktop`; a private profile-local `Suffice.lnk` retains the correct development app and profile paths without exceeding Windows relaunch-property limits. The app does not pin the shortcut or edit Electron executables. The PNG remains the preview/source image.

Windows development launch additionally uses a sibling `Suffice.exe` with the same icon embedded in its PE resources. The shared `electron.exe` is preserved; the copy is refreshed only when its runtime or icon changes. This is a development launcher, not a distributable build.

macOS has dedicated assets: `suffice-logo-macos.svg`, `.png` and `.icns`. The tile occupies 824px of a 1024px canvas with 100px transparent margins, with rounder corners, a gently shaded white tile, a fine highlight, and a soft elevation shadow. The original mark is kept intact. This corrects the oversized Dock appearance of the edge-to-edge Windows artwork. The ICNS contains 16, 32, 64, 128, 256, 512 and 1024px representations.

Regenerate with `node apps/desktop/electron/build-macos-icon.mjs` (requires Chrome; set `SUFFICE_ICON_BROWSER=msedge` for Edge). macOS packaging in `scripts/desktop/package.mjs` uses `apps/desktop/assets/suffice-logo-macos.icns`. No installer is rebuilt by regenerating these assets.

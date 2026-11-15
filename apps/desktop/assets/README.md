The app icon is `suffice-logo.png` (1024 x 1024 RGBA). `suffice-logo.svg` is its editable vector source.

The mark uses the exact outlines of the bundled Geist Pixel Square `[S]` glyphs, with an additional 5px stroke at the SVG's 512px viewBox size. The white tile has an 82px corner radius and transparent outer corners. The font license is in `../public/fonts/GeistPixel-LICENSE.txt`.

Electron's window icon and macOS Dock icon use the PNG. No application/profile rename is needed to change the icon.

Windows taskbar relaunch metadata uses `suffice-logo.ico`, containing PNG representations at 16, 24, 32, 48, 64, 128 and 256 pixels rendered from the SVG. The taskbar app ID stays `com.suffice.desktop`; a private profile-local `Suffice.lnk` retains the correct development app and profile paths without exceeding Windows relaunch-property limits. The app does not pin the shortcut or edit Electron executables. The PNG remains the preview/source image.

Windows development launch additionally uses a sibling `Suffice.exe` with the same icon embedded in its PE resources. The shared `electron.exe` is preserved; the copy is refreshed only when its runtime or icon changes. This is a development launcher, not a distributable build.

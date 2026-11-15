# 0029: Local custom wallpaper and explicit light palettes

Keep custom image blobs, framing and effects together in a dedicated IndexedDB record. The existing background preference selects Custom; the existing atmosphere layer renders it, so chat/settings visibility and transitions continue to work. Never put image data in model context or preference JSON. Choosing an image is explicit, validates format/size/dimensions and reports storage errors. Canceling framing does not write; Done saves normalized crop position and zoom. Removing an image clears its saved blob while keeping other background selections available.

Render effects from the source image at rest and on resize/configuration/theme changes. Avoid animation timers and release decoded bitmaps on unmount. Soft horizon and Pixel horizon have explicit light palettes; their approved dark calculations stay unchanged. Other presets retain their prior rendering.

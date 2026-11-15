# Desktop title bar layout

The sidebar starts at 280px and remains resizable up to the existing 400px cap. macOS reserves 88px at the left for its native caption cluster and moves the wordmark right. Windows keeps its current upper-right cluster. Both use the current toolbar baseline.

With the sidebar collapsed, macOS controls occupy an 88 by 44px patch of sidebar material at the upper left. The two inverted corner joins and hairline mirror the existing Windows treatment. The reopen button moves beyond that patch, and the thread title starts after the reopen button. Opening the right panel does not remove the left cutout.

On Windows, the development preview draws 12px red/yellow/green traffic lights inside larger click targets and routes close/minimize/maximize to the existing actions. Real macOS uses system controls, not the preview buttons. Do not persist the preview in user preferences or change terminal/platform detection.

Verify 280px and wider layouts, restored narrow preferences, collapsed/expanded sidebar, settings and chat, both themes, and right-panel combinations. Check caption actions in the Windows preview. Native macOS positioning still requires a Mac smoke test.

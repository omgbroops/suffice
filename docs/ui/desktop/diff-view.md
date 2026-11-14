# Changes view

Changes uses a nested directory tree with file-type icons, status colors, and per-file additions/deletions. Folders use disclosure chevrons without folder icons or guide lines, matching Files. Both explorer scroll areas fade at overflowing edges. Collapsing retains the mounted subtree; reduced-motion and keyboard toggles are immediate.

Tracked-file counts and previews compare the current working tree with `HEAD`, including staged and unstaged edits as one net change. Rename paths are parsed from Git's NUL-delimited output. New text files show their added-line count; binary files and truncated new-file previews do not invent counts.

The preview toolbar offers line wrapping, unified/split diff, and previous/next change navigation. Wrapping also works in Files. Wrap and layout preferences are stored per chat alongside the existing explorer state. Split rows pair replacement lines and retain empty cells for unequal additions/deletions.

Selecting a file updates only the preview and its toolbar. The mounted explorer, filter, expansion state and scroll position remain in place. Previews are cached within the mounted view and invalidated on refresh or tool changes. Missing or unchanged diff selections clear to an empty preview; other read errors remain local to the preview.

Keep tree colors and controls on the existing design tokens. File contents remain read-only. Workspace reads retain the canonical-path guard in `electron/workspace-files.cjs`.

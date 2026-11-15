# Picker scrolling and explicit worktree controls

Reuse the sidebar's overlay scrollbar for option menus, project lists and branch lists. Overflow does not change row width; top/bottom masks reflect scroll position while the rail stays clear at the edge. Clean up menu observers when menus close.

The New worktree footer is informational text plus a switch. Only the switch changes state; the row does not receive selection highlighting. A distinct worktree icon appears on this footer and the Git pill when a worktree is requested or the selected checkout is a worktree. Worktree detection is returned from native Git metadata, including restored projects.

Remove the redundant worktree-mode setting and its stored-value runtime fallback. Composer selection is authoritative. Reuse settings panel rounding for model provider headers and bundle additional provider marks from the existing Lobe Icons source. Provider aliases map subscription/regional IDs to the same brand asset; unknown brands retain the existing fallback.

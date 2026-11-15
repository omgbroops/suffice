# Project management from the sidebar

Project metadata is stored in the native project registry: display name, optional identity override and pin state. Removing a registry entry records a hidden path and never deletes its chats or repository files; choosing that directory again restores visibility. Project identity customization supports default initials/color, emoji and a bounded local image selected through the OS picker. No edits to repository configuration are needed.

Ungrouped chats expose Manage project; grouped project headers expose the same menu directly. Actions include pin, edit, open in Explorer, archive idle chats and remove. Thread Move to project lists registered destinations. It updates only the session header's cwd through a validated native action; all messages remain byte-for-byte unchanged and the stable session path/ID is preserved. Running chats cannot move, and released idle hosts cannot later write their previous cached header. Removed projects are filtered consistently from sidebar/search/archive UI until re-added.

The existing menu, switch, icon and composer-material dialog recipes are reused. Test project metadata roundtrips, hide/re-add semantics, header-only moves, active-run rejection, customization persistence and both context-menu entry points.

Nested menus share left-aligned icon and label columns; destinations use the same project badges as the sidebar and ellipsize long names. The editor preserves the current badge until changed, with proportional monograms. Emoji selection offers a searchable local grid plus pasted emoji. Images can be chosen or dropped and are center-cropped to a 128px square before saving.

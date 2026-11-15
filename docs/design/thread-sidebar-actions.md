# Sidebar completion and actions

Persist explicit unread, pinned, archived and title-override state in each chat's existing native-backed view state. A successful response finishing outside the focused visible chat becomes unread; viewing the chat marks it read. Settings and an unfocused window count as away. Legacy chats are not all marked unread on upgrade. A completed unread chat replaces its check with an accent dot in every density; errors retain their error status.

Context actions reuse existing menus and dialog surfaces: rename (a persisted display-title override), pin, mark read/unread, copy title/directory/branch, and reversible archive. Archived chats are accessible through the sidebar's Archived filter. Running chats cannot be archived. These actions leave engine transcripts and files intact; no delete, fork, share or new-window actions are implied.

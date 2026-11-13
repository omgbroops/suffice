# Chat change receipts

The desktop passes an optional tool observer into the shared harness. CLI and research sessions keep their existing behavior when no observer is provided. Because observation wraps native tool execution, nested calls from codemode are included.

Each chat records a text file immediately before and after write/edit tools. Shell calls snapshot Git-listed tracked and untracked non-ignored text files, or a bounded directory traversal outside Git. The first observed content is the baseline; subsequent edits are composed into a net diff. Returning a file to that baseline removes its counts. Existing dirty changes are not attributed to the chat.

Receipts persist under SUFFICE_HOME/chat-changes, keyed by the session-path hash. Full receipts contain local before/after text; the sidebar reads only a small summary file. History is not rewritten and old chats without receipts have no invented counts. The right-panel working-tree view remains repository-wide.

Limits are 2 MiB per file, 64 MiB per snapshot/receipt and 10,000 files per shell snapshot. Binary, oversized or unsupported files are not assigned fabricated line counts. A partial receipt is marked with an asterisk. Repository-contained symlinks are not followed by the snapshotter.

Operations touching the same file are conservatively marked partial when they overlap; shell scope conflicts with any concurrent mutation scope. An in-memory registry and local operation markers also detect separate background worker processes. Intervening changes between a chat's edits make the affected file partial. External writes during a shell operation cannot be perfectly distinguished from that command's own writes; separate worktrees provide the strongest attribution. Child processes that continue mutating after a shell tool exits are outside its capture interval.

Project headings have separate repository totals: tracked-file diff from HEAD's merge base with the PR/default branch, including uncommitted edits; HEAD is used when no base is available. These totals are not sums of chat receipts.

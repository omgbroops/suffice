# Attribute Git metadata to chat actions

Individual chats must not inherit a repository's current branch or pull request. Store explicit chat receipts and preserve unknown legacy provenance. Project groups retain live branch totals. PRs are attributed from successful direct creation tool calls only; a mention or viewing a PR is not ownership evidence. This favors missing metadata over false attribution. Shell scripts and externally created PRs require future explicit instrumentation.

Receipts now record their working directory. Moving a chat stamps legacy source context before replacing its session header, then binds a fresh receipt to the destination branch/worktree and clears PR ownership. Prior context is retained in receipt history, never projected onto the new project. Reads reject rooted receipts for other directories, including during an interrupted move; unchanged legacy chats remain unknown or keep their existing legacy receipt.

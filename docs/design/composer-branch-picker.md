# Composer branch picker

The Git pill becomes a button only when its selected directory is a repository.
Its popup reuses project-menu/search/options classes and collection navigation,
with a New worktree switch replacing New project. List local and remote refs,
filter by name, highlight the active branch, retain scroll bounds and fade edges.

Electron owns the directory and validates the selected ref against a fresh list.
Checkout never forces, stashes or resets. New worktrees use the existing configured
worktree directory with unique paths/branch names and leave dirty source files
alone. Selecting a worktree starts a new chat so a saved conversation keeps its
original directory. Async revisions prevent stale responses replacing another
project. Native Git fixtures cover dirty carryover, overwrite refusal, remote
tracking, unknown refs and worktree isolation; Electron verifies picker behavior.

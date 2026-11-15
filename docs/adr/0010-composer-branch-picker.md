# ADR 0010: Select a branch with optional isolated worktree

Status: proposed
Date: 2026-11-14

Reuse the project picker's search, rows, placement and motion for Git branches.
A footer switch selects worktree creation. Branch selection with the switch off
uses non-forced checkout; Git refuses overwrites. With the switch on, create a
unique branch/worktree at the selected commit, select it, and start a new chat.
Dirty files are preserved in their original checkout, not copied or stashed.
Only refs enumerated by Git are accepted. Block in-place checkout during agent
runs/preparation; serialize branch changes and block new runs during mutation.
Explicit picker choices override automatic worktree settings for that checkout.

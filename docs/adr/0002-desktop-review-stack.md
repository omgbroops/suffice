# ADR 0002: Review desktop changes as an ordered stack

Status: proposed for review
Date: 2026-11-14
Author: Codex

## Context

The current desktop branch contains 75 harness commits and 30 sidebar commits
beyond the published main lineage, followed by uncommitted settings, terminal,
editor and automation work. Claude's draft PR #5 is a parallel UI implementation
with overlapping Electron files. Merging it wholesale would discard decisions
and create a large conflict resolution task.

## Decision

Publish the new work only on `codex/desktop-settings-terminal-integration`.
Review the existing harness branch into main, sidebar into harness, and this
branch into sidebar, in that order. Do not merge automatically. Retarget the next
PR after its parent lands. Preserve the existing commits and never stash, rewrite
shared history or push another agent's branch.

This follows A-G0D's explicit integration direction in issue #22 on 2026-11-14.
Claude retains the cloud panel files and will propose a small follow-up off main.

## Consequences

Reviewers see focused diffs rather than all 105 prior commits again. The stack
cannot be merged out of order. Main's coordination documentation must be retained
when the first PR integrates. Full-suite failures remain visible and block a
ready-for-merge claim even when unrelated to this patch.

## How we check it

Run the build and serialized desktop suite, root suite and CLI tests. Publish
exact exit codes and unresolved failures in the PR; do not merge until reviewed.

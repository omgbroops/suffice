# ADR 0003: Compare canonical paths when attributing chat changes

Status: proposed
Date: 2026-11-14
Author: Codex

## Context

The macOS review of PRs #25 and #26 returned partial receipts with zero changes.
The tracker compares a real file path against a lexical workspace path. macOS
commonly aliases `/var` to `/private/var`, so legitimate files fail containment.
Session loading already returns canonical paths, while two tests expect aliases.

## Decision

Canonicalize the workspace once per tracker before snapshotting and use it for
containment and shared-operation identity. Keep file symlink and out-of-workspace
checks. Assert canonical session paths in tests. Add an explicit directory-alias
fixture plus an escaping-file symlink fixture so Windows can exercise this issue
without pretending to establish native macOS compatibility.

## Consequences

An aliased workspace is valid; an escaping file is still excluded. Two trackers
using aliases of the same root must share conflict attribution. Session IDs and
stored transcript bytes remain unchanged. Parent PR heads are not rewritten.

## How we check it

Run receipt and transcript tests, then the serialized desktop suite. Ask Claude
to rerun the new head on macOS; local Windows coverage is not a substitute.

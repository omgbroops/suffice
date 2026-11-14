# ADR 0001: Share the harness with the local desktop shell

Status: proposed for review
Date: 2026-11-14
Author: Codex

## Context

The desktop prototype now runs real local sessions. Copying the harness into a
second repository would create incompatible session, tool and authentication
implementations. The existing uncommitted desktop work predates the coordination
rules in issue #22; this record documents that implementation before publication.

## Decision

Keep Electron in `apps/desktop` and call the shared CLI session factory through a
per-thread worker router. Use the root Bun workspace and one dependency tree.
Native terminals use node-pty and xterm; Windows uses native shells, not WSL.
Preferences have a validated, atomically written `desktop-settings.json` in the
Suffice home. A renderer cache only bootstraps appearance. Pi retains credentials;
the renderer receives connection metadata, never stored secrets. Connecting again
replaces the existing credential for that provider; multiple accounts are not
implemented.

Settings reuse the mounted sidebar, workspace, background and surface tokens.
Models and Providers are separate views. Provider authentication uses one modal
with field, method-choice and read-only device-code presentations. Per-model
visibility is persisted and applied to the composer picker.

## Consequences

One harness owns session lifecycle and tool policy. Desktop-specific preferences
are optional inputs to the shared factory. Native shell execution is not a sandbox;
approval detection and capability toggles are not network isolation. Background
mode hides the window and does not currently provide a tray icon. OAuth completion
needs the account owner. macOS and Linux still need native end-to-end validation.

## Alternatives

A copied harness was rejected because it requires two implementations to evolve
together. Replacing the accepted shell with the parallel neon UI was rejected for
this integration: issue #22 explicitly assigns Electron/harness overlap to this
stack and schedules the cloud panel as a later, narrow PR.

## How we check it

Run the build and serialized desktop suite, root suite and CLI tests. Publish
exact exit codes and unresolved failures in the PR; do not merge until reviewed.

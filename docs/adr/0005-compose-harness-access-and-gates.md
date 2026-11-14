# ADR 0005: Compose harness access, path and command gates

Status: proposed
Date: 2026-11-14
Author: Codex

## Context
PR #3 adds access levels and an external shell gate to files also changed by our
desktop settings. Choosing either branch wholesale loses the other's checks.
## Decision
Keep desktop observers and native shell selection; add explicit read/edit/full
tool allowlists, forward the validated absolute file path to native tools, and
enforce the external gate before shell execution. Restricted levels omit external
automation entirely. Cancellation/timeout/failure of a configured gate denies.
## Consequences
This is capability enforcement, not an OS sandbox. Full-access native commands
still have user permissions. Policy failures never cause a fallback to WSL or an
ungated command. Gate configuration is trusted operator configuration.
## How we check it
Test exact tool exposure, alias-like paths, escaping links, denied gate commands,
gate cancellation/timeout, and unchanged behavior when the gate is absent.

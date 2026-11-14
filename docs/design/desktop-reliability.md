# Desktop reliability follow-up

Scope approved by Mohammed: Windows/macOS CI, harness policy reconciliation and
recovery verification. Packaging is excluded. Work is coordinated in issue #22
on the existing Codex integration branch; no cloud-panel or Rust changes.

## Checks that run without accounts

GitHub Actions uses independent Windows and macOS jobs, pinned actions, Node 24
and Bun 1.4.4. Install the frozen workspace lockfile, build once, then run core/CLI
and serialized Electron suites against fresh fixture homes. Capture logs even on
failure and apply job timeouts. Never send provider credentials to CI or retry
failed GUI tests until they appear green. macOS failures must remain visible.

## Tool policy composition

Bring PR #3's read/edit/full capability allowlist and checked absolute file paths
into the current native-shell/observer implementation. Default full preserves
existing behavior. Restricted access never registers browser/desktop automation.
The backend's optional SUFFICE_GATE_CMD must deny shell execution on nonzero exit,
timeout, launch failure or cancellation, using native Git Bash on Windows rather
than WSL. An absent hook preserves existing local execution. Desktop approval
prompts are an additional condition, never a replacement for an external gate.

## Recovery contracts

An unexpected harness process exit rejects every in-flight request and clears
the transport. A later deliberate request can start a fresh worker; never replay
the interrupted tool or prompt automatically. Persisted transcripts remain the
source of recovery, with partial trailing journal writes handled explicitly.
Terminals survive renderer/tab changes but are killed on normal application
shutdown. Closing while terminal creation is pending must not spawn an orphan.
Test these boundaries with fake transports plus isolated real Electron/native
PTY flows. Do not claim recovery from a whole-machine power loss merely because
graceful cancellation passes.

## Completion evidence

Focused adversarial access/gate tests; process-exit/restart tests; interrupted
journal/session tests; terminal cleanup tests; build; full root/CLI and desktop
suites; remote CI results. Publish commands and limits in PR #26 and issue #22.
Actual hosted macOS execution is required before claiming macOS compatibility.

The forced-exit experiment exposed Chromium storage flush delay. Add bounded
native view-state backups (ADR 0007), restore them before chat mounting, and test
the actual forced process-tree exit without a graceful storage flush. This does
not promise orphan cleanup when only one arbitrary browser process is killed.

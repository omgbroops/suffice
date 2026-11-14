# Desktop settings, terminals and editor integration

## Scope and ownership

Publish the accepted desktop shell without replacing its design language. Claim
and integration agreement: https://github.com/sufficelabs/suffice/issues/22.
This document records accumulated work; the new coordination rules arrived after
the implementation. No claim of prior design review is implied.

## Data flow

The renderer calls the preload allowlist, Electron validates requests and owns
native dialogs, settings, filesystem previews and PTYs. The thread router isolates
active sessions in workers. Workers construct the shared Suffice/Pi session with
validated preferences and correlated approval requests. Browser/desktop adapters
are deferred tools; subprocess delivery uncertainty is surfaced instead of retried.

Preferences are validated on disk writes. Atomic rename plus a lock serializes
cross-process updates. Appearance is cached for first paint; secrets remain in
Pi's authentication store. Drafts, selected editor tabs and panel state remain
per-thread. Terminal sessions remain alive across tab switches and are disposed
when their owner closes. File previews are cached independently of the explorer;
loading a preview does not replace the entire panel.

## Interface contracts

- Reuse existing sidebar/workspace and composer material, fonts, radii and borders.
- Keep settings navigation immediate; animate segmented selection and provider
  group collapse, with reduced-motion support.
- Provider dialogs share header/body/footer, keyboard dismissal and initial focus.
  Device codes are selectable read-only cells, not editable OTP authentication.
- Menus keep headings fixed and cap the options scroll area to the viewport.
- Files and Changes share row behavior, hidden folder icons, custom scrollbars
  and fading edges. Diff presentation supports wrapping and split/unified views.
- Terminal tabs size to content; hover replaces the icon with close. Their canvas
  matches the sidebar. Resize updates PTY geometry without replaying output.

## Failure boundaries

Provider cancellation leaves the previous credential intact. Disabled models are
excluded from selection; disabling all models prevents sending. Stale/missing
diff files clear selection. Retention excludes active/viewed sessions and uses
the native trash operation. Exports contain sessions, not authentication files.
Push approval is literal-command detection, not a complete shell policy.

## Verification and integration

Run desktop build, serialized Electron tests, root tests and CLI tests. Record
actual exit codes in PRs, including failures. Existing screenshots and UI review
notes document the visual iterations; no new redesign is part of publishing.
Manual third-party OAuth, cross-platform behavior and production packaging are
not established by fixture tests. Review this stack before Claude's cloud panel
follow-up; do not blindly merge draft PR #5.

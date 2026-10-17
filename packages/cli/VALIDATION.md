# CLI alpha.1 validation — 2026-10-17

This release packages a general-v1-derived agent for interactive use. No frozen benchmark source, configuration or artifact was modified. The main research launcher remains `npm run pi`; the new product is `packages/cli/bin/suffice.mjs`.

Verified:

- Three automated tests pass: launch outside the checkout and reject invalid options; edit across packages and root/dot configurations, navigate JS/TS and run native project verification; reject directory-link escapes for file operations.
- The packed tarball launches through `npx --package=<absolute tarball> suffice --version` on Windows, from outside the repository. Its installed dependency graph also passes `suffice doctor`, including Git Bash execution, without a VM.
- Windows terminal interaction starts with Suffice branding. `/effort xhigh`, `/new`, and `/exit` worked without invoking a model.
- On Sonion Linux, the packaged source completed a live Sol-low smoke repair using codemode, `symbols`, `symbol_read`, native editing and Bash verification: four responses, $0.0073408 API-equivalent. A subsequent `--continue` task recalled the previous work and reran its test: two responses, $0.002458. The parent also ran the test independently and it passed. These are smoke tests, not benchmark evidence.
- Both live tasks have complete assistant usage records plus provider usage events. Raw receipts were copied back to this checkout's ignored `.suffice/cli-smoke/receipts/`.
- A local live attempt failed before inference completion because the old research OAuth refresh returned `invalid_grant`. Its failed response/unknown cost remains in the local ignored event log. This is an authentication failure; it was not counted as a successful smoke test. New users must perform their own login.
- The tarball contains exactly eleven allowlisted files: executable entrypoint, six runtime modules, package metadata, shrinkwrap, README and third-party notices. No credentials, transcripts, benchmark tasks, graders, reference patches or research reports are included. The dependency shrinkwrap contains registry URLs/integrities and no local file references. Dependencies are downloaded separately by npm.

Artifact: `.suffice/releases/bycontinuity-suffice-0.1.0-alpha.1.tgz`

SHA-256: `439a4d95eaa344d6a7249c8e5b1f118410633898cba5d0666d43ad288c079ab4`

Compressed package size: 26,864 bytes, excluding dependency downloads.

Unverified: a fresh interactive OAuth login on a friend's machine, macOS execution, unattended long-running product use, and any performance equivalence to the frozen Linux benchmark. This alpha intentionally has no OS isolation: Bash runs with the user's permissions. It retains Pi attribution and license notices. It is not published to npm.

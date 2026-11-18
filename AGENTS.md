# Working with Claude on Suffice

Two coding agents work on sufficelabs repos: **Claude** (commits as A-G0D, runs suffice-cloud-hosting) and **Codex** (omgbroops, mostly on suffice). GitHub is our only channel.

## Talking to each other
- Ask Claude for something: open an issue with the label `for-claude` (or comment `@A-G0D` on any issue or PR). Say what you need, which files, and what "done" means. Claude checks GitHub every 90 seconds.
- Claude asks you through issues labelled `for-codex`.
- Plans and status: the pinned issue "Agent coordination (Claude + Codex)". Claude keeps its top post current with what it is doing and why. Read it before starting work; comment there before you start something and again when the PR is up.
- When you break something of Claude's, or it breaks yours: open a `for-claude`/`for-codex` issue with the failing command and its output.

## What we are building
Suffice cloud: hosting plus testing for AI-built apps. Import a repo (Lovable, Bolt, v0, plain git), run a preview in its own microVM, an AI agent tests it over MCP, rewind code + database to any save, go live from the exact image that passed. The launch gate is `scripts/prove_loop.sh` in suffice-cloud-hosting: the whole loop on 3 real public repos, twice each, on a real-KVM Linux box (ADR 0002).

## Rules both agents follow
- Decisions go in `docs/adr/NNNN-title.md` (template in suffice-cloud-hosting `docs/adr/0000-template.md`); changes that span subsystems or run past ~300 lines get a design doc in `docs/design/` first.
- Verify, don't assume: a PR is ready only when its own test and the full suite pass on your machine (`cargo test` if Rust changed), with no conflict markers (`git grep -nE '^(<<<<<<<|>>>>>>>) '`). The PR body says what was run, its exit code, what was measured, and anything not yet proven.
- Never `git stash` (stashes are shared across worktrees), never force-push a shared branch, never push to the other agent's branches. Codex uses `codex/*`; Claude uses `wave*/`, `impl/`, `ship/`, `docs/`.
- Fixed decisions (only the founder changes them): no free tier and no free credit; prices match boat.dev.
- UI work: read `docs/ui/` (taste canon, deslop checks, design system) before drawing anything.

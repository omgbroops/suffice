# Suffice CLI — alpha

A lean coding agent with JavaScript codemode, deterministic repository tools, and source navigation. Requires **Node.js 24+** and Bash (Git for Windows on Windows). No VM is required.

This is an early preview. The CLI presents Suffice's own interface and uses Pi 1.2.0 as its agent engine. Pi remains credited here and in third-party notices. It does not launch the stock Pi interface.

## Run with npx

For a local tarball, replace the path below with the package you received:

```powershell
npx --yes --package="C:\path\bycontinuity-suffice-0.1.0-alpha.1.tgz" suffice --help
npx --yes --package="C:\path\bycontinuity-suffice-0.1.0-alpha.1.tgz" suffice login
cd C:\path\your-project
npx --yes --package="C:\path\bycontinuity-suffice-0.1.0-alpha.1.tgz" suffice
```

On macOS/Linux, use the corresponding absolute tarball path. `npx` downloads dependencies into its cache; there is no global install. This package is **not yet published to the npm registry**. The scoped name does not imply registry ownership has been established.

Examples after selecting the tarball with `--package`:

```text
suffice doctor
suffice --print "Investigate the failing tests and fix the cause"
suffice --model gpt-6-luna --effort xhigh
suffice --continue
suffice --cwd /path/to/repo --max-cost 1 --timeout 300
```

The default is GPT-6.1 Sol at low effort. `login` uses your own OpenAI subscription through the engine's OAuth flow. Model availability depends on your account. This preview has no API-key fallback. Existing research credentials can be selected explicitly with `--home C:\path\to\suffice\.suffice\pi`; credentials are never included in the package.

## Working with it

Type a task at `suffice >`. `/help` lists commands; `/model ID` and `/effort LEVEL` change the current session; `/new` starts fresh; `/usage` shows usage; `/exit` leaves. Ctrl+C cancels a running task. `--print` runs one task and returns a nonzero exit code on errors, cancellation or limits. When there is no terminal, supply a task argument or pipe it through stdin.

Repository-wide read/edit/write, native Bash execution, and `symbols`, `symbol_read`, and `symbol_references` are available through codemode. Edits are serialized by the engine. Commands have a 180-second maximum. Per-task limits are 600 seconds, 60 assistant responses, 240 tool calls and $10 **API-equivalent** inference by default. Cost checks happen between responses, so an individual response can cross the allowance; this is not a provider billing cap. Failed and retried responses remain in event receipts. Subscription spending is not inferred from API-equivalent estimates.

The system prompt, codemode settings, navigation algorithm, disabled automatic compaction, and append-only history are derived from the frozen general-v1 baseline. The benchmark execution boundary and model/effort enforcement are **not** included in this interactive product. This CLI is separately versioned; benchmark results do not certify this release's performance.

## Permissions and local data

**Commands execute with your user permissions, without an OS sandbox or per-command approval dialog.** Use a trusted checkout and review changes before committing. File-tool paths are scoped to the selected repository, including configurations, tests and multiple packages; arbitrary Bash commands can access whatever your user account can access. Do not place private graders in an actor-accessible environment.

Credentials, append-only sessions and event receipts are stored in `~/.suffice` (override with `SUFFICE_HOME` or `--home`). Sessions and receipts contain prompts, source/tool output and responses. Keep that directory private. Project instructions such as `AGENTS.md` are loaded. External extensions, skills and prompt templates are not automatically loaded. Suffice adds no analytics; engine analytics and install telemetry are disabled. Requests and selected repository content go to the model provider when you ask it to work.

## Known limits

This alpha uses a simple terminal conversation, not Pi's full-screen TUI. It does not yet provide image input, a diff approval screen, automatic compaction, arbitrary provider configuration, or a session picker. Use `/new` if a long conversation fills the model context.

Navigation parses JavaScript and strippable TypeScript. References are syntactic name matches, not a semantic call graph. TSX/JSX and unsupported TypeScript constructs require native reads/search commands; parsing failures are reported. Bulk navigation skips dot directories, symlinks and `node_modules`, and limits individual indexed files to 128 KiB. You can still read authorized files directly with the native tools.

## Build the preview

From the repository root after installing its dependencies:

```text
node packages/cli/bin/suffice.mjs --help
node --test packages/cli/test/*.test.mjs
npm pack ./packages/cli --pack-destination .suffice/releases
```

The package allowlist excludes tests, research code, fixtures, reports, credentials and transcripts. Public publication and a license for Suffice's own source have not been configured. Third-party software retains its own licenses.

# Suffice CLI — alpha

A lean coding agent with JavaScript codemode, deterministic repository tools, and source navigation. Requires **Node.js 24+** and Bash (Git for Windows on Windows). No VM is required.

This is an early preview built on **Pi 1.2.0's actual interactive terminal interface and agent engine**, with a Suffice header, project selection and Suffice's tool configuration. Pi remains credited here and in third-party notices. The editor, tool rendering, themes, settings, login, model selector and session controls come from Pi.

## Run with npx

From a clone (Node.js 24+ required):

```bash
git clone --branch codex/suffice-cli-alpha https://github.com/bycontinuity/suffice.git
cd suffice
npm ci
npx suffice
```

Launch from the Suffice checkout. Use `/project` to choose a directory with Pi's selector/input dialogs and `/login` to sign in on first use. Recent projects are available in the chooser; `/project ~/code/my-app` switches directly. Each switch starts a separate session so another project's context is not carried over. `--cwd PATH` selects a starting directory. `--print`, `login` and `doctor` remain available without the terminal UI.

There is no global install, tarball-building step or required `--yes`, `--ignore-scripts` or `--package` flag for the clone workflow. `npm ci` installs dependencies once; run `git pull` to get updates. Private repositories require GitHub access. The package is **not yet published to npm**; running `npx suffice` outside this checkout may resolve a different registry package.

macOS and Linux use their normal Bash shell. Windows needs Git for Windows. No WSL or VM is required. A separately shared tarball can still be launched with `npx --package=/absolute/path/to/package.tgz suffice`; that flag only identifies a local unpublished tarball.

Examples from the checkout:

```text
npx suffice doctor
npx suffice --print "Investigate the failing tests and fix the cause"
npx suffice --model gpt-6-luna --effort xhigh
npx suffice --continue
npx suffice --cwd /path/to/repo --max-cost 1 --timeout 300
```

The default is GPT-6.1 Sol at low effort. `login` uses your own OpenAI subscription through the engine's OAuth flow. Model availability depends on your account. This preview has no API-key fallback. Existing research credentials can be selected explicitly with `--home C:\path\to\suffice\.suffice\pi`; credentials are never included in the package.

Experimental repository intelligence is available with `--intelligence tools`
(three evidence-backed graph tools) or `--intelligence guided` (also selects
initial context and appends edit-impact/test recommendations). The default is
`off`. Indexes persist under the CLI home and validate source contents on every
query. Unsupported/dynamic dependencies remain unresolved; recommendations do
not establish behavioral correctness or test coverage. Existing navigation,
search, edit, and execution tools stay available. See the repository's
[architecture and limitations](../../docs/REPOSITORY-INTELLIGENCE.md) and
[measured evaluation](../../reports/repository-intelligence-v1/REPORT.md).

## Working with it

Type a task in Pi's normal input editor. `/project [PATH]` (or `/cd`) changes projects; `/login` opens Pi's login flow; `/model` opens its model selector; `/settings` opens preferences; `/new` starts fresh; `/resume` opens previous sessions; `/usage` shows current-run usage. Pi's keyboard shortcuts and tool output rendering are retained. Escape interrupts; Ctrl+D exits from an empty editor. `--print` runs one task and returns a nonzero exit code on errors, cancellation or limits. When there is no terminal, supply a task argument or pipe it through stdin.

Repository-wide read/edit/write, native Bash execution, and `symbols`, `symbol_read`, and `symbol_references` are available through codemode. Edits are serialized by the engine. Commands have a 180-second maximum. Per-task limits are 600 seconds, 60 assistant responses, 240 tool calls and $10 **API-equivalent** inference by default. Cost checks happen between responses, so an individual response can cross the allowance; this is not a provider billing cap. Failed and retried responses remain in event receipts. Subscription spending is not inferred from API-equivalent estimates.

The system prompt, codemode settings, navigation algorithm, disabled automatic compaction, and append-only history are derived from the frozen general-v1 baseline. The benchmark execution boundary and model/effort enforcement are **not** included in this interactive product. This CLI is separately versioned; benchmark results do not certify this release's performance.

## Permissions and local data

**Commands execute with your user permissions, without an OS sandbox or per-command approval dialog.** Use a trusted checkout and review changes before committing. File-tool paths are scoped to the selected repository, including configurations, tests and multiple packages; arbitrary Bash commands can access whatever your user account can access. Do not place private graders in an actor-accessible environment.

Credentials, append-only sessions, recent-project paths and event receipts are stored in `~/.suffice` (override with `SUFFICE_HOME` or `--home`). Sessions and receipts contain prompts, source/tool output and responses. Keep that directory private. Project instructions such as `AGENTS.md` are loaded. External extensions, skills and prompt templates are not automatically loaded. Suffice adds no analytics; engine analytics and install telemetry are disabled. Pi's helper downloads and model access remain enabled; its standalone CLI update advertisement is hidden because updates come from the Suffice repository. Requests and selected repository content go to the model provider when you ask it to work.

## Known limits

The interface retains some upstream Pi wording/help and its normal engine version display. The Suffice header does not imply an independent UI implementation. Preferences are currently session-local, external extensions remain disabled, and only the configured OpenAI model catalog is supported by the CLI flags. Automatic compaction remains off; use `/new` if a conversation fills the model context. Pi's native session picker, manual controls and renderers are available, but this is not an OS sandbox or a mandatory diff approval flow.

Navigation parses JavaScript and strippable TypeScript. References are syntactic name matches, not a semantic call graph. TSX/JSX and unsupported TypeScript constructs require native reads/search commands; parsing failures are reported. Bulk navigation skips dot directories, symlinks and `node_modules`, and limits individual indexed files to 128 KiB. You can still read authorized files directly with the native tools.

## Build the preview

From the repository root after installing its dependencies:

```text
node packages/cli/bin/suffice.mjs --help
node --test packages/cli/test/*.test.mjs
npm pack ./packages/cli --pack-destination .suffice/releases
```

The package allowlist excludes tests, research code, fixtures, reports, credentials and transcripts. Public publication and a license for Suffice's own source have not been configured. Third-party software retains its own licenses.

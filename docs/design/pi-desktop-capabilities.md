# Pi 1.5.2 desktop capability audit

Audited against the installed Pi 1.5.2 SDK and the current Suffice desktop integration. This describes the actual integration, not everything the dependency could theoretically do.

| Capability | Current Suffice state | Remaining work |
| --- | --- | --- |
| MCP | Not wired into shared Suffice sessions | Server configuration, connect/disconnect, auth, project overrides, tool discovery and scoped approvals; a settings page alone is insufficient |
| Skills | Automatic loading disabled by noSkills in packages/cli/src/session.mjs | Trusted project/user skill discovery, invocation and enable/disable UI |
| User extensions / Pi packages | Automatic extension loading disabled by noExtensions; Suffice installs its own factories | Package installation/update/removal, trust, extension commands and desktop adapters for custom tool/widget renderers |
| Prompt templates | Disabled by noPromptTemplates | Reusable prompts, arguments and slash-command picker |
| Session tree / branching | Whole-conversation fork and saved transcript resume exist | Message-level fork/rewind, branch tree and session import UI |
| Context management | Automatic compaction and usage meter exist | Compact-now action, context inspection and compaction-history controls |
| Message queue | Steering an active agent exists | A separate queued follow-up flow and queue editing/reordering |
| Custom model/provider definitions | models.json is read by the shared model runtime | Desktop editing/validation for custom endpoints, models and compatibility settings |
| Provider auth / model visibility | Pi-backed connection flows and model toggles exist | End-to-end live account authorization must be completed by the user; account-switching would need additional design |
| Browser / desktop tools | Suffice's programmatic automation tools exist | They are separate from Pi MCP and do not imply arbitrary MCP integration |

The session loader deliberately passes noExtensions, noSkills, noPromptTemplates and noThemes. The SDK allowlist and active-tool set contain Suffice's repository/automation tools plus Codemode. There are no MCP, manual-compaction, session-tree or follow-up-queue endpoints in desktop preload/worker routing. Pi terminal themes are not directly interchangeable with Suffice's web appearance system.

Useful next sequence: MCP and skills, then prompt templates and extension/package support, then richer session/context/queue controls. Plan mode and autonomous subagents are not built-in Pi features; Pi documents them as extension/customization options, so they should not be described as missing switches that merely need turning on.

Upstream reference: https://github.com/earendil-works/pi/tree/v1.5.2/packages/coding-agent/docs

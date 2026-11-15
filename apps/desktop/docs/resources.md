# Desktop Pi resources

Open Settings to manage MCPs, Skills, Extensions and Prompt templates. These use Suffice's agent directory (`~/.suffice`, or `SUFFICE_HOME`). They do not modify another Pi installation's profile.

- **MCPs:** add a command and JSON arguments, or an HTTP endpoint. Advanced configuration includes environment variables, headers and exposure. Enable or disable servers, check connections, and sign in or out of remote servers through Pi's OAuth flow.
- **Skills:** discover local and packaged skills, import a folder, create or edit `SKILL.md`, and toggle whether the agent sees a skill. Pi can select skills automatically; `/skill:name` invokes one explicitly.
- **Prompt templates:** add or edit Markdown prompts and invoke them with `/name`. Pi expands positional arguments such as `$1` and `$ARGUMENTS`.
- **Extensions:** import a local extension or install a Pi package from npm, Git or a local directory. Installed packages can be updated or removed. Extensions execute code with the agent's access; inspecting this page does not import them or install missing packages.

Read/edit-only harness sessions retain their tool allowlists and do not load external extensions or MCP servers.

Project-local Pi resources require explicit trust before loading. The desktop asks before the first trusted load; the decision is kept in Pi's trust store. User/global resources remain separate from project overrides.

Standard extension input, selection, confirmation, editor dialogs, text widgets and notifications have desktop adapters. Terminal component factories, raw terminal input, terminal themes, custom editors and terminal autocomplete providers cannot render in the web interface. They report a clear error; use the Pi terminal interface for those extensions. Extension commands that replace sessions or switch projects must use Suffice's existing New session, Fork and sidebar controls so that per-chat workers stay isolated. Reload and history navigation are connected to the active Pi session.

External provider OAuth and third-party package behavior vary by service. Local MCP transport/tool calls, resource reload, trust, local package management and desktop dialogs have fixture coverage; the tests do not authenticate real external services.

# Pi upgrade and desktop adoption

## Runtime and catalogs

One shared initializer uses auth.json, models.json and catalog.json under SUFFICE_HOME. The explicit models configuration path enables Pi's locked FileModelsStore rather than the in-memory fallback used when modelsPath was null. Bundled/cached models paint immediately; network refreshes have a deadline, coalesce, and leave cached data intact on failure. Offline mode performs no network refresh. Successful refreshes notify desktop consumers, which reload disk data and preserve IDs, disabled choices and active model selections. Settings has a manual refresh with last-check/failure feedback.

## Desktop

Composer and settings share provider icon aliases. With no selectable model the composer opens Providers. A missing previously selected model is shown as unavailable and requires an explicit replacement. Fork creates a new Pi session using the original conversation's project, or asks for an existing directory if its original directory is gone. The original transcript and ID remain untouched; the fork gets its own view state and no inherited PR ownership.

Mermaid fences render as SVG after streaming settles. Pie and flow diagrams use the current theme. Click directives are stripped and parsed as data; safe HTTPS destinations become explicit links on the rendered nodes. Callback directives never run. Invalid/oversized diagrams keep their source. Tool input/output scrolling reaches within 3px of the enclosing widget edge while text keeps its existing inset.

## Upstream adoption

The dependency upgrade brings Codemode queueing, schema/extension fixes, provider/auth updates and compaction fixes. Enable model APIs in Codemode for supported classifiers, rather than pretending classifiers are chat models. Pi terminal auth, MCP overrides and Nix remain upstream CLI capabilities; existing project trust boundaries are not silently relaxed. Product defaults change only when no saved choice exists.

## Validation

Exercise offline cache restoration, refresh coalescing/deadlines/failure fallback, new model discovery, preserved visibility choices, fork identity and source immutability, missing-directory selection, native IPC and desktop actions. Render pie/flow charts and safe links; test malicious directives. Run harness/CLI/desktop suites and renderer build. No distributable/package build. Native macOS and real provider entitlements remain separate live checks.

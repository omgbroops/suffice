# 0030: Safe mathematics and shared search metadata

Tokenize LaTeX before Markdown escapes its delimiters. Sanitize Markdown first, then replace only per-render nonce placeholders with KaTeX output using trust=false, bounded size/expansion and fresh macros per formula. MathML remains available for accessibility. Code spans/blocks and ordinary currency stay literal; incomplete or invalid formulas remain readable. Bundle fonts locally and load the math renderer only when needed. Code copy controls are generated after sanitization and copy the code element rather than rendered controls.

Spotlight results reuse sidebar status and provider-history helpers. The directory supplies live job state and chat-scoped diffs; active provider logos remain last and earlier providers are dimmed. Keep result metadata on one line with truncation and preserve keyboard navigation. Spotlight input is explicitly excluded from modal form-field fills/outlines.

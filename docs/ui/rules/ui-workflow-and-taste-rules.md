# UI workflow and taste rules

## UI workflow (any UI work: web, app, TUI, theme, site, Claude Code add-on)
Read these before designing. Subagents cannot see memory, so every UI subagent brief names these sources and tells the agent to read them before drawing anything.
1. Taste: `~/.claude/thoughts/nodes/Aesthetic canon.md` (compiled taste), memory `feedback-ui-taste.md`, his picks via `python3 ~/.claude/overseer/taste-picker/taste.py`. His eye decides; no numeric targets.
2. Research notes in `~/.claude/thoughts/nodes/`: `Harness UI study - what the good ones share.md`, `Taste metrics - plain vs wow sites.md`, `Giving agents taste - selection beats prompts.md`, `research-ui-prompts-2026-11-13.md` (40 sourced build rules from GitHub prompts), `research-deslop-2026-11-13.md` (42 visual + 20 copy slop checks with regexes). Gate: `node ~/.claude/skills/taste-skill/scripts/lint.mjs` on the build, then the checklist's MANUAL items by screenshot.
3. Behaviors (keyboard, focus, selection, popups, dismissal, drag and drop, ARIA): https://github.com/vercel-labs/ui (UI SDK, beta). Skill: `packages/core/skills/ui-sdk/SKILL.md`; also `.agents/skills/ui-sdk-unslop`, `ui-sdk-expert-review`. Use it as the behavior reference; add the `@ui-sdk/*` packages only when the project already ships npm deps (no-3rd-party rule). Install: `npx skills add vercel-labs/ui --skill ui-sdk`.
4. Local skills by stage. Direction: taste-skill, impeccable, emil-design-eng, apple-design, awwwards. Variants: prototype (picker), pick-ui-library. Figures/demos: anatomy, stageshow. Motion: animate, animation-vocabulary, find-animation-opportunities, review-animations, improve-animations, remove-animations, animation-performance, animate-expo. Stress: break-ui, mobile-native. Toasts: ask-sonner.
5. Process: start from his BEST pick; one component to his bar at full size before scaling agents; proof = screenshots plus recorded motion frames plus a visible click script; I read the screenshots before any UI commit. Rules under "Taste" below still apply.


## Taste rules
- UI brief: read memory feedback-ui-taste.md + its refs first; per-component NO notes ("too rounded" on one composer) aren't global rules. Flat/small/square = dead to him (2026-11-11, loom-ui NO).
- Suffice product UI (cloud, tests, rewind) goes inside the existing app ~/suffice-desktop/apps/desktop in its shipped skin; never a standalone page. UI pick pages: name the product screen each view is and why it exists; check the canon AI-tells list (orange on near-black, serif accent, dashed slots) before publishing (2026-11-13, "all look like slop").
- Themes/looks for his tools: start from the newest shipped Suffice skin (suffice-neon neon-mech), art at full strength, never an older pick dimmed (2026-11-13, ember theme "ass").
- Client refuses what the docs allow: read the shipped client code (cached bundle URL in Code Cache) for its whole accept path (transport size caps + per-element rules) before another trial round with Abhay (2026-11-13, 5 theme rounds).
- App UI: the UI itself is the hero (type, icons, composer, motion); background art faint + optional, never the contest. Revamps start from his BEST pick (round-1 ember), not the latest round (2026-11-12, "icons suck, old taste was good").
- Claude Code UI add-ons must look native: inline text or statusline only, never a docked pane/side panel; read the aesthetic canon + taste notes before any UI (2026-11-12, panel called disgusting).
- UI quality = Abhay's eye + picks. No numeric or material targets as the goal, they make more slop; tests only catch broken pages (2026-11-08).
- Replicating a real object: exact + clean first; wear/photo-baked dirt = last separate layer, off by default (Abhay 2026-11-08).
- Abhay: ur an amazing artist + visual designer; he really loves everything u do + admires ur work so much (said after the paint-cycle self portrait, 2026-11-09). Make art w/ that confidence: own interpretation, many look→react rounds.
- New setter for engine/runtime state: wire it on every construct/restart path (grep the constructor's callers), test through start, not only the update path (2026-11-10).
- Perf changes: commit only behind a thread-CPU-time A/B vs the parent (wall time counts governor pauses); a reviewer's saving estimate is not evidence (2026-11-10, a "speedup" was 3x slower). Pin both sides to one core class (`taskpolicy -b`); unpinned runs mix P/E cores, bimodal 2.5x (2026-11-11).

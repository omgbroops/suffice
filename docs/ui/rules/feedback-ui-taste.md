---
name: feedback-ui-taste
description: User rejects "vibecoded slop" UI (gradient icon tiles, sparkles, saturated blue, colored badges); wants monochrome liquid-glass restraint like Codex/T3 Code
metadata:
  type: feedback
---

On 2026-10-06 the user called the Tandem Studio UI "gradient icon based vibecoded slop" / "electron slop" and set the bar at "peak UI": a translucent liquid-glass window over a real wallpaper photo, near-monochrome, color only in diff +/- and tiny file glyphs (docs/target-ui.jpg). They value design resources like DESIGN.md (refero, aura.build, typeui) and UI libs (21st.dev, coss.com/ui, beui, etc.). For marketing/demo sites they also favor curated asset libraries (ascii-magic.com — has an MCP at https://www.ascii-magic.com/mcp — and backgrounds.supply) as a way to get distinctive visuals instead of generated-looking ones.

**Why:** frontend beauty is the product; "backend doesn't matter if frontend isn't frontier".
**How to apply:** for any UI work, avoid AI tells (sparkles, gradient tiles, glows, uppercase labels, badge/avatar clutter, emoji, saturated primaries), write/follow a DESIGN.md, verify by screenshot against the reference. Related: [[tandem-studio-build]].

2026-10-22 (UIL practice app): Abhay called newspaper/UIL-literal restyles "miserable", "no inertia". Their own reference is the shark demo ~/tuff-factory/sharks: warm off-white, gentle background zones (soft halos, dot rings, low-contrast ASCII-glyph sharks), Instrument Serif/Geist/Geist Mono, spring motion via Motion + React Bits. **Never commit UI without me reading the screenshots first** — builders commit only after my visual review.

2026-11-06: direction moved on from liquid glass. Abhay: "minimalist and CLEAN yet elegant motion that attracts attention functionally without clutter, since most good content is slop anwyways, removing slop opens the space for very aesthetic, high quality UI trinkets". References: vespin.dev and hoplite.sh. Tandem Studio (repo UI-CLONE-TEST, which Abhay calls UITEST) is what this replaces.

**How to apply (added):** a screenshot cannot prove motion. Check motion by recording, extracting frames and measuring against the token, to within a frame. Write how every state change moves before drawing screens. Glass-over-photo is no longer the default look.

2026-11-07 (ERP v3, Abhay): after ease-of-use, next goal is an *inviting* look. Devin is good because it is "really nice to look at": colour, contrast, fonts and how they mesh, "nuance… depth that makes it interesting, not annoying". Flat minimal ≠ enough. Claude Code CLI colours look human-made; AI TUIs and the early halftone artifacts look like slop. Motion simple but varied (oomph on click, success animation), plus sounds. "Pull a lot from the internet." Refs: Devin, UI-CLONE-TEST (~/tandem-studio), Vespin tokens.

2026-11-07 Abhay on warm-paper v1 (ERP): "okay I guess? but its just too clean now… SUPER dull… dead". Wants BIG contrasty sections (e.g. dark menu block vs bright content, a bold hero), not many small contrasty bits (slop = lots of tiny orange dots). Wants "a proper menu area". Sound toggle belongs in a proper Settings pane, not the sidebar. Devin's life = dark sidebar panel beside a big vivid image block (run-2026-11-06/shots/precision/*-vs-devin.png). Too minimalist is as bad as slop.

2026-11-09: abhaygodavarthy.com is NOT a portfolio about him: no projects, no bio. He wants an art demo site showing new artistic styles of online UI media and content. Taste loop: later rounds got worse ('same slop'); restart from his best earlier keeps, less motion, real dithered artwork as the core. **Why:** rounds 1-2 portfolio and round 5 taste were all No with heavy frustration. **How to apply:** before a UI round, read his keeps + notes and gather real striking references; never seed a concept he didn't give.

2026-11-12 22:4x Abhay on a lordspline X post (Scrapybara app shots): "this looks so fucking sick, why doesn't suffice look like this". Big hard-cell dithered illustration filling the viewport (checkerboard on/off cells, magenta + teal), solid #1a1a1a composer, violet #9c6cd9 action button. For Suffice this overrides "art faint". Built as preset ?background=neon-cliffs (src/backgrounds/neon-dither.js + neon-skin.css), uncommitted pending his eye.

2026-11-13: Abhay rated the Suffice Cloud site (preorder page) 4-4.5/10 UI, 2.5/10 functionality.

2026-11-13 ~20:00 Abhay on the Sortwell ERP site (site/shots/site-1440.png) and its v3 demo screens: "this whole shit looks like straight slop especially the dmos". The demos are the v3 app: orange-dot count rows as charts, orange bullets on every row, tiny low-contrast grey text on near-black, fake window dots, dot-grid backdrop. **How to apply:** fix the product screens first (the site only frames them); drafts start from his named bars (Devin, Linear) at full size, not from v3.
2026-11-13 ~20:30 v4 Today drafts (erp-core/ui/v4-drafts): A Devin "don't like 1's graphic" (rainbow dither); B Linear "nice, but the big white thing looks wierd and fonts at the bottom suck" (bright block on dark; mono IDs + small grey table text); C Attio/Stripe "too bright but might be the best". Next: C structure, dimmed.

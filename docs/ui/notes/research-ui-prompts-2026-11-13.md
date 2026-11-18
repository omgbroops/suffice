# UI-generation prompts and design skills: sources and rules (2026-11-13)

V = seen this session (gh api output or file read). A = assumed, not opened.

## 1. Sources

| Repo | Stars | Last push | What it is | Verdict |
|---|---|---|---|---|
| anthropics/skills (skills/frontend-design) V | 194,151 V | 2026-11-06 V | Official frontend-design SKILL.md, read in full V | Best single prompt. Anti-default list plus plan-review-build-critique process. |
| vercel-labs/ui V | 3,847 V | 2026-11-13 V | ui-sdk behaviors library; skills: ui-sdk-write-code, expert-review, unslop, write-docs V | Code and a11y rules only, almost nothing visual. Useful for process (twin impl, lint, cold read). |
| x1xhlol/system-prompts-and-models-of-ai-tools V | 144,660 V | 2026-10-12 V | Collected prompts: v0, Lovable, Same.dev, Orchids, Leap.new, Cursor, Devin, Google V | Best raw prompt source. v0, Lovable, Same, Orchids files grepped V. |
| asgeirtj/system_prompts_leaks V | 71,356 V | 2026-11-13 V | Daily-updated leaks incl. Cursor, Antigravity A | Not opened for design content A. |
| elder-plinius/CL4R1T4S V | 52,748 V | 2026-11-09 V | Leaked prompts (Lovable, Replit, Cursor) | Not opened A. |
| nextlevelbuilder/ui-ux-pro-max-skill V | 149,113 V | 2026-11-10 V | Design-intelligence skill with CLI, stacks, gallery (tree listed only) | Large; contents not read A. Check before copying. |
| Leonxlnx/taste-skill V | 115,065 V | 2026-11-08 V | Installed locally; read House rules V | Strongest checkable bans list. |
| pbakaus/impeccable V | 109,628 V | 2026-11-14 V | Installed locally; design vocabulary, critique, audit | Already covered. |
| PatrickJS/awesome-cursorrules V | 41,158 V | 2026-05-30 V | Cursor rule files per framework | Stale, framework-centric A. Skip for design. |
| Ilm-Alan/frontend-design V | 167 V | 2026-09-26 V | Eight aesthetic anchors with locked tokens; content-discipline section read V | Adds the "content is not design" rules. Small but sharp. |
| dani-z/frontend-design-skill-benchmark V | 24 V | 2026-03-07 V | Eval: skill vs baseline, "100% vs 28% pass rate" (description only) | Evidence that rubric-style evals work; method not read A. |
| Moddingflow/better-design V, aladicf/better-web-ui V | 51, 52 V | 2026-10, 2026-05 V | Design skills with DESIGN.md/tokens/motion | Not read A. |
| Charles-Belcort/design-system-skill V, 32comic/design-md-generator V | 0, 1 V | 2026-11, 2026-04 V | Google Stitch DESIGN.md format skills | Tiny. No official Stitch prompt repo found with stars. |
| bolt.new system prompt | not found | - | gh search "bolt.new system prompt" returned no repos V | Not in x1xhlol tree listing V either. Treat as unavailable. |

Local skills (taste-skill, impeccable, emil-design-eng, apple-design, awwwards) were skimmed by heading only V. Emil and Apple are motion/interaction; awwwards is a concept-first pipeline with a Hard rules block V.

What the external sources add beyond local skills: (a) the official frontend-design list of five "AI default" clusters; (b) v0/Lovable token and palette-count limits; (c) Ilm-Alan's content-fabrication bans; (d) vercel's contrast numbers and "report each command with exit code" closing rule.

## 2. Rules for a high-craft marketing site

Source tags: AF = anthropics frontend-design V; TS = taste-skill House rules V; AW = awwwards Hard rules V; V0 = v0 prompt V; LV = Lovable prompt V; SM = Same.dev prompt V; IA = Ilm-Alan V; VU = vercel ui-sdk V. "Recurs" means two or more sources.

### Typography
1. Two typefaces at most, usually one; if two, clearly distinct. (AF, TS, V0 "max 2 families". Recurs.)
2. Body 16-18 px, line-height 1.45-1.6. (AW, V0 1.4-1.6.) Serif body gets slightly more leading than sans. (AF)
3. Body measure under 80 characters per line. (AF)
4. Display tracking negative and set per size, not one global value. (AW)
5. Every heading at most two lines at every viewport width; fix by cutting words, then widening measure, size last. (TS)
6. Statement paragraphs (large intro sentences) max 36 px desktop, 24 px phone, about 25 words. Larger than that is a headline. (TS)
7. Small UI text 12-14 px only if contrast passes AA. (AW)
8. No tiny uppercase letter-spaced labels; sentence case at readable size. (AF, TS. Recurs.)
9. No single accented word in a headline (italic, color, serif swap). (AF, TS. Recurs.)
10. No monospace outside real code; use tabular figures for aligned numbers. (TS, AF lists mono data labels as a tell.)

### Color
11. Palette of 3-5 colors total. (V0.) AF asks for 4-6 named hex values in the plan; both agree on a small named set.
12. All color through semantic tokens (CSS variables), never raw `bg-white`/`text-black` in components. (LV, V0 "semantic".) Define in one place, HSL or equivalent.
13. Avoid the assistant palette: cream (~#F4F1EA) plus terracotta (~#D97757); near-black with one acid accent; violet/indigo by default. (AF, TS, V0 "never purple prominently", SM "avoid purple, indigo, blue". Recurs in four.)
14. Avoid tinted near-black (#0B0B0B, #111) standing in for black without a reason. (AF)
15. Gradients: default none. If used, 2-3 stops, analogous colors. (TS none, V0 limit, AF "gradient washes as decoration" is a tell.)
16. Text contrast 4.5:1; control edges, focus rings, state fills 3:1. Check in a real browser, not jsdom. (VU)

### Layout and composition
17. Do not chop content into identical rounded cards with one radius and one soft shadow. (AF "SaaS-card kit", TS "no rows of identical cards", "no icon-topped feature cards".)
18. Radius follows hierarchy (different radius for button, card, container), not one value everywhere. (AF)
19. No shadows on resting surfaces; shadows only for floating things (menu, dialog). Use tone steps between surfaces. (TS; AF flags uniform rgba(0,0,0,.1).)
20. Equal outer margins; no section pushed to one side with the other half empty. No blank stretch taller than about half a screen. (TS)
21. Use spacing from a scale (Tailwind steps, `p-4` not `p-[16px]`). (V0)
22. Visual structure must encode information: numbering (01/02/03) only for real sequences, `<ol>` if order matters. (AF, TS, IA. Recurs.)
23. No eyebrow label above headings, no pill badge or "New" chip above the headline. (AF, TS.)
24. Nav: plain bar with wordmark, few links, one action. No floating glass pill, no backdrop-blur panels. (TS)
25. Cascade hygiene: avoid type selectors like `.section` fighting element selectors like `.cta` on padding/margin. (AF)

### Hero
26. Hero opens with the most characteristic thing of the subject (headline, image, live demo, interactive moment). The big-number-plus-small-label-plus-gradient treatment is the default and needs a reason. (AF)
27. One `h1` on the first screen that states what the product is and does. (TS)
28. Show a real picture or real interface fragment, never a fake dashboard of grey bars, gradient blob, or emoji. (TS, V0 "never leave placeholders/fake images", IA no fabricated data.)

### Copy
29. CTA names the outcome ("Save changes", not "Submit"); the same action keeps its name across button, toast, and state. (AF)
30. Plain verbs, sentence case, active voice; no themed replacement for standard copy ("Authenticate Session" for "Next"). (AF, IA.)
31. No fabricated data, no filler labels, no unicode glyphs as icons, no `//` kickers. If removing a string removes no information, cut it. (IA, AF)
32. Errors say what went wrong and how to fix it, never apologize; empty states point to an action. (AF)

### Motion
33. Page-load motion: one orchestrated sequence or one reveal. Fade-and-slide-up on every section and hover transitions on every card are the generic default. (AF)
34. Animate only `transform`, `opacity`, `clip-path`; never layout properties. One easing family; larger elements slower; stagger 20-80 ms. (AW)
35. Respect `prefers-reduced-motion`. (AF, AW.)

### States, responsiveness, a11y
36. Every interactive element has hover, focus-visible, and active states; inline body links keep an underline at rest. (AW, AF "visible keyboard focus")
37. Mobile-first; verify down to phone width. (V0, SM "responsive", AF.)
38. Semantic HTML, alt text on images, named controls (`aria-label` when no visible text). (V0, VU.)
39. Local image paths, never blob or hotlinked URLs. (V0, Orchids per grep summary V.)

### Restraint
40. Spend boldness in one place: one memorable element, everything else quiet. Before finishing, remove one decoration. (AF, AW "concept decides the score".)

## 3. Prompt structure patterns

**anthropics/frontend-design** (most instructive):
1. Role and stakes first: "Approach this as the design lead at a design studio... This client has already rejected proposals that felt cliché."
2. Ground in subject matter before any style decision.
3. Principles, written as defaults to avoid rather than styles to copy: "they are defaults rather than choices."
4. A calibration list of the model's own habitual outputs, each with a hex or pattern, so the model can recognize its tells.
5. Explicit escape clause: "the brief's own words always win, including when it asks for one of these looks."
6. Two-pass process: write a token plan (4-6 named hexes, type roles, layout in one-sentence prose plus ASCII wireframe), review plan against "would I produce this for any similar page", revise and say what changed, then code.
7. Close with quality floor (responsive, focus, reduced motion) and self-critique with screenshots.
Rules dominate; almost no worked examples. The calibration list acts as negative examples.

**taste-skill**: numbered run (brief, argument, direction, idea, words, build, gate, look, move, report), then a two-column table "Rule | Instead". Every ban ships its replacement. Measured by an `inspect.mjs` script, so rules are machine-checkable. Best pattern for a checkable gate.

**Ilm-Alan**: one-line mantra at top ("Reach for the unexpected. Fidelity to the anchor...") then pick-one anchor with locked tokens; a "forbidden" list with concrete bad strings as examples.

**v0 / Lovable / Same system prompts**: flat bullet lists of MUST/NEVER in caps ("ALWAYS use exactly 3-5 colors total"), mixed with tool and file-format sections; tokens defined in named files (index.css, tailwind.config.ts) with a CRITICAL flag. They give numbers (3-5 colors, 2 fonts, 1.4-1.6) but no taste reasoning. Good for floors, weak for distinctiveness.

**vercel ui-sdk skills**: "Read first" then "Pick your path", "Rules for every path", and "When you're done" with a closing report: "Report each command you ran with its exit code, anything you couldn't check." Pattern worth copying for gates.

Common ordering across the best: context/brief, direction (plan), hard rules table, build, measured gate, look at screenshots, report.

## 4. Gaps and cautions
- bolt.new and Google Stitch prompt files were not found (V for bolt search; Stitch only via third-party DESIGN.md skills).
- Line numbers for v0/Lovable/Same come from a grep summary that a hook shortened; re-grep before quoting.
- ui-ux-pro-max-skill (149k stars) was only listed, not read.
- Star counts here are unusually high; V as returned by gh api this session.

# Deslop checklist for web UI and copy (2026-11-13)

Marks: V = seen this session (file or gh output read). A = assumed or only seen as a listing line.
Not repeated here: the Aesthetic canon HATES list, declauding register.md. This adds checks to them.

## 1. Sources

| Source | Stars | Last push | What it is | Verdict |
|---|---|---|---|---|
| github.com/Leonxlnx/taste-skill (local copy in ~/.claude/skills/taste-skill) | 115065 V | 2026-11-08 | Art-direction skill; dated tells registry, copy rules, zero-dependency `scripts/lint.mjs` | Best. Ready regexes. V |
| github.com/heydamir/unslop, `references/signs.md` | 15678 V | 2026-11-08 | Sign-to-fix list in 10 groups for vibecoded UI. CC BY 4.0, credit Damir Sokolovsky | Best for fixes. V |
| github.com/miqdadbadjuber/anti-slop | 9137 V | 2026-11-13 | 40 rules R-01..R-40, PASS/FAIL gate, copywriting skill with ~25 prose patterns. MIT | Best for copy. Rule text read for R-01..R-31 only. V |
| github.com/pbakaus/impeccable (local copy) | 109628 V | 2026-11-14 | Design vocabulary skill; `craft-floor.md` Refuse list; `detect` script | Good. Did not run `detect`. V |
| github.com/Nutlope/hallmark | 54535 V | 2026-11-11 | Anti-slop design skill: gates, craft, layout, fonts, imagery | Not read past README listing. A |
| github.com/vercel-labs/ui `.agents/skills/ui-sdk-unslop` | 3847 V | 2026-11-13 | One SKILL.md; removes slop from code comments (restating comments, filler JSDoc, "robust/seamless/simply/just"), lint `comment-length` | Code-comment slop only. Reuse the hedge-word list. V |
| github.com/theclaymethod/unslop | 1054 V | 2026-09-07 | Prose de-AI skill | Not read. A |
| github.com/FeedHive/ai-slop-detector | 111 V | 2026-10-12 | 120 writing patterns plus skill | Not read. Candidate pattern list. A |
| github.com/stephenturner/skill-deslop | 439 V | 2026-03-18 | De-AI scientific writing | Not read. Low relevance. A |
| github.com/dmmulroy/anti-slop | 6070 V | 2026-10-14 | Oxlint rules for TS/JS | Code, not UI. Skip. A |
| github.com/peteromallet/desloppify | 4130 V | 2026-10-27 | Code slop harness | Code, not UI. Skip. A |
| github.com/agiwhitelist/auteur, Laith0003/ux-skill (171-rule linter), superdesigndev/superdesign-skill, airtaxi/frontend-slop-guard | 1047 / 104 / 1007 / 2 V | 2026-08 to 2026-11 | UI slop linters and skills | Listing only, not opened. Check Laith0003/ux-skill first if a bigger rule set is needed. A |
| Practitioner blog posts on "AI website tells" | n/a | n/a | WebSearch not run | Gap. The tells below come from the repos above, which cite them. A |

## 2. Visual checklist (42 items)

Format: tell | check | instead. `rg` patterns run over css, html, jsx, tsx, vue, svelte. Source tag in brackets: T taste-skill, U unslop, A anti-slop, I impeccable.

### Color and surface
1. Violet, indigo, purple-to-blue or purple-to-pink gradient [T,U,A] | `(from|via|to)-(violet|purple|indigo|fuchsia|pink)-\d+`, `linear-gradient\([^)]*(#[78][0-9a-f]{2}[0-9a-f]{3}|rgb\(1[0-9]{2},\s*[0-9]{2},)` | One neutral surface plus one accent, used once or twice per screen.
2. Gradient text [T,U,I] | `background-clip:\s*text`, `bg-clip-text`, `text-transparent` | Solid text color.
3. Colored glow shadow [U,A] | `shadow-\[0_0_`, `box-shadow:\s*0\s+0\s+\d+px\s+rgba`, `drop-shadow` on emoji | Surface steps plus 6 to 10% hairline.
4. Radial wash or blurred blob behind content [U] | `blur-(2xl|3xl)`, `filter:\s*blur\(\d{2,}`, `radial-gradient` count over 1 | Remove, or use one real product visual.
5. Neon or high-contrast colored border [U] | `border-(violet|purple|cyan|fuchsia)-\d+`, `border.*rgba\([^)]*,\s*0?\.[5-9]` | Hairline at 6 to 10% opacity.
6. Glassmorphism on more than 2 elements [T,A] | count of `backdrop-blur|backdrop-filter` over 2 | Plain raised surface with a hairline. Blur on one element at most.
7. Soft grey shadow under every card [T,A] | count of `shadow-(md|lg|xl|2xl)` over 3 | Elevation only for popovers and modals.
8. Colored side-border on cards [I] | `border-[lr]-[2-9]`, `border-(left|right):\s*[2-9]px` | No side stripe. Use a full 1px hairline.
9. Near-black page plus one neon accent [T] | background `#0[0-9a-f]{5}` plus accent in cyan/lime/violet range; `#161616` exact | Tint the neutral ramp toward the product's world.
10. Framework default colors [T] | `#3b82f6`, `#6366f1`, `#8b5cf6`, `#06b6d4` | Pick a hue from the product's world.
11. More than 3 core colors plus 1 accent [A] | distinct hex count over 8 after removing greys (needs script) | Cap the palette.
12. Five near-identical tints of one hue for text [U] | more than 3 distinct text colors per hue | Three text roles from one ramp.

### Type
13. Weight 800 or 900 headings [U] | `font-(extrabold|black)`, `font-weight:\s*[89]00` | 400 to 600, hierarchy by size.
14. Default typeface everywhere [T,A] | `Inter|Poppins|Montserrat|Roboto|Space Grotesk|Plus Jakarta|Outfit|Sora|Geist` in font-family with no second family | A face chosen for the product, with a written reason.
15. Uppercase wide-tracked micro labels [T,U,A] | `tracking-(wider|widest)`, `letter-spacing:\s*0?\.[1-9]\d*em` near `uppercase` | Sentence case, normal tracking.
16. Eyebrow or kicker above every heading [T,I] | small element directly before `h1|h2` with `uppercase` or `text-xs` | Delete. Heading alone.
17. 01/02/03 section numbering, mono micro-meta, crosshairs, local time, coordinates [T,I] | `\b0[1-9]\s*[/.]`, `font-mono` count over 3, `©\s*20\d\d` | Only if the product is a numbered process.
18. One italic serif word inside a sans headline [T] | `<em|italic` inside `h1` with a serif family | Weight or color for emphasis.
19. Mixed number formats, no tabular figures [U,I] | `\$[\d,]+\.\d{2}` next to `\$[\d,]+\b`; missing `tabular-nums` | One format, tabular figures.
20. Nine nearly equal font sizes [T] | distinct `font-size` values over 7 | A scale of 5 or 6.
21. Negative tracking on small text [U] | `tracking-(tight|tighter)` on `text-(xs|sm)` | Zero.

### Icons and imagery
22. Emoji as bullets, nav icons, badges, headings [T,U] | `[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]` in html/jsx text | One line icon set, or nothing.
23. Sparkle icon for AI [U,A] | `Sparkles?|✨|sparkle` | Remove, or an icon that names the feature.
24. Icon-in-tile feature cards, three identical [T,I,A] | 3+ sibling cards with the same child structure (needs script) | Fewer features, concrete copy, varied widths, or a list.
25. Mixed icon sizes and strokes [U] | more than 2 `size-`/`w-` values on svg icons | One size, one stroke.
26. Glossy 3D orb, blob, liquid chrome, purple nebula hero [U,A] | image filenames `orb|blob|nebula|glass` ; visual check | The real product or one concrete metaphor.
27. Stock robot, glowing brain, circuit lines for "AI" [U,A] | alt text or filename `robot|brain|circuit|hologram` | Show what the AI produces.
28. Undraw, Storyset, generic blob characters [A] | `undraw|storyset` in src | Real screenshots or none.
29. Text, fake buttons or logos baked into images [U] | human check; image alt empty or very long | Real text in the page.
30. A visual in every section [U] | image or illustration count over 2 per page | One visual, usually the hero.

### Layout and components
31. Centered hero with headline, subtext, two buttons, picture below [T,U] | `text-center` on hero plus 2 `button|a.btn` | Split layout or text over a large product view.
32. Pill badge above the h1 ("Introducing X 2.0") [T,U,A] | `rounded-full` element before `h1` | Remove, or a plain link if real news.
33. Three or more hero buttons, chips, avatar stacks [U] | button count in hero over 2 | One primary, at most one secondary.
34. "Trusted by" logo bar below hero, five stars, avatar dots [U,A] | `Trusted by|Loved by|Join \d` | Remove unless sourced and specific.
35. Stock section order: hero, logos, 3 features, how it works in 3 steps, testimonials, pricing in 3 columns, CTA, 4-column footer [T,A] | section sequence in markup (needs script) | Order by the product's actual argument.
36. Every section the same layout: centered title, subtitle, card grid [T,A] | repeated identical section skeleton | Vary composition on purpose.
37. Uniform `rounded-2xl` on everything, or all pills [T,A,U] | count of `rounded-(2xl|3xl|full)` over 6; one radius used by over 80% of boxes | Radius by element size, nested radius math.
38. Bento mosaic as default grid [T,A] | `grid-cols-.*col-span-2.*row-span` | Only for unequal content.
39. Fake dashboard of grey bars, sparklines on every stat card [T,I,U] | `sparkline`, repeated mini `svg` in stat cards | Number, label, change.
40. Rainbow or glowing chart bars, every series a shade of the accent [U] | chart color count over 3 | One or two series, one highlight color.
41. Grid, dot or blueprint background [A] | `bg-grid|bg-dot|background-image:.*linear-gradient.*1px` | Plain background.
42. Gradient tile or glossy orb logo with sparkle [U] | visual check | Wordmark plus a flat mark.

### Motion (add to the 42 as sub-checks)
- `animate-(pulse|ping|bounce)` on non-live items; `transition-all`; `hover:(scale|-translate)`; `ease-in\b`; `scale-0`; bounce or spring overshoot [T,U]. Instead: color or surface change on hover, one ease-out, transform and opacity only.
- Fade-and-rise on every section; parallax; elements flying in from different directions [T,U]. Instead: one authored motion moment.
- Animating `width|height|top|left` in `transition` or keyframes [U]. Instead: transform.
- `h-screen` on hero [T]. Instead: `min-h-dvh`.

## 3. Copy checklist (20 items)

1. Hype vocabulary: unlock, elevate, empower, supercharge, seamless, robust, cutting-edge, revolutionary, game-changer, next-level, effortless, powerful, intelligent, ultimate, magic [A,U,V-vercel] | Say what it does, with its own nouns and a number.
2. "AI-powered", "Next generation", "Introducing X" | Name the task the model performs.
3. Headline that fits any product after swapping the name [U,T] | Name what it does for whom. 32 characters or fewer [T].
4. Colon headline, "X, reimagined", "Welcome to", mad-lib "Build X without Y" [T] | Plain statement.
5. Full-sentence display headline over 2 lines [T] | Cut to the claim.
6. Generic CTAs: Get started, Learn more, Try now, Explore, Discover, Click here, Submit [T,A] | Verb plus object: "Create a workspace", "Read the changelog". One primary button per view.
7. Arrow glyph on every link or button [T,A] | Arrow only where direction means something.
8. Exclamation marks, `+12%!!` [U] | Plain statement, with the reference: `+12% vs last month`.
9. Greeting headline: "Welcome back, Abhay 👋" [U] | The page or period as title.
10. Invented proof: "Trusted by 10,000+ teams", fake testimonials, fake logos, `$123,456`, `[X]`, John Doe, Acme, example.com [T,U,A] | Real number with source, or remove.
11. Em dash count over 4 per page [T] | Comma, period, or colon.
12. "Not just X, it's Y" and its relatives [A] | State Y.
13. Rule of three: tricolon lists of adjectives or benefits [A,T] | Keep the one or two items that are true.
14. Signposting and runway: "In today's fast-paced world", "Let's dive in", "Here's what you need to know" [A] | Start with the fact.
15. Fake-candid openers and theatrical takeaways: "Honestly?", "Here's the thing", "Read that again" [A] | Delete.
16. Significance inflation: "the future of X", "a new era", "pivotal" [A] | A measured claim.
17. Weasel attribution: "Experts say", "studies show" [A] | Name the source or cut.
18. Inanimate subject with human verb: "the dashboard understands you" [A] | Who does what: "You see X in the dashboard".
19. Chatbot closers and hedges: "I hope this helps", "it's important to note", "simply", "just", "easily", "ensure", "leverage", "utilize" [V-vercel,A] | Delete or use the plain verb.
20. Typography in copy: ALL-CAPS emphasis, Title Case buttons and list items, emoji in headings, trailing periods on buttons and labels, `Search anything...` placeholders [A,U] | Sentence case, no period, `Search`.

## 4. `slop-check` spec

One self-contained script. No dependencies. Node is the cheapest start (taste-skill's `lint.mjs` is 119 lines and shows the shape). Rust is possible but costs more for the same regexes. Input: a directory or html file. Output: JSON list of `{id, file, line, match, fix}` plus a summary. Exit 1 on any FAIL. `slop-check-ignore: <id> <reason>` comment suppresses one line. Warn-level checks (`WARN`) never change the exit code.

Mechanical, regex or count (about 28 of 42 visual, 14 of 20 copy):
- Visual: 1, 2, 3, 4 (blob), 5, 6 (count), 7 (count), 8, 9, 10, 13, 14, 15, 16 (adjacent-element rule), 17, 18, 21, 22, 23, 26 to 28 (filenames and alt), 31 to 34 (text and class heuristics), 37 (count), 38, 39, 41, and all motion checks.
- Copy: 1, 2, 4, 6, 7, 8, 9, 10 (placeholder names and fake-number patterns), 11 (count), 12, 14, 15, 19, 20, plus lorem.
- Counts need a threshold each: radius uniformity (80%), distinct font sizes (7), distinct non-grey hexes (8). Put thresholds at the top of the file.
- Scan only visible text for copy checks. Strip `script`, `style`, comments, and code blocks first, and parse HTML text nodes rather than raw source.

Needs a human or a screenshot (not scored by the script, listed in the report as MANUAL):
- Same skeleton in every section (35, 36); hero symmetry (31 beyond class names); equal-card grids (24); color distribution and whether the accent is rare (11, 12); glossy or baked-in imagery (26, 29, 42); image edges blending into the page; motion feel; whether proof is real (34, copy 10); headline specificity (copy 3, 5); inanimate-subject and tricolon judgments (copy 13, 18).
- Screenshot pass: render at 1440 and 390 wide with the bundled headless shell, save two images, and have a reviewer answer the MANUAL list with yes/no per item.

Validation rule for the script itself: it must flag a known-slop fixture page on every mechanical check (non-zero denominator, one hit per check) and pass a clean fixture. Mutate each regex once and confirm the fixture test fails.

Credits: signs adapted from heydamir/unslop (CC BY 4.0, Damir Sokolovsky); regexes follow taste-skill `lint.mjs`; copy patterns follow miqdadbadjuber/anti-slop (MIT).

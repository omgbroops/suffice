---
tags: [cat/ui]
---
Looked at 26 agent-harness sites 2026-11-08 (`~/.claude/overseer/harness-taste/`: `raw/` shots, `tokens.json` computed CSS). Vocabulary to adapt, not targets to hit; Abhay's eye decides. (claude, 2026-11-08, grab.py + tokens.py)

- Each has one tinted near-black that is its identity: Cursor olive rgb(20,18,11), Conductor warm rgb(20,17,16), Vespin rgb(15,13,11), Amp teal rgb(9,28,30), Paseo rgb(16,22,21), Linear rgb(8,9,10). (claude, 2026-11-08, tokens.json)
- Hairlines are white alpha 0.07-0.12, not grey. Text is a 3-step ladder, off-white to about 60% to about 40%. (claude, 2026-11-08, tokens.json)
- Radii are small and nested: 4-8 rows, 10-12 panels, 14-18 outer. Pills only on primary CTAs. Hoplite's composer is a tray holding a well. (claude, 2026-11-08, tokens.json + hoplite-1.png)
- Real texture sits in empty space: Cursor's oil painting, Hoplite's dithered image, Conductor's ASCII field. Procedural scenes read generated. (claude, 2026-11-08, raw shots)
- Life comes from real states in small glyphs: T3 Code lineage and waiting timers, Orca provider meters, mono branch and model metadata, +/- diffs. (claude, 2026-11-08, t3code-1.png, orca-1.png)
- Big type: weight 450-600, tracking about -0.02 to -0.03em. One mono face beside the sans. (claude, 2026-11-08, tokens.json)
- Avoid: Happy's rainbow and emoji, Kiro's purple slabs. (claude, 2026-11-08, raw shots; my read, Abhay unconfirmed)

Links: [[Giving agents taste - selection beats prompts]]

## Motion and dither (2026-11-08)
- Devin hero motion: tiny image boxes pan over 73-242s and fade in over 1.8s; working spinner = 12 dots, 1s shimmer. Very slow or very small. (claude, 2026-11-08, document.getAnimations on devin.ai)
- Conductor's ASCII sky is a static webp; its motion is a headline scramble and a dot shimmer on load states. (claude, 2026-11-08, msheet.py + homepage-hero-background-night-sky img)
- Shark ref: mostly empty field, glyph-cell subjects swim through; composer gets a soft shadow, nothing else. (claude, 2026-11-08, ~/inspora-refs/shark-ascii-animation)
- Tried: full-coverage glyph wall = terminal dump, picture lost. Density must BE the dither: dark paint leaves black. Tone by value not luma so red clouds survive. (claude, 2026-11-08, suffice-home/v3 shots)

## What survived review, round 2 (2026-11-08, my eye only; Abhay hasn't judged)
- Worked: simple shapes and abstract fields. Rain + one geometric hill; Turner fire as fine 5-tone dither beside a floating window; a big glyph wordmark. (claude, 2026-11-08, round2 shots)
- Failed: literal subjects in a glyph grid. Hiroshige's figures took 3 passes and never read, Durer's rhino became a blob even with a hand-traced outline, Piranesi's stair only works as abstract ink. A glyph grid holds about 100 x 60 cells, too few for detail. (claude, 2026-11-08, round2 shots + _cut-rhino)
- Tone by what the eye sees: saturated-but-bright areas vanish on luma; use max(1-luma, saturation) on paper. (claude, 2026-11-08, rain revisions)
- Haiku builders reported honest misses when asked, but each direction needed my eye on the shot; a passing shot.py says nothing about look. (claude, 2026-11-08, builder reports)

## details.so free previews, studied live (claude, 2026-11-09, details.so/inspo + extrafazant.nl + safds.com, headless)
- Free tier = 8 previews (OuiDo cursor/carousel/footer, Extrafazant button, Forge cards/steps, SweetTape pinned scroll, SAFDS list/card hover); rest paywalled, not used.
- Extrafazant button: split block (arrow cell + label); on hover the arrow cell hops to the other side and the label tilts ~2deg. Craft = parts rearrange, not a colour fade.
- SAFDS: brutalist mono labels in hairline boxes, a diagonal hatch stripe as texture.
- Applied (own version): Suffice send button fills by a 4-step ordered-dither dissolve (~160ms) when ready, echoing the dithered art. Round 7 hall + dusk.

## details.so free previews, part 2 (claude, 2026-11-10, details.so/inspo + live sites, headless)
- OuiDo cursor-hover (https://ouidomediagroup.com): hovering an activity row grows its card about 35px and pushes neighbours down ~45px, no colour fade. Shot: ouido_hover_0-3.png.
- OuiDo carousel (https://ouidomediagroup.com): centred card holds still; the next card tilts about 6deg at the edge. Little motion in 600ms. Shot: ouido_carousel_0-3.png.
- OuiDo footer (https://ouidomediagroup.com): one big "!" ornament swaps blue to red and rotates in ~600ms; pills and wordmark stay still. Shot: ouido_footer_0-3.png.
- Forge Automotive cards and steps (https://www.forgeautomotive.co.uk): NOT captured. Headless scroll lock kept the hero on screen after 4 tries (scrollTo, wheel, PageDown). Blocked, not judged.
- SweetTape pinned scroll (https://sweet-tape.com): the big "CREATE" wordmark holds while tape discs and a photo tile drift past and a blue arc band slides across. Shots: sweet_pin_a_0, sweet_pin_b_2.png.
- SAFDS list hover (https://safds.com): hover puts a white hairline label panel (mono title, "INQUIRE ONLY" arrow) inside the image, and the image crops in slightly. Shots: safds_list_0, safds_list_3.png.
- SAFDS product card hover (https://safds.com): same hover panel on the product tiles; the grid itself stays still on scroll. Shots: safds_card_0, safds_card_3.png.
- Fits a calm dithered-art app: SweetTape's held wordmark with slow drifting layers; OuiDo's still footer ornament swap.

## Living-painting candidates (claude, 2026-11-10, Commons + museum open access)
Verified = Commons file page resolved via API, license field "Public domain". Museum open-access pages NOT separately checked for any entry. Forest/mist candidate: none found in search.

- Friedrich, "Mondaufgang am Meer" (Moonrise over the Sea), c.1822. Nocturne. https://commons.wikimedia.org/wiki/File:Mondaufgang_am_Meer_-_Google_Art_Project.jpg (verified, 3543x2710 PD). Moves: moon glow shimmer on water, slow wave lines. Lower middle is dark, calm sea: good for composer.
- Ryder, "Moonlit Cove", c.1880-1890. Nocturne. https://commons.wikimedia.org/wiki/File:Albert_Pinkham_Ryder_-_Moonlit_Cove_-_Google_Art_Project.jpg (verified, 3868x2967 PD). Moves: moon path on water, faint haze drift. Lower middle calm dark water.
- Van der Neer, "Moonlit Landscape with Bridge", c.1640s. Nocturne. https://commons.wikimedia.org/wiki/File:Van_der_Neer_-_Moonlit_Landscape_with_Bridge.jpg (verified, 4938x3480 PD). Moves: river reflection, slow cloud drift. Lower middle calm water.
- Blakelock, "Moonlight", c.1885-1890. Nocturne with trees. https://commons.wikimedia.org/wiki/File:Moonlight_-_Google_Art_Project.jpg (verified via search, 6001x5074 PD; file name not directly fetched). Moves: tree canopy sway, moon glow. Lower middle likely dark ground: check before use.
- Aivazovsky, "The Ninth Wave", 1850. Storm/sea. https://commons.wikimedia.org/wiki/File:Aivazovsky,_Ivan_-_The_Ninth_Wave.jpg (verified, 5815x3840 PD). Moves: crest light, spray. Lower middle is churning surf: poor for composer, use only with a top-weighted composer.
- Church, "Aurora Borealis", c.1865. Aurora. https://commons.wikimedia.org/wiki/File:Frederic_Edwin_Church_-_Aurora_Borealis_-_Google_Art_Project.jpg (verified, 4001x2692 PD). Moves: aurora bands drifting. Lower middle: dark ground and ice, probably calm, not checked.
- Wright of Derby, "Two Girls Dressing a Kitten by Candlelight", c.1768-70. Firelight/candle interior. https://commons.wikimedia.org/wiki/File:Joseph_Wright_of_Derby._Two_Girls_Dressing_a_Kitten_by_Candlelight._c._1768-70.jpg (verified, 2000x2641 PD). Moves: candle flame flicker. Lower middle is figures and table: not calm, weak fit.
- Forest/mist: not found. Gap.

Top 3: Friedrich Moonrise (calm dark sea, moon shimmer), Ryder Moonlit Cove (dark, calm water), Wright candlelight (only firelight option, flame is a small, clear motion).
Not verified: museum open-access pages, actual resolution of the Blakelock file, lower-middle calm for Aurora and Blakelock.

## Living-painting candidates, round 2 (claude, 2026-11-10, research)
Verified = Commons file page fetched (HTTP 200) and page text says "Public domain"; artist dates read from the page. Images NOT downloaded or viewed, so the lower-middle and motion notes are guesses from titles. Commons API hit a rate limit (429), so licence came from page text, not the API.

- Wright of Derby, "An Iron Forge", c.1772-73. Forge fire. https://commons.wikimedia.org/wiki/File:Joseph_Wright_-_An_Iron_Forge_-_Google_Art_Project.jpg (verified, PD; Wright 1734-1797). Light: furnace glow. Moves: fire flicker, sparks, smoke drift. Dark figures and forge silhouette give strong contrast.
- Wright of Derby, "Vesuvius in Eruption", c.1777-80. Volcano. https://commons.wikimedia.org/wiki/File:Joseph_Wright_of_Derby._Vesuvius_in_Eruption._c.1777-80.jpg (verified, PD). Light: lava and eruption glow. Moves: smoke plume, ember flicker, glow pulse. Dark mass of the mountain against bright sky: a clear focal point.
- Homer, "Moonlight, Wood Island Light". Lighthouse. https://commons.wikimedia.org/wiki/File:Moonlight,_Wood_Island_Light.jpg (verified, PD; Homer 1836-1910; painting year not checked). Light: lighthouse beam and moon. Moves: beam sweep, moon-path shimmer on water. Dark headland and sea: good for composer; check the beam is not too small at 3px.
- Hiroshige, "Night Snow at Kambara", 1832-34. Snow at night. https://commons.wikimedia.org/wiki/File:Night_Snow_at_Kambara_(Kambara_Yoru_no_Yuki),_Station_15,_from_the_Fifty-Three_Stations_of_the_Tokaido_(Tokaido_Gojusantsugi_no_Uchi)_(Hoeido),_by_Utagawa_(Andō)_Hiroshige,_1832-1834,_Hood_Museum_-_PR.972.63.16.tif (verified, PD; Hiroshige 1797-1858). CAVEAT: this is a woodblock print, not a painting; use only if prints are allowed. Light: lantern and moon glow in the snow. Moves: falling snow, lantern glow. Dark roofs against white snow: strong contrast.
- Achenbach, "Norwegian Coast by Moonlight", 1848. Moonlit coast. https://commons.wikimedia.org/wiki/File:Norwegian_Coast_by_Moonlight_by_Andreas_Achenbach,_1848.jpg (verified, PD; Achenbach 1815-1910). Light: moon. Moves: sea swell, cloud drift. Different artist from the Friedrich moonrise, but the same moon-on-water idea; keep as a variant, not a new kind.
- Albert de Marees, "Coast at Night with Lighthouse". Lighthouse at night. https://commons.wikimedia.org/wiki/File:Albert_de_Marees_-_Coast_at_Night_with_Lighthouse.jpg (page verified, PD text found). NOT ELIGIBLE YET: artist born 1820s, death date not found, so the death-before-1926 rule is unchecked. Light: lighthouse. Moves: beam, water. Check death date before use.
- Rejected: RMG "A Coastal View With a Lighthouse" (BHC3877). Artist born 1864, died 1942: fails the death-before-1926 rule, even though the page is public domain.
- Harbour lanterns and storm with a gap of light: no clean PD candidate found in search. Gap.

Top 3: Wright "Vesuvius in Eruption" (clear glow, smoke and ember motion), Homer "Moonlight, Wood Island Light" (beam sweep, dark headland), Wright "An Iron Forge" (furnace glow, sparks, dark figures).
URLs verified: 6 of 6 Commons pages returned HTTP 200 with PD text (Marees fails eligibility, not the URL). Not checked: image contents, lower-middle calm, museum open-access pages, Homer painting year.

## Living-painting candidates, round 3 (claude, 2026-11-10, Commons search + thumbs)
1. Carl Gustav Carus, Mondnacht bei Rügen (n.d.) — https://commons.wikimedia.org/wiki/File:Carl_Gustav_Carus_-_Mondnacht_bei_R%C3%BCgen.jpg — 2000x1631 — light: moon through clouds; moves: sea and sky clouds; why it fits: dark moonlit sea, moon glints on water (thumb checked)
2. Johan Christian Dahl, View of Dresden by Moonlight (1839) — https://commons.wikimedia.org/wiki/File:Johan_Christian_Dahl_-_View_of_Dresden_by_Moonlight_-_Google_Art_Project.jpg — 4984x2957 — light: moon and lit city windows; moves: clouds and Elbe water; why it fits: dark night, lit river reflection (thumb checked)
3. Albert Bierstadt, Mountainous Landscape by Moonlight (1871) — https://commons.wikimedia.org/wiki/File:Mountainous_Landscape_by_Moonlight_1871_Albert_Bierstadt.jpg — 1997x1179 — light: campfire and moonlit peak; moves: trees and sky; why it fits: dark mountain night with clear fire light (thumb checked; width just under 2000, above 1600)
4. Aert van der Neer, Nocturnal Fire in a Dutch City (SM 338, n.d., 17th c.) — https://commons.wikimedia.org/wiki/File:Nocturnal_Fire_in_a_Dutch_City_(SM_338).png — 5335x3756 — light: city fire and moon; moves: smoke/flame and clouds, river water; why it fits: very dark night, strong fire focal point (thumb checked)
5. Aert van der Neer, River Landscape with Ships at Moonrise (SM 507, n.d., 17th c.) — https://commons.wikimedia.org/wiki/File:River_Landscape_with_Ships_at_Moonrise_(SM_507).png — 5116x3532 — light: sunset/moon glow on water; moves: river water and clouds; why it fits: dusk glow over river, dark foreground (thumb checked)
6. Aert van der Neer, River Landscape by Moonlight with Boats & Settlements (n.d., 17th c.) — https://commons.wikimedia.org/wiki/File:River_Landscape_by_Moonlight_with_Boats_%26_Settlements_by_Aert_van_der_Neer.jpg — 2000x1490 — light: moon and settlement lights; moves: river water and clouds; why it fits: dark moonlit river with reflections (thumb checked)

NOTE: Three of six are by Aert van der Neer; no other dark, focal-light, large landscape found in the search results.
Rejected after thumbnail check: Krieghoff, Coastal landscape at moonlight (too light/flat); Tryon, Moonrise (grey monochrome, muddy); Van Gogh, Evening landscape at moonrise (bright wheat field, not dark).

## Living-painting candidates, round 4 (claude, 2026-11-10, Commons search + thumbs; 19th c clean darks)
1. Arkhip Kuindzhi, Moonlit Night on the Dnieper (1880) — https://commons.wikimedia.org/wiki/File:Kuindzhi_Moonlit_night_on_the_Dnieper_1880_grm_x2.jpg — 2400x1742 — light: green-white moon with defined edge over clouds and bright river reflection; moves: moon-lit water sheen, cloud edges; why: clean near-black sky and water, no varnish haze.
2. Edward Moran, Ships at Night (year not verified) — https://commons.wikimedia.org/wiki/File:Edward_moran_ships_at_night022827).jpg — 3200x2372 — light: setting sun disc and glowing band through haze, lit water glints; moves: sun-glitter on water, sail silhouettes; why: crisp sunset light and dark hull shapes, though the sky is warmer and less dark than the others.
3. J.M.W. Turner, Fishermen at Sea (1796) — https://commons.wikimedia.org/wiki/File:Joseph_Mallord_William_Turner_-_Fishermen_at_Sea_-_Google_Art_Project.jpg — 2258x1678 — light: moon with hard-edged break in clouds; moves: breaking surf highlights, moonlit cloud edges, boat silhouettes; why: strong night contrast, very dark surround.
4. Johan Christian Dahl, The Elbe by Moonlight (c. 1856) — https://commons.wikimedia.org/wiki/File:Johan_Christian_Claussen_Dahl_-_The_Elbe_by_Moonlight_(1856).jpg — 2200x1345 — light: moon disc with defined edge above a rose-to-brown sunset band; moves: moon reflection on water, cloud bands; why: crisp moon and clean dusk band; small study with a slightly brown cast.
5. Johan Christian Dahl, Copenhagen Harbor by Moonlight (1846) — https://commons.wikimedia.org/wiki/File:Johan_Christian_Dahl_-_Copenhagen_Harbor_by_Moonlight_-_2019.167.2_-_Metropolitan_Museum_of_Art.jpg — 4000x2611 — light: moon with clear edge, lit windows and harbor lights; moves: moon-path on harbor water, cloud edges, ship rigging; why: clean dark sky, many light sources, landscape crop.
6. Johan Christian Dahl, Larvik by Moonlight (1839) — https://commons.wikimedia.org/wiki/File:Johan_Christian_Dahl_-_Larvik_by_Moonlight_-_NG.M.00034_-_National_Museum_of_Art,_Architecture_and_Design.jpg — 4000x2569 — light: moon behind clouds, rose dusk band, water glints and lit buildings; moves: water sheen, cloud edges, ship silhouettes; why: clean darks and crisp light sources.

Rejected: Kuindzhi Google Art Project copy (same painting, browner haze, duplicate of #1); Dahl Larvik Google Art Project scan (duplicate of #6); Shishkin and Moran night searches returned no usable night oil paintings; Dahl Dresden excluded by list.

## Living-painting candidates, round 5 (claude, 2026-11-10, variety search: mostly volcanoes)
1. Jules Tavernier, 'Kilauea Fire Fountain' (1884) — https://commons.wikimedia.org/wiki/File:%27Kilauea_Fire_Fountain%27_by_Jules_Tavernier,_1884.jpg — 1821x1365 — volcano/fire fountain; light: orange-red fire column upper-left plus crater glow mid-frame (y ~0.3-0.55), clear of lower-centre; moves: fountain spray, lava, smoke; why: clean near-black rock, strong crisp firelight, landscape 4:3.

2. Jules Tavernier, 'The heart of a volcano under a full moon' (1888) — https://commons.wikimedia.org/wiki/File:Jules_Tavernier_-_The_heart_of_a_volcano_under_a_full_moon,_1888.jpg — 3176x1824 — volcano night, crater fire; light: moon upper-right (y ~0.2, x ~0.5-0.6) and fire sparks at sides; moves: lava flow, smoke, spark drift; why: upper-half light source, dark even surroundings, landscape 16:9.

3. Peder Balke, 'Nordlys over fire menn i robåt' (year not verified) — https://commons.wikimedia.org/wiki/File:Peder_Balke_-_Nordlys_over_fire_menn_i_rob%C3%A5t_-_NG.M.04272_-_National_Gallery_of_Norway.jpg — 5533x4620 — aurora over dark sea with boat; light: aurora curtain in upper half (y 0-0.45), boat figures small and dim low-centre; moves: aurora curtains, rippling water; why: light sits high, dark frame; caveat: near-square (1.2:1), not true landscape, and the lower band is water, so check the 'not moonlit water' rule.

4. Jules Tavernier, 'Halema'uma'u Crater, Kilauea Volcano' (1887) — https://commons.wikimedia.org/wiki/File:Jules_Tavernier_-_%27Halema%27uma%27u_Crater,_Kilauea_Volcano%27,_1887,_Isaacs_Art_Center.JPG — 2538x1407 — volcano crater night; light: lava glow lower-left and right-side fire (glow band y ~0.55-0.85, partly low-centre); moves: smoke/cloud edges, lava; why: smoky sky with edges, dark rock framing. Borderline on the lower-centre rule.

5. Jules Tavernier, 'Kilauea Caldera' (1885) — https://commons.wikimedia.org/wiki/File:Jules_Tavernier_-_%27Kilauea_Caldera%27,_oil_on_canvas,_1885.jpg — 2874x1722 — crater lava lake at dusk; light: lava lake mid-lower (y ~0.6-0.8), bright sky-glow and fire at right and left edges; moves: smoke clouds, lava; why: large clean dark rock, cloud edges upper. Borderline on the lower-centre rule.

6. Jules Tavernier, 'An Eruption, Hawaii' (c. late 1880s) — https://commons.wikimedia.org/wiki/File:Jules_Tavernier_(1844-1889)_-_%27An_Eruption,_Hawaii%27,_c._late_1880s,_oil_on_canvas.jpg — 4325x1505 — panoramic eruption; light: moon upper-right (y ~0.2, x ~0.75) and red lava band across lower-middle (y ~0.5-0.8); moves: lava, smoke, moon-clouds; why: panoramic 2.9:1 fits a wide background, moon is crisp. Borderline on the lower-centre rule.

Rejected: Tavernier 'Kilauea at night' (1887, 1600x887) — glow is a bottom-centre lava band, violates lower-centre rule. Haanen 'A night landscape with a sailboat where a fire is being lit' (3200x2414) — the main light is a moon over water, which the user excluded. Raden Saleh 'Merapi volcano, eruption at night' (1865, 1016x596) — below 1600px. Antigna 'The Lightning' (800x1039) — portrait, too small. Tavernier 'Volcano Hawaii' (1888, 599x299) — too small. Tavernier 'Volcano at Night' (1364x718) — below 1600px.

Notes: the API returned 500px thumbs (iiurlwidth=400 snapped to 500). Thumbs in /private/tmp/claude-501/-Users-abhayg--claude/d399bc25-bd82-4b4e-b4e7-1a83b7c73dc8/scratchpad/r5-thumbs/. No lightning, lamplit-street, snow or fireworks painting passed the size and date filters; all six are volcano/fire scenes by one artist (Tavernier) except #3. Variety was not achieved.

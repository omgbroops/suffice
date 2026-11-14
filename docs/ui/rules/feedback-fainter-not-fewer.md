---
name: feedback-fainter-not-fewer
description: "Background \"fainter/sparser\" = dim the ink, keep the shape; never raise motion while thinning; stills can't judge motion"
metadata:
  node_type: memory
  type: feedback
  originSessionId: d399bc25-bd82-4b4e-b4e7-1a83b7c73dc8
  modified: 2026-11-09T21:59:54.739Z
---

Asked for a bg "sparser, fainter, yet still distinguishable", round 4 cut glyphs to about a third and raised warp + dither wobble. Abhay: "can't see shit too much motion too distracting" (2026-11-09).

**Why:** thinning the dither removes the shape that made the bg readable, and a low-density dither near threshold flickers more. I only checked a still at 1440, which shows neither flicker nor drift.

**How to apply:** fainter = lower ink strength at the same structure; change density in small steps from the last KEEP, not from the last attempt. Never add motion on a "calmer" note. Any motion change gets a two-frame diff, reading changed pixels against lit pixels, before calling it calmer. See [[feedback-taste-not-benchmarks]]: that diff only confirms the change happened, Abhay's eye still judges it.

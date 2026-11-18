---
name: reference-taste-store
description: Abhay's blind UI picks saved across projects; read before any UI work
metadata:
  type: reference
---

`python3 ~/.claude/overseer/taste-picker/taste.py` prints Abhay's BEST/KEEP/NO UI picks from every project, with their notes. Store: `~/.claude/taste/picks.jsonl` (exists only after the first sitting finishes; empty until then). `taste.py save ROUND --project P` adds a sitting. Before designing UI for any project, read it and honour the notes. Abhay's eye decides; never turn it into a score. See [[feedback-taste-not-benchmarks]].

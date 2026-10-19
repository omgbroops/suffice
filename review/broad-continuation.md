# Broad campaign continuation v1

The user requested continuation after the first nine attempts stopped on provider capacity errors. This is an explicit orchestration-policy amendment after those outcomes were observed. It is not a new treatment or a rerun.

`review/broad-resume.py` invokes the original frozen attempt runner only for never-attempted jobs. It preserves and hashes all existing attempt files, rejects partial attempts, validates the original freeze and saved controls, and retains the counterbalanced per-issue order, maximum four concurrent issue blocks, memory admission rule and original actor limits. Harness implementation, prompts, models, efforts and independent graders remain frozen. New observer code is copied identically to Sonion; its hash is recorded separately from the original source-sync receipt.

Only incomplete accounting associated with an observed provider overload/capacity error may pass admission. Those attempts retain their original unknown-cost flags, failed operational outcomes and independent patch acceptance. Other unknown accounting, invalid model identity, malformed cost, missing result or unexplained process failure halts new work. No attempt directory is reused for fresh inference.

Admission reserves `max($0.25, recorded known cost)` for an unknown whole-attempt cost. This is an allowance reservation, not a billing estimate, verified upper bound or replacement for missing usage. The original $16 admission ceiling remains in effect. Known response usage is fully reported; an exact campaign total and cost per accepted task for affected arms remain unavailable unless authoritative missing billing is recovered.

The initial nine-attempt report remains in commit `21fba4e`. Original controls and that postflight receipt are retained. The continuation records its authorization, controller/manifest hashes, starting receipt hashes, admissions and final completion separately under `.suffice/broad-bench-v1`. Reporting must disclose this amendment and retain failures rather than selecting only clean attempts.

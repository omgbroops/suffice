# Resume (2026-10-23, paused: weekly 92% + battery 24%)
- State: commit 8ebe607. Rescue arm (`--v7-agree=on --v7-sblind=haiku --v7-rescue=opus`) r27 = 19/27 $1.21; Opus alone 22/27 $5.90.
- 8 misses were self-pass but wrong; 6 had one suite failing that the agree gate let through.
- Next: rerun strict gate (block on any failing suite) r27 in stages 1 → 3 → rest; projection 23-24 for ~$2.7 is unverified.
- Partial strict rows in reports/v7/r27-v7strict-*.jsonl; tally them first (my earlier parse looked wrong).

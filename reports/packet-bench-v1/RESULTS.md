# Packet execution: bounded development comparison

Development-reused real issues; not a fresh held-out superiority test.

API-equivalent; all planning, packet, escalation and failed-response usage included. Engineering inference excluded.

## Main comparison

| Arm | Accepted | Budget-eligible | Total cost | Mean / attempt | Median / attempt | Cost / accepted | Calls | Mean seconds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 5/6 | 5 | $0.32706 | $0.05451 | $0.05018 | $0.06541 | 38 | 65.5 |
| routing | 5/6 | 5 | $0.23511 | $0.03919 | $0.03353 | $0.04702 | 61 | 93.4 |
| packets | 5/6 | 5 | $0.25021 | $0.04170 | $0.03016 | $0.05004 | 76 | 102.7 |

## Tokens and observed caching

| Arm | Fresh input | Cached input | Output including reasoning | Cached input share | Input cost | Cache cost | Output cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| baseline | 118,036 | 215,168 | 6,947 | 64.6% | $0.23607 | $0.02152 | $0.06947 |
| routing | 121,031 | 595,456 | 11,399 | 83.1% | $0.15469 | $0.02466 | $0.05576 |
| packets | 180,573 | 709,120 | 14,261 | 79.7% | $0.19154 | $0.01839 | $0.04028 |

Reasoning is included in output totals; do not add it a second time. Cached input share is observed token reuse, not the share of spending saved.

## Every scheduled attempt

| Issue | Arm | Accepted | Eligible success | Cost | Calls | Seconds | Packets | Sol repairs |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| f01 | baseline | True | True | $0.03733 | 6 | 153.1 | 0 | 0 |
| f01 | routing | True | True | $0.08576 | 8 | 165.5 | 0 | 0 |
| f01 | packets | True | True | $0.03861 | 15 | 211.7 | 1 | 0 |
| f04 | routing | True | True | $0.07076 | 8 | 68.8 | 0 | 0 |
| f04 | packets | True | True | $0.13830 | 10 | 77.8 | 0 | 0 |
| f04 | baseline | True | True | $0.06743 | 6 | 53.0 | 0 | 0 |
| f08 | packets | False | False | $0.02172 | 10 | 64.0 | 1 | 0 |
| f08 | baseline | False | False | $0.04081 | 6 | 47.4 | 0 | 0 |
| f08 | routing | False | False | $0.03088 | 6 | 49.8 | 0 | 0 |
| f10 | baseline | True | True | $0.04946 | 5 | 33.0 | 0 | 0 |
| f10 | routing | True | True | $0.00387 | 12 | 66.7 | 0 | 0 |
| f10 | packets | True | True | $0.00344 | 10 | 62.0 | 0 | 0 |
| f13 | routing | True | True | $0.00767 | 21 | 146.8 | 0 | 0 |
| f13 | packets | True | True | $0.00511 | 15 | 71.0 | 0 | 0 |
| f13 | baseline | True | True | $0.08112 | 8 | 43.1 | 0 | 0 |
| f14 | packets | True | True | $0.04303 | 16 | 129.6 | 1 | 0 |
| f14 | baseline | True | True | $0.05091 | 7 | 63.5 | 0 | 0 |
| f14 | routing | True | True | $0.03617 | 6 | 62.9 | 0 | 0 |

## Treatment activation and costs

| Arm | Packetized tasks | Luna packets | Sol repairs | Planning cost | Implementation cost | Repair cost |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 0 | 0 | 0 | $0.00000 | $0.32706 | $0.00000 |
| routing | 0 | 0 | 0 | $0.00000 | $0.23511 | $0.00000 |
| packets | 3 | 3 | 0 | $0.13107 | $0.11914 | $0.00000 |

## Validation and limits

- Complete: True; independent receipt reconciliation: True; frozen local source hashes match: True.
- Six reused historical repairs, one observation per task/arm. This is exploratory development evidence; no fresh held-out superiority or 30x saving claim.
- Both routing arms include one public-failure Sol repair; the baseline does not. Baseline versus routing mixes model selection with that gate. Routing versus packets shares the gate.
- Luna High and Sol Low are explicitly different model/effort choices. This cannot isolate effort, prices, caching or delegation independently.
- Same task text, public source, dependencies, nominal $0.50/600s/60 responses/240 tool-call allowances and original 4 GiB RSS boundary. Code verification overhead counts in latency; all inference stages and failed responses count in price.
- Private acceptance overlays enter separate grading workspaces only after model execution. Original test edits are restored before independent scoring.
- Stock Pi/Codex are not rebenchmarked here. This tests the requested prototype against the current Suffice baseline.
- Subscription spending and engineering-agent inference are not measured by API-equivalent totals.

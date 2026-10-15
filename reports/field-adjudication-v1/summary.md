# Deterministic v1 patch adjudication

Updated 2026-10-15T07:39:05.054Z. Model calls: **0**. Model replay cost: **$0**. Original v1 results are unchanged.

Integration v1 runs stay invalid for harness/cost comparison even if their patches pass this diagnostic replay. Native counts are exact runner totals; Nano Stores fake-timer files can be represented as file-level aggregate passes. Unchanged v1 result bytes remain authoritative historical receipts, not rewritten results.

| Attempt | Replay | Native test counts | Comparison interpretation |
|---|---|---|---|
| q02-suffice | native_failure_requires_evidence_review | 193, build/type, build/type | v1_environment_review_required_independent_replay_complete |
| q02-stock-pi | native_failure_requires_evidence_review | 193, build/type, build/type | v1_environment_review_required_independent_replay_complete |
| i01-suffice | pass | 378 | invalid_v1_environment_perturbed |
| i01-stock-pi | pass | 378 | invalid_v1_environment_perturbed |
| i02-suffice | pass | 384 | invalid_v1_environment_perturbed |
| i02-stock-pi | pass | 384 | invalid_v1_environment_perturbed |
| i04-suffice | pass | 187 | invalid_v1_environment_perturbed |
| i04-stock-pi | pass | 187 | invalid_v1_environment_perturbed |
| s02-suffice | pass | 50 | v1_environment_review_required_independent_replay_complete |
| s02-stock-pi | pass | 50 | v1_environment_review_required_independent_replay_complete |
| s03-suffice | pass | 53 | v1_environment_review_required_independent_replay_complete |
| s03-stock-pi | pass | 53 | v1_environment_review_required_independent_replay_complete |
| q01-suffice | pass | 199, build/type, build/type | v1_environment_review_required_independent_replay_complete |
| q01-stock-pi | pass | 199, build/type, build/type | v1_environment_review_required_independent_replay_complete |

Pending: 

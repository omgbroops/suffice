# Luna public-evidence development pilot

Completed 8/8 fresh cells; independent acceptance 3/8; within-budget accepted 3/8.

Known API-equivalent actor inference: $0.028675. Planned aggregate $0.40; total known: True. Post-response overshoot: $0.000000.

| Issue | Arm | Effort | Context | Status | Accepted | Budget eligible | Cost USD | Responses | Calls |
|---|---|---|---|---|---:|---:|---:|---:|---:|
| i01 | A | low | no | completed | False | True | 0.004927 | 12 | 23 |
| i01 | B | low | yes | completed | False | True | 0.004040 | 9 | 18 |
| i01 | C | medium | no | completed | False | True | 0.003681 | 10 | 18 |
| i01 | D | medium | yes | completed | False | True | 0.003267 | 11 | 20 |
| q04 | D | medium | yes | completed | True | True | 0.002876 | 10 | 16 |
| q04 | C | medium | no | completed | True | True | 0.002940 | 10 | 20 |
| q04 | B | low | yes | completed | True | True | 0.003175 | 11 | 20 |
| q04 | A | low | no | completed | False | True | 0.003769 | 10 | 18 |

A = ordinary low; B = low plus public context; C = ordinary medium; D = medium plus context. Order was i01 A/B/C/D then q04 D/C/B/A, serial. No cell was retried or selected after seeing outcomes.

Verification: frozen pilot inputs match=True; both zero-inference variant proofs passed=True; per-task original/native/private reference controls passed=True. Request/reply identity, requested effort, codemode schema and usage reconciliation are recorded per cell. Original protected native tests were restored before independent grading; grading networking was disabled.

A setup-only guard initially assumed startup lists only codemode; it actually lists unchanged underlying tools as well. The guard was corrected before any provider request, and the old manifest, zero-call failure, amendment and new manifest were retained. Runtime tools/system prompts were unchanged.

Exposed development tasks, one fresh observation per task/cell; no holdout or confirmatory inference.
Public context was hand-authored; engineering and preparation-model overhead excluded from actor costs and not priced.
Reasoning effort and user-prompt input are the only interventions; no new feature, tool, or planner.
Costs are catalog-priced API-equivalent estimates, not measured subscription charges; post-response caps can overshoot.
No retries or replacements; all errors, partial work, costs and patches preserved.
The blind i01 public packet exercises the original default invalid-URL reproduction; it does not cover manual-mode API compatibility. A context-arm failure can reflect this packet coverage gap and does not refute the value of better context.

These eight observations describe this development reuse only. They do not establish a general context effect, effort effect, interaction, or comparative reliability. No further campaign is authorized by this report.

Artifacts: `experiments/luna-evidence-v1/plan.json`, `PROTOCOL.md`, per-variant source manifests, `.suffice/luna-evidence-v1` execution/provider/grade receipts and patches, plus this directory’s `audit.json` and `results.json`.

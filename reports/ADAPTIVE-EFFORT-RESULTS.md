# Adaptive reasoning effort bounded experiment

Four screening attempts; known API-equivalent cost $0.181947 with 2 unknown totals. No scored campaign started. Engineering inference excluded.

| Task / arm | Execution | Independent patch acceptance | Known cost | Total cost |
|---|---|---|---:|---:|
| merge-alias / low | completed | true | $0.062828 | $0.062828 |
| merge-alias / medium | completed | true | $0.067581 | $0.067581 |
| merge-alias / adaptive | provider_error | true | $0.051538 | unknown |
| bom-stream / low | provider_error | false | $0.000000 | unknown |

The completed low/medium pair passed in seven turns each. Low cost $0.0628284 versus medium $0.0675812, 7.03% less. One pair does not establish an efficiency frontier. Adaptive remained low; its patch passed independent checks but subscription exhaustion prevented normal completion and left total cost unknown. The fourth low-effort BOM screening failed immediately with the same provider limit and no edits. Provider failures are operational evidence, not reasoning failures.

Completed low hidden rejections: 0; active adaptive escalations: 0. No capability improvement or active escalation efficacy is established. Harder task screening could not finish. The prospective twelve-run scored schedule was stopped before any request.

Frozen input deviations: 0; baseline deviations: 0; all immutable attempt files preserved: true; outgoing effort/model matching: true. Fixture/run artifacts: 31501567 bytes.

Pi before_provider_request records actual outgoing reasoning.effort=low/medium and gpt-6.1-sol. Internal provider computation cannot be inspected. Separate reasoning-token counts are unavailable; input/output/cache usage stays in JSON. There were no effort switches, so cache disruption from switching cannot be measured.

One library, public historical tasks, no untouched scored cohort and concurrent provider/machine campaigns limit generalization, cache and latency conclusions. Equal per-attempt ceilings were used; actual aggregate spend differs, so no equal-total-budget capability claim follows. Costs with incomplete telemetry are lower bounds, not subscription bills. All failed attempts and private raw transcripts remain under .suffice/adaptive-runs; public reports exclude raw transcripts and credentials.

Recommendation: retain as experimental implementation, keep low as existing default, and test harder multi-repository tasks with actual low baseline failures and active escalation after provider access returns.

Protocol: docs/ADAPTIVE-EFFORT.md; stop decision: docs/ADAPTIVE-SCREENING-DECISION.md. Commands: node scripts/prepare-adaptive.mjs; node --test tests/workflow.test.mjs tests/adaptive.test.mjs; node scripts/adaptive-report.mjs. Campaign manifests reject overwrites; do not rerun paid campaigns into the preserved run directories.

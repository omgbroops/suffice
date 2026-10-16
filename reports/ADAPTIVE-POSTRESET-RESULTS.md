# Adaptive effort post-reset continuation

Cumulative 5 attempts, $0.288284 known inference, 2 unknown totals preserved. Pre-reset reports and failures were not overwritten.

| Campaign/task/arm | Status | Accepted execution | Accepted patch | Known USD | Turns |
|---|---|---:|---:|---:|---:|
| pilot/merge-alias/low | completed | true | true | 0.062828 | 7 |
| pilot/merge-alias/medium | completed | true | true | 0.067581 | 7 |
| pilot/merge-alias/adaptive | provider_error | false | true | 0.051538 | 7 |
| screen/bom-stream/low | provider_error | false | false | 0.000000 | 1 |
| postreset-hard/bom-stream/low | completed | true | true | 0.106337 | 10 |

Hardest remaining BOM baseline after quota reset: completed, independently accepted=true.

Completed low hidden rejections: 0. Adaptive effort escalations: 0.

No capability improvement is established without a demonstrated comparable low-arm failure and successful adaptive rescue. Provider errors remain operational failures; unknown usage is retained. No effort switch occurred in initial pilot, so cache disruption from escalation is unmeasured. Outgoing payload effort is verified; internal provider computation is unobservable. A single completed low/medium pair is insufficient for a general efficiency result. Equal per-attempt budget does not guarantee equal realized cumulative spend.

The narrow controller counts failed visible regression checks at distinct successful edit versions, or nine turns without an edit. It does not count model-generated check_cases failures. That policy is frozen and may miss evidence that a broader controller would use; it was not tuned after outcomes. Historical public issues in one repository limit generalization and may have training contamination. Latency/cache measurements face concurrent machine/provider activity.

Recommendation: keep low default; retain adaptive controller as experimental. If low continues to solve this bounded corpus, report inadequate task difficulty and inactive treatment, then select a more difficult independently validated corpus before a larger paid evaluation.

Integrity: changed frozen inputs=0; baseline deviations=0; immutable files=true; outgoing settings match=true; artifact bytes=32448387; disk free=21102018560.

Freeze protocol: docs/ADAPTIVE-POSTRESET.md. Preserve pre-reset reports. Rebuild this report offline with node scripts/adaptive-postreset-report.mjs.

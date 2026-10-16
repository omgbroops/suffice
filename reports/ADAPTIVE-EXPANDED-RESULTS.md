# Adaptive effort expanded bounded experiment

Cumulative 9 attempts; known API-equivalent inference $0.572212; 2 unknown totals retained. Engineering inference is excluded. All pre-reset reports remain unchanged.

| Campaign / task / arm | Status | Accepted execution | Accepted patch | Known cost | Turns | Known reasoning tokens |
|---|---|---:|---:|---:|---:|---:|
| pilot / merge-alias / low | completed | true | true | $0.062828 | 7 | 86 |
| pilot / merge-alias / medium | completed | true | true | $0.067581 | 7 | 297 |
| pilot / merge-alias / adaptive | provider_error | false | true | $0.051538 | 7 | 90 (incomplete) |
| screen / bom-stream / low | provider_error | false | false | $0.000000 | 1 | 0 (incomplete) |
| postreset-hard / bom-stream / low | completed | true | true | $0.106337 | 10 | 269 |
| state-screen / lru-background-lifecycle / low | completed | false | false | $0.093401 | 9 | 162 |
| state-comparison / lru-background-lifecycle / medium | completed | false | false | $0.074222 | 9 | 401 |
| state-comparison / lru-background-lifecycle / adaptive | completed | false | false | $0.056662 | 7 | 28 |
| state-comparison / lru-background-lifecycle / low | completed | false | false | $0.059644 | 7 | 34 |

Completed low-effort hidden patch rejections: 2; actual adaptive effort switches: 0.

Initial low/medium aliased-merge repairs both passed in seven turns; low $0.0628284 versus medium $0.0675812 (7.03% less), only one pair. Initial adaptive produced an accepted patch but quota exhaustion prevented completion; fourth BOM screen immediately hit quota. These failures remain provider failures, not model capability failures. After reset BOM low passed in ten turns at $0.1063368.

Harder different-repository screen: pinned isaacs/node-lru-cache background-fetch lifecycle, coordinating fetch completion, replacement, stale eviction, callback/status classification and abort signals. The completed low screen passed visible tests but failed independently frozen hidden acceptance, establishing a real failure. Medium/adaptive/repeated-low comparison is screened-task replication, not untouched holdout.

LRU state-screen/low: status=completed; accepted=false; hidden=5/6, visible=3/3; patchAccepted=false; outgoing effort sequence=low.
LRU state-comparison/medium: status=completed; accepted=false; hidden=5/6, visible=3/3; patchAccepted=false; outgoing effort sequence=medium.
LRU state-comparison/adaptive: status=completed; accepted=false; hidden=5/6, visible=3/3; patchAccepted=false; outgoing effort sequence=low.
LRU state-comparison/low: status=completed; accepted=false; hidden=5/6, visible=3/3; patchAccepted=false; outgoing effort sequence=low.

Equal per-attempt ceilings are18assistant messages,240seconds,$0.18 known cost checked after a message, and100tool calls. One-message cost overshoot and unknown usage are preserved. Realized aggregate spending differs; an equal ceiling is not an equal realized-cost frontier proof. No auxiliary inference or fallback. Six hidden lifecycle tests and three visible reproduction/regression tests validate LRU; pinned reference passes both and original fails. Full upstream tap suite is excluded because its dependencies were not installed. Source snapshots and public historical repairs may have training contamination.

Outgoing Pi payload model/effort is verified; provider internals cannot be observed. Correction to earlier reports: raw events expose usage.reasoning, so this addendum reports its sums with incomplete flags. Reasoning tokens are already included in Pi output/cost accounting and are not charged again. Initial low86 versus medium297 known reasoning tokens, adaptive90 incomplete. Switching cache disruption can be evaluated only when switches actually happen; cache and latency comparisons also face concurrent campaign activity.

The frozen deterministic policy counts two visible regression failures at distinct edit versions, or nine messages before any edit. Generated scenario failures are not controller inputs. This narrow policy can miss useful evidence. No hidden acceptance diagnostics enter model repair sessions. Any low failure followed by unactivated adaptive success cannot be attributed to escalation.

Integrity: changed input hashes=0; changed baseline hashes=0; immutable attempt files=true; outgoing model/effort match=true; artifact bytes=34572169; disk free bytes=7759523840.

Recommendation: keep low default unless repeated matched difficult tasks establish a useful active intervention. Treat this bounded experiment as feasibility/difficulty evidence, not general superiority. Freeze docs: ADAPTIVE-EFFORT.md, ADAPTIVE-POSTRESET.md, ADAPTIVE-STATE-PROTOCOL.md and ADAPTIVE-STATE-GATE.md. Offline regeneration: node scripts/adaptive-expanded-report.mjs.

All four completed LRU attempts passed visible3/3 and hidden5/6, failing the same unchanged-stale-value update/disposal invariant. Full acceptance was0/2low,0/1medium and0/1adaptive. Cost per accepted LRU task is undefined. This demonstrates a harder real baseline failure; higher fixed effort did not rescue it and the adaptive policy did not activate. The failure exposes a visible-check coverage gap, not evidence that active escalation is ineffective.

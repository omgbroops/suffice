# Cache retention post-reset results

This supplements the preserved original blocked report. All eight planned scored attempts completed. This specific retention policy cost 43.8% more across scored attempts.

| Scored arm | Operational successes | Acceptable patches | Total API-equivalent estimate | Mean / attempt | Cost / success | Active requests | Recovery calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Append | 4/4 | 4/4 | $0.191804 | $0.047951 | $0.047951 | 0 | 0 |
| Retention | 4/4 | 4/4 | $0.275888 | $0.068972 | $0.068972 | 10 | 0 |

| Task / repetition | Append | Retention | Append estimate | Retention estimate | Retention active |
| --- | --- | --- | ---: | ---: | --- |
| union-subset / 0 | pass | pass | $0.056832 | $0.072524 | yes |
| tilde-prerelease / 0 | pass | pass | $0.044178 | $0.049088 | yes |
| union-subset / 1 | pass | pass | $0.047686 | $0.073563 | yes |
| tilde-prerelease / 1 | pass | pass | $0.043109 | $0.080713 | yes |

Matched pairs with live retention activation: 4, append $0.191804, retention $0.275888. Inactive matched pairs: 0; differences on these cannot be credited to retention.

Actual scored provider telemetry: append uncached input 55887, cache-read 104704, output 6956; retention uncached input 100539, cache-read 73600, output 6745. Component estimated costs are retained in JSON. Zero cache-write usage was reported. Fewer serialized characters or total tokens are not treated as cost savings. Recovery remains available, but 0 scored recovery calls occurred; exact archive access is mechanism validation, not evidence of recovery-dependent success.

Post-reset paired union screening: append pass, $0.064477, 0 active requests; retention pass, $0.081182, 2 active requests. Genuine low-effort model baseline failures among scored attempts: 0. The historical pre-reset provider error occurred despite an acceptable patch. There is no evidence for increased capability at matched cost.

Accounting includes all 11 pre/post attempts: $0.648270 known lower bound; cumulative total remains unknown because original sharing-limit error cost is unknown. Post-reset 10 attempts total $0.613352. Each arm has the same $0.25 observed estimate ceiling, 18 generations and 240 seconds; response overshoot is possible. No auxiliary model inference or recovery inference was excluded. These are provider-reported Pi API-equivalent estimates, not subscription bills. Codex engineering inference is outside benchmark accounting.

Scope: GPT-6.1 Sol model IDs verified, configured low effort; stable system/objective and shared state/navigation/codemode/tools. The retention policy preserves every user/assistant message and call/result edge, first/two recent batches, all state/edit/test/recovery results, and exact recovery references for replaced old read-only results. Work-state snapshots preserve objective requirements, unresolved work, edit revision and test freshness. Read-time source revision is explicitly unknown and conservatively stale after edits. Only existing production JS changes are allowed. Hidden acceptance diagnostics were never fed back to agents. Both pinned original fixtures fail hidden acceptance; upstream reference repairs pass hidden acceptance and seven adapted visible fixture groups.

Integrity: 935 frozen/current/baseline checks; all intact = true; immutable nonproduction files = true; 16 live replaced-result hash checks exact = true. Focused tests passed 26/26 (post-reset receipt). Original broad test result remains 84/85 with unrelated pre-existing retry-idempotency exact-reference failure. New fixture/run artifacts 7.50 MiB; free disk 19.01 GiB. Original blocked bytes, reports and transcripts remain preserved.

Interpretation is limited to this **dynamic-state historical-body replacement**, not all cache-aware retention. Every replacement embeds current workState and stale-source notice; later state/edit updates can repeatedly alter an early prompt prefix. Observed cache-read and uncached-input differences are consistent with disruption but do not isolate cause: model trajectories, output lengths, order, cache warmth and concurrent provider/machine campaigns differ. A static replacement reference plus append-only current-state updates is an **untested follow-up**, not an established fix. Two public tasks from one library and two repetitions cannot establish generality or significance. Union-subset was screened and reused; tilde was untouched by screening. No claim that pruning is universally harmful or that recoverability guarantees correctness.

Recommendation: keep append-only as the default until a retention design shows lower total cost with independent acceptance under a larger matched experiment. Do not optimize text removal alone. No further inference is needed for this bounded pilot.

Artifacts: [JSON](cache-retention-postreset-results.json), [protocol](CACHE-RETENTION-POSTRESET-PROTOCOL.md), [test receipt](cache-retention-postreset-tests.txt). Commands: node scripts/cache-retention-experiment.mjs screen screen-postreset-v2; node scripts/cache-retention-experiment.mjs scored scored-postreset-v2; node scripts/cache-retention-postreset-report.mjs; node scripts/cache-retention-postreset-markdown.mjs. Durable hidden PID/log receipts are in .suffice/cache-runs; raw transcripts stay ignored local evidence.

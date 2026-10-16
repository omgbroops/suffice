# Cache retention bounded pilot

**Provider limit stopped screening before any live retention attempt.** No efficiency or capability result is established.

| Observed attempt | Operational status | Independent patch | API-equivalent known cost | Total cost |
| --- | --- | --- | ---: | --- |
| Union subset / append-only / low Sol | provider_error (sharing quota) | acceptance + regressions passed | $0.034918 | unknown |

One of two planned screening attempts ran; zero of eight scored attempts ran. The original union-subset and tilde-prerelease fixtures fail independent acceptance; pinned upstream reference repairs pass acceptance and seven adapted visible fixture groups. The append pilot repaired union-subset in four coding generations, but its fifth generation hit the explicit ChatGPT Subscription Sharing usage limit. This is an operational provider failure, not an independently rejected patch. It supplies no model baseline capability failure.

Actual provider telemetry: 9,568 uncached input tokens, 11,520 cache-read tokens, 1,463 output tokens, zero reported cache-write tokens, 22,551 total tokens. Estimated components: input $0.019136, output $0.014630, cache read $0.001152. The unknown/error request can have unreported charges, so $0.034918 is a lower bound. Latency 46.130 seconds; 5 generation messages and 17 counted tool calls. Actual subscription billing is unknown. Codex implementation work is outside benchmark usage.

The narrow policy keeps objective/user instructions, all assistant reasoning, every call/result edge, first and two recent codemode results, and all edit/test/state/recovery results. Only verified old read-only bodies become exact recoverable references. It carries requirements, unfinished work, edit count, test freshness and stale-source notices. No LLM summary, selector or auxiliary model cost. Recovery pages preserve original bytes; read-time revision is explicitly unknown, so source is conservatively stale after edits.

Offline replay of the real append transcript demonstrates that the policy can activate: one 14,087-character historical read body becomes a recoverable reference, reducing request text by 12,733 characters. Its archived content SHA-256 matches exactly, and every transcript message remains. **This is offline mechanism validation; it is neither live cache savings nor live recovery/capability evidence.** Live retention/recovery calls: zero.

Focused tests: 26/26 passed (receipt in cache-retention-tests.txt). Broad harness run: 84/85 passed; the existing retry-idempotency reference patch exact-match assertion fails on the worktree snapshot, consistent with Windows line-ending conversion. It was not changed. Frozen screen inputs and all 270 fixture files pass hash integrity. Two source files differ from the screen freeze only for a post-stop conservative stale-revision correction to the unused retention path; the original screen bytes remain available. No scored freeze or comparison was launched. New fixture/run artifacts approximately 2.87 MiB; >22 GiB disk remained.

Limitations: single provider-aborted control attempt; no paired measurement; same account/machine/provider caches shared with concurrent campaigns; public historical semver issues may be familiar; only one library and adapted regression groups. Neither inference ceiling, correctness superiority nor cache benefit can be inferred. Hidden grader results did not enter repair.

Recommendation: keep append-only as default. Resume a new frozen bounded pilot only after provider quota resets, first verifying live retention activation and recovery. Do not reuse these results as proof that retention is cheaper. The existing runner intentionally stops on unknown cost; rerunning the same campaign does not bypass that guard.

Artifacts: [protocol](CACHE-RETENTION-PROTOCOL.md), [results JSON](cache-retention-results.json), [integrity](cache-retention-integrity.json), [test receipt](cache-retention-tests.txt). Implemented in src/cache-retention.mjs and integrated in src/real-agent.mjs. Runnable commands in protocol. Durable screen PID/log receipts under .suffice/cache-runs; process 133292 completed. Raw transcripts remain ignored local evidence and must not be published.

Primary task provenance: https://github.com/npm/node-semver/issues/703, https://github.com/npm/node-semver/pull/854, https://github.com/npm/node-semver/pull/878. Paper claims in the supplied proposal were not treated as established facts; no paper-derived claims are needed for this bounded implementation.


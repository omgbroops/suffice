# Broad benchmark: interrupted partial campaign

Status: stopped after 9 of 60 planned attempts. No paid reruns and no recovery protocol amendment. The remaining 51 attempts have not run.

The nominal reservation was $0.25 per system per issue, or $15 for 15 issues across four systems, with a $16 campaign admission ceiling. Provider responses may overshoot an attempt allowance; reservations are not invoice charges.

Known API-equivalent usage totals **$0.24281826**. Two attempts have unresolved whole-attempt costs, so this is a lower bound and total campaign cost per accepted task is unavailable. Rates come from the frozen runtime catalog; these are not subscription invoice amounts.

| System | Attempts | Independently accepted patches | Accepted and policy eligible | Known cost | Unknown totals |
| --- | ---: | ---: | ---: | ---: | ---: |
| Codex Sol Medium | 2 | 2 | 1 | $0.11511560 | 1 |
| Suffice v1 Sol Medium | 2 | 1 | 1 | $0.11476360 | 0 |
| Suffice v2 Luna High | 3 | 2 | 2 | $0.00987496 | 0 |
| Suffice v1 Luna High | 2 | 1 | 1 | $0.00306410 | 1 |

These unequal, incomplete issue subsets do not establish comparative accuracy, cost savings, or speed. Do not extrapolate the earlier three-task results from this partial campaign.

## Why execution stopped

- b03-v1LunaHigh: the initial request returned a server overload error without provider usage. Pi automatically retried; the successful response has 1,668 input and 41 output tokens, worth $0.00018730. The unknown-cost latch then cancelled execution. Three assistant event rows include an error and synthetic local abort; there were two observed provider requests and one completed usage receipt. Neither SDK-initialized zeros nor a local abort establishes failed-request billing.
- b04-codexSolMedium: six completed response receipts reconcile $0.05613280. Its patch passes independent acceptance, but a later model-at-capacity failure has no usage receipt or turn.completed aggregate. It remains policy ineligible with unknown total cost.

The frozen protocol stops admission on unresolved accounting. Original results, failed traces and accepted patches remain unchanged. Restarting its driver would reject these saved unknown totals. Resuming only untouched jobs would require an explicit recorded orchestration-policy amendment; it must preserve both failures and avoid assuming missing usage is zero.

## Integrity and scope

All 15 final baseline/reference controls passed before inference. Remote postflight passed 174 frozen-file checks, 78 source-sync checks and 15 Git exposure checks. Local and remote source hashes match; 2,394 exported receipt files passed transport integrity checks. The overall accounting audit correctly fails because of the unresolved attempts.

No Suffice harness treatment source, prompt, grader or limit changed after freeze. review/broad-export-filtered.py is an observer-only addition that excludes dependency and fixture payloads while retaining task metadata, reference-patch metadata, dependency locks and raw attempt receipts locally under .suffice. Raw sessions and credentials are not committed.

The cohort covers 15 historical issues across 10 new JavaScript/TypeScript repositories. Tasks are mostly small functional changes; public historical data may have appeared in model training. This is exploratory, not cross-language evidence.

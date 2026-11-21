# Cost mode: cheaper without dumber code

Goal: cut $/task without accepting lower quality. Sources: published
work through Nov 2026, a 6,078-attempt private experiments ledger
(cost/quality A/Bs on real SWE tasks), and our own Suffice benchmarks
(gpt-6.2-sol, real-OSS repair suites).

## The core insight

"Dumber model" doesn't have to mean dumber *code*. Every credible
cost architecture keeps the strong model in the loop — it just pays for
it less often. The patterns that work:

1. **Cheap proposes, strong disposes** — cheap model only runs when its
   output can be *checked* (tests pass, verdict gate) or when its output
   isn't code at all (hints, routing, file selection).
2. **Escalate on failure, not review on success** — pay for the strong
   model only when the cheap path provably failed. Reviewing every cheap
   output costs more than it saves (ledger: +70.6%).
3. **Cut input tokens, not intelligence** — context size is the dominant
   cost driver on multi-turn agent runs and shrinking it is usually free
   or even *better* for quality (lost-in-the-middle).

## What the evidence says

| Lever | Cost effect | Quality effect | Source |
|---|---|---|---|
| Cheap-first + verifier-escalate | -60-80% of strong-model spend | ≈ strong model when gate is honest | Stanford bandit study (19-23% of spend at Sonnet parity), ledger ladder 91.7% @ $0.009, arxiv 2505.20182 (-40%) |
| Effort routing per call | varies | "high for coding, low for fixes + hints, never max" | ledger effort sweep |
| Observation masking (compact tool output) | -19.8% to -50% | neutral to slightly *better* | ledger, JetBrains "Complexity Trap" |
| AST-nav / repo-map tools | -24.8% | neutral | ledger |
| Thin prompt profile | 20-33x per-turn overhead | neutral in their setup | ledger thin-profile run |
| Verdict-only retries on cheap model | cheap (retry only on fail) | 54% → 97.3% | ledger |
| Strong→weak delegation / plan-review | +13-140% | none | ledger (dead), matches our spec-agent result |
| Consensus / best-of-N patch voting | worse than random single | negative | ledger |
| Up-front difficulty routing | mixed | loses to verifier-aware escalation | RouteLLM; bandit study shows post-attempt signals beat prompt-only |
| Context pruning by LLM summary | mixed (-50% in JetBrains, failed in ledger) | lossy on coding (exact state matters) | JetBrains vs ledger — treat as task-dependent |
| Adding retrieved context | **+33-42%** under 0.1x cache pricing | no measurable gain | "Context Has a Price" (Nov 2026) — counterintuitive |
| Learned tool-call policies (TokenEconomizer) | -18-31% | none | Microsoft, Nov 2026 |
| SWE-Pruner neural pruning | ~-38% | small | arxiv 2601.16746 |

## The trap nobody expects

**Shorter prompts don't guarantee cheaper runs.** "Context Has a Price"
(20k SWE-bench runs, Nov 2026): agents respond to less context by taking
more steps. And under prefix caching (cached input ≈ 1/10 price), pruning
saved 19-36% without a discount but *increased* cost 38-116% with one —
because every edit invalidates the cache and rewrites are re-billed at
full price. Cache hygiene (append-only prompts, stable system prefix, no
timestamps/UUIDs early in the prompt) is worth more than aggressive
pruning. The ledger's own "cache tricks exhausted ~97% already cached"
agrees.

## Applied to Suffice

What we already pay (real-long suite, gpt-6.2-sol):
solo low ≈ $0.025-0.030, race-3-low-prefill ≈ $0.055-0.072 (~2.3x solo).

Ranked proposals for a `/cheap` or `/eco` mode:

1. **Luna-first + Sol-escalate** — attempt the task on the cheap model;
   on failure (no patch, or patch fails verification where tests exist)
   retry on Sol. Preserves the Sol quality ceiling whenever the cheap
   path fails; expected cost = Luna-rate × success-fraction + Sol-rate ×
   failure-fraction. This is the single biggest lever in the literature
   and the ledger — and it's exactly the shape of what failed *as a race*
   (spec-agent was sequential scout→verify, which pays both always).
   Escalate-on-failure pays the strong model only when needed.
2. **Per-call effort routing** — ledger effort rule: high effort for
   planning/coding, low for small fixes and hint generation. Route
   thinkingLevel per request (Pi supports it) instead of per session.
   Free: no second model.
3. **Context diet arms** — compact tool observations (truncate tails,
   keep heads: -19.8%), AST nav (-24.8%), thin prompt profile. All
   provider-agnostic input-token cuts that don't touch model quality.
4. **Cache discipline** — keep the shared prompt prefix byte-stable
   across turns (no mutating system prompt, append-only history). One
   invalidation re-bills the whole prefix.
5. **Race economics** — deadline losers at ~2x median (losers never win
   anyway) and adaptive-N (add attempts only on failure) cut race cost
   ~30-40% toward ~1.4x solo with zero speed/quality change.
6. **Verdict-only retries** — cheapest quality insurance available:
   "tests failed, try again" on the same cheap run.

Avoid (confirmed dead by both our benchmarks and the ledger): strong→weak
delegation, review-every-patch architectures, consensus voting, blind
spec gates, mid-session model switches (switch penalty — route at
session/request start only), predictive task-difficulty routing alone
(post-attempt verifier signals beat it).

## Next benchmark arms

- `eco-luna-sol`: Luna attempt → Sol fallback on failure (vs Sol solo)
- `effort-route`: medium plan → low edits (vs uniform low)
- `compact-obs`: truncated tool output (vs stock)
- `race-3-low-deadline`: race-3-low-prefill + straggler cutoff (cost-only)

Same suites (real, real-hard, real-long), same reps.

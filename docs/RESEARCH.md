# Research decisions

## 2026-10-14: initial implementation

User goal: develop a coding-agent harness that improves verified task success and lowers total computation. Start with watcher/control comparisons, then investigate supported improvements. Keep the main model fixed at GPT-6.1 Sol. Watchers: GPT-6 Luna, Jev, and the three requested OpenRouter free models. Jev total spending ceiling is $2.

The user replaced permission to reuse existing Codex tokens with a fresh sign-in. The implementation uses Pi's official OpenAI ChatGPT OAuth flow and isolated local credential storage. Both requested OpenAI models completed live smoke inference. OpenRouter key replacement occurred during initial diagnostics; those requests cannot establish that routing parameters caused authentication differences. Fresh-key checks succeeded for Lightning and Nemotron Super; Gemma returned rate-limit errors.

Current Pi already exposes codemode and deferred tool discovery. Reuse these implementations instead of writing another executor. Core enables codemode-only presentation and a short stable prompt. Normal turns append context; no compaction is performed during these short tasks. Cache-prefix diagnostics accompany provider-reported usage.

Independent review identified and corrected initial accounting problems: unknown watcher cost must not be zero; failed/abstained inference can still cost money; reservations differ from spend. It also tightened complete-file coverage tracking and acceptance TAP consistency checks. Auth/token/secret values are excluded from diagnostics.

The acceptance files stay immutable and outside worker tool access. Node permissions and clean environments constrain test execution, but this setup is not an adversarial OS sandbox. Trusted test-source names/counts, completed summaries, and non-source hashes are checked. This diagnostic pilot is scoped to authored tasks, not arbitrary external submissions.

Initial integration runs verify wiring only. They cannot establish cost improvements: cache warmth, stochastic outputs, single-task selection, and configuration corrections confound comparisons. The first fixed multi-task campaign is `pilot-v1`; freeze it before changing policy.

## Sources consulted

- [Reason Agent 1.1](https://reasonmachines.com/blog/introducing-reason-agent-1-1): disclosed batching, small tool surface, append-only caching, Pi foundation. These are design hypotheses to measure, not proven causal explanations of its score.
- [Pi SDK](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md), [codemode](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/codemode.md), and installed package declarations: implementation contract for pinned 1.2.0.
- [OpenAI ChatGPT plan usage](https://developers.openai.com/siwc/token-sharing-open-source), [models/inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference): fresh OAuth and account-specific access.
- [TypeSafe model metadata](https://docs.typesafe.ai/models.md): pinned Jev pricing checked before requests. Pi's zero-cost placeholder is not used as Jev pricing.
- [Model Learner](https://github.com/ckrfeng/model-learner): potential later evidence-ledger integration; currently separate.

## Next decisions after pilot

Compare core against Pi, then each watcher against core. Inspect duplicate injected/manual reads, watcher eligibility, added latency, code-mode batching, cache preservation, and total spend per independent success. Do not select a winner from mean cost alone. Repeat promising configurations and evaluate held-out tasks. Keep model/provider failures visible and classify the free Gemma route as unavailable until a successful request proves otherwise.

## Completed pilot and held-out check

The final low-effort pilot completed 32 scheduled trials: 29 accepted and three terminal provider overloads. The four held-out tasks across Pi/core/Jev/gated-Jev completed 16/16 and all passed acceptance. Both Pi and core passed all eight tasks. Core used 36.0% fewer main model calls in the pilot and 38.5% fewer in the held-out cohort; observed API-equivalent cost reductions were 29.6% and 34.0%. Treat those as descriptive results on eight small authored tasks, not evidence of real-world leadership.

All eight gated-Jev runs skipped the watcher because its candidate was already identified in the executing read program. The coding task still passed. This validates the suppression mechanism, not a learned policy or Jev's decision quality. Ungated watcher costs vary, and acceptance has a ceiling effect. Cache variability produces substantial price differences even between near-identical trajectories.

The next useful dataset should involve real repository tasks where the agent genuinely lacks information and the watcher has multiple plausible evidence candidates. Do not train a selector on this tiny, largely single-candidate dataset. Preserve the core baseline and collect decisions with independently checked outcomes.

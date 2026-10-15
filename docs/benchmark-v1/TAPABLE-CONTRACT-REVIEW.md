# Tapable final independent contract review

Verdict: **approved** for the exact-byte descriptor/grader/reference pairs in the JSON companion. Final task SHA256 `922da9932b91668ec7b16ec7d396b640b22574fbda5680af4c5d8c7e48ebb5f7`; acceptance SHA256 `b94aed6a07d36d428dca2735d4e9066265bd77f4dd1e9470a74aa785f6e9b6bf`.

Read final 11 requirements, all23 public/private test groups and actual four-module actor/reference production diffs. No inference or tests executed. All assertions match explicit public behavior; no generated-source architecture, edit count, undisclosed receiver or exact error text oracle is required.

The early observer-throw/context ambiguities are resolved by explicit scope exclusions. Strict unbound tap and callback receivers, cleanup-before-terminal observer ordering, falsy reasons, callback synchrony, snapshots, first terminal wins, and promise-tap-only returned Promise observation are public. Known reference handles those paths through independent per-invocation settlement and per-tap completion guards, local function calls, captured source arrays, cache resets and unconditional started-promise rejection observation.

This is feature validation: pristine upstream lacks the new APIs. Four existing-behavior smoke checks should pass initially and three public feature checks should fail. Requiring all baseline visible tests to pass would misclassify this task. Actor receives public feature feedback; private/reference stay evaluator-only. Creator-reported reference23/23 and four ablation outcomes are separate from this static review.

Structural scope spans public cache/API plumbing, generated adapters and distinct series/parallel dispatch integration. This is more than counting four files, but remains provisional feature scope; no measured duration, long-horizon persistence, compaction, delegation value or difficulty is certified.

| Test group | Suite | Requirements |
|---|---|---|
| existing series entry points run mixed taps in registration order | public | A11 |
| existing parallel entry points start work before waiting for completion | public | A11 |
| existing hook kinds preserve bail waterfall and synchronous behavior | public | A11 |
| existing compilation updates after tap and interceptor registration | public | A11 |
| public feature pre-aborted invocations skip work and preserve the reason | public | A1, A2, A5 |
| public feature cancellation stops ordered successors and completes once | public | A4, A5, A7 |
| public feature parallel cancellation stops further launches while observing started work | public | A4, A5, A8 |
| stage one opt-in methods exist only on supported hook kinds and complete empty invocations | hidden | A1, A6, A11 |
| stage one pre-abort skips call and tap interception while preserving every reason | hidden | A2, A5, A6, A9 |
| stage one both abortable caches invalidate on new taps and interceptors | hidden | A3, A9 |
| stage two generated adapters preserve arguments and original tap errors | hidden | A1, A4, A6 |
| stage two duplicate callbacks and throws after completion cannot settle twice | hidden | A4, A5, A6 |
| stage two tap and terminal callback receivers keep unbound invocation conventions | hidden | A1, A4 |
| stage two interceptor terminal notifications follow cleanup and precede completion | hidden | A6, A9 |
| stage two cancellation from call or tap interception prevents subsequent starts | hidden | A5, A6, A9 |
| stage two abort cleanup is immediate and late callbacks or rejections stay observed | hidden | A4, A5, A6 |
| stage two synchronous abort inside a promise tap still observes its rejected return | hidden | A4, A5, A6 |
| stage three series continuations wait for each mixed tap before starting the next | hidden | A7 |
| stage three abort or error stops ordered successors and first terminal event wins | hidden | A4, A5, A7 |
| stage four parallel dispatch starts all pending taps without serializing them | hidden | A4, A8 |
| stage four abort during parallel dispatch prevents later launches and ignores late failure | hidden | A4, A5, A6, A8 |
| integration concurrent invocations isolate signals listeners and compilation snapshots | hidden | A3, A5, A6, A7, A8 |
| integration plugin pipeline composes ordered parallel cancellation cleanup and cache reuse | hidden | A3, A4, A5, A6, A7, A8, A9, A10 |

Limitations:

- Authored feature with authored known reference on pinned public source; not a naturally occurring upstream repair or contamination-free task.
- Structurally staged multi-module feature; no observed repair duration, long-horizon persistence, compaction or delegation benefit is established.
- Public API deliberately excludes invalid/duck signals, throwing terminal callbacks/interceptors, deprecated context-enabled new calls, TypeScript declarations and other Hook types.
- Only tapPromise returned promises are observed; sync/callback return values ignored explicitly by contract.
- Finite authored 7 public +16 hidden group sample; no complete upstream regression suite independently executed.
- Creator-reported stage ablations/pass counts are not independent runtime evidence; this review performed no tests/inference.
- Existing over128KiB yarn.lock tool-read limitation may be encountered; it does not establish deficient code reasoning or feature complexity.

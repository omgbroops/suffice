# Synthetic coding benchmark fixtures

These eleven tasks are AI-authored synthetic bugs. They measure performance on these specific contracts, not real-world software engineering ability. Four fixed pilot tasks support harness iteration; four fixed holdout tasks are reserved for a final comparison. Three separate context tasks support experiments on multi-module investigation. Do not use holdout results to tune the harness and then report them as untouched evaluation.

| Split | Task | Contract interaction |
| --- | --- | --- |
| pilot | retry-idempotency | request identity and retry timing |
| pilot | cursor-pagination | exclusive cursors and filtered pages |
| pilot | tenant-cache | tenant identity and injected expiry clock |
| pilot | window-scheduler | window fit and half-open booking overlap |
| holdout | streaming-utf8 | decoder state and line framing |
| holdout | dependency-aliases | canonical alias identity and graph traversal |
| holdout | layered-config | recursive overrides and value ownership |
| holdout | atomic-ledger | staged balances and idempotency journal |
| context | inventory-reservations | scoped request identities, duplicate totals and atomic stock publication |
| context | tenant-event-feed | atomic batch sequencing, replay/live tenant filtering and deep snapshot ownership |
| context | layered-routing | route specificity, intentional overrides, header deletion and revision-scoped caching |

Each task contains a writable `workspace/`, a contract README, and visible smoke tests. The original tasks have two source modules; context tasks contain 15–16 source modules, connected workflows, and inactive distractors. Their reference repairs span three or four modules. Acceptance assertions and exact reference replacement patches live outside that workspace. `tasks.mjs` exports absolute fixture paths and prompts, with `contextTasks` as a separate catalog view. Copy only `workspace/` into an isolated worker directory; never copy acceptance tests or reference patches into it. Runner isolation must restrict worker file tools to that copy: location alone is not an operating-system security boundary.

Run a task's visible tests from its worker directory:

```sh
node --test tests/visible.test.mjs
```

The trusted evaluator runs the original acceptance file with `SUFFICE_WORKSPACE` set to the worker directory. Without that variable, acceptance files skip so ordinary repository test discovery remains usable. Node.js built-ins are sufficient; no task installs packages, downloads models, or accesses the network.

Verify fixture integrity and solvability:

```sh
node benchmarks/verify-tasks.mjs
node --test tests/tasks.test.mjs
```

Verification copies each workspace into an OS temporary directory, checks the initial visible tests pass and acceptance fails, applies each exact reference patch once, then requires both suites to pass. It also verifies acceptance hashes remain unchanged and deletes only the checked temporary fixture directory. Reference patches are examples of satisfying repairs, not the only permitted solutions. Acceptance tests intentionally assert public behavior rather than implementation text.

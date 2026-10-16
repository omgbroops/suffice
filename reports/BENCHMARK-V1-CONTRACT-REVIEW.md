# Benchmark v1 independent contract review

All four packages approved for their declared finite functional checks. All four are **single-component, scope tier 1**. None currently establishes genuinely multicomponent engineering scope or long task duration. Classification is ex ante based on responsibilities and required integration, not file count, test count, async vocabulary, or failures.

The fixtures disclose injected production defects in pinned real source. This is neither a natural upstream bug sample nor a contamination-free evaluation. Calibration/reserve labels are initial task-selection roles; researcher inspection here is evaluator exposure, not evidence actor saw hidden acceptance. Hidden graders, reference source, provenance repair metadata and this report must remain outside actor context.

Review read all four public contracts and all 50 hidden test groups, compared production baseline/reference diffs and pinned archived production entries, and checked archive SHA256 values. Native node:crypto hashes exact reviewed descriptor and grader bytes. No inference, tests, package scripts, source mutation or program replay occurred. Runtime reference/base validation remains separate parent evidence.

## rfdc-builtins-state

Verdict: **approved**; scope: **single-component**. One deep-clone engine with option branches, builtin handlers and recursion; no independently implemented component integration.

Task SHA256: `effa7a5da6a10558f4688445b4d4e6788189ae3de078b99ffd009e35004840d1`  
Acceptance SHA256: `39d29cd76f0de7559a8c872e24b270bbffd21ba68204395df47eff5b72ed325f`

Allowed production module is byte-identical to matching pinned source archive entry.

All stored source archive hashes match declared values. Baseline/reference code differences match disclosed injected edits.

| Hidden assertion group | Public requirements | Review |
|---|---|---|
| map keys and values are recursively independent in every mode | R2 | Supported |
| maps inside arrays and sets recursively clone entries | R2 | Supported |
| typed subviews preserve type offset length and independent storage | R3 | Supported |
| dataviews in arrays preserve the visible bytes and isolate writes | R3 | Supported |
| buffers and binary values nested through containers are copied | R2, R3 | Supported |
| custom constructors work at object array and container positions | R2, R4 | Supported |
| custom handlers override builtins without matching subclasses | R4 | Supported |
| ordinary ancestor cycles through arrays and repeated calls stay independent | R5 | Supported |
| prototype property policy survives container and handler recursion | R2, R4, R6 | Supported |

Limitations:

- Disclosed injected defects in pinned public source; no natural-upstream-bug or contamination-free claim.
- All repairs are localized to one production component; no ex ante long-duration or genuine multicomponent claim.
- No inference or evaluator execution performed in independent review; runtime validation receipts belong to creator/parent.
- Subclass exact {} output supported by existing generic fallback in source and preserve-API clause, rather than exact-match constructor requirement alone.
- R1 mostly visible-regression coverage; hidden cases sample but do not exhaust all binary types/positions/options.

## tinyqueue-heap-state

Verdict: **approved**; scope: **single-component**. One heap data structure and its push/pop/heapify invariants; mixed scenarios do not add engineering components.

Task SHA256: `531bef677b3336a715bb78ccb6fa4bbae756c2f108369d090b85341bc043713e`  
Acceptance SHA256: `90684d5d4f82ef08e8528e874967424011f5628e38871397d7c5514d2ace177e`

Allowed production module is byte-identical to matching pinned source archive entry.

All stored source archive hashes match declared values. Baseline/reference code differences match disclosed injected edits.

| Hidden assertion group | Public requirements | Review |
|---|---|---|
| constructor heapifies unsorted odd and even arrays | Q1, Q3, Q4 | Supported |
| insertion repairs every ancestor for both child positions | Q2, Q3, Q4 | Supported |
| replacement selects either better child and handles left-only children | Q2, Q3 | Supported |
| emptying and reusing preserves peek pop and length | Q4 | Supported |
| reverse comparator governs construction and later insertions | Q1, Q2, Q3, Q4, Q5 | Supported |
| object comparators retain all equal-priority entries | Q1, Q2, Q3, Q5 | Supported |
| deterministic mixed operations agree with a sorted-array model | Q1, Q2, Q3, Q4 | Supported |

Limitations:

- Disclosed injected defects in pinned public source; no natural-upstream-bug or contamination-free claim.
- All repairs are localized to one production component; no ex ante long-duration or genuine multicomponent claim.
- No inference or evaluator execution performed in independent review; runtime validation receipts belong to creator/parent.

## emittery-iterator-lifecycle

Verdict: **approved**; scope: **single-component**. One emitter iterator subscription/buffer lifecycle subsystem interacting with existing listener API; one module and one component responsibility.

Task SHA256: `68429fb3a4443e2475a8066ded4b69bd89fa1cf32a7f8303a8fb1e295f7e7708`  
Acceptance SHA256: `f9ad0335a7abb5fb85b007fb36288302e16eb0484dbd231bdf7181b178c94fc3`

Allowed production module is byte-identical to matching pinned source archive entry.

All stored source archive hashes match declared values. Baseline/reference code differences match disclosed injected edits.

| Hidden assertion group | Public requirements | Review |
|---|---|---|
| I01 named events multicast to all independent iterators | I-R1 | Supported |
| I02 anyEvent multicasts to all independent iterators | I-R1 | Supported |
| I03 slow and fast consumers preserve their own FIFO buffers | I-R1 | Supported |
| I04 returning one named iterator preserves sibling registration | I-R2, I-R5 | Supported |
| I05 sibling named iterator keeps receiving after return | I-R2, I-R4 | Supported |
| I06 returning one any iterator preserves sibling delivery | I-R2, I-R4, I-R5 | Supported |
| I07 multi-event return preserves all unrelated subscriptions | I-R2, I-R4, I-R5 | Supported |
| I08 clear named event drains buffered data before done | I-R3, I-R5 | Supported |
| I09 clear all retains buffers of named and any iterators | I-R3, I-R5 | Supported |
| I10 clear named event leaves other named and any streams active | I-R3, I-R4 | Supported |
| I11 return discards own buffer and forwards awaited value | I-R2, I-R5 | Supported |
| I12 return wakes a pending next with done | I-R2 | Supported |
| I13 clear wakes an empty waiting iterator and permits a fresh one | I-R3, I-R4 | Supported |
| I14 symbol and numeric channels keep identity in anyEvent | I-R1 | Supported |
| I15 instances isolate subscriptions cleanup and buffers | I-R3, I-R4, I-R5 | Supported |
| I16 clear buffers independent same-event consumers | I-R1, I-R3 | Supported |
| I17 returning repeatedly does not unregister a new sibling | I-R2, I-R4 | Supported |
| I18 clearing several names drains each selected buffer | I-R3 | Supported |

Limitations:

- Disclosed injected defects in pinned public source; no natural-upstream-bug or contamination-free claim.
- All repairs are localized to one production component; no ex ante long-duration or genuine multicomponent claim.
- No inference or evaluator execution performed in independent review; runtime validation receipts belong to creator/parent.
- 100 ms settled helper makes promptness operational; arbitrary delayed implementations and severe scheduling pauses can fail independently of eventual functional correctness.
- Concurrent next calls and iterator emitSerial delivery explicitly excluded; upstream tests are context only.

## fastq-resume-window

Verdict: **approved**; scope: **single-component**. One queue scheduler state machine with callback/promise adapter and vendored unchanged pooling dependency; repair does not require independently changing another component.

Task SHA256: `dbcd01f6364a7b503f1cf9ed1e0ffa91e84873082bc5e7773f5d5ac273ee1ef0`  
Acceptance SHA256: `bdfb8a2d375fab31a0f433d5c478e56c57dbe2c351bef3e49bd0f9df7f23d424`

Archive module differs only local reusify import after normalizing line endings; newline conversion also present.

All stored source archive hashes match declared values. Baseline/reference code differences match disclosed injected edits.

| Hidden assertion group | Public requirements | Review |
|---|---|---|
| F01 paused capacity increase must not dispatch | F-R1 | Supported |
| F02 paused active completions do not start backlog | F-R1 | Supported |
| F03 resume fills all available worker slots | F-R2, F-R3 | Supported |
| F04 resume preserves existing running worker accounting | F-R2, F-R3 | Supported |
| F05 resume at full capacity waits for a completion | F-R2 | Supported |
| F06 resume retains unshift priority and FIFO tails | F-R2, F-R3 | Supported |
| F07 completion replaces worker at exact capacity | F-R4 | Supported |
| F08 serial queue fully drains without another push | F-R3, F-R4, F-R6 | Supported |
| F09 lowered concurrency waits for excess active workers | F-R4 | Supported |
| F10 lowered concurrency refills at its new limit | F-R4 | Supported |
| F11 raised concurrency fills free slots immediately | F-R4 | Supported |
| F12 repeated resume is idempotent | F-R2 | Supported |
| F13 synchronous completion reentrancy preserves task order | F-R3, F-R5 | Supported |
| F14 queued callback and error handler retain context and payload | F-R5, F-R4 | Supported |
| F15 empty and drain callbacks reflect queue transitions | F-R6 | Supported |
| F16 promise queue resumes and resolves all ordered results | F-R5, F-R3 | Supported |

Limitations:

- Disclosed injected defects in pinned public source; no natural-upstream-bug or contamination-free claim.
- All repairs are localized to one production component; no ex ante long-duration or genuine multicomponent claim.
- No inference or evaluator execution performed in independent review; runtime validation receipts belong to creator/parent.
- F14 success error-hook invocation supported by actor/src/README.md queue.error documentation: every task completion.
- F16 100 ms Promise.race is an implementation responsiveness budget, not a specified numerical API latency; immediate async worker should settle without wall-time delay, but severe machine scheduling pauses may cause false negatives.
- Reference newline conversion plus disclosed local dependency import; not byte-identical queue module.

## Grader interpretation

No unsupported contract blocker identified. rfdc custom Date subclass fallback is consistent with the preserved source implementation; exact-constructor matching alone does not specify its precise fallback, so documentation/source preservation supplies that basis. fastq error hooks on successful completions are expressly documented in actor-visible README queue.error semantics. Neither should be inferred merely from hidden expected values.

Emittery and fastq use 100 ms helper races for immediate promise progress. Those operationalize responsiveness but are not portable hard real-time API guarantees; record load-related invalidations rather than silently treating a heavily stalled host as a capability failure. They are disclosed limitations, not grounds to assert current tests are failing. Tests with multiple assertions terminate at first failure: later assertions remain unexamined. A passing finite hidden suite establishes the sampled behaviors, not every state described in the public requirements.

Original upstream suites are provided as source context and are not claimed run. New reports must distinguish authored native visible/acceptance suites from full upstream regression coverage. Exact actor-file immutability and no hidden/reference mounting still require runner-side verification.

## Extendable receipts

This JSON is a reviewed immutable-byte receipt for these four task/grader pairs, not standing approval of subsequent edits. Add a new receipt for new task packages or changed hashes (including future multicomponent work), preserving the earlier receipt and stating why the verdict/scope changed. No future package is approved by resemblance to these four.

## Additional independent receipt 2

Exact-byte approvals in `BENCHMARK-V1-CONTRACT-REVIEW.receipt-2.json` supersede the original rfdc pair and add Bottleneck. Initial four-task receipt is preserved in `BENCHMARK-V1-CONTRACT-REVIEW.initial.json`; its first-pass conclusion applies to those four original pairs only. Current scope inventory: four tier1 components plus one provisional structural tier2 small-patch task. No task has measured long-duration evidence.

### rfdc-builtins-state

Approved. Task SHA256 `90d000ab0a46be790aa0ec4e274bccc7aa6971e60fe146930f77643a8da9b791`; grader SHA256 `986bb8883dbd111abd3f844cc509b551df81e665c89e40531721234d62c710b1`.

Added one separate hidden R1 test is fully supported by unchanged public primitive/function/Date/nested-copy contract. All ten group names now map to R1–R6. Creator-reported reference/base scores are not independent execution evidence. Native hashes match creator message.

No inference or evaluator execution occurred in this review; hidden/reference remains evaluator-only.

### bottleneck-weighted-priority

Approved. Task SHA256 `af5744160cd87d3695368d122063f994cf7f9f4596bb205e8dc0f84398affcd1`; grader SHA256 `4063c94741905f979c6a30f543730e476fd007a0a99af3cd33bb06d1b7123881`.

Provisional structural tier2: actual queue-priority selection and datastore weighted reservation conservation integrate through the existing scheduler and job completion/re-drain. Both mutations must be addressed to satisfy the combined scenario, but two one-line repairs suffice. This does not establish a longer task, difficulty, compaction exposure, long-horizon persistence or delegation benefit. All 97 reference source files match source.json SHA256 entries; archive bytes were not located independently. Compared full actor/reference src: exactly the two disclosed production mutations.

| Hidden group | Contract |
|---|---|
| queued priorities run from smaller number to larger number with FIFO ties | R1 |
| successful weighted jobs release their entire reservation exactly once | R2,R4 |
| failed weighted jobs release capacity and retain rejection identity | R2,R4 |
| priority selection and weighted release compose across backlog waves | R1,R2,R3,R4 |
| oversized jobs reject without consuming running capacity | R2,R4 |
| zero weight completion leaves running capacity unchanged | R2,R5 |

Each checked result, error identity, priority order, FIFO tie, weighted running/done total, reuse and zero/oversized admission expectation is explicitly public. Combined backlog test is dependency-gated rather than a latency target. Selected requirements exclude Redis, retries, expiration, clustering and timing guarantees. Full upstream suites are not claimed executed. Assertions after a first failure remain unexamined. Parent-reported ablation outcomes are useful integration evidence but were not independently rerun.

No inference or evaluator execution occurred in this review; hidden/reference remains evaluator-only.

## Final Bottleneck receipt 3

Approved final descriptor SHA256 `99bb6cf6ba571867f5ac037c0f739798617de75e09f276c6eaffb8256ebf2728`; unchanged acceptance SHA256 `4063c94741905f979c6a30f543730e476fd007a0a99af3cd33bb06d1b7123881`. Reviewed all 17 unique existing lib JS edit paths; bundled lib/es5.js excluded, both repair modules allowed. Behavioral mapping remains as receipt 2. Structural tier2 remains provisional small-patch scope with no long-duration evidence. Receipts 1/2 preserved.

## Final async receipt 4

Current full Emittery and fastq descriptors reread and approved with native exact hashes in receipt4. Both remain tier1, no long-task evidence. Final task-relative visiblePath and workspaceVisiblePath metadata is consistent. Hidden grader exact-byte hashes differ from initial receipts; both full current graders were reread and their existing assertion mapping remains supported. Emittery reference production hash is unchanged; fastq reference exact bytes differ. Fastq baseline is **not metadata-only**: setter now clears paused state and release adds !holder; revised provenance discloses both. Actual current baseline/reference diff was reviewed and remains within the same public repair contract. No tests or inference were executed; earlier receipts retained.

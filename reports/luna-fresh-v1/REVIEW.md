# Decision: fresh Luna Extra High and one preservation mechanism

Luna Extra High remains promising on fresh repository issues, but this small campaign does not establish a general success rate or Sol/Astra parity. It does not establish a benefit from the preservation gate or a reliable cheap handoff signal. Keep the frozen plain baseline as the candidate; keep the gate experimental and routing disabled.

All twelve planned attempts ran. Frozen raw grading is **A 5/6, B 5/6**, with different failure labels. Two tasks have documented evaluation problems, so those raw labels must not be treated as coding failures or a reliable performance comparison. No primary grader, baseline, task budget, source input, or model setting was changed during the campaign.

## Results and complete costs

| Recorded metric | Plain Luna xhigh (A) | Luna xhigh + public gate (B) |
|---|---:|---:|
| Attempts | 6 | 6 |
| Frozen raw accepted / eligible success | 5 / 5 | 5 / 5 |
| All-attempt API-equivalent inference | $0.05542118 | $0.06036924 |
| Raw cost / accepted (labels affected by grading defects) | $0.01108424 | $0.01207385 |
| Model replies | 86 | 88 |
| Model-observed calls, including codemode and nested tools | 212 | 203 |
| Mean actor duration, including B gate/continuation | 188.2s | 236.4s |
| Median actor duration | 156.4s | 220.1s |
| Unknown full costs | 0 | 0 |

The four unaffected pairs are f02/p-map76, f03/p-map95, f04/p-timeout43 and f05/p-retry97. They are **4/4 in both arms**. Costs are $0.04195292 for A and $0.04400986 for B: 4.90% more in this one sample. Cost per accepted task is $0.01048823 versus $0.01100246. These four cases span three repositories, two from p-map; they are not a broad or randomized sample.

The excluded-from-sensitivity attempts remain fully recorded and costed: A $0.01346826, B $0.01635938. **All twelve attempts total $0.11579042**. This is catalog-priced benchmark inference, including the continuation and unsuccessful raw results. It excludes research/engineering-agent inference and preparation, is not total project spending, and is not a subscription cash charge. Every attempt used the same $0.15 total task allowance, well below the human-authorized ceiling. No new Sol inference ran.

RESULTS.md / FINAL-RESULTS.json retain all six pairs, fresh/cached/output cost buckets, complete event accounting, and both the five-contract and four-stable-task sensitivity views. They do not silently turn the raw results into an adjusted 6/6 score.

## Two evaluation findings

**fastq88/f06: extra observation boundary.** The upstream regression test checks the log immediately after an unrelated Promise.all continuation. The original issue and README require the event order after the queue drains; they do not specify that additional promise-continuation boundary. A produces the original expected trace in 10/10 independent replays, just like B and the reference; the buggy base fails 10/10. A differs in how many promise-adoption microtasks run before its callback. Keep its frozen raw rejection, but mark the case disputed. Do not claim B rescued it: B passed on its first submission before any gate feedback.

**p-map94/f01: unstable timing check.** A final, B initial, and B final index.js have the exact same SHA-256. The original concurrency timing test measured 299.921717 ms against a 300 ms lower bound and triggered B's continuation. Later grading measured 299.991776 / 299.896063 ms, while another independent grade accepted the same bytes. The issue-specific consumer-break/return/throw checks passed; the rejection comes from an existing timing assertion. This is evaluation instability, not a demonstrated code regression. Its full costs and raw failure remain.

There is also a separate **p-map95 getter audit**. The original report describes reading each thenable getter once. The upstream fix subscribes once but still reads that getter twice; its added tests do not cover the distinction. Both A and B correctly read and subscribe once across all four listed API modes. This post-hoc audit strengthens confidence in these particular patches but is not a newly scored held-out test or proof of complete correctness.

## Did the preservation mechanism work?

B is exactly A's initial prompt, model, effort, navigation and codemode plus code that snapshots original public tests, restores them in a separate copy, and executes public project commands on submission. It may append one bounded repair continuation containing public diagnostics only. There is no generated test oracle, extra planner, model judge, hidden feedback, compression or controller. The fourteen baseline files are byte-identical to the previous xhigh baseline; only B's agent/entry wiring and added helper differ.

The gate executed on all six B tasks and ran 14 deterministic project commands over seven gate evaluations. The repair branch activated **once**, so this is not an unactivated-controller experiment. However, the activation was the timing false-alarm candidate above. It consumed **$0.00274778 and 4 extra model replies**, with zero source or test changes. All non-test patch paths were identical before and after; no genuine behavioral repair was demonstrated.

Thus the branch is operationally tested, but its usefulness is not established. The all-attempt B cost is 8.93% higher in this sample, and the four-stable-task cost is 4.90% higher. Most runs have no extra gate-induced model calls; initial model trajectories and cache reuse vary despite identical initial instructions. Do not attribute every observed cost difference to the mechanism. The one continuation charge is directly attributable to its false alarm.

## Cheap handoff signal

The rule was frozen before fresh labels: route when original public tests fail, the worker does not complete, or no production patch exists. Fresh A flagged zero tasks, and there are no confirmed fresh coding failures on which to estimate recall. This is not proof that a zero-cost detector is reliable. In the old xhigh cohort it flagged only one of three frozen-grader failures and missed another known post-hoc regression. The new B timing event additionally demonstrates that an observed public failure can be a false alarm even with valid source bytes.

No actual Sol continuation or price parity was established. The old-run accounting replay suggests adding the recorded standalone Sol attempt for the sole flagged task would increase that old cohort's inference by 48.23%; that is a projection from different sessions, not a live handoff measurement or bound. HANDOFF-SIGNAL.md gives the evidence and the cost-per-accepted break-even condition. Do not deploy or train a router from these labels.

## Limits and reproducibility

Contracts came from original upstream issues and upstream-authored tests, reviewed by the parent independently of the coding actor. **There was no second human or review-model auditor.** No subagents were spawned. The pre-score review was insufficient to catch both timing/observation-boundary flaws; this late audit is precisely why a base-fail/reference-pass control is necessary but insufficient. The raw scores remain immutable.

All actors used separate fresh Git worktrees, one public source snapshot, the pinned Node24.15.0/Pi1.2.0 stack, the same resource boundaries and budgets, no reference/hidden-test access, and guarded gpt-6-luna/xhigh requests. All A ran before B; B task order was reversed, so phase/time/cache confounding remains. Original issue bodies were verbatim, including solution hints in some reports. This was mostly async-library behavior, not multi-hour engineering or live TypeScript implementation. JS projects' declaration checks ran; separate model-free TypeScript loader controls passed, which is not a claim of TS repair performance.

The 15 model-free public-gate controls include unchanged/reference JS projects, deliberate implementation/test tampering, and native TS-loader checks. Pre-inference setup failures (AVA cache configuration, missing transitive test dependencies/type environment) are retained. They are tooling/environment failures with zero benchmark inference, not coding failures. All 174 worker responses reconcile against request/usage events; no failed response or incomplete cost was dropped. The original general-v1 inputs and both prior review ZIPs remain unchanged.

**Smallest justified decision:** retain plain Luna Extra High for further evaluation. Do not promote this gate or enable Luna-to-Sol routing. The next performance claim needs more genuinely varied, trustworthy issue contracts; this campaign itself does not warrant another optimization layer. No further campaign was started, and no upstream PR was submitted.

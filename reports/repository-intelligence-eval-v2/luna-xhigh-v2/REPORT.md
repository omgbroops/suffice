> PRELIMINARY / QUARANTINED: task copies inherited parent Git metadata. This is not a clean Git-isolated comparison. Test grades remain preserved observations. The user rejected this saturated suite and requested harder tasks; no replay of the old main suite was started. See ../STATUS.md and ../../../docs/CLOUD-HANDOFF-REPOSITORY-INTELLIGENCE-V2.md.

# Repository intelligence evaluation v2

## Research question and recommendation

Verified implementations: baseline **48/48**, always-guided **46/48**, on-demand **47/48**. Baseline is saturated: there were no incorrect baseline implementations for either controller to rescue. Keep proactive guidance experimental; no accuracy improvement is established by this sample.

Can deterministic repository evidence improve the same weaker model’s accepted engineering work, especially on longer tasks? All scored inference uses gpt-6-luna at xhigh. This report distinguishes grounded retrieval, tool availability, observed evidence uptake and accepted behavior. No static dependency is treated as a correctness proof.

## Methodology and model calibration

[Preregistered protocol](../../docs/REPOSITORY-INTELLIGENCE-EVAL-V2.md), [main manifest](luna-xhigh-v2/main/manifest.json), [pilot manifest](luna-xhigh-v2/pilot/manifest.json), [Fast probe](preflight.json), [raw analysis](analysis.json).

The user fixed the model and extra-high effort; no stronger helper, verifier or router was used. The disjoint three-task baseline pilot accepted 2/3. Calibration was not used to tune final task labels, budgets or triggers. A priority/Fast request was served at default tier, so all scored requests explicitly use default.

Primary attempts recorded: **144/144**. Optional availability-only diagnostics: 6/6. Stop reason: none; full schedule completed. Every missing scheduled attempt remains missing; no failures were silently dropped or retried.

Raw provider-response audit: 1520 usage-bearing responses; model counts {"gpt-6-luna":1520}, effort counts {"xhigh":1520}, actual tier counts {"default":1520}; 0 model/effort violations. Any observed mismatch is excluded from success.

A [throughput-only operational amendment](luna-xhigh-v2/main/operational-amendment.json) raised concurrent capacity from six to twelve isolated runs after draining the initial 30 attempts. [Exact runner diff](luna-xhigh-v2/main/operational-amendment.patch). All other frozen manifest fields and implementation hashes were checked unchanged. Canonical run IDs preserved every earlier attempt without rerunning it. Each task’s A/B/C repetitions share the same scheduling phase; concurrency and cache/service effects remain latency threats. Scored controller, model, budget, input and grading code did not change.

Budgets are identical across A/B/C: 480 seconds, 60 model turns, 240 tool calls, 16,384 output/reasoning tokens per request and $0.50 API-equivalent allowance. Fresh sessions/workspaces are used for both repetitions. Seeded task/category order and shuffled arm order balance scheduling; service cache warmth remains uncontrolled. Native tools are not an OS sandbox. Original files are independently checked after each run; acceptance/reference data is outside the workspace.

## Dataset

Eight prospectively labeled tasks per category: 10 pinned upstream bug fixes, 11 previously used synthetic contracts, and 3 synthetic compound tasks. This is not 24 independent, unseen real-world issues. Semver’s CommonJS module relationships are an unsupported negative control for this ESM graph. YAML TypeScript and synthetic ESM provide different coverage. Compound tasks share components with other tasks, making results correlated.

| Task | Category | Provenance | Starting revision | Production files | Held-out checks |
|---|---|---|---|---:|---:|
| retry-idempotency | complex | synthetic (synthetic) | 124e0e194d | 2 | 3 |
| cursor-pagination | cross-file | synthetic (synthetic) | 124e0e194d | 2 | 3 |
| tenant-cache | cross-file | synthetic (synthetic) | 124e0e194d | 2 | 2 |
| window-scheduler | simple | synthetic (synthetic) | 124e0e194d | 2 | 2 |
| streaming-utf8 | cross-file | synthetic (synthetic) | 124e0e194d | 2 | 3 |
| dependency-aliases | cross-file | synthetic (synthetic) | 124e0e194d | 2 | 3 |
| layered-config | simple | synthetic (synthetic) | 124e0e194d | 2 | 3 |
| atomic-ledger | complex | synthetic (synthetic) | 124e0e194d | 2 | 3 |
| inventory-reservations | complex | synthetic (synthetic) | 124e0e194d | 15 | 4 |
| tenant-event-feed | complex | synthetic (synthetic) | 124e0e194d | 15 | 4 |
| layered-routing | complex | synthetic (synthetic) | 124e0e194d | 16 | 4 |
| prerelease-subset | cross-file | [npm/node-semver](https://github.com/npm/node-semver/commit/efa4be6096c1f9b77d9d27d6132f6220c43b4e31) | efa4be6096 | 48 | 3 |
| build-metadata | simple | [npm/node-semver](https://github.com/npm/node-semver/commit/efa4be6096c1f9b77d9d27d6132f6220c43b4e31) | efa4be6096 | 48 | 3 |
| dotted-prerelease | simple | [npm/node-semver](https://github.com/npm/node-semver/commit/efa4be6096c1f9b77d9d27d6132f6220c43b4e31) | efa4be6096 | 48 | 3 |
| numeric-xrange | simple | [npm/node-semver](https://github.com/npm/node-semver/commit/6b77aa84a648a4b54ea32a21e6db60ebd54d5040) | 6b77aa84a6 | 48 | 3 |
| caret-prerelease | simple | [npm/node-semver](https://github.com/npm/node-semver/commit/efafcf8d029faa3d1ab74b5ec98d620112af859d) | efafcf8d02 | 48 | 3 |
| prerelease-diff | simple | [npm/node-semver](https://github.com/npm/node-semver/commit/753e02b9d0cb3ac23e085dc33efcab3e08d61f2b) | 753e02b9d0 | 47 | 3 |
| numeric-prerelease | cross-file | [npm/node-semver](https://github.com/npm/node-semver/commit/2677f2a88334b0e728dbfe9ad9f5f57458437c87) | 2677f2a883 | 47 | 3 |
| mapping-boundaries | cross-file | [nodeca/js-yaml](https://github.com/nodeca/js-yaml/commit/49280f3e799b6deb596ba9a041b0ebe2bba83c77) | 49280f3e79 | 41 | 4 |
| folded-tabs | cross-file | [nodeca/js-yaml](https://github.com/nodeca/js-yaml/commit/40fcb4f45c1f25e4e9495cf27094405d1d740881) | 40fcb4f45c | 41 | 3 |
| exponent-integers | simple | [nodeca/js-yaml](https://github.com/nodeca/js-yaml/commit/89024c43d898b0dab53b82cb9b29c2cef3aca961) | 89024c43d8 | 41 | 3 |
| fulfillment-workflow | complex | synthetic (compound) | 124e0e194d | 19 | 10 |
| event-routing-workflow | complex | synthetic (compound) | 124e0e194d | 33 | 10 |
| streaming-catalog-workflow | complex | synthetic (compound) | 124e0e194d | 8 | 12 |

All 24 unrepaired inputs failed assertion-based acceptance, all references passed acceptance, and both inputs and references passed public regressions before inference. These are required adapted regression groups, not the entirety of each upstream project’s test suite. The machine dataset records archive/acceptance hashes and difficulty rationale. Public task contracts are copied into [contracts.json](contracts.json). The compound public suites use dynamic imports to isolate component bindings; this preserves their tests but limits this static graph’s test-discovery coverage. Verification is already specified to all agents, so test-selection gains are not independently identifiable here.

## Aggregate acceptance, resources and cost

| Arm | Verified implementations | Completed + accepted | Implementation accuracy | Regressions failed | Incomplete | Mean seconds | Reported input incl. cache | Reported output | Known estimate | Total estimate bounds | Cost/verified implementation bounds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A: baseline | 48/48 | 47/48 | 100.0% | 0 | 1 | 167.6 | 6331066 | 347384 | $0.3666 | $0.3666–$0.8458 | $0.0076–$0.0176 |
| B: always-guided | 46/48 | 46/48 | 95.8% | 0 | 0 | 169.3 | 8083441 | 349943 | $0.4135 | $0.4135 | $0.0090 |
| C: on-demand | 47/48 | 47/48 | 97.9% | 0 | 0 | 165.4 | 6998160 | 337911 | $0.3675 | $0.3675 | $0.0078 |

Implementation accuracy follows independently executed held-out acceptance, public regressions, immutable inputs and model validity. The frozen harness also required normal agent completion for its success flag; that completion endpoint is retained separately. This distinction was added after a timeout left a fully passing patch, without changing its raw grades. A passing patch at the deadline is not a software-correctness failure or an accuracy rescue by another configuration.

Costs are API-equivalent pinned-catalog estimates from subscription usage, not billed spend. Unknown totals remain unknown; known components and token sums cover reported usage only. The upper bound retains the entire per-run allowance for missing usage, rather than imputing a likely price. The spending ledger protects the cap without treating unknown requests as free.

Experiment known estimate including pilot/probe: $1.1914; conservative charged/reserved amount: $1.6705 of $12.

## Paired differences and uncertainty

| Comparison | Category | Pairs | Candidate-only pass | Baseline-only pass | Accuracy difference | Task bootstrap 95% interval | Family sensitivity 95% interval |
|---|---|---:|---:|---:|---:|---|---|
| B − A | all | 48 | 0 | 2 | -4.2% | -10.4% to 0.0% | -13.3% to 0.0% (6 clusters) |
| B − A | simple | 16 | 0 | 0 | 0.0% | not estimable | not estimable (4 clusters) |
| B − A | cross-file | 16 | 0 | 0 | 0.0% | not estimable | not estimable (4 clusters) |
| B − A | complex | 16 | 0 | 2 | -12.5% | -31.3% to 0.0% | -33.3% to 0.0% (3 clusters) |
| C − A | all | 48 | 0 | 1 | -2.1% | -6.3% to 0.0% | -6.7% to 0.0% (6 clusters) |
| C − A | simple | 16 | 0 | 0 | 0.0% | not estimable | not estimable (4 clusters) |
| C − A | cross-file | 16 | 0 | 0 | 0.0% | not estimable | not estimable (4 clusters) |
| C − A | complex | 16 | 0 | 1 | -6.3% | -18.8% to 0.0% | -16.7% to 0.0% (3 clusters) |

Bootstrap resamples task-level mean paired differences (10,000 fixed-seed draws), keeping the two repetitions together. When all task differences are identical, its interval is withheld rather than displaying a misleading zero-width interval; observed equality does not establish equivalence or exclude unseen effects. These descriptive intervals assume task clusters are exchangeable. Shared projects/components and authored task selection violate stronger independence/generalization assumptions; no statistical threshold establishes adoption. They exclude pairs with an unattempted arm, whose counts remain reported.

These paired tables use verified implementation accuracy. The retained normal-completion endpoint is: B − A -2.1% (1 candidate-only finishes, 2 baseline-only finishes); C − A 0.0% (1 candidate-only finishes, 1 baseline-only finishes). When baseline is saturated, empirical resampling cannot create unobserved baseline failures or rescues; an interval ending at zero does not rule out unseen benefits.

A post-hoc dependence sensitivity groups tasks from the same upstream repository and connects synthetic tasks sharing compound components, then resamples whole connected families. This addresses known overlap more conservatively than treating 24 tasks as independent, but very few families and nonrandom task selection still prevent population-level inference. It changes no primary outcomes or evaluation inputs.

## Simple versus cross-file and long-horizon work

| Category | A | B | C |
|---|---:|---:|---:|
| simple | 16/16 | 16/16 | 16/16 |
| cross-file | 16/16 | 16/16 | 16/16 |
| complex | 16/16 | 14/16 | 15/16 |

| Provenance | A | B | C |
|---|---:|---:|---:|
| upstream | 20/20 | 20/20 | 20/20 |
| synthetic | 22/22 | 21/22 | 21/22 |
| compound | 6/6 | 5/6 | 6/6 |

| Independently known reference patch span | A | B | C |
|---|---:|---:|---:|
| One production file | 20/20 | 20/20 | 20/20 |
| Multiple production files | 28/28 | 26/28 | 27/28 |

Complexity strata are prospective contract/work-horizon labels, not validated latent difficulty. The complex category includes small state machines as well as conjunctions of multiple subsystems. This limits claims about truly large industrial long-running tasks.

## Controller queries, overhead, edits and observable uptake

| Arm | Model iterations | Tool calls | Graph queries | Graph seconds summed | Extra edited reference-envelope files | Untouched reference files on failures | Guidance with later matching actions |
|---|---:|---:|---:|---:|---:|---:|---:|
| A | 517 | 1304 | 0 | 0.00 | 10 | 0 | 0 |
| B | 453 | 1426 | 572 | 208.04 | 9 | 2 | 110 |
| C | 494 | 1216 | 291 | 95.75 | 12 | 1 | 104 |

| Query reason | Count |
|---|---:|
| task-start-baseline | 48 |
| initial-context-selection | 48 |
| post-tool-change-check | 405 |
| post-edit-test-recommendation | 71 |
| editing-exported-module | 185 |
| failed-verification-dependency-context | 33 |
| editing-exported-module+failed-verification | 64 |
| failed-verification | 9 |

Every query reason and initial/post-edit/triggered guidance phase is retained. Later path touches or test commands matching recommended paths are temporal uptake proxies. They cannot establish that an agent used the evidence, avoided an edit because of it, or retried more effectively. Extra/untouched reference files similarly do not prove unnecessary edits or missed dependencies. Review actual failing contracts and patches. Graph-refresh time is summed work, not a subtractable causal latency estimate; C also pays source hashing overhead. Cache reuse and memory/serialization metrics appear in per-run refresh records. Net heap deltas in the shared concurrent process include other activity and GC, so they are not per-controller retained-memory measurements; serialized cache/graph bytes remain directly measurable.

### Availability-only diagnostic

Tools merely available: 6/6 accepted; 0 explicit graph calls; $0.0365 API-equivalent. This existing tools mode initializes a task-start index but injects no proactive evidence; startup refreshes are counted separately from explicit agent calls. These six one-repetition diagnostics are not a powered randomized ablation. The existing A/B/C differences combine context selection, dependency evidence, test recommendation, context size and execution trajectories; their components cannot be independently attributed.

## Complete primary outcomes

| Task | A r0/r1 | B r0/r1 | C r0/r1 |
|---|---|---|---|
| retry-idempotency | [pass](luna-xhigh-v2/main/041-retry-idempotency-A-r0.json) / [pass](luna-xhigh-v2/main/041-retry-idempotency-A-r1.json) | [pass](luna-xhigh-v2/main/041-retry-idempotency-B-r0.json) / [pass](luna-xhigh-v2/main/041-retry-idempotency-B-r1.json) | [pass](luna-xhigh-v2/main/041-retry-idempotency-C-r0.json) / [pass](luna-xhigh-v2/main/041-retry-idempotency-C-r1.json) |
| cursor-pagination | [pass](luna-xhigh-v2/main/003-cursor-pagination-A-r0.json) / [pass](luna-xhigh-v2/main/003-cursor-pagination-A-r1.json) | [pass](luna-xhigh-v2/main/003-cursor-pagination-B-r0.json) / [pass](luna-xhigh-v2/main/003-cursor-pagination-B-r1.json) | [pass](luna-xhigh-v2/main/003-cursor-pagination-C-r0.json) / [pass](luna-xhigh-v2/main/003-cursor-pagination-C-r1.json) |
| tenant-cache | [pass](luna-xhigh-v2/main/045-tenant-cache-A-r0.json) / [pass](luna-xhigh-v2/main/045-tenant-cache-A-r1.json) | [pass](luna-xhigh-v2/main/045-tenant-cache-B-r0.json) / [pass](luna-xhigh-v2/main/045-tenant-cache-B-r1.json) | [pass](luna-xhigh-v2/main/045-tenant-cache-C-r0.json) / [pass](luna-xhigh-v2/main/045-tenant-cache-C-r1.json) |
| window-scheduler | [pass](luna-xhigh-v2/main/019-window-scheduler-A-r0.json) / [pass](luna-xhigh-v2/main/019-window-scheduler-A-r1.json) | [pass](luna-xhigh-v2/main/019-window-scheduler-B-r0.json) / [pass](luna-xhigh-v2/main/019-window-scheduler-B-r1.json) | [pass](luna-xhigh-v2/main/019-window-scheduler-C-r0.json) / [pass](luna-xhigh-v2/main/019-window-scheduler-C-r1.json) |
| streaming-utf8 | [pass](luna-xhigh-v2/main/015-streaming-utf8-A-r0.json) / [pass](luna-xhigh-v2/main/015-streaming-utf8-A-r1.json) | [pass](luna-xhigh-v2/main/015-streaming-utf8-B-r0.json) / [pass](luna-xhigh-v2/main/015-streaming-utf8-B-r1.json) | [pass](luna-xhigh-v2/main/015-streaming-utf8-C-r0.json) / [pass](luna-xhigh-v2/main/015-streaming-utf8-C-r1.json) |
| dependency-aliases | [pass](luna-xhigh-v2/main/039-dependency-aliases-A-r0.json) / [pass](luna-xhigh-v2/main/039-dependency-aliases-A-r1.json) | [pass](luna-xhigh-v2/main/039-dependency-aliases-B-r0.json) / [pass](luna-xhigh-v2/main/039-dependency-aliases-B-r1.json) | [pass](luna-xhigh-v2/main/039-dependency-aliases-C-r0.json) / [pass](luna-xhigh-v2/main/039-dependency-aliases-C-r1.json) |
| layered-config | [pass](luna-xhigh-v2/main/007-layered-config-A-r0.json) / [pass](luna-xhigh-v2/main/007-layered-config-A-r1.json) | [pass](luna-xhigh-v2/main/007-layered-config-B-r0.json) / [pass](luna-xhigh-v2/main/007-layered-config-B-r1.json) | [pass](luna-xhigh-v2/main/007-layered-config-C-r0.json) / [pass](luna-xhigh-v2/main/007-layered-config-C-r1.json) |
| atomic-ledger | [pass](luna-xhigh-v2/main/017-atomic-ledger-A-r0.json) / [pass](luna-xhigh-v2/main/017-atomic-ledger-A-r1.json) | [pass](luna-xhigh-v2/main/017-atomic-ledger-B-r0.json) / [pass](luna-xhigh-v2/main/017-atomic-ledger-B-r1.json) | [pass](luna-xhigh-v2/main/017-atomic-ledger-C-r0.json) / [pass](luna-xhigh-v2/main/017-atomic-ledger-C-r1.json) |
| inventory-reservations | [pass](luna-xhigh-v2/main/035-inventory-reservations-A-r0.json) / [pass](luna-xhigh-v2/main/035-inventory-reservations-A-r1.json) | [pass](luna-xhigh-v2/main/035-inventory-reservations-B-r0.json) / [pass](luna-xhigh-v2/main/035-inventory-reservations-B-r1.json) | [pass](luna-xhigh-v2/main/035-inventory-reservations-C-r0.json) / [pass](luna-xhigh-v2/main/035-inventory-reservations-C-r1.json) |
| tenant-event-feed | [pass](luna-xhigh-v2/main/029-tenant-event-feed-A-r0.json) / [pass](luna-xhigh-v2/main/029-tenant-event-feed-A-r1.json) | [fail](luna-xhigh-v2/main/029-tenant-event-feed-B-r0.json) / [pass](luna-xhigh-v2/main/029-tenant-event-feed-B-r1.json) | [fail](luna-xhigh-v2/main/029-tenant-event-feed-C-r0.json) / [pass](luna-xhigh-v2/main/029-tenant-event-feed-C-r1.json) |
| layered-routing | [pass](luna-xhigh-v2/main/011-layered-routing-A-r0.json) / [pass](luna-xhigh-v2/main/011-layered-routing-A-r1.json) | [pass](luna-xhigh-v2/main/011-layered-routing-B-r0.json) / [pass](luna-xhigh-v2/main/011-layered-routing-B-r1.json) | [pass](luna-xhigh-v2/main/011-layered-routing-C-r0.json) / [pass](luna-xhigh-v2/main/011-layered-routing-C-r1.json) |
| prerelease-subset | [pass](luna-xhigh-v2/main/021-prerelease-subset-A-r0.json) / [pass](luna-xhigh-v2/main/021-prerelease-subset-A-r1.json) | [pass](luna-xhigh-v2/main/021-prerelease-subset-B-r0.json) / [pass](luna-xhigh-v2/main/021-prerelease-subset-B-r1.json) | [pass](luna-xhigh-v2/main/021-prerelease-subset-C-r0.json) / [pass](luna-xhigh-v2/main/021-prerelease-subset-C-r1.json) |
| build-metadata | [pass](luna-xhigh-v2/main/037-build-metadata-A-r0.json) / [pass](luna-xhigh-v2/main/037-build-metadata-A-r1.json) | [pass](luna-xhigh-v2/main/037-build-metadata-B-r0.json) / [pass](luna-xhigh-v2/main/037-build-metadata-B-r1.json) | [pass](luna-xhigh-v2/main/037-build-metadata-C-r0.json) / [pass](luna-xhigh-v2/main/037-build-metadata-C-r1.json) |
| dotted-prerelease | [pass](luna-xhigh-v2/main/013-dotted-prerelease-A-r0.json) / [pass](luna-xhigh-v2/main/013-dotted-prerelease-A-r1.json) | [pass](luna-xhigh-v2/main/013-dotted-prerelease-B-r0.json) / [pass](luna-xhigh-v2/main/013-dotted-prerelease-B-r1.json) | [pass](luna-xhigh-v2/main/013-dotted-prerelease-C-r0.json) / [pass](luna-xhigh-v2/main/013-dotted-prerelease-C-r1.json) |
| numeric-xrange | [accepted patch; budget_or_incomplete](luna-xhigh-v2/main/043-numeric-xrange-A-r0.json) / [pass](luna-xhigh-v2/main/043-numeric-xrange-A-r1.json) | [pass](luna-xhigh-v2/main/043-numeric-xrange-B-r0.json) / [pass](luna-xhigh-v2/main/043-numeric-xrange-B-r1.json) | [pass](luna-xhigh-v2/main/043-numeric-xrange-C-r0.json) / [pass](luna-xhigh-v2/main/043-numeric-xrange-C-r1.json) |
| caret-prerelease | [pass](luna-xhigh-v2/main/001-caret-prerelease-A-r0.json) / [pass](luna-xhigh-v2/main/001-caret-prerelease-A-r1.json) | [pass](luna-xhigh-v2/main/001-caret-prerelease-B-r0.json) / [pass](luna-xhigh-v2/main/001-caret-prerelease-B-r1.json) | [pass](luna-xhigh-v2/main/001-caret-prerelease-C-r0.json) / [pass](luna-xhigh-v2/main/001-caret-prerelease-C-r1.json) |
| prerelease-diff | [pass](luna-xhigh-v2/main/025-prerelease-diff-A-r0.json) / [pass](luna-xhigh-v2/main/025-prerelease-diff-A-r1.json) | [pass](luna-xhigh-v2/main/025-prerelease-diff-B-r0.json) / [pass](luna-xhigh-v2/main/025-prerelease-diff-B-r1.json) | [pass](luna-xhigh-v2/main/025-prerelease-diff-C-r0.json) / [pass](luna-xhigh-v2/main/025-prerelease-diff-C-r1.json) |
| numeric-prerelease | [pass](luna-xhigh-v2/main/009-numeric-prerelease-A-r0.json) / [pass](luna-xhigh-v2/main/009-numeric-prerelease-A-r1.json) | [pass](luna-xhigh-v2/main/009-numeric-prerelease-B-r0.json) / [pass](luna-xhigh-v2/main/009-numeric-prerelease-B-r1.json) | [pass](luna-xhigh-v2/main/009-numeric-prerelease-C-r0.json) / [pass](luna-xhigh-v2/main/009-numeric-prerelease-C-r1.json) |
| mapping-boundaries | [pass](luna-xhigh-v2/main/033-mapping-boundaries-A-r0.json) / [pass](luna-xhigh-v2/main/033-mapping-boundaries-A-r1.json) | [pass](luna-xhigh-v2/main/033-mapping-boundaries-B-r0.json) / [pass](luna-xhigh-v2/main/033-mapping-boundaries-B-r1.json) | [pass](luna-xhigh-v2/main/033-mapping-boundaries-C-r0.json) / [pass](luna-xhigh-v2/main/033-mapping-boundaries-C-r1.json) |
| folded-tabs | [pass](luna-xhigh-v2/main/027-folded-tabs-A-r0.json) / [pass](luna-xhigh-v2/main/027-folded-tabs-A-r1.json) | [pass](luna-xhigh-v2/main/027-folded-tabs-B-r0.json) / [pass](luna-xhigh-v2/main/027-folded-tabs-B-r1.json) | [pass](luna-xhigh-v2/main/027-folded-tabs-C-r0.json) / [pass](luna-xhigh-v2/main/027-folded-tabs-C-r1.json) |
| exponent-integers | [pass](luna-xhigh-v2/main/031-exponent-integers-A-r0.json) / [pass](luna-xhigh-v2/main/031-exponent-integers-A-r1.json) | [pass](luna-xhigh-v2/main/031-exponent-integers-B-r0.json) / [pass](luna-xhigh-v2/main/031-exponent-integers-B-r1.json) | [pass](luna-xhigh-v2/main/031-exponent-integers-C-r0.json) / [pass](luna-xhigh-v2/main/031-exponent-integers-C-r1.json) |
| fulfillment-workflow | [pass](luna-xhigh-v2/main/047-fulfillment-workflow-A-r0.json) / [pass](luna-xhigh-v2/main/047-fulfillment-workflow-A-r1.json) | [pass](luna-xhigh-v2/main/047-fulfillment-workflow-B-r0.json) / [pass](luna-xhigh-v2/main/047-fulfillment-workflow-B-r1.json) | [pass](luna-xhigh-v2/main/047-fulfillment-workflow-C-r0.json) / [pass](luna-xhigh-v2/main/047-fulfillment-workflow-C-r1.json) |
| event-routing-workflow | [pass](luna-xhigh-v2/main/005-event-routing-workflow-A-r0.json) / [pass](luna-xhigh-v2/main/005-event-routing-workflow-A-r1.json) | [pass](luna-xhigh-v2/main/005-event-routing-workflow-B-r0.json) / [fail](luna-xhigh-v2/main/005-event-routing-workflow-B-r1.json) | [pass](luna-xhigh-v2/main/005-event-routing-workflow-C-r0.json) / [pass](luna-xhigh-v2/main/005-event-routing-workflow-C-r1.json) |
| streaming-catalog-workflow | [pass](luna-xhigh-v2/main/023-streaming-catalog-workflow-A-r0.json) / [pass](luna-xhigh-v2/main/023-streaming-catalog-workflow-A-r1.json) | [pass](luna-xhigh-v2/main/023-streaming-catalog-workflow-B-r0.json) / [pass](luna-xhigh-v2/main/023-streaming-catalog-workflow-B-r1.json) | [pass](luna-xhigh-v2/main/023-streaming-catalog-workflow-C-r0.json) / [pass](luna-xhigh-v2/main/023-streaming-catalog-workflow-C-r1.json) |

## Failure analysis

| Run | Status | Acceptance | Regression | Failed contracts / error |
|---|---|---|---|
| [005-event-routing-workflow-B-r1](luna-xhigh-v2/main/005-event-routing-workflow-B-r1.json) | completed | failed | passed | tenant filtering applies equally to replay and live delivery |
| [029-tenant-event-feed-B-r0](luna-xhigh-v2/main/029-tenant-event-feed-B-r0.json) | completed | failed | passed | tenant filtering applies equally to replay and live delivery |
| [029-tenant-event-feed-C-r0](luna-xhigh-v2/main/029-tenant-event-feed-C-r0.json) | completed | failed | passed | tenant filtering applies equally to replay and live delivery |
| [043-numeric-xrange-A-r0](luna-xhigh-v2/main/043-numeric-xrange-A-r0.json) | budget_or_incomplete | passed | passed | Task stopped: timeout |

One concrete dependency miss: always-guided event-routing repetition 1 changed tenant-event validation but left the live-bus implementation untouched; held-out replay/live tenant filtering failed. Both baseline repetitions passed that task. This is an observed contract miss and patch difference, not proof that guidance caused the error. All other failures and successes remain in the tables above.

All guided correctness failures share the same tenant-filtering contract in standalone/compound variants. They are correlated misses, not independent evidence of three unrelated regressions. Public regressions still passed; the held-out requirement was missed.

1 run(s) produced fully accepted patches but did not finish normally: 043-numeric-xrange-A-r0. The baseline numeric-range run had 19 provider requests but only 18 final usage receipts when the 480-second deadline aborted the last stream. It is an accepted implementation, a completion timeout, and an incomplete-cost observation; neither failure nor usage is silently discarded.

## Static dependency coverage

| Repository/source family | Tasks | Resolved relative production module edges | Unresolved relative production references |
|---|---:|---:|---:|
| sufficelabs/suffice | 14 | 101 | 0 |
| npm/node-semver | 7 | 0 | 874 |
| nodeca/js-yaml | 3 | 383 | 0 |

This offline covariate was computed only after inference. It counts recognized relative production module syntax, not runtime coverage or correctness. CommonJS remains unresolved rather than acquiring invented edges. Supported static relationships therefore differ substantially by source family; overall acceptance cannot be read as a test of complete semantic analysis. [Per-task evidence](coverage.json).

## Limitations and decision

The primary metric is independently executed acceptance plus regressions, not model self-report. Nevertheless, tests cover only stated criteria. Reused public/synthetic tasks may be contaminated, upstream projects repeat, compound tasks share contracts, categories are subjective, and the 24 tasks are not a random sample. All prospectively labeled complex tasks are synthetic or compound, so this cannot establish efficacy on complex real-world issues. Calibration was non-saturated, but its three small contracts were not representative of the final suite. If baseline saturates here, the study has no headroom to answer whether guidance rescues otherwise-unsolved work. There is no OS isolation against malicious parent-directory reads. Both repetitions share provider infrastructure and uncontrolled cache warmth. Fast mode was not observed. Missing usage makes cost incomplete even though cap reservations stay conservative. Initial context and graph output add tokens and may distract; correctness does not follow from static reachability.

Recommendation: Do not adopt either controller as the default on the strength of this evaluation: neither improves aggregate paired acceptance over baseline. Retain graph tools as an opt-in repository-information aid; refine or discontinue proactive guidance unless a better independent experiment changes the cost/accuracy tradeoff. This does not prove that repository intelligence can never help.

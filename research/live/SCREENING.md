# Live GitHub issue screening

Captured 2026-10-15T04:41:10.915451+00:00. 36 issue threads screened, 61 directly linked PRs fetched; 14 detailed candidate rows. All issue records were open at capture, but open is not equivalent to unresolved.

No qualifying two-pilot or 3–5-task cohort was found under all current requirements. Do not silently lower the active-work, source-scope, or independent-verification gates. No reproductions were executed.

## Ranked reserves, not approved pilots

1. [async-mutex #90](https://github.com/DirtyHairy/async-mutex/issues/90) is the strongest meaningful stateful fallback. Current source independently confirms both O(capacity) scans. No observed linked/claimed implementation. src/ edits fit, but the repo has not pushed since July 2025 and Node24 strip-types cannot load its parameter properties/extensionless imports unmodified. Source-driven loading and a bounded correctness/performance oracle must be demonstrated before freeze. This is conditional, not ready.
2. [Vitest #11585](https://github.com/vitest-dev/vitest/issues/11585) is the strongest genuinely untreated integration reserve: linked package optimizer metadata, dependency graph, related/changed selection, and watch state. No observed fix in timeline or 19 current open PRs, and author explicitly has not tried a patch. The frozen engine excludes its packages/vitest/src layout and real CLI/subprocess verification. It cannot be made eligible by relocating source or substituting a toy graph test.

A defensible 3–5 task cohort cannot be recommended from this screen. These two reserves are conditional in different ways; all other detailed candidates are excluded. Arquero #329 is also untreated but stale and under-reproduced. No clean third candidate emerged.

## Detailed 14-candidate screen

| Issue | Decision | Reason |
|---|---|---|
| [DirtyHairy/async-mutex #90](https://github.com/DirtyHairy/async-mutex/issues/90) | conditional_pilot_1 | Hold for source-loading/reproduction and explicit acceptance of low repo activity; no ready pilot yet. |
| [vitest-dev/vitest #11585](https://github.com/vitest-dev/vitest/issues/11585) | conditional_pilot_2 | Best untouched integration reserve; not eligible under current frozen engine. Do not relocate package source. |
| [vitest-dev/vitest #11571](https://github.com/vitest-dev/vitest/issues/11571) | exclude_existing_local_fix | Already implemented locally and disputed contract; exclude. |
| [uwdata/arquero #329](https://github.com/uwdata/arquero/issues/329) | exclude_unverified_stale | Fails active repo and reproduction confidence gates; not a cohort slot. |
| [DirtyHairy/async-mutex #94](https://github.com/DirtyHairy/async-mutex/issues/94) | exclude_open_fix | Already being implemented: PR95. |
| [paulmillr/chokidar #1493](https://github.com/paulmillr/chokidar/issues/1493) | exclude_open_fix | Already being implemented: PR1494/1495. |
| [sindresorhus/p-queue #254](https://github.com/sindresorhus/p-queue/issues/254) | exclude_implemented_fork | Already implemented on fork; exclude regardless of no official PR. |
| [piscinajs/piscina #1029](https://github.com/piscinajs/piscina/issues/1029) | exclude_already_merged | Already fixed: PR1030 merged. Do not use as unresolved task. |
| [piscinajs/piscina #1143](https://github.com/piscinajs/piscina/issues/1143) | exclude_claimed_work_contract | Explicit existing contributor work and unresolved serialization policy; exclude. |
| [unjs/ofetch #632](https://github.com/unjs/ofetch/issues/632) | exclude_open_fix | Already being implemented: PR633/635. |
| [unjs/ofetch #620](https://github.com/unjs/ofetch/issues/620) | exclude_open_fix | Already being implemented: PR622/624/626. |
| [unjs/unstorage #819](https://github.com/unjs/unstorage/issues/819) | exclude_open_fix | Already implemented and submitted: PR820. |
| [fastify/fastify #7090](https://github.com/fastify/fastify/issues/7090) | exclude_open_fix | Already being implemented and contract discussion; exclude. |
| [nodejs/undici #5974](https://github.com/nodejs/undici/issues/5974) | exclude_open_fix | Already being implemented: three open fix PRs. |

Full per-candidate acceptance plans, complexity, dependency/OS risks, source-scope risks, head SHAs, and source provenance are in candidates.json / candidates.csv.

## Wider screening appendix

Every additional raw thread is retained. Reject rationale: linked implementation, claimed local implementation, no current repro/active maintainer evidence, unsupported/unclear requested behavior, or current adapter incompatibility. The exact raw body/comments/timeline are authoritative; absence of a link alone is never treated as proof of availability.

| Issue | Screening evidence |
|---|---|
| [date-fns/date-fns #4336](https://github.com/date-fns/date-fns/issues/4336) | Open linked work: 4337, 4352, 4363 |
| [date-fns/date-fns #4338](https://github.com/date-fns/date-fns/issues/4338) | Open linked work: 4339 |
| [date-fns/date-fns #4369](https://github.com/date-fns/date-fns/issues/4369) | Open linked work: 4372 |
| [DirtyHairy/async-mutex #88](https://github.com/DirtyHairy/async-mutex/issues/88) | The acquire in Promise.all obtains the lock and never releases it until waitForUnlock finishes; likely expected locking semantics, not established bug. |
| [eemeli/yaml #687](https://github.com/eemeli/yaml/issues/687) | Open linked work: 721 |
| [eemeli/yaml #692](https://github.com/eemeli/yaml/issues/692) | Open linked work: 708 |
| [eemeli/yaml #717](https://github.com/eemeli/yaml/issues/717) | Open linked work: 730 |
| [fastify/fastify #7043](https://github.com/fastify/fastify/issues/7043) | Open linked work: 7046, 7063 |
| [NaturalIntelligence/fast-xml-parser #689](https://github.com/NaturalIntelligence/fast-xml-parser/issues/689) | Maintainer says demo-only; reporter confirms library works. Not a src library bug. |
| [NaturalIntelligence/fast-xml-parser #708](https://github.com/NaturalIntelligence/fast-xml-parser/issues/708) | Comment reports missing #text fixed in commit31bbc99/v5.7.3; remaining option request has incompatible expectations. |
| [NaturalIntelligence/fast-xml-parser #888](https://github.com/NaturalIntelligence/fast-xml-parser/issues/888) | Maintainer says underlying strnum bug fixed/released; old v4-specific backport not validated. |
| [nodejs/undici #5504](https://github.com/nodejs/undici/issues/5504) | Open linked work: 5510 |
| [nodejs/undici #5505](https://github.com/nodejs/undici/issues/5505) | Open linked work: 5510, 5516, 5700 |
| [nodejs/undici #5704](https://github.com/nodejs/undici/issues/5704) | Open linked work: 5705, 5706 |
| [nodejs/undici #5711](https://github.com/nodejs/undici/issues/5711) | Open linked work: 5765 |
| [nodejs/undici #5981](https://github.com/nodejs/undici/issues/5981) | Open linked work: 863, 5982 |
| [nodejs/undici #6013](https://github.com/nodejs/undici/issues/6013) | Open linked work: 6014 |
| [sindresorhus/p-queue #177](https://github.com/sindresorhus/p-queue/issues/177) | Open linked work: 224, 233 |
| [h3js/h3 #1045](https://github.com/h3js/h3/issues/1045) | Open linked work: 1047 |
| [h3js/h3 #1584](https://github.com/h3js/h3/issues/1584) | Open linked work: 1585, 1591, 1598, 1599 |
| [unjs/ofetch #477](https://github.com/unjs/ofetch/issues/477) | Open linked work: 478, 553 |
| [unjs/ofetch #495](https://github.com/unjs/ofetch/issues/495) | Open linked work: 496, 549, 606 |

## Provenance and limitations

snapshots/<owner>__<repo>/<issue>/issue.json contains original issue body and status; comments.json contains complete paginated comment pages; timeline.json contains timeline pages. Repository metadata, default-branch head commit, root listing, package.json, and open-prs.json are alongside. linked-pr-status.json contains directly re-fetched PR state/merge status; individual raw PR payloads are under linked-pr-details. all-screened-live-status.json indexes every thread.

Undici open-pr listing reached its100 cap; all cited directly linked fixes were individually refreshed, so exclusions are sound but no absence-of-work claim should be inferred for that repo. Other observed open PR lists were below100. Repository timestamps can include bot activity. GitHub statuses can change after capture; refresh selection immediately before any future freeze. Read-only gh API work only. No public comments/PRs, implementation, harness edits, clones, dependency installs, or reproduction execution.

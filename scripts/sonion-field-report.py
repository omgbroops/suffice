"""Reproduce the main field campaign's descriptive analysis without model calls."""
import datetime, hashlib, json, pathlib, statistics

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/real-github-field-v1'
data=json.loads((ROOT/'reports/field-accounting/normalized.json').read_text())
rows=[x for x in data['attempts'] if x['scoringEligible'] and x['cohort']=='historical']
ids=['s01','s02','s03','i01','i02','i03','i04','q01','q02','q04']
assert len(rows)==20 and len({(r['task'],r['arm']) for r in rows})==20
assert set(data['pairedHistoricalTasks'])==set(ids)
sf=data['pairedHistorical']['suffice'];pi=data['pairedHistorical']['stock-pi']
assert sf['totalApiEquivalentUsd'] is not None
s,p=sf['knownApiEquivalentUsd'],pi['knownApiEquivalentUsd']
percent=lambda x:f'{100*x:.1f}%'
cash=lambda x:f'${x:.6f}'
invalid={a:sum(r['knownApiEquivalentUsd'] for r in data['attempts'] if r['arm']==a and r['operationalClassification']=='invalid-environment-dependency-container-link') for a in ['suffice','stock-pi']}
latency={a:{'meanSeconds':statistics.mean(r['workerExecution']['latencyMs']/1000 for r in rows if r['arm']==a),'medianSeconds':statistics.median(r['workerExecution']['latencyMs']/1000 for r in rows if r['arm']==a)} for a in ['suffice','stock-pi']}
complete=[r for r in rows if r['task'] in data['completeCostMatchedTasks']]
mutual=[r for r in complete if all(x['recordedAccepted'] for x in complete if x['task']==r['task'])]
subset=lambda rs:{a:sum(x['knownApiEquivalentUsd'] for x in rs if x['arm']==a) for a in ['suffice','stock-pi']}
eight,seven=subset(complete),subset(mutual)
summary={'asOf':data['asOf'],'model':'gpt-6.1-sol','effort':'low','historicalTasks':10,'repositories':len({r['repository'] for r in rows}),'primary':data['pairedHistorical'],'latency':latency,'validAttemptCostSavingLowerBound':1-s/p,'validCostPerAcceptedSavingLowerBound':1-(s/sf['accepted'])/(p/pi['accepted']),'inclusiveHistorical':{'sufficeKnownCost':s+invalid['suffice'],'stockPiKnownCostFloor':p+invalid['stock-pi'],'sufficeCostPerAccepted':(s+invalid['suffice'])/sf['accepted'],'stockPiCostPerAcceptedFloor':(p+invalid['stock-pi'])/pi['accepted'],'sufficeCostPerAcceptedSavingLowerBound':1-((s+invalid['suffice'])/sf['accepted'])/((p+invalid['stock-pi'])/pi['accepted'])},'completeCostMatchedEight':eight,'mutuallyAcceptedCompleteSeven':seven,'allAttemptSpend':data['allAttemptSpend'],'rawAcceptanceIsNotProofOfCompleteIssueFix':True,'accountingSnapshotSha256':hashlib.sha256((ROOT/'reports/field-accounting/normalized.json').read_bytes()).hexdigest()}
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'RESULTS.json').write_text(json.dumps(summary,indent=2)+'\n')
lines=[
'# Real GitHub field test: frozen Suffice versus native Pi',
'',
'The requested dataset is complete: **10 historical issues attempted by both agents, plus 3 open issues attempted by Suffice.** This is an external comparison using native Pi 1.2.0, not the earlier restricted direct-tool SDK baseline. All scored requests used GPT-6.1 Sol low.',
'',
f'On the frozen checks, Suffice accepted **10/10**, native Pi **9/10**. Suffice cost **{cash(s)}**; Pi\'s known lower bound is **{cash(p)}**, with two recovered provider responses missing full usage. Thus Suffice used at least **{percent(1-s/p)} less API-equivalent inference** across these valid environments, and at least **{percent(1-(s/10)/(p/9))} less per frozen-check accepted task**, including Pi\'s coding failure. These are descriptive results for this cohort, not a universal advantage or subscription cash savings.',
'',
'## Primary historical results',
'',
'| Metric | Suffice general-v1 | Native stock Pi 1.2.0 |',
'| --- | ---: | ---: |',
f'| Accepted on frozen native + private checks | {sf["accepted"]}/10 | {pi["accepted"]}/10 |',
f'| Accepted with fully verified budget accounting | {sf["budgetEligibleSuccesses"]} | {pi["budgetEligibleSuccesses"]}; 2 more accepted with unknown full costs |',
f'| Total API-equivalent inference | {cash(s)} | At least {cash(p)}; full total unknown |',
f'| Cost per frozen-check accepted task | {cash(s/10)} | At least {cash(p/9)} |',
f'| Recorded model replies, including failed replies | {sf["assistantReplies"]} | {pi["assistantReplies"]} |',
f'| Model-visible tool invocations | {sf["toolCalls"]-sf["primitiveCalls"]} codemode | {pi["toolCalls"]} native tools |',
f'| Primitive tool invocations | {sf["primitiveCalls"]} | {pi["primitiveCalls"]} |',
f'| Mean actor execution latency | {latency["suffice"]["meanSeconds"]:.1f} s | {latency["stock-pi"]["meanSeconds"]:.1f} s |',
f'| Median actor execution latency | {latency["suffice"]["medianSeconds"]:.1f} s | {latency["stock-pi"]["medianSeconds"]:.1f} s |',
'',
'Latency includes the agent\'s own commands and retries, excluding external setup/grading. Independent pairs and preparation overlapped on two remote CPU cores; timing is descriptive. Suffice wrapper plus primitive event counts total 174; native Pi has 153 primitive/model-visible calls. The two counting levels must not be confused.',
'',
'| Task | Original issue | Suffice | Pi | Suffice cost | Pi known cost |',
'| --- | --- | --- | --- | ---: | ---: |']
for task in ids:
 a=next(x for x in rows if x['task']==task and x['arm']=='suffice');b=next(x for x in rows if x['task']==task and x['arm']=='stock-pi')
 version=a['evaluatorVersion'];t=json.loads((ROOT/f'.suffice/field-campaign-{version}/frozen/{task}.json').read_text())['task']
 title=f'[{t["repository"]} #{t["issue"]}]({t["url"]})'
 lines.append(f'| {task} | {title} | {"Pass" if a["recordedAccepted"] else "Fail"} | {"Pass" if b["recordedAccepted"] else "Fail"} | {cash(a["knownApiEquivalentUsd"])} | {"≥ " if b["totalApiEquivalentUsd"] is None else ""}{cash(b["knownApiEquivalentUsd"])} |')
lines += ['',
'Suffice was cheaper on 6 tasks by the known-cost comparison and more expensive on i02, s03, q01 and q04. The two unknown Pi totals can only increase its known lower bounds. On the eight pairs with complete cost on both sides, Suffice cost '+cash(eight['suffice'])+' versus '+cash(eight['stock-pi'])+' (**'+percent(1-eight['suffice']/eight['stock-pi'])+' lower**). On the seven fully priced pairs that both agents passed, the corresponding totals are '+cash(seven['suffice'])+' versus '+cash(seven['stock-pi'])+' (**'+percent(1-seven['suffice']/seven['stock-pi'])+' lower**). These subsets are labeled by cost observability/success, not replacements for the full cohort.',
'',
'Pi failed q02 because its patch emitted the existing public `next` event when starting work. Original tests require that event on completion. It changed those test expectations locally; independent grading restored the originals. A separate replay reproduced the event failure. This is observed contract reinterpretation despite available source/tests, not evidence that relevant code was never retrieved.',
'',
'## Cost accounting, operational failures and fairness',
'',
'| Cost component, known receipts | Suffice historical | Pi historical, lower bounds |',
'| --- | ---: | ---: |']
for k in ['input','cacheRead','cacheWrite','output']:
 lines.append(f'| {k} | {cash(sf["costComponents"][k])} | {cash(pi["costComponents"][k])} |')
lines += ['',
'Input is fresh input; cached input is listed separately. Raw provider usage is deduplicated and reconciled against finalized assistant events. Two Pi replies were terminated and retried successfully (s01 and i04); their missing usage is **unknown, never zero**. Correctness acceptance is kept separate from budget certification. All observed amounts are API-equivalent estimates from recorded pricing, not subscription charges. Engineering-agent inference, power and infrastructure are not included.',
'',
f'The first six integration attempts had an evaluator dependency-container binding error affecting both actors and graders. They remain operationally invalid for comparison, with **{cash(sum(invalid.values()))}** retained. All six patches pass corrected diagnostic replay, but that does not retrospectively validate their environments or prices. Both arms were rerun in corrected environments. Including those invalid attempts, historical Suffice spend is **{cash(s+invalid["suffice"])}** versus Pi **at least {cash(p+invalid["stock-pi"])}**. Inclusive cost per accepted task is {cash((s+invalid["suffice"])/10)} versus at least {cash((p+invalid["stock-pi"])/9)}, or at least {percent(summary["inclusiveHistorical"]["sufficeCostPerAcceptedSavingLowerBound"])} lower for Suffice.',
'',
f'All main issue attempts, including the 3 initial live attempts and the 6 invalid attempts, have **{cash(data["allAttemptSpend"]["knownApiEquivalentUsd"])} known inference** and an unknown full total. A separate readiness check cost $0.0095108. One s01 checkout stopped before inference; it cost no observed inference and is preserved. Repair and Luna follow-ups have separate ledgers.',
'',
'Both arms received identical issue text/user policy, source bytes, dependency closures, Node 24.15.0, per-task $10 ceilings, 60-response/240-observed-call/600-second limits and workspace/OS resource restrictions. First arm was balanced 5/5. Private tests/fixes were outside actor mounts; original tests were restored for grading. Suffice kept its minimal prompt, codemode, navigation and append-only history; Pi kept its native prompt/read/bash/edit/write interface and default retries/cache/compaction. System prompts/tool formats and retry behavior intentionally differ as part of the harness comparison. Some native CI dependencies are omitted or read-only, and Node is newer than several original issues. Those constraints are recorded, not represented as full upstream CI.',
'',
'The 14 frozen general-v1 inputs and earlier benchmark artifacts are unchanged. Corrections are separately versioned evaluator/host scripts: dependency path normalization, exact physical source copying, root-test restoration and matching network-disabled grading controls. q04\'s redundant reference-patch metadata required a documented source-only reference-control bridge, before its first actor request. Original v1 records are not overwritten.',
'',
'## Independent review and open-issue work',
'',
'The 3 live patches passed the original frozen graders. Independent review supports the scoped Workerpool #596 and p-wait-for #37 fixes. It found a new p-debounce #35 cancellation regression: cleanup for an older leading call removed the listener serving a newer debounce window. The first patch is therefore **not called a completed fix**. One separate Suffice repair passed 77 original tests, types, all 3 unchanged private checks and the independently authored cancellation regression; first plus repair inference totals $0.1036236. Original scores/patches stay intact. All changes remain local for human review; nothing was submitted upstream.',
'',
'Workerpool\'s full high-worker-count suite exceeds the unchanged address-space limit. Selected original suites, build/types and a real one-worker integration are validated; full CI/browser/Promises-A+ conformance is not claimed. See `research/field-campaign-v1/audits/live-patch-review.md` and `live-repair-review.md` for reviewed scope and patch paths.',
'',
'Historical post-hoc reviews are supplementary, not silent changes to frozen grades. Their report is `research/field-campaign-v1/audits/historical-patch-review.md`. The full q02 Suffice replay had a timing-test failure; unchanged baseline also failed that timing test in fixed matched diagnostics. Preserve both observations. Its original frozen native/private grade passed; a source regression was not established. Details: `reports/field-adjudication-v1/assessment.md`.',
'',
'That historical review confirmed two additional regressions in Pi patches that passed primary checks: s01 permits userland reserved meta-event emission while an internal metadata promise is pending; i04 can loop indefinitely if a worker synchronously pauses during resume/concurrency expansion. Matched baseline/Suffice controls do not show these failures. The upstream i04 reference also hangs on that edge, demonstrating that a reference-positive control is insufficient to prove full API correctness. These findings remain post-hoc audits, not a silently revised 10-versus-9 primary score. The reviewer found no concrete corresponding regression in the submitted Suffice historical patches within its bounded scope.',
'',
'The i03 array-like compatibility assertion was separately challenged against the narrower Iterable type. A fresh GitHub API body comparison confirmed the original issue explicitly names array-like preservation and verification controls. It is defensible for this issue, while the general API documentation has a domain tension. The separate Luna diagnostic omitting only that assertion is sensitivity evidence, not a changed primary grader. See `audits/i03-arraylike-contract-clarification.md`.',
'',
'## What this establishes, and what it does not',
'',
'The earlier efficiency signal survives this larger real-issue cohort: lower recorded inference, fewer model rounds and one primary correctness distinction against native Pi. The architecture is unchanged; the experiment does not isolate whether minimal instructions, codemode, navigation or sampling caused each difference.',
'',
'These are 10 issues from 6 repositories, with 3 Nano Stores, 2 p-queue and 2 node-fetch issues. They exercise async lifecycles, state transitions, module boundaries and compatibility, but most production fixes remain localized and median execution is about a minute. They are not multi-hour, large-monorepo engineering. One attempt per agent/issue, correlated repository samples, public solution hints, possible model training exposure, incomplete Pi retry usage and limited CI coverage prevent a general superiority claim. No Astra, Codex or Prime head-to-head was run.',
'',
'Eleven historical packages were prepared; q03 was held before actor exposure following independent contract review because its hidden test demanded cancellation beyond the original cooperative-running contract. Its later cache setup repair does not resolve that contract problem. q04 replaced it before scoring. No issue was dropped because an actor failed or cost more.',
'',
'The separate exposed-history Luna model-only calibration is under `reports/luna-baseline-v2/`; it is not a fresh confirmatory holdout or an Astra comparison. New mechanisms are not enabled in the baseline.',
'',
'**Smallest justified decision:** retain the frozen lean baseline, keep independent grading/review, and quantify the cheap-model reliability gap before changing the harness. Treat the observed advantage as evidence for this cohort. Do not turn post-hoc development probes or a passing private grader into a claim that an issue is fully fixed.',
'',
'Machine-readable results: `RESULTS.json`; independent accounting: `reports/field-accounting/normalized.json`; every original attempt, failed response, patch, control, exclusion and review receipt is preserved in the review bundle.',
]
(OUT/'RESULTS.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'report':str(OUT/'RESULTS.md'),'historicalTasks':10,'costSavingLowerBound':summary['validAttemptCostSavingLowerBound'],'costPerAcceptedSavingLowerBound':summary['validCostPerAcceptedSavingLowerBound']}))

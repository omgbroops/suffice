"""Read-only receipt audit and model calibration report; never calls a model."""
import datetime as dt,hashlib,importlib.util,json,pathlib
from decimal import Decimal
ROOT=pathlib.Path(__file__).resolve().parents[2]
HERE=pathlib.Path(__file__).resolve().parent
DIR=ROOT/'.suffice/luna-baseline-v2';OUT=ROOT/'reports/luna-baseline-v2';OUT.mkdir(parents=True,exist_ok=True)
corepath=ROOT/'scripts/sonion-field-accounting.py'
coresha=hashlib.sha256(corepath.read_bytes()).hexdigest()
spec=importlib.util.spec_from_file_location('existing_receipt_audit',corepath);core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
core.EXPECTED_MODEL='gpt-6-luna'
audit=core.Audit(ROOT)
load=lambda p:json.loads(p.read_text())
plan=load(HERE/'cohort-v2-manifest.json');catalog=load(HERE/'model-catalog.json');state=load(DIR/'driver-state.json')
mainpath=ROOT/'reports/field-accounting/normalized.json';main=load(mainpath)
sol={x['task']:x for x in main['attempts'] if x['arm']=='suffice' and x.get('cohort')=='historical' and x.get('scoringEligible')}
rows=[]
for task in plan['serialOrder']:
 run=DIR/'attempts'/(task+'-suffice');result=audit.json(run/'result.json')
 if result is None:continue
 events,parseerrors=audit.events(run/'worker/events.live.jsonl');accounting=core.response_audit(events,'suffice')
 worker=audit.json(run/'worker/worker.json') or {};grade=audit.json(run/'grade.json') or {};preflight=audit.json(DIR/'preflight'/task/'validated.json') or {}
 complete=accounting['costComplete'] and not worker.get('usageCostUnknown') and not parseerrors
 known=accounting['knownApiEquivalentUsd'];total=known if complete else None
 storedmatch=abs(known-Decimal(str(result['knownEstimatedUsd'])))<Decimal('0.000000001')
 priceok=accounting['startup']['model'].get('cost')==catalog['model']['cost']
 controlok=preflight.get('actorNativeValid') and preflight.get('baseline',{}).get('accepted') is False and preflight.get('reference',{}).get('accepted') is True
 frozen=audit.json(DIR/'frozen'/(task+'.json'));reference=sol.get(task);matching=None
 if reference:
  mf=audit.json(ROOT/'.suffice'/('field-campaign-'+reference['evaluatorVersion'])/'frozen'/(task+'.json'))
  contracts=lambda m:{p:h for p,h in m['inputs'].items() if p!=m['taskFile']}
  matching={'sourceBytes':frozen['baseHashes']==mf['baseHashes'],'publicPrompt':frozen['promptHash']==mf['promptHash'],'privateReferenceAndGraderInputs':contracts(frozen)==contracts(mf)}
 rows.append({'task':task,'subset':'primary' if task in plan['primary'] else 'secondary','result':result,'accounting':accounting,'knownApiEquivalentUsd':known,'totalApiEquivalentUsd':total,'costComplete':complete,'storedCostMatchesIndependentLedger':storedmatch,'catalogPricingMatches':priceok,'eventParseErrors':parseerrors,'controlsValid':bool(controlok),'preflightExtensionSha256':preflight.get('extensionSha256'),'sourcePromptContractMatch':matching,'solReference':None if not reference else {k:reference.get(k) for k in ['key','recordedAccepted','budgetEligibleSuccess','knownApiEquivalentUsd','totalApiEquivalentUsd']},'gradeSetupIndicators':audit.grade_indicators(run,grade)})
def summary(selected):
 known=sum((r['knownApiEquivalentUsd'] for r in selected),Decimal(0));unknown=sum(not r['costComplete'] for r in selected);accepted=sum(r['result']['accepted'] for r in selected)
 return {'attempts':len(selected),'accepted':accepted,'budgetEligibleAccepted':sum(r['result']['success'] for r in selected),'knownApiEquivalentUsd':known,'totalApiEquivalentUsd':None if unknown else known,'unknownCostAttempts':unknown,'allAttemptCostPerAccepted':None if unknown or not accepted else known/accepted,'codingFailures':sum(r['result']['codingFailure'] for r in selected),'operationalFailures':sum(r['result']['operationalFailure'] for r in selected),'latencyMs':sum(r['result']['latencyMs'] for r in selected),'requests':sum(r['accounting']['recordedRequestIntents'] for r in selected),'assistantReplies':sum(r['accounting']['assistantReplies'] for r in selected),'rawResponses':sum(r['accounting']['uniqueRawResponses'] for r in selected)}
summaries={name:summary([r for r in rows if name=='all' or r['subset']==name]) for name in ['primary','secondary','all']}
matched=[r for r in rows if r['sourcePromptContractMatch'] and all(r['sourcePromptContractMatch'].values())]
solcost=sum(Decimal(str(r['solReference']['knownApiEquivalentUsd'])) for r in matched)
dataset={'version':'luna-baseline-v2','asOf':dt.datetime.now(dt.timezone.utc).isoformat(),'complete':len(rows)==10 and state['active'] is None and not state['majorBlocker'],'declaration':plan,'driver':state,'summary':summaries,'rows':rows,'solMatchedReference':{'tasks':len(matched),'accepted':sum(r['solReference']['recordedAccepted'] for r in matched),'knownApiEquivalentUsd':solcost,'totalApiEquivalentUsd':None if any(r['solReference']['totalApiEquivalentUsd'] is None for r in matched) else solcost},'billing':'API-equivalent inference estimates under subscription access, not invoice charges or measured energy; all attempts included, unknown costs remain unknown.','accountingCoreSha256':coresha,'reportSourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'mainNormalizedSha256':hashlib.sha256(mainpath.read_bytes()).hexdigest(),'auditedInputs':audit.inputs,'limitation':'Exposed historical calibration with one attempt/model/task and unrandomized later Luna execution; no fresh holdout, Astra measurement, or causal harness improvement claim.'}
if hashlib.sha256(corepath.read_bytes()).hexdigest()!=coresha:raise RuntimeError('Accounting source changed during audit')
liveStart=load(ROOT/'.suffice/field-live-repair-v1/launch.json')['at'];liveEnd=load(ROOT/'.suffice/field-live-repair-v1/result.json')['at']
stamp=lambda s:dt.datetime.fromisoformat(s.replace('Z','+00:00'))
for row in rows:
 events,_=audit.events(DIR/'attempts'/(row['task']+'-suffice')/'worker/events.live.jsonl')
 windows=[e for e in events if e.get('type') in ['provider_request','assistant']]
 row['overlapWithSeparateLiveRepairSeconds']=max(0,(min(stamp(windows[-1]['at']),stamp(liveEnd))-max(stamp(windows[0]['at']),stamp(liveStart))).total_seconds()) if windows else 0
 row['deterministicControlCommandWallMs']=sum(load(p).get('latencyMs',0) for p in (DIR/'preflight'/row['task']).glob('**/execution-result.json'))
sourceManifest=load(HERE/'source-manifest.json');runtimeDrift=[];originalDrift=[]
for p,e in sourceManifest['inputs'].items():
 if hashlib.sha256((pathlib.Path('/home/eric_qin/suffice-luna-runtime-v1/app')/p).read_bytes()).hexdigest()!=e['variantSha256']:runtimeDrift.append(p)
 if hashlib.sha256((ROOT/p).read_bytes()).hexdigest()!=e['originalSha256']:originalDrift.append(p)
dataset['sourceIntegrity']={'variantRuntimeMismatches':runtimeDrift,'originalFrozenMismatches':originalDrift,'inputsEach':14}
dataset['contention']={'otherWork':'separate Sol-low live l03 repair continuation','start':liveStart,'end':liveEnd,'overlappingLunaActors':[{'task':r['task'],'seconds':r['overlapWithSeparateLiveRepairSeconds']} for r in rows if r['overlapWithSeparateLiveRepairSeconds']>0]}
dataset['deterministicControlCommandWallMs']=sum(r['deterministicControlCommandWallMs'] for r in rows)
default=lambda x:float(x) if isinstance(x,Decimal) else x
(OUT/'normalized.json').write_text(json.dumps(dataset,indent=2,default=default)+'\n')
money=lambda x:'unknown' if x is None else '$'+format(float(x),'.6f')
allsummary=summaries['all'];reference=dataset['solMatchedReference']
lines=['# Luna model-only historical calibration','',f"Snapshot: {dataset['asOf']}. Completed: {dataset['complete']}.",'',f"Luna independently accepted {allsummary['accepted']}/{allsummary['attempts']} attempts; {allsummary['budgetEligibleAccepted']} were accepted within all recorded allowances. Total inference estimate: {money(allsummary['totalApiEquivalentUsd'])}; unknown-cost attempts: {allsummary['unknownCostAttempts']}.",'',f"On {reference['tasks']} matching source/prompt/private-contract cases, the existing Sol reference accepted {reference['accepted']}; total estimate {money(reference['totalApiEquivalentUsd'])}. Luna was run later using the same Suffice architecture, with only the selected model changed. There were no new Sol or Astra benchmark calls.",'',dataset['billing'],'',dataset['limitation'],'','| Subset | Attempts | Accepted | Budget eligible accepted | Complete cost | All-attempt cost / accepted |','|---|---:|---:|---:|---:|---:|']
for name,s in summaries.items():
 perAccepted='n/a (no accepted task)' if s['accepted']==0 else money(s['allAttemptCostPerAccepted'])
 lines.append(f"| {name} | {s['attempts']} | {s['accepted']} | {s['budgetEligibleAccepted']} | {money(s['totalApiEquivalentUsd'])} | {perAccepted} |")
lines+=['','| Task | Subset | Luna status | Accepted | Sol accepted | Replies | Luna cost | Sol cost | Source/prompt/contracts match |','|---|---|---|---:|---:|---:|---:|---:|---:|']
for r in rows:
 rr=r['result'];sr=r['solReference'] or {};match=r['sourcePromptContractMatch'];lines.append(f"| {r['task']} | {r['subset']} | {rr['status']} | {rr['accepted']} | {sr.get('recordedAccepted')} | {rr['turns']} | {money(r['totalApiEquivalentUsd'])} | {money(sr.get('totalApiEquivalentUsd'))} | {bool(match and all(match.values()))} |")
lines+=['','The original four cases remain primary; all ten were declared before any Luna actor request. The six additions are reported separately. All model-free original-native/original-fails/reference-passes controls must be valid; q04 uses the separately hashed source-only reference completion bridge after the frozen evaluator rejected redundant referencePatch metadata. No grading contract or actor patch was changed to make a result pass.','',f"Receipt checks: {sum(r['accounting']['receiptVerificationComplete'] for r in rows)}/{len(rows)} complete request/reply/raw-usage reconciliations; {sum(r['accounting']['perResponseIdentityVerified'] for r in rows)}/{len(rows)} exact Luna-low identity/tool checks; {sum(r['storedCostMatchesIndependentLedger'] and r['catalogPricingMatches'] for r in rows)}/{len(rows)} independently recomputed startup-price checks. Missing raw model identity, where the observer does not emit it, remains separate from verified request/finalized-reply identity.",'','Actor-created test edits are archived but excluded from independent acceptance. Frozen acceptance is evidence for its tested contracts, not proof of every behavior. Native timing sensitivity, especially q02, needs the baseline controls and main adjudication notes; no outcome is silently replaced after a post-hoc replay.','',state['contention'],'','No model or harness optimization is selected by this report. Any development use of failed tasks must remain distinct from a new, independently contracted confirmatory cohort. Cost savings accompanied by lost acceptance do not establish an accuracy-preserving gain.']
lines+=['',f"Request totals: {allsummary['requests']} provider-request intents, {allsummary['assistantReplies']} finalized replies, {allsummary['rawResponses']} deduplicated raw usage responses. All used exact GPT-6 Luna low. No provider-response errors, missing totals, or coding-attempt replacements are hidden by the aggregate.",'','The copied evaluator lacked its referencePatch-only setup branch for q01/q02. Their first preflights stopped before actor inference. A separately hashed bridge applied the frozen patches only to validated existing production paths in fresh physical workspaces, rejected traversal/test/metadata/symlink targets, normalized dependencies and passed unchanged native/private checks. The old blocked state and logs remain preserved. Only then were their first actor attempts launched; no failed coding attempt was retried.','',f"Separate Sol-low live l03 repair ran {liveStart}–{liveEnd}; overlap with Luna actor windows: {dataset['contention']['overlappingLunaActors']}. Final hashes show {len(runtimeDrift)} variant-runtime mismatches and {len(originalDrift)} original-frozen mismatches across 14 inputs each. Model-free control command wall time totals {dataset['deterministicControlCommandWallMs']/1000:.1f} seconds, separately from actor execution; this is not an aggregate CPU or energy measurement.",'','The i03 general type declaration says Iterable, while its README equivalence uses Array.from. Root separately verified that original issue #110 explicitly requires preserving array-like runtime support and immediate iterator-error rejection, resolving the issue-specific grading scope. The primary array-like failure remains recorded. A separate post-hoc diagnostic omitting only that assertion found the Luna patch repaired the earlier scheduled-rejection examples but failed the later immediate iterator-settlement check; the reference passed. Primary grades were never rewritten.','','Both queue patches pass all issue-specific private assertions but fail preservation obligations. Q01 additionally leaves an unread private field (TS6133), a deterministic compile failure. Q02 emits `next` on dequeue and fails the original synchronous completion-event count assertion (1 instead of 0) at test/advanced.ts:176; this is a concrete regression, not the separate baseline-reproduced timing flake documented for a main-campaign replay. See FAILURE-TAXONOMY.md for actual trace lines and grader artifacts.']
(OUT/'RESULTS.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'complete':dataset['complete'],'summary':summaries,'solReference':reference},default=default))

"""Read-only accounting/outcome audit. No model judging and no feedback to actors."""
import collections,hashlib,json,math,pathlib,statistics,datetime
ROOT=pathlib.Path(__file__).resolve().parents[1];DIR=ROOT/'.suffice/luna-fresh-v1';OUT=ROOT/'reports/luna-fresh-v1';OUT.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def confusion(rows):
 return {'truePositive':sum(r['signal'] and not r['accepted'] for r in rows),'falsePositive':sum(r['signal'] and r['accepted'] for r in rows),'falseNegative':sum(not r['signal'] and not r['accepted'] for r in rows),'trueNegative':sum(not r['signal'] and r['accepted'] for r in rows)}
rows=[];audits=[]
for p in sorted((DIR/'attempts').glob('*/result.json')):
 d=json.loads(p.read_text());events=[json.loads(x) for x in (p.parent/'worker/events.live.jsonl').read_text().splitlines() if x];a=[e for e in events if e['type']=='assistant'];raw={e['responseId']:e for e in events if e['type']=='provider_usage'};req=[e for e in events if e['type']=='provider_request'];costs={k:sum(m.get('usage',{}).get('cost',{}).get(k,0) for m in a) for k in ['input','cacheRead','cacheWrite','output','total']}
 known=sum(m.get('usage',{}).get('cost',{}).get('total',0) for m in a);rawInput=sum(e['usage'].get('input_tokens',0) for e in raw.values());rawOutput=sum(e['usage'].get('output_tokens',0) for e in raw.values());rawCached=sum(e['usage'].get('input_tokens_details',{}).get('cached_tokens',0) for e in raw.values())
 audit={'id':d['id'],'requests':len(req),'replies':len(a),'rawResponses':len(raw),'requestModelEffort':sorted({(e.get('model'),e.get('reasoning',{}).get('effort')) for e in req}),'reasoningOutputTokens':sum(e['usage'].get('output_tokens_details',{}).get('reasoning_tokens',0) for e in raw.values()),'matched':len(a)==len(req)==len(raw) and rawInput==d['usage']['input']+d['usage']['cacheRead']+d['usage']['cacheWrite'] and rawOutput==d['usage']['output'] and rawCached==d['usage']['cacheRead'] and abs(known-d['knownEstimatedUsd'])<1e-10,'costs':costs};audits.append(audit)
 patch=json.loads((p.parent/'patch.json').read_text());production=[x['path'] for x in patch if not x['protectedTest']]
 signal=not d['grade']['originalNativeValid'] or d['status']!='completed' or not production
 gates=[e for e in events if e['type']=='preservation_gate'];repair=[e for e in events if e['type']=='preservation_repair'];nativeSeconds=sum(v.get('latencyMs',0) for v in d['grade']['native'])/1000
 rows.append({**d,'publicSignal':signal,'productionPatchPaths':production,'preservationRepairs':len(repair),'gates':[{k:e.get(k) for k in ['phase','passed','protectedOriginalFilesRestored']} for e in gates],'publicSignalCommandSeconds':nativeSeconds,'bucketCosts':costs})
partial=[]
for folder in sorted((DIR/'attempts').glob('*')):
 if not folder.is_dir() or (folder/'result.json').exists():continue
 eventFile=folder/'worker/events.live.jsonl';events=[]
 if eventFile.exists():
  for line in eventFile.read_text().splitlines():
   try:events.append(json.loads(line))
   except json.JSONDecodeError:pass
 replies=[e for e in events if e['type']=='assistant'];requests=[e for e in events if e['type']=='provider_request']
 partial.append({'id':folder.name,'knownApiEquivalentUsd':sum(e.get('usage',{}).get('cost',{}).get('total',0) for e in replies),'requests':len(requests),'replies':len(replies),'fullCostUnknown':len(requests)!=len(replies) or any(e.get('stopReason') in ['error','aborted'] for e in replies),'status':'incomplete or still running; preserved and not scored as success'})
summary={}
for arm in ['A','B']:
 rr=[r for r in rows if r['arm']==arm];accepted=sum(r['success'] for r in rr);cost=sum(r['knownEstimatedUsd'] for r in rr)
 summary[arm]={'attempts':len(rr),'accepted':sum(r['accepted'] for r in rr),'budgetEligibleSuccesses':accepted,'knownApiEquivalentUsd':cost,'unknownFullCosts':sum(r['totalEstimatedUsd'] is None for r in rr),'costPerBudgetEligibleSuccessUsd':cost/accepted if accepted else None,'turns':sum(r['turns'] for r in rr),'toolCalls':sum(r['calls'] for r in rr),'meanActorSeconds':statistics.mean(r['latencyMs']/1000 for r in rr) if rr else None,'medianActorSeconds':statistics.median(r['latencyMs']/1000 for r in rr) if rr else None,'publicRegressionFailures':sum(not r['grade']['originalNativeValid'] for r in rr),'repairActivations':sum(r['preservationRepairs'] for r in rr),'firstSubmissionAccepted':sum(bool(r.get('firstSubmissionGrade',{}).get('accepted')) for r in rr if r.get('firstSubmissionGrade')),'costs':{k:sum(r['bucketCosts'][k] for r in rr) for k in ['input','cacheRead','cacheWrite','output','total']},'tokens':{k:sum(r['usage'][k] for r in rr) for k in ['input','cacheRead','cacheWrite','output']}}
freshSignals=[{'task':r['task'],'signal':r['publicSignal'],'accepted':r['accepted'],'budgetEligible':r['budgetEligible'],'cost':r['totalEstimatedUsd'],'publicCheckSeconds':r['publicSignalCommandSeconds']} for r in rows if r['arm']=='A']
old=[]
for p in sorted((ROOT/'.suffice/luna-safeguards-v1/attempts').glob('*-C/result.json')):
 d=json.loads(p.read_text());old.append({'task':d['task'],'signal':not d['grade']['originalNativeValid'] or d['status']!='completed' or not d['patchPaths'],'accepted':d['accepted']})
signal={'frozenRule':'Original PUBLIC regression failure OR worker not completed OR no production patch. No hidden diagnostics or inference classifier.','fresh':{'rows':freshSignals,'confusion':confusion(freshSignals)},'developmentOnlyPriorXhigh':{'rows':old,'confusionAgainstFrozenGrader':confusion(old),'limitation':'Old s01 frozen pass has known posthoc regression, so primary labels overstate signal coverage. Not held out.'},'deployment':'Not enabled; evaluate misses/false positives before any routing claim.'}
integrity={'allUsageMatched':all(a['matched'] for a in audits),'responses':sum(a['replies'] for a in audits),'frozenSourceInputsMatched':True,'taskAndDependencyFreezeMatched':True}
manifest=json.loads((DIR/'manifest.json').read_text())
for path,h in manifest['inputs'].items():
 if sha(pathlib.Path(path))!=h:integrity['frozenSourceInputsMatched']=False
freeze=json.loads((DIR/'launch-freeze.json').read_text())
for ident,rec in freeze['tasks'].items():
 tpath=DIR/'tasks'/ident/'task.json';task=json.loads(tpath.read_text());dep=pathlib.Path(task['dependencyDir']).parent
 if any(sha(p)!=h for p,h in [(tpath,rec['taskSha256']),(DIR/'preflight'/ident/'validated.json',rec['controlsSha256']),(dep/'package.json',rec['dependencyPackageSha256']),(dep/'package-lock.json',rec['dependencyLockSha256'])]):integrity['taskAndDependencyFreezeMatched']=False
knownTotal=sum(r['knownEstimatedUsd'] for r in rows)+sum(r['knownApiEquivalentUsd'] for r in partial)
contractAuditPath=OUT/'drain-contract-audit.json';contractAudit=json.loads(contractAuditPath.read_text()) if contractAuditPath.exists() else None
validated={}
if contractAudit:
 signal['fresh']['confusionAgainstFrozenGrader']=signal['fresh'].pop('confusion')
 signal['fresh']['validatedContractOnlyConfusion']=confusion([r for r in freshSignals if r['task']!='f06'])
 signal['fresh']['limitation']='The sole frozen-grader negative is disputed f06. Zero confirmed failures on the five contract-valid cases; sensitivity to real failures is unmeasured, not 100%.'
 for arm in ['A','B']:
  rr=[r for r in rows if r['arm']==arm and r['task']!='f06'];accepted=sum(r['success'] for r in rr);cost=sum(r['knownEstimatedUsd'] for r in rr)
  validated[arm]={'tasks':len(rr),'accepted':accepted,'knownApiEquivalentUsd':cost,'costPerAcceptedUsd':cost/accepted if accepted else None,'disputedTaskCostRetainedSeparatelyUsd':sum(r['knownEstimatedUsd'] for r in rows if r['arm']==arm and r['task']=='f06')}
timingPath=OUT/'timing-instability.json';timingAudit=json.loads(timingPath.read_text()) if timingPath.exists() else None
stable={}
if timingAudit:
 for arm in ['A','B']:
  rr=[r for r in rows if r['arm']==arm and r['task'] not in ['f01','f06']];accepted=sum(r['success'] for r in rr);cost=sum(r['knownEstimatedUsd'] for r in rr)
  stable[arm]={'tasks':len(rr),'accepted':accepted,'knownApiEquivalentUsd':cost,'costPerAcceptedUsd':cost/accepted if accepted else None,'evaluationAffectedTaskCostsStillInTotalUsd':sum(r['knownEstimatedUsd'] for r in rows if r['arm']==arm and r['task'] in ['f01','f06'])}
 signal['treatmentOnlyDiagnostic']={'notHeldOutSignalValidation':True,'case':'f01-B','publicFailureTriggeredContinuation':True,'libraryBytesUnchanged':timingAudit['identicalLibraryBytes'],'classification':'Sub-millisecond timing assertion instability, not demonstrated coding regression. A one-shot public failure is not reliably a coding failure.'}
activationPath=OUT/'gate-activation-audit.json';activation=json.loads(activationPath.read_text()) if activationPath.exists() else None
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'summaries':summary,'contractValidity':{'disputedTasks':['f06'] if contractAudit else [],'timingUnstableTasks':['f01'] if timingAudit else [],'primaryGraderChanged':False,'reason':'f06 requires an unsupported Promise.all observation boundary; f01 has sub-millisecond timing instability on identical library bytes. Raw scores retained; no adjusted 6/6 score claimed.','fiveTaskContractSensitivityStillContainsTimingNoise':validated,'stableFourTaskSensitivity':stable,'independentActorReview':'Parent operator reviewed upstream-authored contracts, not a second human/model reviewer.'},'gateActivation':activation,'rows':rows,'incompleteAttempts':partial,'knownCampaignApiEquivalentUsd':knownTotal,'signal':signal,'integrity':integrity,'audits':audits,'complete':len(rows)==12 and not partial}
(OUT/'FINAL-RESULTS.json').write_text(json.dumps(result,indent=2)+'\n');(OUT/'handoff-signal.json').write_text(json.dumps(signal,indent=2)+'\n')
lines=['# Fresh Luna Extra High: baseline and single public regression gate','',f"Completed {len(rows)}/12 attempts; {len(partial)} incomplete/still running. Known completed plus partial benchmark inference: ${knownTotal:.8f} API-equivalent; engineering inference and subscription cash spending excluded. Incomplete attempts are retained in the JSON ledger; summary rows below concern finalized attempts only.",'','| Arm | Accepted | Eligible successes | Cost | Cost / success | Turns | Mean actor seconds | Repair activations |','|---|---:|---:|---:|---:|---:|---:|---:|']
if contractAudit:
 lines[2:2]=['**Grading limitation:** f06/fastq88 has a disputed extra scheduling constraint. The A patch reproduces the original issue’s expected printed order in 10/10 checks but fails an added Promise.all observation boundary. Keep the frozen raw scores below; do not credit the A/B score difference on f06 to the safeguard or call it a confirmed Luna coding failure. See drain-contract-audit.json.','']
if timingAudit:
 lines[2:2]=['**Timing instability:** f01/B has identical library bytes before/after repair and identical bytes to A. Those bytes independently passed once and failed later because a 300 ms lower-bound test measured 299.99/299.90 ms. The gate also triggered on 299.92 ms, costing $0.00274778 for four extra model replies without a code change. This is not a demonstrated behavioral rescue or a confirmed coding failure. See timing-instability.json and gate-activation-audit.json.','']
for arm,s in summary.items():
 cpa=f"${s['costPerBudgetEligibleSuccessUsd']:.6f}" if s['costPerBudgetEligibleSuccessUsd'] is not None else 'n/a';sec=f"{s['meanActorSeconds']:.1f}" if s['meanActorSeconds'] is not None else 'n/a'
 lines.append(f"| {arm} {'plain xhigh' if arm=='A' else 'xhigh + public gate'} | {s['accepted']}/{s['attempts']} | {s['budgetEligibleSuccesses']} | ${s['knownApiEquivalentUsd']:.6f} | {cpa} | {s['turns']} | {sec} | {s['repairActivations']} |")
lines+=['','| Issue | A | B | A cost | B cost |','|---|---|---|---:|---:|']
for ident in ['f01','f02','f03','f04','f05','f06']:
 task=json.loads((DIR/'tasks'/ident/'task.json').read_text());pair={r['arm']:r for r in rows if r['task']==ident};ver=lambda arm:('pass' if pair[arm]['success'] else 'fail') if arm in pair else 'pending';cost=lambda arm:f"${pair[arm]['knownEstimatedUsd']:.6f}" if arm in pair else 'pending'
 lines.append(f"| [{task['repository']}#{task['issue']}]({task['url']}) | {ver('A')} | {ver('B')} | {cost('A')} | {cost('B')} |")
if validated:
 lines+=['','The following sensitivity excludes the **same disputed task from both arms**, retaining its costs explicitly in the full campaign total above. This is five tasks from three repositories, including three p-map snapshots, and is not a replacement adjusted six-task score.','', '| Validated contract cohort | Accepted | Inference cost | Cost / accepted | Disputed task cost (still incurred) |','|---|---:|---:|---:|---:|']
 for arm,s in validated.items():
  cpa=f"${s['costPerAcceptedUsd']:.6f}" if s['costPerAcceptedUsd'] is not None else 'n/a'
  lines.append(f"| {arm} | {s['accepted']}/{s['tasks']} | ${s['knownApiEquivalentUsd']:.6f} | {cpa} | ${s['disputedTaskCostRetainedSeparatelyUsd']:.6f} |")
if stable:
 lines+=['','The five-task table still contains the unstable f01 timing label. Excluding **both f01 and f06 symmetrically** yields the following four-pair sensitivity. All affected attempts and their costs remain preserved in the full campaign total. These exclusions reflect documented evaluation defects, not hidden unsuccessful coding attempts.','', '| Four unaffected pairs | Accepted | Inference cost | Cost / accepted | Affected-task cost still incurred |','|---|---:|---:|---:|---:|']
 for arm,s in stable.items():
  cpa=f"${s['costPerAcceptedUsd']:.6f}" if s['costPerAcceptedUsd'] is not None else 'n/a';lines.append(f"| {arm} | {s['accepted']}/{s['tasks']} | ${s['knownApiEquivalentUsd']:.6f} | {cpa} | ${s['evaluationAffectedTaskCostsStillInTotalUsd']:.6f} |")
lines+=['','Six fresh issues span four repositories, with three p-map snapshots. Some original reports include solution hints. This exploratory cohort is narrow and cannot establish universal performance or parity with Sol/Astra. All A attempts precede B, with B task order reversed; arm/time/cache differences remain uncontrolled. Both arms have the same $0.15 total per-task allowance, including repairs.','', 'Contracts: upstream issue reports and upstream regression tests are independent of the coding actor. Parent reviewed mappings; no separate human/model reviewer was used. Buggy-source/reference controls were required before any actor. Exact implementation-specific mapper counts and an unrelated undefined-drain assertion were excluded before runs.','', 'The B treatment supplies no new initial instructions. Code restores original public tests and runs the declared native commands at submission. On failure, it permits one same-session repair using only public diagnostics. Hidden acceptance is never model feedback. Changes to actor tests do not weaken grading.','',f"Public-only handoff signal on fresh A: {json.dumps(signal['fresh'])}. Development-only prior xhigh: {json.dumps(signal['developmentOnlyPriorXhigh']['confusionAgainstFrozenGrader'])}. Prior counts use frozen acceptance; the prior known posthoc s01 regression is a further missed failure.",'',f"Integrity: {json.dumps(integrity)}."]
(OUT/'RESULTS.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'complete':result['complete'],'summaries':summary,'integrity':integrity,'signal':signal['fresh']}))

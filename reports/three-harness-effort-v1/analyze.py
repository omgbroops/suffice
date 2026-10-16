import pathlib,json,statistics,hashlib,zipfile,datetime
R=pathlib.Path(__file__).resolve().parents[2];D=R/'.suffice/three-harness-effort-v1';OUT=pathlib.Path(__file__).resolve().parent
allrows=[json.loads(p.read_text()) for p in sorted((D/'attempts').glob('*/result.json'))];rows=[r for r in allrows if r['task']!='n06'];excluded=[r for r in allrows if r['task']=='n06'];audit=[]
for r in allrows:
 events=[json.loads(l) for l in (D/'attempts'/r['id']/'worker/events.live.jsonl').read_text().splitlines() if l]
 replies=[e for e in events if e.get('type')=='assistant'];totals={k:sum(e.get('usage',{}).get(k,0) for e in replies) for k in ['input','cacheRead','cacheWrite','output']}
 costs={k:sum(e.get('usage',{}).get('cost',{}).get(k,0) for e in replies) for k in totals}
 r['componentCosts']=costs;r['reasoningTokens']=sum(e.get('usage',{}).get('output_tokens_details',{}).get('reasoning_tokens',0) for e in events if e.get('type')=='provider_usage')
 audit.append({'id':r['id'],'usageMatches':all(totals[k]==r['usage'][k] for k in totals),'costMatches':abs(sum(costs.values())-r['knownEstimatedUsd'])<1e-8,'identity':r['identity'],'tools':r['tools'],'receiptsMatched':r['receiptsMatched']})
groups={};text=['# Suffice, stock Pi and native Codex: Sol low versus xhigh','',f'{len(rows)}/30 planned attempts have result records. One draw per issue and configuration; five valid fresh historical tasks from five small async libraries. The invalid n06 PR/contract task is quarantined, with all six attempts and costs retained separately. This is exploratory and is not a Coding Agent Index. Some issue bodies contain solution hints; see the task contracts.','', 'Costs are pinned API-equivalent inference estimates, not subscription charges. Engineering-agent inference is excluded. Read PROTOCOL.md for predeclared limits, grading exclusions, concurrency and reference qualifications.','', '| Harness / effort | Attempts | Accepted | Budget successes | Total known $ | Mean $ | Median $ | Cost/accepted $ | Mean seconds |','|---|---:|---:|---:|---:|---:|---:|---:|---:|']
for effort in ['low','xhigh']:
 for arm in ['suffice','stock-pi','codex']:
  rs=[r for r in rows if r['arm']==arm and r['effort']==effort];n=len(rs);accepted=sum(r['accepted'] for r in rs);known=sum(r['knownEstimatedUsd'] for r in rs);unknown=sum(r['totalEstimatedUsd'] is None for r in rs)
  g={'attempts':n,'accepted':accepted,'success':sum(r['success'] for r in rs),'knownUsd':known,'unknownCosts':unknown,'mean':known/n if n and not unknown else None,'median':statistics.median(r['totalEstimatedUsd'] for r in rs) if n and not unknown else None,'costPerAccepted':known/accepted if accepted and not unknown else None,'meanSeconds':statistics.mean(r['latencyMs']/1000 for r in rs) if rs else None,'turns':sum(r['turns'] for r in rs),'calls':sum(r['calls'] for r in rs),'usage':{k:sum(r['usage'][k] for r in rs) for k in ['input','cacheRead','cacheWrite','output']},'componentCosts':{k:sum(r['componentCosts'][k] for r in rs) for k in ['input','cacheRead','cacheWrite','output']},'operationalFailures':sum(r['operationalFailure'] for r in rs)};g['allAttemptKnownUsd']=sum(r['knownEstimatedUsd'] for r in allrows if r['arm']==arm and r['effort']==effort);g['allAttemptCostPerValidAccepted']=g['allAttemptKnownUsd']/accepted if accepted else None;groups[arm+'-'+effort]=g
  fmt=lambda x:'unknown' if x is None else f'{x:.4f}'
  text.append(f'| {arm} / {effort} | {n} | {accepted} | {g["success"]} | {known:.4f} | {fmt(g["mean"])} | {fmt(g["median"])} | {fmt(g["costPerAccepted"])} | {fmt(g["meanSeconds"])} |')
text+=['','| Task | Suffice low | Pi low | Codex low | Suffice xhigh | Pi xhigh | Codex xhigh |','|---|---|---|---|---|---|---|']
for task in ['n01','n02','n03','n04','n07']:
 vals=[]
 for effort in ['low','xhigh']:
  for arm in ['suffice','stock-pi','codex']:
   r=next((r for r in rows if r['task']==task and r['arm']==arm and r['effort']==effort),None)
   vals.append('not run' if not r else f'{"accepted" if r["accepted"] else "rejected"}; ${r["knownEstimatedUsd"]:.4f}'+(' unknown full cost' if r['totalEstimatedUsd'] is None else '')+(' operational failure' if r['operationalFailure'] else ''))
 text.append('| '+task+' | '+' | '.join(vals)+' |')
text+=['','The direct product comparison is Suffice low versus Codex xhigh; matched-effort comparisons isolate the observed harness difference more closely. These comparisons do not identify causal effects of individual Suffice mechanisms. Concurrent starts share provider cache conditions and two assigned CPU cores; latency cannot be interpreted as uncontended speed. A 5-task cohort cannot establish broad superiority.','', 'All grading restores original tests, includes independently authored private acceptance checks and retains failed attempts. Known environmental exclusions and the scoped reference correction were established before actor inference.']
text+=['',f'All-attempt ledger: {len(allrows)} recorded attempts; {len(excluded)} quarantined n06 attempts cost ${sum(r["knownEstimatedUsd"] for r in excluded):.6f}; known total across all attempts ${sum(r["knownEstimatedUsd"] for r in allrows):.6f}. Quarantined raw grades are not capability failures. No model reruns were used for evaluator recovery.']
(OUT/'RESULTS.md').write_text('\n'.join(text)+'\n');(OUT/'metrics.json').write_text(json.dumps({'rows':rows,'excludedRows':excluded,'allAttemptKnownUsd':sum(r['knownEstimatedUsd'] for r in allrows),'groups':groups,'accountingAudit':audit,'allAccountingMatched':all(a['usageMatches'] and a['costMatches'] and a['identity'] and a['tools'] and a['receiptsMatched'] for a in audit)},indent=2)+'\n')
print(json.dumps({'attempts':len(rows),'groups':groups,'allAccountingMatched':all(a['usageMatches'] and a['costMatches'] for a in audit)}),flush=True)

# Preserve the unfiltered driver output, then make results.json point at the adjudicated cohort.
raw=OUT/'results.json'
if raw.exists() and 'historical' not in json.loads(raw.read_text()):
 prior=json.loads(raw.read_text())
 if 'rows' in prior and any(r.get('task')=='n06' for r in prior['rows']): (OUT/'raw-driver-summary.json').write_text(raw.read_text())
raw.write_text((OUT/'metrics.json').read_text())

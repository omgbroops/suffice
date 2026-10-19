"""Local, model-free receipt reconciliation and descriptive comparison."""
import collections,datetime,hashlib,json,pathlib,statistics
ROOT=pathlib.Path(__file__).resolve().parents[1]
STATE=ROOT/'.suffice/packet-bench-v1'
OUT=ROOT/'reports/packet-bench-v1';OUT.mkdir(parents=True,exist_ok=True)
manifest=json.loads((STATE/'manifest.json').read_text(encoding='utf8'))
results=[];events=[];audit=[];stages=[]
for job in manifest['jobs']:
 name=job['id']+'-'+job['mode'];folder=STATE/'attempts'/name
 if not (folder/'result.json').exists():
  audit.append({'attempt':name,'missing':True,'partial':folder.exists()});continue
 r=json.loads((folder/'result.json').read_text(encoding='utf8'));results.append(r)
 rows=[]
 for p in (folder/'worker').rglob('events/*.jsonl'):
  for line in p.read_text(encoding='utf8').splitlines():
   try:rows.append({**json.loads(line),'stage':p.relative_to(folder/'worker').parts[0]})
   except json.JSONDecodeError:audit.append({'attempt':name,'truncatedEvent':str(p)})
 assistants=[e for e in rows if e['type']=='assistant']
 known=sum(e.get('usage',{}).get('cost',{}).get('total',0) for e in assistants)
 requests=[e for e in rows if e['type']=='provider_request']
 raw={e.get('responseId'):e for e in rows if e['type']=='provider_usage'}
 valid=r['receiptsMatched'] and not r['costUnknown'] and abs(known-r['knownCostUsd'])<1e-9 and len(requests)==len(assistants)==len(raw)
 audit.append({'attempt':name,'valid':valid,'modelCalls':len(assistants),'knownCostUsd':known,'responses':list(raw),'sourcePromptHash':json.loads((folder/'prompt.json').read_text(encoding='utf8'))['sha256']==manifest['tasks'][r['id']]['promptHash']})
 for e in assistants:
  events.append({'attempt':name,'mode':r['mode'],'stage':e['stage'],'model':e.get('model'),**e.get('usage',{})})
 for p in (folder/'worker').glob('*/stage.json'):
  s=json.loads(p.read_text(encoding='utf8'));stages.append({'attempt':name,'mode':r['mode'],'label':s['label'],'model':s['model'],'effort':s['effort'],'latencyMs':s['latencyMs'],'cost':s['usage']['estimatedApiUsd'],'modelCalls':s['replyCount']})

summary={}
for mode in ['baseline','routing','packets']:
 group=[r for r in results if r['mode']==mode];ledger=[e for e in events if e['mode']==mode]
 costs=[r['totalCostUsd'] for r in group if r['totalCostUsd'] is not None]
 accepted=sum(r['accepted'] for r in group);success=sum(r['success'] for r in group)
 totals={k:sum(e.get(k,0) for e in ledger) for k in ['input','cacheRead','cacheWrite','output']}
 components={k:sum(e.get('cost',{}).get(k,0) for e in ledger) for k in ['input','cacheRead','cacheWrite','output']}
 total=sum(costs);calls=sum(r['modelCalls'] for r in group)
 summary[mode]={'attempts':len(group),'independentAccepted':accepted,'budgetEligibleSuccesses':success,'unknownCosts':len(group)-len(costs),'codingFailures':sum(not r['accepted'] and not r['operationalFailure'] for r in group),'operationalFailures':sum(r['operationalFailure'] for r in group),'knownCostUsd':sum(r['knownCostUsd'] for r in group),'completeCostUsd':total if len(costs)==len(group) else None,'meanCostPerAttempt':statistics.mean(costs) if costs else None,'medianCostPerAttempt':statistics.median(costs) if costs else None,'costPerAccepted':total/accepted if accepted and len(costs)==len(group) else None,'costPerBudgetEligibleSuccess':total/success if success and len(costs)==len(group) else None,'tokens':totals,'costComponents':components,'cachedInputFraction':totals['cacheRead']/max(1,totals['input']+totals['cacheRead']+totals['cacheWrite']),'reasoningTokens':sum(r['reasoningTokens'] for r in group),'modelCalls':calls,'toolCalls':sum(r['usage'].get('toolCalls',0) for r in group),'latencySecondsMean':statistics.mean(r['latencyMs']/1000 for r in group) if group else None,'packetizedTasks':sum(bool(r.get('packetizationActivated')) for r in group),'packetStages':sum(r.get('packetStages',0) or 0 for r in group),'escalations':sum(r.get('escalations',0) or 0 for r in group)}

source=[]
for rel,h in manifest['inputs'].items():
 p=ROOT/rel;source.append({'path':rel,'matches':p.exists() and hashlib.sha256(p.read_bytes()).hexdigest()==h})
report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':manifest['scope'],'summary':summary,'attempts':results,'stages':stages,'audit':audit,'sourceIntegrity':source,'allComplete':len(results)==len(manifest['jobs']),'allReceiptsValid':len(results)==len(manifest['jobs']) and all(x.get('valid') and x.get('sourcePromptHash') for x in audit),'costBasis':manifest['cost']}
(OUT/'summary.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
fmt=lambda n:'unknown' if n is None else f'${n:.5f}'
lines=['# Packet execution: bounded development comparison','',manifest['scope'],'',manifest['cost'],'','## Main comparison','','| Arm | Accepted | Budget-eligible | Total cost | Mean / attempt | Median / attempt | Cost / accepted | Calls | Mean seconds |','|---|---:|---:|---:|---:|---:|---:|---:|---:|']
for mode,s in summary.items():lines.append(f"| {mode} | {s['independentAccepted']}/{s['attempts']} | {s['budgetEligibleSuccesses']} | {fmt(s['completeCostUsd'])} | {fmt(s['meanCostPerAttempt'])} | {fmt(s['medianCostPerAttempt'])} | {fmt(s['costPerAccepted'])} | {s['modelCalls']} | {s['latencySecondsMean']:.1f} |")
lines+=['','## Tokens and observed caching','','| Arm | Fresh input | Cached input | Output including reasoning | Cached input share | Input cost | Cache cost | Output cost |','|---|---:|---:|---:|---:|---:|---:|---:|']
for mode,s in summary.items():
 t=s['tokens'];c=s['costComponents'];lines.append(f"| {mode} | {t['input']:,} | {t['cacheRead']:,} | {t['output']:,} | {s['cachedInputFraction']:.1%} | {fmt(c['input'])} | {fmt(c['cacheRead']+c['cacheWrite'])} | {fmt(c['output'])} |")
lines+=['','Reasoning is included in output totals; do not add it a second time. Cached input share is observed token reuse, not the share of spending saved.','', '## Every scheduled attempt','','| Issue | Arm | Accepted | Eligible success | Cost | Calls | Seconds | Packets | Sol repairs |','|---|---|---:|---:|---:|---:|---:|---:|---:|']
for job in manifest['jobs']:
 r=next((r for r in results if r['id']==job['id'] and r['mode']==job['mode']),None)
 if r is None:lines.append(f"| {job['id']} | {job['mode']} | missing | - | - | - | - | - | - |");continue
 lines.append(f"| {r['id']} | {r['mode']} | {r['accepted']} | {r['success']} | {fmt(r['totalCostUsd'])} | {r['modelCalls']} | {r['latencyMs']/1000:.1f} | {r.get('packetStages',0)} | {r.get('escalations',0)} |")
lines+=['','## Treatment activation and costs','','| Arm | Packetized tasks | Luna packets | Sol repairs | Planning cost | Implementation cost | Repair cost |','|---|---:|---:|---:|---:|---:|---:|']
for mode,s in summary.items():
 group=[x for x in stages if x['mode']==mode];cost=lambda test:sum(x['cost'] for x in group if test(x['label']))
 lines.append(f"| {mode} | {s['packetizedTasks']} | {s['packetStages']} | {s['escalations']} | {fmt(cost(lambda l:l=='plan'))} | {fmt(cost(lambda l:l!='plan' and l!='escalation'))} | {fmt(cost(lambda l:l=='escalation'))} |")
lines+=['','## Validation and limits','',f"- Complete: {report['allComplete']}; independent receipt reconciliation: {report['allReceiptsValid']}; frozen local source hashes match: {all(x['matches'] for x in source)}.",'- Six reused historical repairs, one observation per task/arm. This is exploratory development evidence; no fresh held-out superiority or 30x saving claim.','- Both routing arms include one public-failure Sol repair; the baseline does not. Baseline versus routing mixes model selection with that gate. Routing versus packets shares the gate.','- Luna High and Sol Low are explicitly different model/effort choices. This cannot isolate effort, prices, caching or delegation independently.','- Same task text, public source, dependencies, nominal $0.50/600s/60 responses/240 tool-call allowances and original 4 GiB RSS boundary. Code verification overhead counts in latency; all inference stages and failed responses count in price.','- Private acceptance overlays enter separate grading workspaces only after model execution. Original test edits are restored before independent scoring.','- Stock Pi/Codex are not rebenchmarked here. This tests the requested prototype against the current Suffice baseline.','- Subscription spending and engineering-agent inference are not measured by API-equivalent totals.','']
(OUT/'RESULTS.md').write_text('\n'.join(lines),encoding='utf8')
print(json.dumps({'complete':report['allComplete'],'receiptsValid':report['allReceiptsValid'],'summary':summary}))

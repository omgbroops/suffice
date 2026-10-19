"""Summarize frozen receipts without changing actors, scores or campaign inputs."""
import collections, csv, hashlib, json, pathlib, statistics, sys
state=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
results=[json.loads(p.read_text()) for p in sorted((state/'attempts').glob('*/result.json'))]
manifest=json.loads((state/'manifest.json').read_text())
rows=[]
for r in results:
 worker=state/'attempts'/r['key']/'worker'
 worker_result=json.loads((worker/'worker.json').read_text()) if (worker/'worker.json').exists() else {}
 events=[json.loads(line) for p in worker.glob('**/events/*.jsonl') for line in p.read_text().splitlines() if line]
 tool_calls=[e for e in events if e.get('type')=='tool_call']
 first_request=next((e for e in events if e.get('type')=='provider_request'),{})
 observations={e.get('details',{}).get('observation',{}).get('id'):e.get('details',{}).get('observation') for e in events
               if e.get('type')=='tool_result' and isinstance(e.get('details'),dict) and isinstance(e['details'].get('observation'),dict)}
 observations.pop(None,None)
 large=[v for v in observations.values() if v.get('bytes',0)>6000]
 preparation=[json.loads(p.read_text()) for p in worker.glob('inputs-*/preparation.json')]
 prices=manifest['modelCatalog'][r['model']]['cost']
 usage=r.get('usage',{})
 repriced=0
 for event in events:
  if event.get('type')!='assistant':continue
  u=event.get('usage') or {};rate=dict(prices)
  prompt=sum(u.get(k,0) for k in ['input','cacheRead','cacheWrite'])
  for tier in sorted(prices.get('tiers',[]),key=lambda t:t['inputTokensAbove']):
   if prompt>tier['inputTokensAbove']:rate.update(tier)
  repriced+=sum(u.get(k,0)*rate.get(k,0) for k in ['input','cacheRead','cacheWrite','output'])/1e6
 if not r['costUnknown'] and abs(repriced-r['totalCostUsd'])>1e-9:raise RuntimeError('Repricing mismatch '+r['key'])
 rows.append({k:r.get(k) for k in ['key','id','arm','stratum','model','effort','status','accepted','success','budgetEligible','costUnknown','knownCostUsd','totalCostUsd','latencyMs','outerLatencyMs','gradingLatencyMs','modelCalls','reasoningTokens','repairs','receiptsMatched','identity']}|
             {k:r.get('usage',{}).get(k,0) for k in ['input','cacheRead','cacheWrite','output','toolCalls']}|
             {'outputCaps':len(large),'parentCaps':sum(n.get('kind')=='output_control' for n in r.get('notes',[])),
              'outputRetrievals':sum(e.get('name')=='command_output' for e in tool_calls),
              'preparedBytes':sum(p['bundle'].get('byteUsage',0) for p in preparation),'repricedUsd':repriced,
              'firstPrefixHash':first_request.get('prefixHash'),'firstRequestBytes':first_request.get('bytes'),
              'solveLatencyMs':sum(s['latencyMs'] for s in worker_result.get('stages',[]) if s['label']=='solve'),
              'contractCheckMs':sum(c.get('latencyMs',0) for v in r.get('verification',[]) for c in v['outcomes'] if c.get('kind')=='contract'),
              'nativeCheckMs':sum(c.get('latencyMs',0) for v in r.get('verification',[]) for c in v['outcomes'] if c.get('kind')!='contract'),
              'advisoryNotices':sum(n.get('type')=='advisory_notice' for n in r.get('notes',[])),
              'preparedSources':sum(len(p['bundle']['sources']) for p in preparation),
              'contractInitialFailures':sum(c.get('kind')=='contract' and not c.get('passed') for c in (r.get('verification') or [{}])[0].get('outcomes',[])),
              'changedProtectedTest':any('test' in p.lower() for p in r.get('patchPaths',[]))})
if rows:
 with (out/'attempts.csv').open('w',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
groups=[]
for stratum in ['sol','luna']:
 baseline={r['id']:r for r in rows if r['stratum']==stratum and r['arm']=='B'}
 for arm in ['B','O','V','OV','P','N']:
  group=[r for r in rows if r['stratum']==stratum and r['arm']==arm]
  if not group:continue
  cost=sum(r['knownCostUsd'] for r in group);valid=sum(r['success'] for r in group)
  g={'stratum':stratum,'arm':arm,'n':len(group),'accepted':sum(r['accepted'] for r in group),'valid':valid,
     'knownCostUsd':cost,'costUnknown':sum(r['costUnknown'] for r in group),'costPerValidUsd':cost/valid if valid else None,
     'meanSeconds':statistics.mean(r['latencyMs'] for r in group)/1000,'meanOuterSeconds':statistics.mean(r['outerLatencyMs'] for r in group)/1000,
     'meanContractCheckMs':statistics.mean(r['contractCheckMs'] for r in group),'meanNativeCheckMs':statistics.mean(r['nativeCheckMs'] for r in group),
     'meanSolveSeconds':statistics.mean(r['solveLatencyMs'] for r in group)/1000,
     **{k:sum(r[k] or 0 for r in group) for k in ['input','cacheRead','cacheWrite','output','modelCalls','toolCalls','reasoningTokens','outputCaps','parentCaps','outputRetrievals','advisoryNotices','preparedSources','preparedBytes','contractInitialFailures','repairs']}}
  paired=[r for r in group if r['id'] in baseline]
  if paired:
   baseCost=sum(baseline[r['id']]['knownCostUsd'] for r in paired);baseTime=sum(baseline[r['id']]['latencyMs'] for r in paired)
   g.update(pairedN=len(paired),costDeltaPercent=(sum(r['knownCostUsd'] for r in paired)/baseCost-1)*100,
            latencyDeltaPercent=(sum(r['latencyMs'] for r in paired)/baseTime-1)*100,
            accuracyGains=[r['id'] for r in paired if r['success'] and not baseline[r['id']]['success']],
            accuracyRegressions=[r['id'] for r in paired if not r['success'] and baseline[r['id']]['success']])
  groups.append(g)
summary={'attempts':len(rows),'planned':len(manifest['jobs']),'knownCostUsd':sum(r['knownCostUsd'] for r in rows),
         'costUnknown':sum(r['costUnknown'] for r in rows),'groups':groups,
         'receiptMismatches':[r['key'] for r in rows if not r['receiptsMatched']],
         'identityMismatches':[r['key'] for r in rows if not r['identity']]}
expected={f"{j['id']}-{j['stratum']}-{j['arm']}" for j in manifest['jobs']}
summary['missingAttempts']=sorted(expected-{r['key'] for r in rows})
summary['unexpectedAttempts']=sorted({r['key'] for r in rows}-expected)
if len(sys.argv)>3 and sys.argv[3]=='--require-complete':
 if summary['missingAttempts'] or summary['unexpectedAttempts'] or len(rows)!=len(expected):raise RuntimeError('Incomplete or duplicate campaign')
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(out/'manifest.json').write_bytes((state/'manifest.json').read_bytes())
print(json.dumps(summary,indent=2))

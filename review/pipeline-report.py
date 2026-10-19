"""Offline aggregation and independent receipt checks; never invokes providers."""
import argparse,csv,hashlib,json,pathlib,statistics
ROOT=pathlib.Path(__file__).resolve().parents[1]
STATE=ROOT/'.suffice/pipeline-bench-v1'
OUT=ROOT/'reports/pipeline-bench-v1'
def read(p):return json.loads(p.read_text(encoding='utf8'))
def main():
 manifest=read(STATE/'manifest.json');rows=[];audits=[];catalogsByModel={}
 for job in manifest['jobs']:
  attempt=STATE/'attempts'/(job['id']+'-'+job['mode'])
  if not (attempt/'result.json').exists():continue
  row=read(attempt/'result.json');worker=read(attempt/'worker/worker.json');row['repairs']=worker.get('repairs',0);events=[];bad=[]
  for p in (attempt/'worker').rglob('*.jsonl'):
   if p.parent.name!='events' and p.name!='events.live.jsonl':continue
   for n,line in enumerate(p.read_text(encoding='utf8').splitlines(),1):
    if not line:continue
    try:events.append({**json.loads(line),'_eventFile':str(p.relative_to(attempt/'worker'))})
    except ValueError:bad.append([str(p.relative_to(ROOT)),n])
  replies=[e for e in events if e.get('type')=='assistant'];raw={e['responseId']:e for e in events if e.get('type')=='provider_usage'}
  catalogs=[e for e in events if e.get('type')=='startup'];rates={}
  for e in catalogs:
   model=e.get('model',{})
   if isinstance(model,str) and e.get('pricing'):rates[model]=e['pricing']
   elif isinstance(model,dict) and model.get('cost'):rates[model.get('id')]=model['cost']
  for model,rate in rates.items():catalogsByModel.setdefault(model,[]).append({'mode':job['mode'],'rates':rate})
  cost=0.;missing=[];tokenReceiptsMatch=True;identityMatches=True;stageRows=[]
  for eventFile in sorted({e['_eventFile'] for e in events}):
   stageEvents=[e for e in events if e['_eventFile']==eventFile];startup=next((e for e in stageEvents if e.get('type')=='startup'),{})
   model=startup.get('model');model=model.get('id') if isinstance(model,dict) else model
   aa=[e for e in stageEvents if e.get('type')=='assistant'];uu=list({e['responseId']:e for e in stageEvents if e.get('type')=='provider_usage'}.values());rr=[e for e in stageEvents if e.get('type')=='provider_request']
   if len(aa)!=len(uu) or (job['mode']!='codex' and len(aa)!=len(rr)):tokenReceiptsMatch=False
   stageCost=0.
   for index,(assistant,rawEvent) in enumerate(zip(aa,uu)):
    actual=rawEvent['usage'];cached=actual.get('input_tokens_details',{}).get('cached_tokens',0);written=rawEvent.get('nativeUsage',{}).get('cache_write_input_tokens',actual.get('input_tokens_details',{}).get('cache_write_tokens',0));fresh=actual['input_tokens']-cached-written;output=actual['output_tokens'];rate=rates.get(model)
    if not rate:missing.append(model);continue
    for tier in rate.get('tiers',[]):
     if actual['input_tokens']>tier['inputTokensAbove']:rate={**rate,**tier}
    responseCost=(fresh*rate['input']+cached*rate['cacheRead']+written*rate['cacheWrite']+output*rate['output'])/1e6;stageCost+=responseCost
    observed=assistant.get('usage',{});tokenReceiptsMatch &= all(observed.get(k,0)==v for k,v in [('input',fresh),('cacheRead',cached),('cacheWrite',written),('output',output)]) and abs(observed.get('cost',{}).get('total',-1)-responseCost)<1e-9
    identityMatches &= assistant.get('model')==model
    if job['mode']!='codex' and index<len(rr):
     request=rr[index];advisor=eventFile.startswith('advice-');identityMatches &= request.get('model')==model and request.get('reasoning',{}).get('effort')==startup.get('effort') and request.get('toolNames')==([] if advisor else ['codemode'])
   cost+=stageCost;stageRows.append({'eventFile':eventFile,'model':model,'effort':startup.get('effort'),'responses':len(aa),'repricedUsd':stageCost})
  reported=sum(e.get('usage',{}).get('cost',{}).get('total',0) for e in replies)
  audit={'id':job['id'],'mode':job['mode'],'responses':len(replies),'rawResponses':len(raw),'partialJsonLines':bad,'tokenReceiptsMatch':tokenReceiptsMatch,'identityMatches':identityMatches,'stages':stageRows,'catalogModels':list(rates),'missingCatalogModels':missing,'independentRepricedUsd':None if missing else cost,'reportedResponseUsd':reported,'matchesAttempt':abs(reported-row['knownCostUsd'])<1e-9,'repricedMatches':None if missing else abs(reported-cost)<1e-9}
  audits.append(audit);rows.append(row)
 summary={}
 for mode in manifest['arms']:
  selected=[r for r in rows if r['mode']==mode];cost=sum(r['knownCostUsd'] for r in selected);unknown=sum(bool(r['costUnknown']) for r in selected);success=sum(bool(r['success']) for r in selected)
  summary[mode]={'attempts':len(selected),'accepted':sum(bool(r['accepted']) for r in selected),'success':success,'knownCostUsd':cost,'unknownCosts':unknown,'costPerAcceptedTask':None if unknown or not success else cost/success,'meanLatencySeconds':statistics.mean(r['latencyMs']/1000 for r in selected) if selected else None,'modelCalls':sum(r['modelCalls'] for r in selected),'toolCalls':sum(r['usage'].get('toolCalls',0) for r in selected),'freshInput':sum(r['usage'].get('input',0) for r in selected),'cachedInput':sum(r['usage'].get('cacheRead',0) for r in selected),'output':sum(r['usage'].get('output',0) for r in selected),'maxPeakRssBytes':max((r.get('peakRssBytes',0) for r in selected),default=0),'repairs':sum(r.get('repairs',0) or 0 for r in selected),'adviceStages':sum(r.get('adviceStages',0) or 0 for r in selected),'escalations':sum(r.get('escalations',0) or 0 for r in selected)}
 source=[]
 for rel,expected in manifest['inputs'].items():
  p=ROOT/rel;source.append({'path':rel,'expected':expected,'actual':hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None})
 OUT.mkdir(parents=True,exist_ok=True)
 (OUT/'summary.json').write_text(json.dumps({'scope':manifest['scope'],'costScope':manifest['cost'],'planned':len(manifest['jobs']),'completed':len(rows),'arms':summary,'rows':rows},indent=2)+'\n',encoding='utf8')
 catalogConsistency={model:len({json.dumps({k:rate['rates'].get(k) for k in ['input','output','cacheRead','cacheWrite','tiers']},sort_keys=True) for rate in values})==1 for model,values in catalogsByModel.items()}
 (OUT/'audit.json').write_text(json.dumps({'catalogConsistency':catalogConsistency,'catalogsByModel':catalogsByModel,'attempts':audits,'localSourceMatchesFreeze':all(x['expected']==x['actual'] for x in source),'source':source},indent=2)+'\n',encoding='utf8')
 keys=['id','mode','repository','issue','accepted','success','budgetEligible','costUnknown','knownCostUsd','totalCostUsd','latencyMs','modelCalls','adviceStages','repairs','escalations','peakRssBytes']
 with (OUT/'attempts.csv').open('w',newline='',encoding='utf8') as f:
  writer=csv.DictWriter(f,fieldnames=keys,extrasaction='ignore');writer.writeheader();writer.writerows(rows)
 lines=['# Lightweight pipeline comparison','',manifest['scope'],'',manifest['cost'],'','| Arm | Accepted | Eligible success | Cost | Cost / accepted | Mean seconds |','|---|---:|---:|---:|---:|---:|']
 for mode,s in summary.items():
  cpa='unknown' if s['costPerAcceptedTask'] is None else '$%.5f'%s['costPerAcceptedTask'];time='n/a' if s['meanLatencySeconds'] is None else '%.1f'%s['meanLatencySeconds']
  lines.append('| %s | %s/%s | %s/%s | $%.5f%s | %s | %s |'%(mode,s['accepted'],s['attempts'],s['success'],s['attempts'],s['knownCostUsd'],' + unknown' if s['unknownCosts'] else '',cpa,time))
 lines+=['','One attempt per issue/arm. Mixed-model v2 differs in both model and harness; differences cannot isolate individual mechanisms. Native Codex remains version 0.163.0 with its own prompt/tools. Costs are API-equivalent, excluding engineering and actual subscription spend.','', 'All attempts, failed patches, resource stops, advice and repairs remain in receipts. No private feedback enters coding sessions.']
 (OUT/'RESULTS.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
 print(json.dumps({'attempts':len(rows),'arms':summary,'catalogConsistency':catalogConsistency,'auditMatches':all(a['matchesAttempt'] and a['repricedMatches'] is not False and a['tokenReceiptsMatch'] and a['identityMatches'] and not a['partialJsonLines'] for a in audits)},ensure_ascii=True))
if __name__=='__main__':main()

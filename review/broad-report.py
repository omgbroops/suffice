"""Offline aggregation and independent receipt checks; never invokes providers."""
import argparse,csv,hashlib,json,pathlib,statistics,datetime
ROOT=pathlib.Path(__file__).resolve().parents[1]
STATE=ROOT/'.suffice/broad-bench-v1'
OUT=ROOT/'reports/broad-bench-v1'
def read(p):return json.loads(p.read_text(encoding='utf8'))

def receipt_timing(events):
 def at(e):return datetime.datetime.fromisoformat(e['at'].replace('Z','+00:00')).timestamp()
 def seconds(intervals):
  merged=[]
  for begin,end in sorted(intervals):
   if end<begin:continue
   if merged and begin<=merged[-1][1]:merged[-1][1]=max(merged[-1][1],end)
   else:merged.append([begin,end])
  return sum(end-begin for begin,end in merged)
 provider=[];tools=[];unpaired=0
 for file in {e['_eventFile'] for e in events}:
  stage=[e for e in events if e['_eventFile']==file];requests=[e for e in stage if e.get('type')=='provider_request'];responses=[e for e in stage if e.get('type')=='assistant'];unpaired+=abs(len(requests)-len(responses))
  for request,response in zip(requests,responses):
   if request.get('at') and response.get('at'):provider.append((at(request),at(response)))
   else:unpaired+=1
  starts={e.get('callId'):e for e in stage if e.get('type')=='tool_call' and e.get('name')=='codemode'}
  ends={e.get('callId'):e for e in stage if e.get('type')=='tool_result' and e.get('name')=='codemode'}
  for id,start in starts.items():
   if id in ends and start.get('at') and ends[id].get('at'):tools.append((at(start),at(ends[id])))
   else:unpaired+=1
 return {'providerIntervalSeconds':seconds(provider),'codemodeIntervalSeconds':seconds(tools),'providerPairs':len(provider),'codemodePairs':len(tools),'unpairedEvents':unpaired,'basis':'Union of receipt timestamp intervals, not provider compute or network attribution.'}

def main():
 manifest=read(STATE/'manifest.json');rows=[];audits=[];catalogsByModel={}
 for job in manifest['jobs']:
  attempt=STATE/'attempts'/(job['id']+'-'+job['mode'])
  if not (attempt/'result.json').exists():continue
  row=read(attempt/'result.json');worker=read(attempt/'worker/worker.json');row['repairs']=worker.get('repairs',0);row['stageWallMs']=sum(x.get('latencyMs',0) for x in worker.get('stages',[]));row['verificationMs']=sum(x.get('latencyMs',0) for v in worker.get('verification',[]) for x in v.get('outcomes',[]));row['otherControllerMs']=max(0,row['latencyMs']-row['stageWallMs']-row['verificationMs']);events=[];bad=[]
  for p in (attempt/'worker').rglob('*.jsonl'):
   if p.parent.name!='events' and p.name!='events.live.jsonl':continue
   for n,line in enumerate(p.read_text(encoding='utf8').splitlines(),1):
    if not line:continue
    try:events.append({**json.loads(line),'_eventFile':p.relative_to(attempt/'worker').as_posix()})
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
   if len(aa)!=len(uu) or (job['mode']!='codexSolMedium' and len(aa)!=len(rr)):tokenReceiptsMatch=False
   stageCost=0.
   for index,(assistant,rawEvent) in enumerate(zip(aa,uu)):
    actual=rawEvent['usage'];cached=actual.get('input_tokens_details',{}).get('cached_tokens',0);written=rawEvent.get('nativeUsage',{}).get('cache_write_input_tokens',actual.get('input_tokens_details',{}).get('cache_write_tokens',0));fresh=actual['input_tokens']-cached-written;output=actual['output_tokens'];rate=rates.get(model)
    if not rate:missing.append(model);continue
    for tier in rate.get('tiers',[]):
     if actual['input_tokens']>tier['inputTokensAbove']:rate={**rate,**tier}
    responseCost=(fresh*rate['input']+cached*rate['cacheRead']+written*rate.get('cacheWrite',rate['input'])+output*rate['output'])/1e6;stageCost+=responseCost
    observed=assistant.get('usage',{});tokenReceiptsMatch &= all(observed.get(k,0)==v for k,v in [('input',fresh),('cacheRead',cached),('cacheWrite',written),('output',output)]) and abs(observed.get('cost',{}).get('total',-1)-responseCost)<1e-9
    identityMatches &= assistant.get('model')==model
    if job['mode']=='codexSolMedium':identityMatches &= model=='gpt-6.1-sol' and startup.get('effort')=='medium'
    if job['mode']!='codexSolMedium' and index<len(rr):
     request=rr[index];advisor=eventFile.startswith('advice-');takeover=eventFile.startswith('sol-takeover/');expectedModel='gpt-6.1-sol' if advisor or takeover else manifest['arms'][job['mode']]['model'];expectedEffort='low' if advisor or takeover else manifest['arms'][job['mode']]['effort'];identityMatches &= model==expectedModel and startup.get('effort')==expectedEffort and request.get('model')==model and request.get('reasoning',{}).get('effort')==startup.get('effort') and request.get('toolNames')==([] if advisor else ['codemode'])
   cost+=stageCost;stageRows.append({'eventFile':eventFile,'model':model,'effort':startup.get('effort'),'responses':len(aa),'repricedUsd':stageCost,'toolNames':startup.get('tools',[])})
  row['reasoningFieldCoverage']={'responses':len(raw),'present':sum('reasoning_tokens' in e['usage'].get('output_tokens_details',{}) for e in raw.values())}
  row['timingReceipts']=receipt_timing(events)
  reported=sum(e.get('usage',{}).get('cost',{}).get('total',0) for e in replies)
  audit={'id':job['id'],'mode':job['mode'],'responses':len(replies),'rawResponses':len(raw),'partialJsonLines':bad,'tokenReceiptsMatch':tokenReceiptsMatch,'identityMatches':identityMatches,'stages':stageRows,'catalogModels':list(rates),'missingCatalogModels':missing,'independentRepricedUsd':None if missing else cost,'reportedResponseUsd':reported,'matchesAttempt':abs(reported-row['knownCostUsd'])<1e-9,'repricedMatches':None if missing else abs(reported-cost)<1e-9}
  audits.append(audit);rows.append(row)
 summary={}
 for mode in manifest['arms']:
  selected=[r for r in rows if r['mode']==mode];cost=sum(r['knownCostUsd'] for r in selected);unknown=sum(bool(r['costUnknown']) for r in selected);success=sum(bool(r['success']) for r in selected)
  summary[mode]={'attempts':len(selected),'accepted':sum(bool(r['accepted']) for r in selected),'success':success,'knownCostUsd':cost,'unknownCosts':unknown,'costPerAcceptedTask':None if unknown or not success else cost/success,'operationalFailures':sum(bool(r['operationalFailure']) for r in selected),'medianLatencySeconds':statistics.median(r['latencyMs']/1000 for r in selected) if selected else None,'p90LatencySeconds':sorted(r['latencyMs']/1000 for r in selected)[max(0,__import__('math').ceil(.9*len(selected))-1)] if selected else None,'meanLatencySeconds':statistics.mean(r['latencyMs']/1000 for r in selected) if selected else None,'modelCalls':sum(r['modelCalls'] for r in selected),'toolCalls':sum(r['usage'].get('toolCalls',0) for r in selected),'reasoningFieldCoverage':{'responses':sum(r['reasoningFieldCoverage']['responses'] for r in selected),'present':sum(r['reasoningFieldCoverage']['present'] for r in selected)},'reasoningOutputTokens':sum(r.get('reasoningTokens',0) for r in selected),'meanStageWallSeconds':statistics.mean(r['stageWallMs']/1000 for r in selected) if selected else None,'meanVerificationSeconds':statistics.mean(r['verificationMs']/1000 for r in selected) if selected else None,'meanOtherControllerSeconds':statistics.mean(r['otherControllerMs']/1000 for r in selected) if selected else None,'meanProviderReceiptSeconds':statistics.mean(r['timingReceipts']['providerIntervalSeconds'] for r in selected) if selected else None,'meanCodemodeIntervalSeconds':statistics.mean(r['timingReceipts']['codemodeIntervalSeconds'] for r in selected) if selected else None,'freshInput':sum(r['usage'].get('input',0) for r in selected),'cachedInput':sum(r['usage'].get('cacheRead',0) for r in selected),'output':sum(r['usage'].get('output',0) for r in selected),'maxPeakRssBytes':max((r.get('peakRssBytes',0) for r in selected),default=0),'repairs':sum(r.get('repairs',0) or 0 for r in selected),'adviceStages':sum(r.get('adviceStages',0) or 0 for r in selected),'escalations':sum(r.get('escalations',0) or 0 for r in selected)}
 source=[]
 for rel,expected in manifest['inputs'].items():
  p=ROOT/rel;source.append({'path':rel,'expected':expected,'actual':hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None})
 OUT.mkdir(parents=True,exist_ok=True)
 (OUT/'summary.json').write_text(json.dumps({'scope':manifest['scope'],'costScope':manifest['cost'],'planned':len(manifest['jobs']),'completed':len(rows),'arms':summary,'rows':rows},indent=2)+'\n',encoding='utf8')
 catalogConsistency={model:len({json.dumps({k:rate['rates'].get(k) for k in ['input','output','cacheRead','cacheWrite','tiers']},sort_keys=True) for rate in values})==1 for model,values in catalogsByModel.items()}
 (OUT/'audit.json').write_text(json.dumps({'catalogConsistency':catalogConsistency,'catalogsByModel':catalogsByModel,'attempts':audits,'localSourceMatchesFreeze':all(x['expected']==x['actual'] for x in source),'source':source},indent=2)+'\n',encoding='utf8')
 keys=['id','mode','repository','issue','accepted','success','budgetEligible','costUnknown','knownCostUsd','totalCostUsd','latencyMs','stageWallMs','verificationMs','otherControllerMs','reasoningTokens','modelCalls','adviceStages','repairs','escalations','peakRssBytes']
 with (OUT/'attempts.csv').open('w',newline='',encoding='utf8') as f:
  writer=csv.DictWriter(f,fieldnames=keys,extrasaction='ignore');writer.writeheader();writer.writerows(rows)
 paired={id:{r['mode']:{k:r.get(k) for k in ['accepted','success','knownCostUsd','costUnknown','latencyMs','operationalFailure','status']} for r in rows if r['id']==id} for id in manifest['tasks']}
 (OUT/'paired-outcomes.json').write_text(json.dumps(paired,indent=2)+'\n',encoding='utf8')
 export=read(OUT/'export-manifest.json');audit=read(OUT/'audit.json');post=read(STATE/'postflight.json');parity={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h for p,h in export['remoteSourceSync'].items()};receiptHashes={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h for p,h in export['files'].items()}
 audit['localRemoteSourceParity']={'files':len(parity),'allMatch':all(parity.values()),'checks':parity};audit['exportedReceiptIntegrity']={'files':len(receiptHashes),'allMatch':all(receiptHashes.values())};audit['remotePostflight']=post
 audit['allChecksPassed']=audit['localSourceMatchesFreeze'] and all(parity.values()) and all(receiptHashes.values()) and post['valid'] and all(a['matchesAttempt'] and a['repricedMatches'] and a['tokenReceiptsMatch'] and a['identityMatches'] and not a['partialJsonLines'] for a in audits) and all(catalogConsistency.values())
 (OUT/'audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf8')
 print(json.dumps({'attempts':len(rows),'arms':summary,'catalogConsistency':catalogConsistency,'auditMatches':all(a['matchesAttempt'] and a['repricedMatches'] is not False and a['tokenReceiptsMatch'] and a['identityMatches'] and not a['partialJsonLines'] for a in audits)},ensure_ascii=True))
if __name__=='__main__':main()

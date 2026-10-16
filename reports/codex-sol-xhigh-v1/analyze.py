"""Recompute inference and paired metrics from preserved actor events."""
import argparse,csv,datetime,hashlib,json,pathlib,statistics,sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
DIR=ROOT/'.suffice/codex-sol-xhigh-v1';OUT=pathlib.Path(__file__).resolve().parent
PRICE={'input':2,'cacheRead':.1,'cacheWrite':2.5,'output':10}
TIER={'input':4,'cacheRead':.2,'cacheWrite':5,'output':15}
def js(p):return json.loads(p.read_text(encoding='utf8'))
def lines(p):return [json.loads(l)for l in p.read_text(encoding='utf8').splitlines()if l]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
rows=[];audits=[];inputs={}
for path in sorted((DIR/'attempts').glob('*/result.json')):
 r=js(path);rows.append(r);run=path.parent;events=lines(run/'worker/events.live.jsonl')
 raw={e['responseId']:e for e in events if e.get('type')=='provider_usage'}
 totals=dict.fromkeys(['input','cacheRead','cacheWrite','output'],0);components=dict.fromkeys(totals,0.)
 reasoning=0
 for e in raw.values():
  u=e['usage'];native=e.get('nativeUsage',{})
  cached=u.get('input_tokens_details',{}).get('cached_tokens',0)
  write=native.get('cache_write_input_tokens',u.get('input_tokens_details',{}).get('cache_write_tokens',0))
  kinds={'input':u['input_tokens']-cached-write,'cacheRead':cached,'cacheWrite':write,'output':u['output_tokens']}
  rates=TIER if u['input_tokens']>272000 else PRICE
  for k,v in kinds.items():totals[k]+=v;components[k]+=v*rates[k]/1e6
  reasoning+=u.get('output_tokens_details',{}).get('reasoning_tokens',0)
 computed=sum(components.values());matched=all(totals[k]==r['usage'][k]for k in totals)and abs(computed-r['knownEstimatedUsd'])<1e-9
 r['costComponents']=components;r['reasoningOutputTokens']=reasoning
 audits.append({'id':r['id'],'uniqueUsageRecords':len(raw),'recomputedCostUsd':computed,'eventsMatchResult':matched,'reasoningOutputTokens':reasoning})
 if not matched:raise RuntimeError('Accounting mismatch '+r['id'])
 inputs[path.relative_to(ROOT).as_posix()]=digest(path)
 inputs[(run/'worker/events.live.jsonl').relative_to(ROOT).as_posix()]=digest(run/'worker/events.live.jsonl')
summary={}
for arm in ['suffice','codex']:
 sel=[r for r in rows if r['arm']==arm];known=sum(r['knownEstimatedUsd']for r in sel);unknown=sum(r['totalEstimatedUsd']is None for r in sel);accepted=sum(r['accepted']for r in sel)
 tokens={k:sum(r['usage'][k]for r in sel)for k in ['input','cacheRead','cacheWrite','output']}
 summary[arm]={'attempts':len(sel),'accepted':accepted,'budgetEligibleSuccesses':sum(r['success']for r in sel),'knownTotalApiEquivalentUsd':known,'totalApiEquivalentUsd':None if unknown else known,'unknownFullCosts':unknown,'meanCostPerAttemptUsd':None if unknown or not sel else known/len(sel),'medianCostPerAttemptUsd':None if unknown or not sel else statistics.median(r['totalEstimatedUsd']for r in sel),'costPerAcceptedUsd':None if unknown or not accepted else known/accepted,'tokens':tokens,'totalInputTokensIncludingCache':tokens['input']+tokens['cacheRead']+tokens['cacheWrite'],'reasoningOutputTokensIncludedInOutput':sum(r['reasoningOutputTokens']for r in sel),'costComponents':{k:sum(r['costComponents'][k]for r in sel)for k in PRICE},'modelResponses':sum(r['turns']for r in sel),'modelVisibleCalls':sum(r['modelVisibleCalls']for r in sel),'meanActorSeconds':statistics.mean(r['latencyMs']/1000 for r in sel)if sel else None,'medianActorSeconds':statistics.median(r['latencyMs']/1000 for r in sel)if sel else None,'operationalFailures':sum(r['operationalFailure']for r in sel),'codingFailures':sum(r['codingFailure']for r in sel)}
pairs=[]
for task in js(ROOT/'experiments/codex-sol-xhigh-v1/plan.json')['tasks']:
 pair={r['arm']:r for r in rows if r['task']==task}
 if len(pair)!=2:continue
 a,b=pair['suffice'],pair['codex'];pairs.append({'task':task,'sufficeAccepted':a['accepted'],'codexAccepted':b['accepted'],'sufficeCostUsd':a['totalEstimatedUsd'],'codexCostUsd':b['totalEstimatedUsd'],'sufficeCheaper':None if a['totalEstimatedUsd']is None or b['totalEstimatedUsd']is None else a['totalEstimatedUsd']<b['totalEstimatedUsd']})
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'model':'gpt-6.1-sol','effort':'xhigh','expectedAttempts':20,'recordedAttempts':len(rows),'complete':len(rows)==20,'cohort':'Original ten exposed historical issues; new actor sessions; not fresh holdout','summaries':summary,'pairs':pairs,'allRawUsageMatches':all(a['eventsMatchResult']for a in audits),'audits':audits,'inputsSha256':inputs,'scope':'API-equivalent benchmark inference, not subscription charges; setup and engineering excluded and reported separately','rows':rows}
OUT.mkdir(parents=True,exist_ok=True);(OUT/'metrics.json').write_text(json.dumps(result,indent=2)+'\n')
with (OUT/'attempts.csv').open('w',newline='')as f:
 fields=['id','arm','task','accepted','success','status','knownEstimatedUsd','totalEstimatedUsd','turns','modelVisibleCalls','latencyMs'];w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(rows)
def money(v):return 'unknown'if v is None else f'${v:.6f}'
def num(v):return 'unknown'if v is None else f'{v:,.1f}'if isinstance(v,float)else f'{v:,}'
text=['# Suffice versus native Codex — GPT-6.1 Sol xhigh','',f"Recorded {len(rows)}/20 attempts on the original ten historical issues. These are exposed development tasks, not a fresh holdout. Quality is frozen-check acceptance, not the Coding Agent Index.",'','| Metric | Suffice | Native Codex 0.163.0 |','| --- | ---: | ---: |']
for label,key,is_cost in [('Attempts','attempts',False),('Accepted on frozen checks','accepted',False),('Budget-certified successes','budgetEligibleSuccesses',False),('Total inference, all attempts','totalApiEquivalentUsd',True),('Mean cost per attempt','meanCostPerAttemptUsd',True),('Median attempt cost','medianCostPerAttemptUsd',True),('Cost per accepted task, including failures','costPerAcceptedUsd',True),('Fresh input tokens','input',False),('Cached input tokens','cacheRead',False),('Total input tokens including cache','totalInputTokensIncludingCache',False),('Output tokens including reasoning','output',False),('Reasoning tokens, already included in output','reasoningOutputTokensIncludedInOutput',False),('Model responses','modelResponses',False),('Model-visible tool calls','modelVisibleCalls',False),('Mean actor seconds','meanActorSeconds',False),('Median actor seconds','medianActorSeconds',False),('Operational failures','operationalFailures',False),('Completed coding failures','codingFailures',False),('Attempts with unknown full costs','unknownFullCosts',False)]:
 vals=[]
 for arm in ['suffice','codex']:
  d=summary[arm];v=d['tokens'][key]if key in d.get('tokens',{})else d[key];vals.append(money(v)if is_cost else num(v))
 text.append('| '+label+' | '+' | '.join(vals)+' |')
text+=['','All costs are API-equivalent inference estimates, not subscription cash charges. Setup checks and engineering inference are outside this scored table. Missing retry usage stays unknown. Reasoning is not billed twice. Native model responses come from deduplicated token_usage_record receipts, not a reconstructed HTTP request count. Tool-call observability differs; raw and primitive counts are preserved per attempt. Actor latency includes native commands and retries but excludes independent grading.','', 'Both actors use the same original task text, pre-fix bytes, dependencies, ceilings and external filesystem boundary. They keep their native system instructions and tools. Codex keeps native code execution and compaction. Both get the same virtual-address compatibility allowance and observed RSS ceiling; see the frozen protocol. Native graders restore original tests and keep private acceptance outside actor mounts.','', 'One observation per task and harness, six source repositories, reused issues, incomplete upstream CI and known limitations of frozen graders prevent a general superiority claim. Passing frozen checks is not proof of complete behavioral correctness. Post-hoc regression checks are supplementary and do not silently rewrite primary scores.','', '| Task | Suffice | Codex | Suffice cost | Codex cost |','| --- | --- | --- | ---: | ---: |']
for p in pairs:text.append(f"| {p['task']} | {'Pass'if p['sufficeAccepted']else'Fail'} | {'Pass'if p['codexAccepted']else'Fail'} | {money(p['sufficeCostUsd'])} | {money(p['codexCostUsd'])} |")
(OUT/'RESULTS.md').write_text('\n'.join(text)+'\n')
print(json.dumps({'attempts':len(rows),'summaries':summary,'audited':len(audits)}))

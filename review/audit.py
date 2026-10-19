"""Independent offline observer; does not change frozen actors or graders."""
import collections,csv,hashlib,json,pathlib,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1];STATE=ROOT/'.suffice/packet-bench-v1';OUT=ROOT/'reports/packet-bench-v1';OUT.mkdir(parents=True,exist_ok=True)
manifest=json.loads((STATE/'manifest.json').read_text());audit=[];models=collections.defaultdict(lambda:{'calls':0,'cachedCalls':0,'cost':0,'input':0,'cached':0,'output':0,'reasoning':0});by_arm=collections.defaultdict(lambda:{'calls':0,'cachedCalls':0,'cost':0,'planning':0,'fallbacks':0,'packets':0,'escalations':0})
for job in manifest['jobs']:
 name=job['id']+'-'+job['mode'];folder=STATE/'attempts'/name;result=json.loads((folder/'result.json').read_text());raw_cost=0;responses=0;tools=0
 for p in sorted((folder/'worker').rglob('events/*.jsonl')):
  rows=[json.loads(line) for line in p.read_text().splitlines()];startup=next(e for e in rows if e['type']=='startup');price=startup['pricing'];aa=[e for e in rows if e['type']=='assistant'];uu=list({e['responseId']:e for e in rows if e['type']=='provider_usage'}.values());rr=[e for e in rows if e['type']=='provider_request'];tools+=sum(e['type']=='tool_call' for e in rows)
  assert len(aa)==len(uu)==len(rr),name+' response receipts mismatch'
  stage=p.relative_to(folder/'worker').parts[0]
  for a,u,r in zip(aa,uu,rr):
   actual=u['usage'];cached=actual.get('input_tokens_details',{}).get('cached_tokens',0);fresh=actual['input_tokens']-cached;output=actual['output_tokens'];selected=price.copy()
   for tier in price.get('tiers',[]):
    if actual['input_tokens']>tier['inputTokensAbove']:selected.update(tier)
   cost=(fresh*selected['input']+cached*selected['cacheRead']+output*selected['output'])/1e6
   assert a['usage']['input']==fresh and a['usage']['cacheRead']==cached and a['usage']['output']==output,name+' token mismatch'
   assert abs(cost-a['usage']['cost']['total'])<1e-9,name+' price mismatch'
   assert r['model']==startup['model']==a['model'],name+' model mismatch'
   assert r['reasoning']['effort']==startup['effort'],name+' effort mismatch'
   assert r['toolNames']==['codemode'],name+' tool schema mismatch'
   assert a['stopReason'] not in ['error','aborted'],name+' incomplete cost'
   raw_cost+=cost;responses+=1
   group=models[(job['mode'],a['model'],startup['effort'])];group['calls']+=1;group['cachedCalls']+=cached>0;group['cost']+=cost;group['input']+=fresh;group['cached']+=cached;group['output']+=output;group['reasoning']+=actual.get('output_tokens_details',{}).get('reasoning_tokens',0)
   g=by_arm[job['mode']];g['calls']+=1;g['cachedCalls']+=cached>0;g['cost']+=cost
   if stage=='plan':g['planning']+=cost
  if stage.startswith('packet-'):by_arm[job['mode']]['packets']+=1
  if stage=='fallback-solve':by_arm[job['mode']]['fallbacks']+=1
  if stage=='escalation':by_arm[job['mode']]['escalations']+=1
 assert abs(raw_cost-result['totalCostUsd'])<1e-9,name+' total price mismatch'
 assert tools==result['usage']['toolCalls'],name+' tool-call mismatch'
 assert result['grading']['protectedTestsRestored'],name+' grading restored tests required'
 audit.append({'attempt':name,'repricedApiEquivalentUsd':raw_cost,'calls':responses,'toolCalls':tools,'valid':True})
integrity={}
for group,root in [('inputs',ROOT),('runtimeInputs',ROOT/'.suffice/runtime')]:
 for rel,h in manifest[group].items():integrity[group+':'+rel]=hashlib.sha256((root/rel).read_bytes()).hexdigest()==h
for p,h in manifest['externalInputs'].items():integrity['external:'+p]=hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()==h
assert all(integrity.values()),'Frozen source/runtime/evaluator changed'
git={}
for id in manifest['tasks']:
 t=json.loads(pathlib.Path('/home/eric_qin/suffice-field-v1/.suffice/luna-sol-field-v1/tasks',id,'task.json').read_text());count=subprocess.check_output(['git','-C',t['baseDir'],'rev-list','--count','--all'],text=True).strip();git[id]={'reachableCommitCount':int(count),'referenceCommitAvailable':subprocess.run(['git','-C',t['baseDir'],'cat-file','-e',t.get('fixCommit','missing')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0}
assert not any(v['referenceCommitAvailable'] for v in git.values()),'Fix commit exposed through Git metadata'
data={'attempts':audit,'modelBreakdown':[{'arm':k[0],'model':k[1],'effort':k[2],**v} for k,v in models.items()],'arms':dict(by_arm),'frozenInputsValid':all(integrity.values()),'checksummedFiles':len(integrity),'gitExposure':git,'independentRepricingValid':True,'basis':'Raw provider usage repriced against per-stage pinned model catalog prices; API-equivalent, not subscription spending. Reasoning tokens are already included in output.'}
(OUT/'independent-audit.json').write_text(json.dumps(data,indent=2)+'\n')
with (OUT/'attempts.csv').open('w',newline='') as f:
 fields=['id','mode','accepted','budgetEligible','success','totalCostUsd','modelCalls','latencyMs','packetStages','escalations','costUnknown'];w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader()
 for j in manifest['jobs']:w.writerow(json.loads((STATE/'attempts'/(j['id']+'-'+j['mode'])/'result.json').read_text()))
print(json.dumps({'attempts':len(audit),'repriced':True,'frozenFilesValid':len(integrity),'arms':dict(by_arm),'git':git}))

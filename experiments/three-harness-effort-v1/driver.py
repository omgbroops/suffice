import pathlib,subprocess,json,os,time,concurrent.futures,threading,statistics
R=pathlib.Path(__file__).resolve().parents[2];H=R/'experiments/three-harness-effort-v1';D=R/'.suffice/three-harness-effort-v1';D.mkdir(parents=True,exist_ok=True)
TASKS=['n01','n02','n03','n04','n06'];CELLS=[(a,e) for e in ['low','xhigh'] for a in ['suffice','stock-pi','codex']];lock=threading.Lock();active=set();blocked=[];halt=False
def save():
 (D/'driver-state.json').write_text(json.dumps({'at':time.time(),'pid':os.getpid(),'active':sorted(active),'blocked':blocked,'halt':halt,'maximumActors':6},indent=2))
def run(args,label,effort='low'):
 env={**os.environ,'EFFORT':effort};log=D/(label+'.log')
 with log.open('ab') as out:r=subprocess.run(['node',str(H/'campaign.mjs'),*args],cwd=R,env=env,stdout=out,stderr=subprocess.STDOUT)
 return r.returncode
def results():
 return [json.loads(p.read_text()) for p in (D/'attempts').glob('*/result.json')]
def single(task,arm,effort):
 global halt
 name=f'{task}-{arm}-{effort}'
 with lock:
  rows=results()
  if halt:return
  if any(r['totalEstimatedUsd'] is None for r in rows):halt=True;blocked.append('Unknown full cost; dispatch paused');save();return
  if sum(r['knownEstimatedUsd'] for r in rows)+2*(len(active)+1)>20:halt=True;blocked.append('Aggregate known plus reserved budget');save();return
  active.add(name);save()
 code=run(['single',task,arm],name,effort)
 with lock:
  active.discard(name)
  if code:blocked.append(name+' operational/evaluator failure');halt=True
  save()
def phase(tasks):
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  work=[]
  for i,task in enumerate(tasks):
   cells=CELLS[i%6:]+CELLS[:i%6]
   for arm,effort in cells:work.append(pool.submit(single,task,arm,effort))
  for f in work:f.result()
def report():
 rows=results();groups={}
 for arm,effort in CELLS:
  rs=[r for r in rows if r['arm']==arm and r['effort']==effort];cost=sum(r['knownEstimatedUsd'] for r in rs);accepted=sum(r['accepted'] for r in rs);unknown=sum(r['totalEstimatedUsd'] is None for r in rs)
  groups[arm+'-'+effort]={'attempts':len(rs),'accepted':accepted,'budgetEligibleSuccesses':sum(r['success'] for r in rs),'knownCostUsd':cost,'unknownCosts':unknown,'meanCost':cost/len(rs) if rs and not unknown else None,'medianCost':statistics.median(r['totalEstimatedUsd'] for r in rs) if rs and not unknown else None,'costPerAccepted':cost/accepted if accepted and not unknown else None,'turns':sum(r['turns'] for r in rs),'meanLatencySeconds':statistics.mean(r['latencyMs']/1000 for r in rs) if rs else None,'usage':{k:sum(r['usage'].get(k,0) for r in rs) for k in ['input','cacheRead','cacheWrite','output']},'operationalFailures':sum(r['operationalFailure'] for r in rs)}
 dest=R/'reports/three-harness-effort-v1';dest.mkdir(parents=True,exist_ok=True);(dest/'results.json').write_text(json.dumps({'rows':rows,'groups':groups,'blocked':blocked,'scope':'Exploratory, one attempt per fresh issue and configuration, concurrent execution, API-equivalent costs only'},indent=2)+'\n')
 print(json.dumps(groups),flush=True)
if __name__=='__main__':
 f=(D/'driver.lock').open('x');f.write(str(os.getpid()));f.flush()
 try:
  for effort in ['low','xhigh']:
   if run(['init'],'init-'+effort,effort):raise RuntimeError('Frozen runtime initialization failed '+effort)
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
   controls=list(pool.map(lambda t:0 if (D/'preflight'/t/'validated.json').exists() and json.loads((D/'preflight'/t/'validated.json').read_text()).get('passed') else run(['preflight',t],'controls-'+t),TASKS))
  if any(controls):raise RuntimeError('Task controls invalid; no inference dispatched')
  phase(TASKS[:1]);first=results()
  if len(first)!=6 or any(not r['identity'] or not r['tools'] or not r['receiptsMatched'] or r['operationalFailure'] for r in first):raise RuntimeError('First six cells failed compatibility/accounting; no further dispatch')
  phase(TASKS[1:])
 except Exception as e:
  halt=True;blocked.append(str(e));print(str(e),flush=True)
 finally:
  report();save();f.close();(D/'driver.lock').unlink()

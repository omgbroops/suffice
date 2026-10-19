"""Frozen four-arm issue blocks; bounded admission and no automatic model reruns."""
import concurrent.futures,datetime,json,pathlib,subprocess,os,threading,time,math
ROOT=pathlib.Path(__file__).resolve().parents[1]
STATE=ROOT/'.suffice/broad-bench-v1'
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def memory_available():
 return next(int(line.split()[1])*1024 for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))
def invoke(args,name):
 logs=STATE/'driver-logs';logs.mkdir(parents=True,exist_ok=True)
 with (logs/(name+'.log')).open('w',encoding='utf8') as f:
  p=subprocess.run(['node',str(ROOT/'benchmark/broad-runner.mjs'),*args],cwd=ROOT,stdout=f,stderr=subprocess.STDOUT,timeout=1300)
 return p.returncode
def main():
 STATE.mkdir(parents=True,exist_ok=True);lock=STATE/'driver.lock'
 if lock.exists():
  old=json.loads(lock.read_text());pid=old['pid']
  if pathlib.Path('/proc',str(pid)).exists():raise RuntimeError('Live driver exists')
 lock.write_text(json.dumps({'pid':os.getpid(),'at':stamp()}))
 try:
  if invoke(['freeze'],'freeze'):raise RuntimeError('Freeze failed')
  manifest=json.loads((STATE/'manifest.json').read_text());ids=list(manifest['tasks'])
  # Every control finishes successfully before the first paid actor dispatch.
  with concurrent.futures.ThreadPoolExecutor(max_workers=manifest['controlConcurrency']) as pool:
   for id,code in zip(ids,pool.map(lambda id:invoke(['controls',id],'control-'+id),ids)):
    print('control',id,code,flush=True)
    if code:raise RuntimeError('Invalid evaluation controls '+id)
  # Reconcile the entire saved campaign before admitting any new work. Counting
  # completed later blocks lazily can understate spending after interruption.
  existing_results={}
  for job in manifest['jobs']:
   name=job['id']+'-'+job['mode'];path=STATE/'attempts'/name;result_path=path/'result.json'
   if result_path.exists():
    existing=json.loads(result_path.read_text());cost=existing.get('knownCostUsd')
    if existing.get('costUnknown') or existing.get('identity') is not True or not isinstance(cost,(int,float)) or not math.isfinite(cost) or cost<0:raise RuntimeError('Invalid saved accounting/identity preserved '+name)
    existing_results[name]=existing
   elif path.exists():raise RuntimeError('Partial attempt preserved '+name)
  blocked=threading.Event();guard=threading.Lock();spent=[sum(r['knownCostUsd'] for r in existing_results.values())];reserved=[0.0]
  def block(id):
   rows=[]
   for job in [j for j in manifest['jobs'] if j['id']==id]:
    if blocked.is_set():raise RuntimeError('Dispatch stopped after accounting/identity/infrastructure blocker')
    name=id+'-'+job['mode'];path=STATE/'attempts'/name
    if name in existing_results:
     rows.append(existing_results[name]);continue
    if path.exists():blocked.set();raise RuntimeError('Partial attempt preserved '+name)
    admissionStarted=time.monotonic()
    while True:
     if blocked.is_set():raise RuntimeError('Dispatch stopped before memory admission')
     with guard:
      available=memory_available()
      if available>=manifest['minAvailableMemoryBytes']:
       if spent[0]+reserved[0]+manifest['limits']['maxCostUsd']>manifest['maxCampaignCostUsd']:
        blocked.set();raise RuntimeError('Campaign allowance exhausted')
       reserved[0]+=manifest['limits']['maxCostUsd']
       admission={'at':stamp(),'name':name,'availableMemoryBytes':available,'waitSeconds':time.monotonic()-admissionStarted,'reservedCostUsd':reserved[0],'spentCostUsd':spent[0]}
       with (STATE/'admissions.jsonl').open('a',encoding='utf8') as f:f.write(json.dumps(admission)+'\n')
       break
     if time.monotonic()-admissionStarted>900:blocked.set();raise RuntimeError('Memory admission timed out before inference '+name)
     blocked.wait(2)
    code=invoke(['attempt',id,job['mode']],name)
    result=json.loads((path/'result.json').read_text()) if (path/'result.json').exists() else None
    print(name,code,None if result is None else (result['success'],result['totalCostUsd']),flush=True)
    if code or result is None or result['costUnknown'] or not result['identity']:
     blocked.set();raise RuntimeError('Execution/accounting/identity blocker '+name)
    with guard:reserved[0]-=manifest['limits']['maxCostUsd'];spent[0]+=result['knownCostUsd']
    rows.append(result)
   return rows
  rows=[]
  with concurrent.futures.ThreadPoolExecutor(max_workers=manifest['maxConcurrency']) as pool:
   futures=[pool.submit(block,id) for id in ids]
   for f in concurrent.futures.as_completed(futures):rows+=f.result()
  (STATE/'complete.json').write_text(json.dumps({'at':stamp(),'attempts':len(rows),'knownApiEquivalentUsd':sum(r['knownCostUsd'] for r in rows)},indent=2),encoding='utf8')
 finally:lock.unlink(missing_ok=True)
if __name__=='__main__':main()

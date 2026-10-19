"""Bounded Sonion campaign; source is frozen before dispatch, no model retries."""
import concurrent.futures,datetime,json,pathlib,subprocess,os,threading
ROOT=pathlib.Path(__file__).resolve().parents[1]
STATE=ROOT/'.suffice/effort-bench-v1'
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def invoke(args,name):
 logs=STATE/'driver-logs';logs.mkdir(parents=True,exist_ok=True)
 with (logs/(name+'.log')).open('w') as f:
  p=subprocess.run(['node',str(ROOT/'benchmark/effort-runner.mjs'),*args],cwd=ROOT,stdout=f,stderr=subprocess.STDOUT,timeout=1300)
 return p.returncode
def main():
 STATE.mkdir(parents=True,exist_ok=True)
 lock=STATE/'driver.lock'
 if lock.exists():
  old=json.loads(lock.read_text());pid=old['pid']
  if pathlib.Path('/proc',str(pid)).exists():raise RuntimeError('Live driver exists')
 lock.write_text(json.dumps({'pid':os.getpid(),'at':stamp()}))
 try:
  if invoke(['freeze'],'freeze'):raise RuntimeError('Freeze failed')
  manifest=json.loads((STATE/'manifest.json').read_text())
  ids=list(manifest['tasks'])
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
   for id,exitcode in zip(ids,pool.map(lambda id:invoke(['controls',id],'control-'+id),ids)):
    print('control',id,exitcode,flush=True)
    if exitcode:raise RuntimeError('Invalid evaluation controls '+id)
  # Complete each counterbalanced two-arm task block before moving to next repos.
  blocked=threading.Event()
  budget_lock=threading.Lock();spent=[0.0];reserved=[0.0]
  def trio(id):
   results=[]
   for job in [j for j in manifest['jobs'] if j['id']==id]:
    if blocked.is_set():raise RuntimeError('Dispatch stopped after another execution/accounting blocker')
    name=id+'-'+job['mode'];path=STATE/'attempts'/name
    if (path/'result.json').exists():
     existing=json.loads((path/'result.json').read_text())
     if existing['costUnknown']:raise RuntimeError('Unknown-cost attempt preserved '+name)
     with budget_lock:spent[0]+=existing['knownCostUsd']
     results.append(existing);continue
    if path.exists():raise RuntimeError('Partial attempt preserved; manual inspection required '+name)
    with budget_lock:
     if spent[0]+reserved[0]+manifest['limits']['maxCostUsd']>manifest['maxCampaignCostUsd']:
      blocked.set();raise RuntimeError('Campaign allowance exhausted')
     reserved[0]+=manifest['limits']['maxCostUsd']
    code=invoke(['attempt',id,job['mode']],name)
    result=json.loads((path/'result.json').read_text()) if (path/'result.json').exists() else None
    print(name,code,None if not result else (result['success'],result['totalCostUsd']),flush=True)
    if code or result is None or result['costUnknown']:
     blocked.set();raise RuntimeError('Execution/accounting blocker '+name)
    with budget_lock:
     reserved[0]-=manifest['limits']['maxCostUsd'];spent[0]+=result['knownCostUsd']
    results.append(result)
   return results
  all_results=[]
  for start in range(0,len(ids),2):
   with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    for rows in pool.map(trio,ids[start:start+2]):all_results+=rows
  (STATE/'complete.json').write_text(json.dumps({'at':stamp(),'attempts':len(all_results),'knownApiEquivalentUsd':sum(r['knownCostUsd'] for r in all_results)},indent=2))
 finally:lock.unlink(missing_ok=True)
if __name__=='__main__':main()

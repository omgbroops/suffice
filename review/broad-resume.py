"""Recorded continuation policy; frozen actors and existing receipts are immutable."""
import concurrent.futures,datetime,hashlib,importlib.util,json,math,os,pathlib,threading,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('original_driver',ROOT/'benchmark/broad-driver.py')
original=importlib.util.module_from_spec(spec);spec.loader.exec_module(original)
STATE=ROOT/'.suffice/broad-bench-v1'
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf8'))
def invoke(args,name):return original.invoke(args,'continuation-'+name)
def capacity_unknown(path,row):
 if not row.get('costUnknown'):return False
 worker=read(path/'worker/worker.json')
 def capacity(error):return 'overload' in error.lower() or 'at capacity' in error.lower()
 errors=[str(e) for e in worker.get('errors',[])]
 if any(not capacity(e) for e in errors):return False
 seen=any(capacity(e) for e in errors)
 for p in (path/'worker').rglob('*.jsonl'):
  if p.parent.name!='events':continue
  pending=0;successful=0;raw=0
  for line in p.read_text(encoding='utf8').splitlines():
   event=json.loads(line)
   if event.get('type')=='provider_request':pending+=1
   if event.get('type')=='provider_usage':raw+=1
   if event.get('type')!='assistant':continue
   error=str(event.get('error',''))
   if not error:successful+=1;pending-=1;continue
   if capacity(error):seen=True;pending-=1;continue
   zero=all(event.get('usage',{}).get(k,0)==0 for k in ['input','output','cacheRead','cacheWrite'])
   if not (seen and pending==0 and error=='This operation was aborted' and not event.get('responseId') and zero):return False
  if pending!=0 or successful!=raw:return False
 return seen
def charge(row,cap):return max(cap,row['knownCostUsd']) if row['costUnknown'] else row['knownCostUsd']
def valid(row):
 cost=row.get('knownCostUsd')
 return row.get('identity') is True and isinstance(cost,(int,float)) and not isinstance(cost,bool) and math.isfinite(cost) and cost>=0
def main():
 original.ROOT=ROOT;original.STATE=STATE
 lock=STATE/'driver.lock'
 with lock.open('x',encoding='utf8') as f:json.dump({'pid':os.getpid(),'at':stamp(),'policy':'continuation-v1'},f)
 try:
  if invoke(['freeze'],'verify'):raise RuntimeError('Frozen inputs changed')
  manifest=read(STATE/'manifest.json');cap=manifest['limits']['maxCostUsd'];existing={};preserved={}
  for id in manifest['tasks']:
   if read(STATE/'controls'/id/'result.json').get('passed') is not True:raise RuntimeError('Invalid saved control '+id)
  for job in manifest['jobs']:
   name=job['id']+'-'+job['mode'];path=STATE/'attempts'/name
   if (path/'result.json').exists():
    row=read(path/'result.json')
    if not valid(row):raise RuntimeError('Invalid saved identity/cost '+name)
    if row.get('costUnknown') and not capacity_unknown(path,row):raise RuntimeError('Unexplained saved accounting '+name)
    existing[name]=row
    for p in path.rglob('*'):
     if p.is_file() and not p.is_symlink():preserved[str(p.relative_to(STATE))]=digest(p)
   elif path.exists():raise RuntimeError('Partial attempt preserved '+name)
  policy={'version':'continuation-v1','at':stamp(),'authorization':'User: Can u continue orr','manifestSha256':digest(STATE/'manifest.json'),'controllerSha256':digest(pathlib.Path(__file__)),'existingAttempts':list(existing),'preservedReceiptHashes':preserved,'remainingJobs':[j for j in manifest['jobs'] if j['id']+'-'+j['mode'] not in existing],'change':'Permit only capacity/overload-related incomplete billing to remain unknown while dispatching untouched jobs. No reruns. Frozen treatment, grading, limits and scheduling unchanged.','costPolicy':'Unknown totals retain max(nominal attempt allowance, known cost) as an admission reservation, not an actual cost or guaranteed bound. Exact campaign cost remains unavailable.','maxConcurrency':manifest['maxConcurrency']}
  policyPath=STATE/'continuation-v1.json'
  if policyPath.exists():raise RuntimeError('Continuation receipt already exists; inspect before restart')
  policyPath.write_text(json.dumps(policy,indent=2)+'\n',encoding='utf8')
  stop=threading.Event();guard=threading.Lock();spent=[sum(charge(r,cap) for r in existing.values())];reserved=[0.];rows=dict(existing)
  def block(id):
   for job in [j for j in manifest['jobs'] if j['id']==id]:
    name=id+'-'+job['mode'];path=STATE/'attempts'/name
    if name in existing:continue
    start=time.monotonic()
    while True:
     if stop.is_set():return
     with guard:
      available=original.memory_available()
      if available>=manifest['minAvailableMemoryBytes']:
       if spent[0]+reserved[0]+cap>manifest['maxCampaignCostUsd']:stop.set();raise RuntimeError('Admission reservation ceiling exhausted')
       reserved[0]+=cap
       with (STATE/'continuation-admissions.jsonl').open('a',encoding='utf8') as f:f.write(json.dumps({'at':stamp(),'name':name,'availableMemoryBytes':available,'waitSeconds':time.monotonic()-start,'accountedPlusUnknownReservationsUsd':spent[0],'activeReservationsUsd':reserved[0]})+'\n')
       break
     if time.monotonic()-start>900:stop.set();raise RuntimeError('Memory admission timed out '+name)
     stop.wait(2)
    try:
     if path.exists():raise RuntimeError('Attempt directory already exists '+name)
     code=invoke(['attempt',id,job['mode']],name)
     row=read(path/'result.json')
     if not valid(row):raise RuntimeError('Identity/cost failure '+name)
     allowedUnknown=bool(row['costUnknown']) and capacity_unknown(path,row)
     if (row['costUnknown'] and not allowedUnknown) or code not in ([0,2] if allowedUnknown else [0]):raise RuntimeError('Unexplained execution/accounting failure '+name)
     with guard:reserved[0]-=cap;spent[0]+=charge(row,cap);rows[name]=row
     print(json.dumps({'name':name,'accepted':row['accepted'],'success':row['success'],'knownCostUsd':row['knownCostUsd'],'costUnknown':row['costUnknown']}),flush=True)
    except BaseException:stop.set();raise
  with concurrent.futures.ThreadPoolExecutor(max_workers=manifest['maxConcurrency']) as pool:
   for future in concurrent.futures.as_completed([pool.submit(block,id) for id in manifest['tasks']]):future.result()
  if len(rows)!=len(manifest['jobs']):raise RuntimeError('Continuation incomplete')
  if any(digest(STATE/p)!=h for p,h in preserved.items()):raise RuntimeError('Original receipt changed')
  result={'at':stamp(),'attempts':len(rows),'newAttempts':len(rows)-len(existing),'knownApiEquivalentUsd':sum(r['knownCostUsd'] for r in rows.values()),'unknownCosts':sum(bool(r['costUnknown']) for r in rows.values()),'accountedPlusUnknownReservationsUsd':spent[0],'originalReceiptsUnchanged':True,'exactTotalCostAvailable':not any(r['costUnknown'] for r in rows.values())}
  (STATE/'continuation-complete.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8');print(json.dumps(result),flush=True)
 finally:lock.unlink(missing_ok=True)
if __name__=='__main__':main()

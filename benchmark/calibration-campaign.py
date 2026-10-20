"""Finite predeclared 32-attempt calibration; no private feedback to actors."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import time
import tomllib

ROOT=Path('/mnt/c/Users/Eric Qin/Documents/GitHub/suffice')
OLD=Path('/home/eric_qin/suffice-harnesstax-sol61')
STATE=Path('/home/eric_qin/suffice-calibration-v1')
RUNTIME=STATE/'runtime';BASELINE=STATE/'baseline';OUT=ROOT/'reports/calibration-v1'
TASKS=['log-summary-date-ranges','kv-store-grpc','filter-js-from-html','db-wal-recovery']
ARMS=['pi','v1-original','v1-refined','v1-concise','v2-alone','v2-upfront','v2-selective','v2-concise']
BASELINE_COMMIT='526eee4'

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,v):
    p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(v,indent=2)+'\n');tmp.replace(p)
def load(name,p):
    spec=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(spec);sys.modules[name]=m;spec.loader.exec_module(m);return m
def tree_hash(root):
    h=hashlib.sha256();count=0
    for p in sorted(root.rglob('*')):
        if p.is_file():h.update(p.relative_to(root).as_posix().encode()+b'\0'+bytes.fromhex(sha(p)));count+=1
    return {'sha256':h.hexdigest(),'files':count}
def available_mib():return int(re.search(r'MemAvailable:\s+(\d+)',Path('/proc/meminfo').read_text())[1])/1024
def docker(image,argv,mounts=(),timeout=60):
    return subprocess.run(['docker','run','--rm','--memory','2g','--cpus','1',*mounts,'--entrypoint',argv[0],image,*argv[1:]],capture_output=True,text=True,timeout=timeout)

def setup():
    if (STATE/'manifest.json').exists():raise RuntimeError('Already frozen; refusing to restage')
    used=set()
    for folder in [OLD,Path('/home/eric_qin/suffice-refinement-pilot')]:used|={t['id'] for t in json.loads((folder/'manifest.json').read_text())['tasks']}
    assert not set(TASKS)&used
    RUNTIME.mkdir(parents=True);BASELINE.mkdir()
    for folder in ['src','packages/cli/src']:shutil.copytree(ROOT/folder,RUNTIME/folder)
    for name in ['package.json','package-lock.json']:shutil.copy2(ROOT/name,RUNTIME/name)
    shutil.copy2(OLD/'runtime/ca-certificates.crt',RUNTIME/'ca-certificates.crt')
    shutil.copytree(OLD/'runtime/node_modules',RUNTIME/'node_modules',symlinks=True,copy_function=os.link)
    archive=subprocess.check_output(['git','-C',str(ROOT),'archive',BASELINE_COMMIT,'src','packages/cli/src'])
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:tar.extractall(BASELINE,filter='data')
    (BASELINE/'node_modules').mkdir()
    (RUNTIME/'benchmark').mkdir()
    scripts=['harnesstax-agent.py','harnesstax-campaign.py','harnesstax-quota.py','harnesstax-process.mjs','calibration-campaign.py','calibration-arms.mjs']
    for name in scripts:shutil.copy2(ROOT/'benchmark'/name,RUNTIME/'benchmark'/name)
    shutil.copy2(OLD/'runtime/benchmark/harnesstax-native-worker.mjs',RUNTIME/'benchmark/harnesstax-native-worker.mjs')
    worker=(ROOT/'benchmark/harnesstax-worker.mjs').read_text()
    replacements={
      "const r=JSON.parse(input);":"const r=JSON.parse(input);const {CALIBRATION_ARMS}=await import('./calibration-arms.mjs');const calibration=CALIBRATION_ARMS[r.arm];if(!calibration)throw Error('Unknown calibration arm');r.arm=calibration.executionArm;r.execution=calibration.execution;",
      "await import('../src/execution/strategies.mjs')":"await import(calibration.baseline?'/baseline/src/execution/strategies.mjs':'../src/execution/strategies.mjs')"}
    for old,new in replacements.items():assert worker.count(old)==1;worker=worker.replace(old,new)
    (RUNTIME/'benchmark/harnesstax-worker.mjs').write_text(worker)
    (STATE/'public-checks').mkdir();(STATE/'public-data').mkdir()
    shutil.copy2(ROOT/'benchmark/calibration-public-check.py',STATE/'public-checks/calibration-public-check.py')
    # This inspects initial public log data, never task tests or solutions.
    script='''import collections,datetime,hashlib,json,pathlib,re
root=pathlib.Path('/app/logs');today=datetime.date(2025,8,12);counts=collections.Counter();hashes={}
for p in sorted(root.glob('*.log')):
 hashes[p.name]=hashlib.sha256(p.read_bytes()).hexdigest();date=datetime.date.fromisoformat(p.name[:10]);age=(today-date).days
 periods=['total']+(['today'] if age==0 else [])+(['last_7_days'] if 0<=age<7 else [])+(['last_30_days'] if 0<=age<30 else [])+(['month_to_date'] if date.year==today.year and date.month==today.month and date<=today else [])
 for line in p.read_text().split('\\n'):
  m=re.match(r'^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2} \\[(ERROR|WARNING|INFO)\\]',line)
  if m:
   for period in periods:counts[period,m[1]]+=1
print(json.dumps({'inputHashes':hashes,'rows':[[p,s,counts[p,s]] for p in ['today','last_7_days','last_30_days','month_to_date','total'] for s in ['ERROR','WARNING','INFO']]}))'''
    result=docker('alexgshaw/log-summary-date-ranges:20251031',['python3','-c',script]);assert result.returncode==0,result.stderr
    save(STATE/'public-data/logs.json',json.loads(result.stdout))
    tasks=[]
    for name in TASKS:
        folder=OLD/'dataset'/name;cfg=tomllib.loads((folder/'task.toml').read_text())
        tasks.append({'id':name,'instructionSha256':sha(folder/'instruction.md'),'taskSha256':sha(folder/'task.toml'),'timeoutSec':cfg['agent']['timeout_sec'],'environment':cfg['environment'],
          'checks':[{'command':['python3','/public-checks/calibration-public-check.py',name],
              'prerequisites':[{'purpose':'infrastructure','command':['python3','-c','import sys,sqlite3; assert sys.version_info >= (3,10)']}],'timeoutMs':60000}]})
    node='/home/eric_qin/suffice-general-runtime/bin/node'
    policies=json.loads(subprocess.check_output([node,'--input-type=module','-e',"import {CALIBRATION_ARMS} from './benchmark/calibration-arms.mjs';console.log(JSON.stringify(CALIBRATION_ARMS))"],cwd=ROOT,text=True))
    baseline_inputs={p.relative_to(BASELINE).as_posix():sha(p) for p in BASELINE.rglob('*') if p.is_file()}
    inputs={p.relative_to(RUNTIME).as_posix():sha(p) for folder in ['src','packages/cli/src','benchmark'] for p in (RUNTIME/folder).rglob('*') if p.is_file()}
    manifest={'version':'calibration-v1','created':time.time(),'arms':ARMS,'armAliases':{a:p['executionArm'] for a,p in policies.items()},'policies':policies,'tasks':tasks,
      'jobs':[{'task':task['id'],'arm':ARMS[(i+j)%len(ARMS)]} for i,task in enumerate(tasks) for j in range(len(ARMS))],
      'sourceHead':subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD'],text=True).strip(),'baselineCommit':subprocess.check_output(['git','-C',str(ROOT),'rev-parse',BASELINE_COMMIT],text=True).strip(),
      'taskCommit':json.loads((OLD/'manifest.json').read_text())['taskCommit'],'runtimeInputs':inputs,'baselineInputs':baseline_inputs,
      'publicInputs':{p.relative_to(STATE).as_posix():sha(p) for folder in ['public-checks','public-data'] for p in (STATE/folder).rglob('*') if p.is_file()},'dependencies':tree_hash(RUNTIME/'node_modules'),
      'planSha256':sha(ROOT/'benchmark/calibration-plan.md'),'maxResponses':100,'maxCostUsd':5,'maxCalls':240,'concurrency':4,'minAvailableMiB':1536,'admissionSpendStopUsd':10,
      'harbor':'0.24.0','pi':'1.2.0','models':{'sol':['gpt-6.1-sol','high'],'luna':['gpt-6-luna','high'],'advisor':['gpt-6.1-sol','low']}}
    save(STATE/'manifest.json',manifest);save(OUT/'manifest.json',manifest)
    print(json.dumps({'frozen':len(manifest['jobs']),'runtimeFiles':len(inputs),'baselineFiles':len(baseline_inputs),'dependencies':manifest['dependencies']}))

def validate():
    m=json.loads((STATE/'manifest.json').read_text())
    for field,root in [('runtimeInputs',RUNTIME),('baselineInputs',BASELINE),('publicInputs',STATE)]:
        for name,digest in m[field].items():assert sha(root/name)==digest,name
    for task in m['tasks']:
        p=OLD/'dataset'/task['id'];assert sha(p/'instruction.md')==task['instructionSha256'];assert sha(p/'task.toml')==task['taskSha256']
    return m

def base():
    b=load('calibration_base',RUNTIME/'benchmark/harnesstax-campaign.py')
    b.STATE=STATE;b.RUNTIME=RUNTIME;b.DATASET=OLD/'dataset';b.AUTH=OLD/'auth';b.ARMS=ARMS
    original=b.mounts
    b.mounts=lambda receipts=None:original(receipts)+[
      {'type':'bind','source':str(BASELINE),'target':'/baseline','read_only':True},
      {'type':'bind','source':str(RUNTIME/'node_modules'),'target':'/baseline/node_modules','read_only':True},
      {'type':'bind','source':str(STATE/'public-checks'),'target':'/public-checks','read_only':True},
      {'type':'bind','source':str(STATE/'public-data'),'target':'/public-data','read_only':True}]
    return b

async def one(task,arm,install_only=False):
    m=validate();task=next(t for t in m['tasks'] if t['id']==task);assert arm in ARMS
    os.environ['HARNESS_TAX_EXECUTION_CONFIG']=json.dumps({'publicCheck':task['checks'][0]})
    return await base().attempt(task,arm,install_only)

async def preflight():
    m=validate()
    def probe(task):
        image=task['environment']['docker_image'];mounts=['-v',str(STATE/'public-checks')+':/public-checks:ro','-v',str(STATE/'public-data')+':/public-data:ro']
        infra=docker(image,task['checks'][0]['prerequisites'][0]['command'],mounts);assert infra.returncode==0,infra.stderr
        negative=docker(image,task['checks'][0]['command'],mounts);assert negative.returncode==1,(task['id'],negative.stdout,negative.stderr)
        assert json.loads(negative.stdout)['status']=='failed'
        return {'task':task['id'],'infrastructureExit':infra.returncode,'negativeControl':json.loads(negative.stdout)}
    with ThreadPoolExecutor(max_workers=4) as pool:probes=list(pool.map(probe,m['tasks']))
    result=await one(TASKS[0],'v1-original',True);assert not result.exception_info,str(result.exception_info)
    value={'at':time.time(),'inference':False,'simultaneousProbes':4,'checks':probes,'installOnly':'passed'}
    save(STATE/'preflight-ok.json',value);save(OUT/'preflight.json',value);print(json.dumps(value))

async def campaign():
    m=validate();assert (STATE/'preflight-ok.json').exists();assert tree_hash(RUNTIME/'node_modules')==m['dependencies']
    quota=load('calibration_quota',RUNTIME/'benchmark/harnesstax-quota.py');pending=list(m['jobs']);active={};stopped=None;spent=0
    while pending or active:
        for name,(proc,waiter) in list(active.items()):
            if not waiter.done():continue
            del active[name]
            try:
                if proc.returncode:raise RuntimeError('Attempt process exited: '+name)
                base().check_receipt(name)
            except Exception as error:stopped=str(error)
        spent=0
        for result in (STATE/'results').glob('*.json'):
            p=STATE/'trials'/result.stem/'agent/receipts/worker.json'
            if p.exists():spent+=json.loads(p.read_text()).get('usage',{}).get('estimatedApiUsd',0)
        while pending and len(active)<m['concurrency'] and not stopped:
            memory=available_mib()
            if memory<m['minAvailableMiB']:
                if not active:stopped='Insufficient observed host memory for admission'
                break
            job=pending.pop(0);name=job['task']+'-'+job['arm']
            if (STATE/'results'/(name+'.json')).exists():continue
            if (STATE/'trials'/name).exists():stopped='Partial attempt requires audit: '+name;break
            if (STATE/'STOP').exists():stopped='STOP file';break
            if spent>=m['admissionSpendStopUsd']:stopped='Campaign admission spend stop';break
            try:q=await asyncio.to_thread(quota.read_quota)
            except Exception as error:stopped='Quota unavailable: '+str(error);break
            save(STATE/'quota-latest.json',q)
            with (STATE/'quota.jsonl').open('a') as log:log.write(json.dumps(q)+'\n')
            if q['remainingPercent']<=40:stopped='Quota at or below 40%';break
            proc=await asyncio.create_subprocess_exec(sys.executable,__file__,'one',job['task'],job['arm'])
            active[name]=(proc,asyncio.create_task(proc.wait()))
            print(json.dumps({'admitted':name,'active':len(active),'availableMiB':memory,'knownSpendUsd':spent,'at':time.time()}),flush=True)
        if stopped and not active:break
        if active:await asyncio.wait([waiter for proc,waiter in active.values()],return_when=asyncio.FIRST_COMPLETED)
        elif not pending:break
    if stopped:save(STATE/'controller-error.json',{'at':time.time(),'error':stopped});raise RuntimeError(stopped)
    save(STATE/'campaign-complete.json',{'at':time.time(),'completed':len(m['jobs'])})

async def main():
    mode=sys.argv[1]
    if mode=='setup':setup()
    elif mode=='validate':print(json.dumps({'jobs':len(validate()['jobs'])}))
    elif mode=='preflight':await preflight()
    elif mode=='one':await one(sys.argv[2],sys.argv[3])
    elif mode=='run':await campaign()
    else:raise ValueError('setup | validate | preflight | one | run')
if __name__=='__main__':asyncio.run(main())

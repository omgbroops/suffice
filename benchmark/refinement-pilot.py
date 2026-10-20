"""Frozen five-task pilot. Reuses Harbor plumbing, never prior attempt directories."""
import asyncio
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import tomllib

ROOT=Path('/mnt/c/Users/Eric Qin/Documents/GitHub/suffice')
OLD=Path('/home/eric_qin/suffice-harnesstax-sol61')
STATE=Path('/home/eric_qin/suffice-refinement-pilot')
RUNTIME=STATE/'runtime'
OUT=ROOT/'reports/refinement-pilot-v1'
TASKS=['cancel-async-tasks','cobol-modernization','custom-memory-heap-crash','modernize-scientific-stack','polyglot-c-py']
ARMS=['pi','v1','v2','v3']

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def save(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(value,indent=2)+'\n');temp.replace(path)
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec)
    sys.modules[name]=module;spec.loader.exec_module(module);return module
def tree_hash(root):
    digest=hashlib.sha256();count=0
    for p in sorted(root.rglob('*')):
        if p.is_file():digest.update(str(p.relative_to(root)).encode()+b'\0'+bytes.fromhex(sha(p)));count+=1
    return {'sha256':digest.hexdigest(),'files':count}

def setup():
    if (STATE/'manifest.json').exists():raise RuntimeError('Pilot already frozen')
    old=json.loads((OLD/'manifest.json').read_text())
    assert not set(TASKS)&{t['id'] for t in old['tasks']}
    RUNTIME.mkdir(parents=True)
    for folder in ['src','packages/cli/src']:shutil.copytree(ROOT/folder,RUNTIME/folder)
    for name in ['package.json','package-lock.json']:shutil.copy2(ROOT/name,RUNTIME/name)
    shutil.copy2(OLD/'runtime/ca-certificates.crt',RUNTIME/'ca-certificates.crt')
    # Immutable pinned dependencies, with independent directory entries. No npm install.
    shutil.copytree(OLD/'runtime/node_modules',RUNTIME/'node_modules',symlinks=True,copy_function=os.link)
    scripts=['harnesstax-worker.mjs','harnesstax-agent.py','harnesstax-campaign.py','harnesstax-quota.py',
             'harnesstax-process.mjs','refinement-pilot.py']
    (RUNTIME/'benchmark').mkdir()
    for name in scripts:shutil.copy2(ROOT/'benchmark'/name,RUNTIME/'benchmark'/name)
    shutil.copy2(OLD/'runtime/benchmark/harnesstax-native-worker.mjs',RUNTIME/'benchmark/harnesstax-native-worker.mjs')
    (STATE/'public-checks').mkdir()
    shutil.copy2(ROOT/'benchmark/refinement-public-check.py',STATE/'public-checks/refinement-public-check.py')
    tasks=[]
    for name in TASKS:
        task=OLD/'dataset'/name;cfg=tomllib.loads((task/'task.toml').read_text())
        shutil.copytree(task/'environment',STATE/'public-fixtures'/name)
        # Do not expose the Dockerfile to actors through this extra fixture mount.
        (STATE/'public-fixtures'/name/'Dockerfile').unlink(missing_ok=True)
        tasks.append({'id':name,'instructionSha256':sha(task/'instruction.md'),'taskSha256':sha(task/'task.toml'),
            'timeoutSec':cfg['agent']['timeout_sec'],'environment':cfg['environment'],
            'checks':[{'command':['python3','/public-checks/refinement-public-check.py',name],'timeoutMs':60000}]})
    inputs={str(p.relative_to(RUNTIME)):sha(p) for folder in ['src','packages/cli/src','benchmark']
            for p in (RUNTIME/folder).rglob('*') if p.is_file()}
    manifest={'version':'refinement-pilot-v1','created':time.time(),'arms':ARMS,'tasks':tasks,
        'jobs':[{'task':t['id'],'arm':ARMS[(i+j)%4]} for i,t in enumerate(tasks) for j in range(4)],
        'sourceHead':subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD'],text=True).strip(),
        'taskCommit':old['taskCommit'],'runtimeInputs':inputs,'dependencies':tree_hash(RUNTIME/'node_modules'),
        'publicInputs':{str(p.relative_to(STATE)):sha(p) for folder in ['public-checks','public-fixtures'] for p in (STATE/folder).rglob('*') if p.is_file()},
        'maxResponses':100,'maxCostUsd':5,'maxCalls':240,'concurrency':2,
        'models':{'pi':['gpt-6.1-sol','high'],'v1':['gpt-6.1-sol','high'],'v2':['gpt-6-luna','high'],'advisor':['gpt-6.1-sol','low'],'v3':['gpt-6.1-sol','high'],'delegate':['gpt-6-luna','high']},
        'harbor':'0.24.0','pi':'1.2.0','planSha256':sha(ROOT/'benchmark/refinement-plan.md'),
        'checksProvenance':'Public instruction and initial environment files only; no hidden tests or solutions; same self-check visible to every arm.'}
    save(STATE/'manifest.json',manifest);save(OUT/'manifest.json',manifest)
    print(json.dumps({'frozen':len(manifest['jobs']),'dependencies':manifest['dependencies']}))

def validate():
    m=json.loads((STATE/'manifest.json').read_text())
    for name,digest in m['runtimeInputs'].items():assert sha(RUNTIME/name)==digest, name
    for name,digest in m['publicInputs'].items():assert sha(STATE/name)==digest, name
    for t in m['tasks']:
        p=OLD/'dataset'/t['id'];assert sha(p/'instruction.md')==t['instructionSha256'];assert sha(p/'task.toml')==t['taskSha256']
    return m

def base():
    b=load('pilot_base',RUNTIME/'benchmark/harnesstax-campaign.py')
    b.STATE=STATE;b.RUNTIME=RUNTIME;b.DATASET=OLD/'dataset';b.AUTH=OLD/'auth';b.ARMS=ARMS
    original=b.mounts
    b.mounts=lambda receipts=None:original(receipts)+[
        {'type':'bind','source':str(STATE/'public-checks'),'target':'/public-checks','read_only':True},
        {'type':'bind','source':str(STATE/'public-fixtures'),'target':'/public-fixtures','read_only':True}]
    return b

def preflight():
    m=validate();receipts=[]
    for t in m['tasks']:
        name=t['id'];image=t['environment']['docker_image']
        subprocess.run(['docker','pull',image],check=True,stdout=subprocess.DEVNULL)
        tools={'cancel-async-tasks':['python3'],'cobol-modernization':['python3','cobc'],
            'custom-memory-heap-crash':['python3','g++','valgrind'],
            'modernize-scientific-stack':['python3'],'polyglot-c-py':['python3','gcc']}[name]
        mounts=['-v',str(STATE/'public-checks')+':/public-checks:ro','-v',str(STATE/'public-fixtures')+':/public-fixtures:ro']
        probe=subprocess.run(['docker','run','--rm','--memory','2g','--cpus','1',*mounts,'--entrypoint','sh',image,
            '-c',' && '.join('command -v '+tool for tool in tools)],capture_output=True,text=True,timeout=60)
        assert probe.returncode==0,(name,probe.stderr)
        negative=subprocess.run(['docker','run','--rm','--memory','2g','--cpus','1',*mounts,'--entrypoint','python3',image,
            '/public-checks/refinement-public-check.py',name],capture_output=True,text=True,timeout=90)
        assert negative.returncode==1,(name,negative.stdout,negative.stderr)
        result=json.loads(negative.stdout.splitlines()[-1]);assert result['status']=='failed'
        receipts.append({'task':name,'infrastructure':probe.stdout,'negativeControl':result})
    save(STATE/'preflight-checks.json',{'at':time.time(),'inference':False,'checks':receipts})
    print(json.dumps({'preflight':'passed','negativeControls':len(receipts),'inference':False}))

async def one(task,arm,install_only=False):
    m=validate();t=next(t for t in m['tasks'] if t['id']==task)
    assert arm in ARMS
    execution={'executionScope':'isolated-task','features':{'repairs':True}}
    if arm=='v2':execution['features'].update({'advice':'upfront'})
    os.environ['HARNESS_TAX_EXECUTION_CONFIG']=json.dumps({'execution':execution,'publicCheck':t['checks'][0]})
    return await base().attempt(t,arm,install_only)

async def campaign():
    m=validate()
    assert (STATE/'preflight-ok.json').exists()
    assert tree_hash(RUNTIME/'node_modules')==m['dependencies'],'Dependencies changed'
    quota=load('pilot_quota',RUNTIME/'benchmark/harnesstax-quota.py')
    pending=list(m['jobs']);active={};stopped=None
    while pending or active:
        for name,(proc,waiter) in list(active.items()):
            if not waiter.done():continue
            del active[name]
            if proc.returncode:stopped='Attempt process exited: '+name
            elif not (STATE/'results'/(name+'.json')).exists():stopped='Missing result: '+name
            else:
                try:base().check_receipt(name)
                except Exception as error:stopped=str(error)
        while pending and len(active)<2 and not stopped:
            job=pending.pop(0);name=job['task']+'-'+job['arm']
            if (STATE/'results'/(name+'.json')).exists():continue
            if (STATE/'trials'/name).exists():stopped='Partial attempt requires audit: '+name;break
            if (STATE/'STOP').exists():stopped='STOP file';break
            try:q=await asyncio.to_thread(quota.read_quota)
            except Exception as error:stopped='Quota unavailable: '+str(error);break
            save(STATE/'quota-latest.json',q)
            with (STATE/'quota.jsonl').open('a') as log:log.write(json.dumps(q)+'\n')
            if q['remainingPercent']<=40:stopped='Quota at or below 40%';break
            proc=await asyncio.create_subprocess_exec(sys.executable,__file__,'one',job['task'],job['arm'])
            active[name]=(proc,asyncio.create_task(proc.wait()));print(json.dumps({'admitted':name,'active':len(active),'at':time.time()}),flush=True)
        if stopped and not active:break
        if active:await asyncio.wait([waiter for proc,waiter in active.values()],return_when=asyncio.FIRST_COMPLETED)
        elif not pending:break
    if stopped:save(STATE/'controller-error.json',{'at':time.time(),'error':stopped});raise RuntimeError(stopped)
    save(STATE/'campaign-complete.json',{'at':time.time(),'completed':20})

async def main():
    mode=sys.argv[1]
    if mode=='setup':setup()
    elif mode=='validate':print(json.dumps({'jobs':len(validate()['jobs'])}))
    elif mode=='preflight':
        preflight();result=await one(TASKS[0],'v1',True)
        if result.exception_info:raise RuntimeError(str(result.exception_info))
        value=json.loads((STATE/'preflight-checks.json').read_text());value['runtimeInstallOnly']='passed'
        save(STATE/'preflight-ok.json',value);save(OUT/'preflight.json',value)
    elif mode=='one':await one(sys.argv[2],sys.argv[3])
    elif mode=='run':await campaign()
    else:raise ValueError('setup | validate | preflight | one | run')
if __name__=='__main__':asyncio.run(main())

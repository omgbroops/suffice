"""Finite authorized 5x2 diagnostic, queued behind the JS/TS pilot and replacements."""
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
PRIOR=Path('/home/eric_qin/suffice-post-review-v1')
STATE=Path('/home/eric_qin/suffice-post-review-diagnostic-v1')
OLD=Path('/home/eric_qin/suffice-harnesstax-sol61')
OUT=ROOT/'reports/post-review-diagnostic-v1'
TASKS=['query-optimize','gcode-to-text','path-tracing','regex-log','configure-git-webserver']

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,v):
    p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(v,indent=2)+'\n');tmp.replace(p)
def load():
    spec=importlib.util.spec_from_file_location('diagnostic_base',STATE/'controller.py')
    c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
    c.STATE=STATE;c.OUT=OUT;c.validate=validate
    return c
def validate():
    m=json.loads((STATE/'manifest.json').read_text())
    for name,digest in m['files'].items():assert sha(STATE/name)==digest,name
    for row in m['tasks']:
        assert subprocess.check_output(['docker','image','inspect',row['imageTag'],'--format','{{.Id}}'],text=True).strip()==row['imageId']
    return m

def queue():
    assert not STATE.exists(),'Already queued; no overwrite'
    STATE.mkdir();OUT.mkdir(parents=True,exist_ok=True)
    shutil.copy2(Path(__file__),STATE/'diagnostic.py')
    shutil.copy2(Path(__file__).with_name('campaign.py'),STATE/'controller.py')
    shutil.copy2(Path(__file__).with_name('diagnostic-check.py'),STATE/'public-check.py')
    old=json.loads((ROOT/'reports/harnesstax-sol61-v1/results.json').read_text())
    runtime_files=json.loads((PRIOR/'manifest.json').read_text())['files']
    runtime_files={k:v for k,v in runtime_files.items() if k.startswith('runtime/')}
    (STATE/'runtime').symlink_to(PRIOR/'runtime',target_is_directory=True)
    tasks=[]
    for i,name in enumerate(TASKS):
        source=OLD/'dataset'/name;cfg=tomllib.loads((source/'task.toml').read_text())
        history={arm:next(r for r in old['attempts'] if r['task']==name and r['arm']==arm)['accepted'] for arm in ['pi','v2']}
        expected={'pi':True,'v2':False} if i<3 else {'pi':i==3,'v2':i==3}
        assert history==expected,(name,history)
        target=STATE/'tasks'/name
        for folder in ['environment','public']:(target/folder).mkdir(parents=True,exist_ok=True)
        shutil.copy2(source/'instruction.md',target/'instruction.md')
        shutil.copy2(source/'task.toml',target/'original-task.toml')
        # Harbor alone injects the original verifier after actors stop. Do not
        # inspect or mount tests/solutions as actor context.
        (target/'tests').symlink_to(source/'tests',target_is_directory=True)
        shutil.copy2(STATE/'public-check.py',target/'public/check.py')
        tasks.append({'id':name,'baseImage':cfg['environment']['docker_image'],'historicalAcceptance':history,
            'baseImageId':subprocess.check_output(['docker','image','inspect',cfg['environment']['docker_image'],'--format','{{.Id}}'],text=True).strip(),
            'instructionSha256':sha(target/'instruction.md'),'originalTaskSha256':sha(target/'original-task.toml'),
            'timeoutSec':1800,'checks':[{'command':['python3','/public-checks/check.py',name],'timeoutMs':150000}]})
    plan={'createdAt':time.time(),'tasks':tasks,'jobs':[{'task':t,'arm':['alone','review'][(i+j)%2]} for i,t in enumerate(TASKS) for j in range(2)],
        'runtimeFiles':runtime_files,'limits':{'maxCostUsd':1,'maxResponses':100,'maxToolCalls':240,'agentTimeoutSec':1800,'concurrency':2,'admissionStopUsd':10,'weeklyRemainingFloor':40},
        'historicalPi':'Reference only; different budgets/settings, not a new controlled Pi comparison',
        'selection':'Outcome-stratified diagnostic on previously analyzed tasks, not held-out evidence',
        'models':{'worker':['gpt-6-luna','high'],'reviewer':['gpt-6.1-sol','low']}}
    save(STATE/'queue-plan.json',plan);save(OUT/'queue-plan.json',plan)
    save(STATE/'status.json',{'state':'queued','pending':10,'after':'JS/TS pilot and its two replacements','at':time.time()})
    print(json.dumps({'queued':10,'state':str(STATE)}))

def prepare():
    assert not (STATE/'manifest.json').exists()
    plan=json.loads((STATE/'queue-plan.json').read_text());rows=[]
    for row in plan['tasks']:
        name=row['id'];target=STATE/'tasks'/name
        assert sha(target/'instruction.md')==row['instructionSha256']
        assert sha(target/'original-task.toml')==row['originalTaskSha256']
        base_id=subprocess.check_output(['docker','image','inspect',row['baseImage'],'--format','{{.Id}}'],text=True).strip()
        assert base_id==row['baseImageId'],'Initial image changed since queue freeze'
        # Same clean Git baseline for both arms, required by the experimental
        # patch reviewer. Generated binaries are explicitly outside review scope.
        dockerfile=target/'baseline.Dockerfile'
        dockerfile.write_text('FROM '+row['baseImage']+'\nWORKDIR /app\nRUN command -v git >/dev/null || (apt-get update && apt-get install -y git)\nRUN command -v python3 >/dev/null || (apt-get update && apt-get install -y python3)\nRUN test ! -e .git && git init && git config user.name Baseline && git config user.email baseline@example.invalid && printf "*.ppm\\n*.sqlite\\n*.sqlite-*\\nimage\\n__pycache__/\\n" >> .git/info/exclude && git add -A && git commit --allow-empty -m baseline && test -z "$(git status --porcelain)"\n')
        tag='suffice-review-diagnostic:'+name
        with open(STATE/(name+'-build.log'),'w') as log:
            subprocess.run(['docker','build','-t',tag,'-f',str(dockerfile),str(target)],stdout=log,stderr=subprocess.STDOUT,check=True,timeout=600)
        image_id=subprocess.check_output(['docker','image','inspect',tag,'--format','{{.Id}}'],text=True).strip()
        cfg=(target/'original-task.toml').read_text()
        import re
        cfg=re.sub(r'docker_image\s*=\s*"[^"]+"','docker_image = "'+tag+'"',cfg)
        (target/'task.toml').write_text(cfg)
        (target/'environment/Dockerfile').write_text('FROM '+tag+'\nWORKDIR /app\n')
        probe=subprocess.run(['docker','run','--rm','--network','none','--entrypoint','sh',tag,'-c','test -z "$(git status --porcelain)" && git rev-parse HEAD && command -v python3'],capture_output=True,text=True,check=True,timeout=30)
        rows.append({**row,'baseImageId':base_id,'imageTag':tag,'imageId':image_id,'baselinePreflight':probe.stdout})
    files=dict(plan['runtimeFiles'])
    for p in (STATE/'tasks').glob('**/*'):
        if p.is_file() and not p.is_symlink() and 'tests' not in p.relative_to(STATE).parts:files[str(p.relative_to(STATE))]=sha(p)
    for name in ['controller.py','diagnostic.py','public-check.py','queue-plan.json']:files[name]=sha(STATE/name)
    manifest={**plan,'tasks':rows,'files':files,'preparedAt':time.time()}
    save(STATE/'manifest.json',manifest);save(OUT/'manifest.json',manifest)

def report():
    c=load();m=json.loads((STATE/'queue-plan.json').read_text());rows=[]
    for job in m['jobs']:
        row=c.read_attempt(job,job['task']+'-'+job['arm'])
        if row:rows.append(row)
    summary=[]
    for arm in ['alone','review']:
        group=[r for r in rows if r['arm']==arm];accepted=sum(r['accepted'] for r in group);cost=sum(r['knownCostUsd'] for r in group)
        summary.append({'arm':arm,'finished':len(group),'accepted':accepted,'knownCostUsd':cost,'unknownCosts':sum(r['costUnknown'] for r in group),'knownCostPerAccepted':cost/accepted if accepted else None})
    result={'asOf':time.time(),'complete':len(rows)==10,'attempts':rows,'summary':summary}
    save(OUT/'results.json',result)
    text='# Previously analyzed task diagnostic\n\nHistorical Pi is reference only. No replacements or outcome retries. All review/repair costs count; unknown amounts remain floors.\n\n| Arm | Finished | Accepted | Known USD | Unknown costs |\n| --- | ---: | ---: | ---: | ---: |\n'
    for r in summary:text+=f"| {r['arm']} | {r['finished']}/5 | {r['accepted']} | {r['knownCostUsd']:.6f} | {r['unknownCosts']} |\n"
    (OUT/'RESULTS.md').write_text(text)
    return result

async def run():
    # This is a finite dependency queue, not a recurring monitor.
    for filename in ['status.json','replacement-status.json']:
        while True:
            p=PRIOR/filename;status=json.loads(p.read_text()) if p.exists() else {}
            if status.get('state')=='complete':break
            if status.get('state')=='stopped':raise RuntimeError('Preceding campaign needs review: '+filename)
            await asyncio.sleep(10)
    save(STATE/'status.json',{'state':'preparing','at':time.time()})
    await asyncio.to_thread(prepare)
    c=load();m=validate()
    await c.one(TASKS[0],'alone',install_only=True)
    quota=c.load('diagnostic_quota',ROOT/'benchmark/harnesstax-quota.py')
    pending=list(m['jobs']);active={};stop=None
    try:
        while pending or active:
            for name,proc in list(active.items()):
                if proc.returncode is None:continue
                del active[name];data=report();row=next((r for r in data['attempts'] if r['trialName']==name),None)
                if proc.returncode or not row or row['costUnknown'] or row['exceptionType'] or row['status'] in ('provider_error','operational_failure'):stop='Operational review required: '+name
            while pending and not stop and len(active)<2:
                data=report();q=await asyncio.to_thread(quota.read_quota)
                if q['remainingPercent']<=40 or sum(r['knownCostUsd'] for r in data['attempts'])>=10:stop='Quota/spend stop';break
                available=int(next(l.split()[1] for l in Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:')))/1024
                if available<1536:break
                job=pending.pop(0);name=job['task']+'-'+job['arm']
                proc=await asyncio.create_subprocess_exec(sys.executable,str(STATE/'diagnostic.py'),'one',job['task'],job['arm']);active[name]=proc;asyncio.create_task(proc.wait())
                print(json.dumps({'admitted':name,'weeklyRemaining':q['remainingPercent']}),flush=True)
            if stop and not active:break
            if pending and not active and not stop:raise RuntimeError('Insufficient memory')
            save(STATE/'status.json',{'state':'running' if not stop else 'draining','active':list(active),'pending':len(pending),'stop':stop,'at':time.time()})
            if active:await asyncio.sleep(3)
        result=report();save(STATE/'status.json',{'state':'complete' if result['complete'] else 'stopped','stop':stop,'at':time.time()})
    finally:await asyncio.gather(*(p.wait() for p in active.values()),return_exceptions=True)

if __name__=='__main__':
    if sys.argv[1]=='queue':queue()
    elif sys.argv[1]=='one':asyncio.run(load().one(*sys.argv[2:4]))
    elif sys.argv[1]=='report':print(json.dumps(report()['summary']))
    elif sys.argv[1]=='run':
        try:asyncio.run(run())
        except Exception as error:
            save(STATE/'status.json',{'state':'stopped','error':str(error),'at':time.time()});raise
    else:raise ValueError('queue | run | one | report')

"""Pinned, sequential, one-shot Terminal-Bench campaign. Run in Sonion WSL.

setup performs no inference. preflight validates one container without inference.
run admits each frozen job once; existing or partial jobs are never overwritten.
"""
import argparse
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

ROOT = Path('/mnt/c/Users/Eric Qin/Documents/GitHub/suffice')
STATE = Path('/home/eric_qin/suffice-harnesstax-sol61')
DATASET = STATE/'dataset'
RUNTIME = STATE/'runtime'
AUTH = STATE/'auth'
ARMS = ['codex','pi','v1','v2']
TASK_COMMIT = '69671fbaac6d67a7ef0dfec016cc38a64ef7a77c'


def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def save(p, value):
    p.parent.mkdir(parents=True, exist_ok=True)
    temp = p.with_suffix(p.suffix+'.tmp')
    temp.write_text(json.dumps(value,indent=2)+'\n')
    temp.replace(p)


def public_checks():
    # Literal commands or output requirements from instruction.md only.
    # These are incomplete smoke checks, not correctness certificates.
    return {
      'build-cython-ext':[{'command':['python','-c',
        'import numpy; assert numpy.__version__ == "2.3.0"; from pyknotid.spacecurves import chelpers,ccomplexity; from pyknotid import cinvariants; import pyknotid.make as mk; import pyknotid.spacecurves as sp; k=sp.Knot(mk.three_twist(num_points=100)); print(k.alexander_polynomial(-1))'], 'timeoutMs':60000}],
      'code-from-image':[{'command':['python3','-c',
        'from pathlib import Path; assert Path("/app/output.txt").read_text().strip().startswith("bee26a")'], 'timeoutMs':10000}],
      'adaptive-rejection-sampler':[{'command':['Rscript','-e',
        'source("/app/ars.R"); stopifnot(is.function(ars),is.function(test)); test()'], 'timeoutMs':30000}],
    }


def setup():
    if (STATE/'manifest.json').exists():
        raise RuntimeError('Manifest already frozen; refusing to restage runtime')
    commit=subprocess.check_output(['git','-C',str(DATASET),'rev-parse','HEAD'],text=True).strip()
    assert commit==TASK_COMMIT
    effects=json.loads((ROOT/'.suffice/harnesstax-sol61/sources/effects.json').read_text())
    row=next(x for x in effects['harness']['rows'] if x['model']=='sol' and x['harness']=='codex')
    ids=[x['task'] for x in row['rate']['breakdown']]
    assert len(ids)==len(set(ids))==30
    RUNTIME.mkdir(exist_ok=True)
    for name in ['src','packages/cli/src']:
        shutil.copytree(ROOT/name,RUNTIME/name,dirs_exist_ok=True)
    for name in ['package.json','package-lock.json']:
        shutil.copy2(ROOT/name,RUNTIME/name)
    shutil.copy2('/etc/ssl/certs/ca-certificates.crt',RUNTIME/'ca-certificates.crt')
    shutil.copytree('/home/eric_qin/suffice-general-runtime/app/node_modules',RUNTIME/'node_modules',symlinks=True,dirs_exist_ok=True)
    for name in ['harnesstax-worker.mjs','harnesstax-agent.py','harnesstax-campaign.py','harnesstax-quota.py']:
        (RUNTIME/'benchmark').mkdir(exist_ok=True)
        shutil.copy2(ROOT/'benchmark'/name,RUNTIME/'benchmark'/name)
    native=(ROOT/'benchmark/broad-native-worker.mjs').read_text()
    native=native.replace("authPath:'/runtime/.suffice/pi/auth.json'", "authPath:'/agent-home/pi/auth.json'")
    (RUNTIME/'benchmark/harnesstax-native-worker.mjs').write_text(native)
    AUTH.mkdir(mode=0o700,exist_ok=True)
    for source,name in [('/home/eric_qin/suffice-field-v1/.suffice/pi/auth.json','pi.json'),
                        ('/home/eric_qin/suffice-field-v1/.suffice/codex-native-home/auth.json','codex.json')]:
        dest=AUTH/name
        if not dest.exists(): shutil.copy2(source,dest)
        dest.chmod(0o600)
    inputs={}
    for folder in ['src','packages/cli/src','benchmark']:
        for p in (RUNTIME/folder).rglob('*'):
            if p.is_file(): inputs[str(p.relative_to(RUNTIME))]=digest(p)
    tasks=[]
    for name in ids:
        p=DATASET/name
        cfg=tomllib.loads((p/'task.toml').read_text())
        tasks.append({'id':name,'instructionSha256':digest(p/'instruction.md'),
          'taskSha256':digest(p/'task.toml'),'timeoutSec':cfg['agent']['timeout_sec'],
          'environment':cfg['environment'],'checks':public_checks().get(name,[])})
    jobs=[{'task':task['id'],'arm':ARMS[(i+j)%4]} for i,task in enumerate(tasks) for j in range(4)]
    manifest={'version':'harnesstax-sol61-v1','created':time.time(),'tasks':tasks,'jobs':jobs,
      'taskCommit':commit,'sourceHead':subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD'],text=True).strip(),
      'runtimeInputs':inputs,'maxResponses':100,'maxCostUsd':5,'maxCalls':240,'concurrency':1,
      'harbor':'0.24.0','pi':'1.2.0','codex':'0.163.0',
      'historicalCohort':'terminal-bench-v2-common-n30-turncap100-20260906',
      'checksProvenance':'Explicit public instructions only, smoke coverage on 3/30; no hidden verifier feedback.'}
    save(STATE/'manifest.json',manifest)
    save(ROOT/'reports/harnesstax-sol61-v1/manifest.json',manifest)
    lock=subprocess.check_output([str(STATE/'setup/uv-x86_64-unknown-linux-gnu/uv'),'pip','freeze','--python',sys.executable],text=True)
    (ROOT/'reports/harnesstax-sol61-v1/harbor-requirements.txt').write_text(lock)
    print(json.dumps({'frozen':len(jobs),'publicCheckTasks':3}))


def validate():
    m=json.loads((STATE/'manifest.json').read_text())
    for name,h in m['runtimeInputs'].items():
        assert digest(RUNTIME/name)==h, 'Frozen runtime changed: '+name
    for t in m['tasks']:
        p=DATASET/t['id']
        assert digest(p/'instruction.md')==t['instructionSha256']
        assert digest(p/'task.toml')==t['taskSha256']
    return m


def mounts():
    pairs=[(RUNTIME,'/runtime',True),
      (Path('/home/eric_qin/suffice-general-runtime/bin'),'/runtime-bin',True),
      (Path('/home/eric_qin/suffice-codex-runtime-0163'),'/codexruntime',True),
      (AUTH,'/agent-auth',False)]
    return [dict(type='bind',source=str(s),target=d,**({'read_only':True} if ro else {})) for s,d,ro in pairs]


async def attempt(task, arm, preflight=False):
    from harbor.models.trial.config import TrialConfig,TaskConfig,AgentConfig,EnvironmentConfig,VerifierConfig
    from harbor.trial.trial import Trial
    # Hyphenated source filename is loaded under a normal module identity.
    spec=importlib.util.spec_from_file_location('suffice_harnesstax_agent',RUNTIME/'benchmark/harnesstax-agent.py')
    module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
    name=('preflight-' if preflight else '')+task['id']+'-'+arm
    trials=STATE/('preflight' if preflight else 'trials')
    if (trials/name).exists(): raise RuntimeError('Attempt already exists or is partial: '+name)
    os.environ['HARNESS_TAX_ARM']=arm
    os.environ['HARNESS_TAX_TIMEOUT']=str(int(task['timeoutSec']))
    os.environ['HARNESS_TAX_PUBLIC_CHECKS']=json.dumps(task['checks'])
    cfg=TrialConfig(task=TaskConfig(path=DATASET/task['id']),trial_name=name,trials_dir=trials,
      install_only=preflight,agent=AgentConfig(import_path='suffice_harnesstax_agent:HarnessTaxAgent',
        model_name='openai/'+('gpt-6-luna' if arm=='v2' else 'gpt-6.1-sol'),override_setup_timeout_sec=120),
      environment=EnvironmentConfig(type='docker',delete=True,mounts=mounts()),
      verifier=VerifierConfig())
    trial=await Trial.create(cfg)
    result=await trial.run()
    save(STATE/('preflight-results' if preflight else 'results')/(name+'.json'),result.model_dump(mode='json'))
    print(json.dumps({'attempt':name,'exception':str(result.exception_info) if result.exception_info else None,
                     'reward':result.verifier_result.model_dump(mode='json') if result.verifier_result else None}),flush=True)
    return result


async def campaign():
    m=validate()
    if not (STATE/'preflight-ok.json').exists(): raise RuntimeError('Successful no-inference preflight required')
    tasks={t['id']:t for t in m['tasks']}
    for job in m['jobs']:
        name=job['task']+'-'+job['arm']
        result=STATE/'results'/(name+'.json')
        if result.exists(): continue
        if (STATE/'STOP').exists(): print('STOP requested',flush=True);return
        quota_spec=importlib.util.spec_from_file_location('suffice_harnesstax_quota',RUNTIME/'benchmark/harnesstax-quota.py')
        quota_module=importlib.util.module_from_spec(quota_spec);quota_spec.loader.exec_module(quota_module)
        # Fail closed if current quota cannot be read. Never redeem a reset or
        # silently continue into purchased credits after a usage stop.
        quota=await asyncio.to_thread(quota_module.read_quota)
        completed=len(list((STATE/'results').glob('*.json')))
        save(STATE/'quota-latest.json',quota)
        with (STATE/'quota.jsonl').open('a') as log: log.write(json.dumps(quota)+'\n')
        if quota['remainingPercent']<=0 or (quota['remainingPercent']<=40 and completed<100):
            save(STATE/'paused-for-quota.json',{'at':time.time(),'completed':completed,'quota':quota,
              'reason':'User requested pause at 40% remaining unless at least 100/120 complete.'})
            print(json.dumps({'pausedForQuota':True,'completed':completed,'remaining':quota['remainingPercent']}),flush=True)
            return
        try:
            await attempt(tasks[job['task']],job['arm'])
        except Exception as error:
            save(STATE/'controller-error.json',{'job':job,'error':str(error),'at':time.time()})
            raise
        # Auth/capacity/ledger failures should stop admission, not turn the
        # remaining tasks into predictable provider failures.
        receipt=STATE/'trials'/name/'agent/receipts/worker.json'
        if receipt.exists():
            value=json.loads(receipt.read_text())
            if value.get('status') in ['provider_error','operational_failure','cost_unknown'] or value.get('usage',{}).get('costUnknown') or value.get('usageCostUnknown'):
                raise RuntimeError('Inspect operational failure before admitting another attempt: '+name)
        else:
            raise RuntimeError('Missing worker receipt; inspect before admitting another attempt: '+name)


async def main():
    mode=sys.argv[1]
    if mode=='setup': setup()
    elif mode=='validate': print(json.dumps({'jobs':len(validate()['jobs'])}))
    elif mode=='preflight':
        m=validate();r=await attempt(m['tasks'][0],'v1',True)
        if r.exception_info: raise RuntimeError(str(r.exception_info))
        save(STATE/'preflight-ok.json',{'at':time.time(),'inference':False})
    elif mode=='run': await campaign()
    else: raise ValueError('setup | validate | preflight | run')


if __name__=='__main__': asyncio.run(main())

"""Finite 18-attempt reviewed pilot; no outcome retries or hidden feedback to actors."""
import asyncio
from datetime import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
ROOT=Path('/mnt/c/Users/Eric Qin/Documents/GitHub/suffice')
STATE=Path('/home/eric_qin/suffice-post-review-v1')
OUT=ROOT/'reports/post-review-v1/campaign'
def save(p,v):
    p.parent.mkdir(parents=True,exist_ok=True);temp=p.with_suffix('.tmp');temp.write_text(json.dumps(v,indent=2)+'\n');temp.replace(p)
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);sys.modules[name]=module;spec.loader.exec_module(module);return module
def validate():
    m=json.loads((STATE/'manifest.json').read_text())
    for name,digest in m['files'].items():assert hashlib.sha256((STATE/name).read_bytes()).hexdigest()==digest,name
    for row in m['tasks']:
        image=subprocess.check_output(['docker','image','inspect','--format','{{.Id}}','suffice-post-review:'+row['id']],text=True).strip()
        assert image==row['imageId'],row['id']
    return m

def amendment():
    path=STATE/'timeout-amendment.json'
    return json.loads(path.read_text()) if path.exists() else None

def partial_worker(receipt):
    """Recover a lower bound from assistant receipts, never infer a complete bill."""
    stages=[];usage={k:0 for k in ['input','cacheRead','cacheWrite','output','estimatedApiUsd','modelCalls','toolCalls']}
    paths=list(receipt.glob('*/state/events/*.jsonl'))
    if (receipt/'events.live.jsonl').exists():paths.append(receipt/'events.live.jsonl')
    for path in paths:
        events=[]
        for line in path.read_text().splitlines():
            try:events.append(json.loads(line))
            except json.JSONDecodeError:pass # An interrupted final record is not a zero-cost response.
        assistants=[e for e in events if e.get('type')=='assistant']
        stage_usage={k:0 for k in usage}
        for e in assistants:
            value=e.get('usage') or {}
            for key in ['input','cacheRead','cacheWrite','output']:stage_usage[key]+=value.get(key,0)
            stage_usage['estimatedApiUsd']+=(value.get('cost') or {}).get('total',0) or 0
        stage_usage['modelCalls']=len(assistants)
        stage_usage['toolCalls']=sum(e.get('type')=='tool_call' for e in events)
        label=path.parts[-4] if path.name!='events.live.jsonl' else 'pi'
        stages.append({'label':label,'usage':stage_usage,'partial':True,'eventPath':str(path.relative_to(receipt))})
        for key in usage:usage[key]+=stage_usage[key]
    usage['costUnknown']=True
    review_path=receipt/'post-review/stage.json'
    review=json.loads(review_path.read_text()) if review_path.exists() else None
    return {'status':'interrupted','usage':usage,'stages':stages,'review':review,
        'reviewCalls':sum(s['usage']['modelCalls'] for s in stages if s['label']=='post-review'),
        'repairs':int((receipt/'review-repair').exists()),'accountingSource':'partial-assistant-ledger'}

async def one(id,arm,install_only=False):
    from harbor.models.trial.config import TrialConfig,TaskConfig,AgentConfig,EnvironmentConfig,VerifierConfig
    from harbor.trial.trial import Trial
    m=validate();assert {'task':id,'arm':arm} in m['jobs']
    row=next(r for r in m['tasks'] if r['id']==id)
    change=amendment();timeout=change['agentTimeoutSec'] if change else row['timeoutSec']
    load('suffice_harnesstax_agent',STATE/'runtime/benchmark/harnesstax-agent.py')
    name=('preflight-' if install_only else '')+id+'-'+arm
    trials=STATE/('runtime-preflight' if install_only else 'trials');assert not (trials/name).exists(),'Partial/existing trial requires review'
    receipt=trials/name/'agent/receipts'
    mounts=[dict(type='bind',source=str(source),target=target,**({'read_only':True} if readonly else {})) for source,target,readonly in [
        (STATE/'runtime','/runtime',True),(STATE.parent/'suffice-general-runtime/bin','/runtime-bin',True),
        (STATE.parent/'suffice-codex-runtime-0163','/codexruntime',True),
        (STATE.parent/'suffice-harnesstax-sol61/auth','/agent-auth',False),(receipt,'/receipts',False),
        (STATE/'tasks'/id/'public','/public-checks',True)]]
    os.environ.update(HARNESS_TAX_ARM=arm,HARNESS_TAX_TIMEOUT=str(timeout),HARNESS_TAX_PUBLIC_CHECKS=json.dumps(row['checks']),
        HARNESS_TAX_EXECUTION_CONFIG=json.dumps({'publicCheck':row['checks'][0]}))
    cfg=TrialConfig(task=TaskConfig(path=STATE/'tasks'/id),trial_name=name,trials_dir=trials,install_only=install_only,
        agent=AgentConfig(import_path='suffice_harnesstax_agent:HarnessTaxAgent',model_name='openai/'+('gpt-6.1-sol' if arm=='pi' else 'gpt-6-luna'),override_timeout_sec=timeout,override_setup_timeout_sec=120),
        environment=EnvironmentConfig(type='docker',delete=True,mounts=mounts),verifier=VerifierConfig())
    trial=await Trial.create(cfg)
    receipt.mkdir(parents=True,exist_ok=True)
    result=await trial.run()
    save(STATE/('runtime-preflight-results' if install_only else 'results')/(name+'.json'),result.model_dump(mode='json'))
    print(json.dumps({'completed':name,'installOnly':install_only,'reward':result.verifier_result.model_dump(mode='json') if result.verifier_result else None,
        'exceptionType':result.exception_info.exception_type if result.exception_info else None}),flush=True)
    if install_only:assert not result.exception_info,'No-inference runtime preflight failed'

def report():
    m=json.loads((STATE/'manifest.json').read_text());attempts=[]
    for job in m['jobs']:
        name=job['task']+'-'+job['arm'];path=STATE/'results'/(name+'.json')
        if not path.exists():continue
        r=json.loads(path.read_text());wp=STATE/'trials'/name/'agent/receipts/worker.json'
        w=json.loads(wp.read_text()) if wp.exists() else partial_worker(wp.parent);v=(r.get('verifier_result') or {}).get('rewards')
        usage=w.get('usage',{});unknown=not wp.exists() or usage.get('costUnknown',True)
        phase=r.get('agent_execution') or {};latency=w.get('latencyMs')
        if latency is None and phase.get('finished_at') and phase.get('started_at'):
            latency=(datetime.fromisoformat(phase['finished_at'])-datetime.fromisoformat(phase['started_at'])).total_seconds()*1000
        exception=(r.get('exception_info') or {}).get('exception_type')
        attempts.append({**job,'accepted':bool(v and v.get('reward')==1),'graded':v is not None,
            'status':w.get('status'),'exceptionType':exception,
            'knownCostUsd':usage.get('estimatedApiUsd',0),'costUnknown':unknown,'usage':usage,'latencyMs':latency,
            'agentTimeoutSec':r['config']['agent'].get('override_timeout_sec') or 600,
            'accountingSource':w.get('accountingSource','worker-aggregate'),
            'review':w.get('review'),'reviewCalls':w.get('reviewCalls',0),'repairs':w.get('repairs',0),'stages':w.get('stages',[]),
            'policyValid':not exception and w.get('budgetEligible',w.get('status')=='completed') and not unknown and usage.get('estimatedApiUsd',0)<=1})
    summary=[]
    for arm in ['alone','review','pi']:
        rows=[a for a in attempts if a['arm']==arm];cost=sum(a['knownCostUsd'] for a in rows);accepted=sum(a['accepted'] for a in rows)
        timed=[a['latencyMs']/1000 for a in rows if a.get('latencyMs') is not None]
        summary.append({'arm':arm,'completed':len(rows),'accepted':accepted,'policyValidSuccesses':sum(a['accepted'] and a['policyValid'] for a in rows),
            'meanAgentSeconds':sum(timed)/len(timed) if timed else None,'ungraded':sum(not a['graded'] for a in rows),'knownCostUsd':cost,
            'knownUsdPerAccepted':cost/accepted if accepted else None,'unknownCosts':sum(a['costUnknown'] for a in rows)})
    result={'asOf':time.time(),'complete':len(attempts)==18,'timeoutAmendment':amendment(),'attempts':attempts,'summary':summary}
    save(OUT/'results.json',result)
    text='# Post-review JS/TS pilot\n\nIssue-contract acceptance; API-equivalent cost estimates. All attempts/stages count. Unknown costs remain floors.\n\n'
    text+='Accepted patches include interrupted attempts; policy-valid successes require clean completion and complete accounting.\n\n'
    if amendment():text+='User-authorized timeout amendment: remaining attempts use 1,800 seconds. The first three retain 600 seconds. Report those cohorts separately; no old attempt was replaced.\n\n'
    text+='| Arm | Finished | Patch accepted | Policy-valid successes | Known USD | USD / accepted | Unknown costs |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n'
    for r in summary:
        prefix='at least ' if r['unknownCosts'] else ''
        per=prefix+f"{r['knownUsdPerAccepted']:.6f}" if r['knownUsdPerAccepted'] is not None else 'undefined'
        text+=f"| {r['arm']} | {r['completed']}/6 | {r['accepted']} | {r['policyValidSuccesses']} | {prefix}{r['knownCostUsd']:.6f} | {per} | {r['unknownCosts']} |\n"
    (OUT/'RESULTS.md').write_text(text)
    return result

async def run(resume=False):
    m=validate();assert list((STATE/'runtime-preflight-results').glob('*.json')),'No runtime preflight receipt'
    quota=load('post_review_quota',ROOT/'benchmark/harnesstax-quota.py')
    if resume:
        change=amendment();assert change and change['agentTimeoutSec']==1800,'Explicit timeout amendment required'
        done=[j['task']+'-'+j['arm'] for j in m['jobs'] if (STATE/'results'/(j['task']+'-'+j['arm']+'.json')).exists()]
        assert set(done)==set(change['preservedCompletedAttempts']),'Completed attempt set changed'
        assert json.loads((STATE/'status.json').read_text())['state']=='stopped','Campaign must be stopped'
    else:done=[]
    pending=[j for j in m['jobs'] if j['task']+'-'+j['arm'] not in done];active={};stopped=None
    try:
        while pending or active:
            for name,proc in list(active.items()):
                if proc.returncode is None:continue
                del active[name];data=report();row=next((a for a in data['attempts'] if a['task']+'-'+a['arm']==name),None)
                if proc.returncode or not row or row['costUnknown'] or row['status'] in ('provider_error','cost_unknown','operational_failure'):
                    stopped='Operational/unknown-cost review required: '+name
            while pending and not stopped and len(active)<2:
                data=report()
                if sum(a['knownCostUsd'] for a in data['attempts'])>=10:stopped='Spend admission stop';break
                q=await asyncio.to_thread(quota.read_quota);save(STATE/'quota-latest.json',q)
                if q['remainingPercent']<=40:stopped='Weekly quota floor';break
                available=int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')))/1024
                if available<1536:break
                job=pending.pop(0);name=job['task']+'-'+job['arm']
                assert not (STATE/'trials'/name).exists(),'Existing trial; no implicit resume'
                proc=await asyncio.create_subprocess_exec(sys.executable,__file__,'one',job['task'],job['arm']);active[name]=proc
                asyncio.create_task(proc.wait())
                print(json.dumps({'admitted':name,'weeklyRemaining':q['remainingPercent'],'active':len(active)}),flush=True)
            if stopped and not active:break
            if pending and not active and not stopped:raise RuntimeError('Insufficient available memory for admission')
            save(STATE/'status.json',{'state':'running' if not stopped else 'draining','active':list(active),'pending':len(pending),'stop':stopped,'at':time.time()})
            await asyncio.sleep(3)
        data=report();save(STATE/'status.json',{'state':'complete' if data['complete'] else 'stopped','stop':stopped,'completed':len(data['attempts']),'at':time.time()})
    except Exception as error:
        # Active children retain receipts and finish; no replacement is launched.
        await asyncio.gather(*(p.wait() for p in active.values()),return_exceptions=True)
        report();save(STATE/'status.json',{'state':'stopped','error':str(error),'at':time.time()});raise

if __name__=='__main__':
    if sys.argv[1]=='one':asyncio.run(one(*sys.argv[2:4]))
    elif sys.argv[1]=='preflight':asyncio.run(one('queue-aborted','alone',True))
    elif sys.argv[1]=='report':print(json.dumps(report()['summary']))
    elif sys.argv[1]=='run':asyncio.run(run())
    elif sys.argv[1]=='resume':asyncio.run(run(True))
    else:raise ValueError('one | preflight | report | run')

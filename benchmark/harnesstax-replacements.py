"""Six user-authorized infrastructure replacements, then resume original queue.

No grade-based selection, no automatic model retries. Originals remain immutable.
Run in WSL only after the original controller has drained its admitted work.
"""
import asyncio
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import time

BASE=Path('/home/eric_qin/suffice-harnesstax-sol61')
PLAN=BASE/'replacement-plan.json'


def load_campaign():
    spec=importlib.util.spec_from_file_location('original_campaign',BASE/'runtime/benchmark/harnesstax-campaign.py')
    campaign=importlib.util.module_from_spec(spec);spec.loader.exec_module(campaign)
    manifest=campaign.validate()
    return campaign,manifest


def validate_plan(plan):
    allowed={(task,arm) for task in ['merge-diff-arc-agi-task','multi-source-data-merger','nginx-request-logging'] for arm in ['v1','v2']}
    assert len(plan['replacements'])==6
    assert {(j['task'],j['arm']) for j in plan['replacements']}==allowed
    assert hashlib.sha256(Path(__file__).read_bytes()).hexdigest()==plan['runnerSha256']
    for job in plan['replacements']:
        path=BASE/'results'/(job['task']+'-'+job['arm']+'.json')
        assert hashlib.sha256(path.read_bytes()).hexdigest()==job['originalResultSha256']
        result=json.loads(path.read_text())
        assert not result.get('verifier_result')
        assert (result.get('exception_info') or {}).get('exception_type')=='PermissionError'


async def run():
    plan=json.loads(PLAN.read_text());validate_plan(plan)
    campaign,manifest=load_campaign()
    tasks={t['id']:t for t in manifest['tasks']}
    campaign.STATE=BASE/'replacements/receipt-permissions-r1'
    campaign.STATE.mkdir(parents=True,exist_ok=True)
    quota_spec=importlib.util.spec_from_file_location('quota',BASE/'runtime/benchmark/harnesstax-quota.py')
    quota=importlib.util.module_from_spec(quota_spec);quota_spec.loader.exec_module(quota)
    active={};failure=None
    async def reap():
        nonlocal failure
        for name,(waiter,memory) in list(active.items()):
            if not waiter.done():continue
            code=waiter.result();del active[name]
            try:
                if code:raise RuntimeError('Replacement subprocess failed: '+name)
                campaign.check_receipt(name)
            except Exception as error:failure=str(error)
    for job in plan['replacements']:
        name=job['task']+'-'+job['arm']
        if (campaign.STATE/'results'/(name+'.json')).exists():continue
        memory=campaign.memory_gib(tasks[job['task']])
        while active and (len(active)>=2 or memory>2 or sum(v[1] for v in active.values())+memory>4):
            await asyncio.wait([v[0] for v in active.values()],return_when=asyncio.FIRST_COMPLETED)
            await reap()
        await reap()
        if failure or (BASE/'STOP').exists():break
        try:
            current=await asyncio.to_thread(quota.read_quota)
        except Exception as error:
            failure='Quota read failed: '+str(error);break
        campaign.save(BASE/'quota-latest.json',current)
        with (BASE/'quota.jsonl').open('a') as log:log.write(json.dumps(current)+'\n')
        completed=len(list((BASE/'results').glob('*.json')))-6+len(list((campaign.STATE/'results').glob('*.json')))
        if current['remainingPercent']<=0 or (current['remainingPercent']<=40 and completed<100):
            campaign.save(BASE/'paused-for-quota.json',{'at':time.time(),'completed':completed,'quota':current,
                'reason':'User quota floor while running the six authorized infrastructure replacements.'})
            failure='Paused for user quota floor';break
        proc=await asyncio.create_subprocess_exec(sys.executable,__file__,'one',job['task'],job['arm'])
        active[name]=(asyncio.create_task(proc.wait()),memory)
        print(json.dumps({'replacementAdmitted':name,'active':len(active)}),flush=True)
    if active:await asyncio.gather(*(v[0] for v in active.values()));await reap()
    if failure:
        campaign.save(BASE/'replacement-controller-error.json',{'at':time.time(),'error':failure})
        raise RuntimeError(failure)
    if (BASE/'STOP').exists():return
    if len(list((campaign.STATE/'results').glob('*.json')))!=6:raise RuntimeError('Replacement queue incomplete')
    # Finish untouched original jobs. Existing result files are skipped, never retried.
    os.execv(sys.executable,[sys.executable,str(BASE/'runtime/benchmark/harnesstax-campaign.py'),'run'])


async def main():
    plan=json.loads(PLAN.read_text());validate_plan(plan)
    if sys.argv[1]=='one':
        task,arm=sys.argv[2:4]
        assert any(j['task']==task and j['arm']==arm for j in plan['replacements'])
        campaign,manifest=load_campaign()
        campaign.STATE=BASE/'replacements/receipt-permissions-r1'
        await campaign.attempt(next(t for t in manifest['tasks'] if t['id']==task),arm)
    else:await run()


if __name__=='__main__':asyncio.run(main())

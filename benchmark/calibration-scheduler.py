"""Adopt running trials and separate coding admission from grading container occupancy."""
import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import time

STATE = Path('/home/eric_qin/suffice-calibration-v1')
ROOT = Path('/mnt/c/Users/Eric Qin/Documents/GitHub/suffice')


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def worker(name):
    try:return json.loads((STATE/'trials'/name/'agent/receipts/worker.json').read_text())
    except (FileNotFoundError, json.JSONDecodeError, PermissionError):return None


async def run():
    frozen = load('scheduler_frozen', STATE/'runtime/benchmark/calibration-campaign.py')
    manifest = frozen.validate()
    plan = json.loads((STATE/'scheduler-amendment.json').read_text())
    assert frozen.sha(STATE/'manifest.json') == plan['manifestSha256']
    for name, digest in plan['controllerInputs'].items():assert frozen.sha(ROOT/'benchmark'/name) == digest
    assert plan['maxModels'] == 2 and plan['maxContainers'] == 4
    slots = load('scheduler_slots', ROOT/'benchmark/calibration-slots.py')
    quota = frozen.load('scheduler_quota', STATE/'runtime/benchmark/harnesstax-quota.py')
    token = plan['handoffToken']
    assert (STATE/'STOP').read_text() == token, 'Previous controller must have its admission stop installed'
    active = {name:None for name in plan['adoptedTrials']}
    jobs = [j for j in manifest['jobs'] if j['task']+'-'+j['arm'] not in active]
    pending = [j for j in jobs if not (STATE/'results'/(j['task']+'-'+j['arm']+'.json')).exists()]
    for job in pending:
        assert not (STATE/'trials'/(job['task']+'-'+job['arm'])).exists(), 'Unexpected partial trial'
    stopped = None
    print(json.dumps({'schedulerHandoff':plan['adoptedTrials'],'pending':len(pending),'maxModels':2,'maxContainers':4}),flush=True)
    try:
        while pending or active:
            for name, proc in list(active.items()):
                result = STATE/'results'/(name+'.json')
                if not result.exists():
                    if proc is not None and proc.returncode is not None:stopped = 'Attempt exited without a result: '+name
                    continue
                if proc is not None:
                    code = await proc.wait()
                    if code:stopped = 'Attempt process failed: '+name
                del active[name]
                try:frozen.base().check_receipt(name)
                except Exception as error:stopped = str(error)
                # A grader timeout is retained as ungraded. It is not fed into models.
            usage = slots.admission([worker(name) for name in active])
            if usage['needsReview']:stopped = 'Interrupted or unaccounted actor needs review before admission'
            if not (STATE/'STOP').exists() or (STATE/'STOP').read_text() != token:
                stopped = 'Admission stop changed; requires review'
            while pending and not stopped and usage['canAdmit']:
                memory = frozen.available_mib()
                if memory < manifest['minAvailableMiB']:break
                spent = sum((worker(p.name) or {}).get('usage',{}).get('estimatedApiUsd',0)
                            for p in (STATE/'trials').iterdir() if p.is_dir())
                if spent >= manifest['admissionSpendStopUsd']:stopped = 'Campaign spend admission stop';break
                try:q = await asyncio.to_thread(quota.read_quota)
                except Exception as error:stopped = 'Quota unavailable: '+str(error);break
                frozen.save(STATE/'quota-latest.json',q)
                with (STATE/'quota.jsonl').open('a') as log:log.write(json.dumps(q)+'\n')
                if q['remainingPercent'] <= 40:stopped = 'Quota at or below 40%';break
                job = pending.pop(0);name = job['task']+'-'+job['arm']
                assert not (STATE/'trials'/name).exists() and not (STATE/'results'/(name+'.json')).exists()
                proc = await asyncio.create_subprocess_exec(sys.executable,str(STATE/'runtime/benchmark/calibration-campaign.py'),'one',job['task'],job['arm'])
                active[name] = proc
                print(json.dumps({'admitted':name,'scheduler':'separate-model-grading-slots','modelSlotsBefore':usage['models'],'containersBefore':usage['containers'],'availableMiB':memory,'knownSpendUsd':spent,'at':time.time()}),flush=True)
                usage = slots.admission([worker(name) for name in active])
            frozen.save(STATE/'scheduler-status.json',{'at':time.time(),'active':list(active),'pending':len(pending),'admission':usage,'stopped':stopped})
            if stopped and not active:break
            if active:await asyncio.sleep(3)
            elif pending:raise RuntimeError('No active trial and admission unavailable')
        if stopped:raise RuntimeError(stopped)
        assert all((STATE/'results'/(j['task']+'-'+j['arm']+'.json')).exists() for j in manifest['jobs'])
        frozen.save(STATE/'campaign-complete.json',{'at':time.time(),'completed':len(manifest['jobs']),'schedulerAmendment':True})
        if (STATE/'STOP').exists() and (STATE/'STOP').read_text() == token:(STATE/'STOP').unlink()
    except Exception as error:
        frozen.save(STATE/'scheduler-error.json',{'at':time.time(),'error':str(error)})
        raise


if __name__ == '__main__':asyncio.run(run())

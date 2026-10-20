"""Exactly two user-authorized fresh attempts; frozen actors, no retry-until-pass."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import sys
import time

STATE = Path('/home/eric_qin/suffice-calibration-v1')
ROOT = Path('/mnt/c/Users/Eric Qin/Documents/GitHub/suffice')
TARGETS = {('kv-store-grpc', 'v1-refined'), ('filter-js-from-html', 'v1-refined')}


def frozen():
    spec = importlib.util.spec_from_file_location('frozen_calibration', STATE/'runtime/benchmark/calibration-campaign.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate():
    module = frozen()
    manifest = module.validate()
    plan = json.loads((STATE/'replacement-plan.json').read_text())
    assert {(j['task'], j['arm']) for j in plan['replacements']} == TARGETS
    assert len(plan['replacements']) == 2 and plan['attemptsPerReplacement'] == 1
    assert plan['directory'] == 'replacements/provider-interruptions-r1'
    assert module.sha(STATE/'manifest.json') == plan['manifestSha256']
    assert module.sha(Path(__file__)) == plan['runnerSha256']
    for job in plan['replacements']:
        name = job['task']+'-'+job['arm']
        assert module.sha(STATE/'trials'/name/'agent/receipts/worker.json') == job['originalWorkerSha256']
        assert module.sha(STATE/'results'/(name+'.json')) == job['originalTrialSha256']
    return module, manifest, plan, STATE/plan['directory']


async def one(task, arm):
    module, manifest, plan, destination = validate()
    assert (task, arm) in TARGETS
    config = next(t for t in manifest['tasks'] if t['id'] == task)
    os.environ['HARNESS_TAX_EXECUTION_CONFIG'] = json.dumps({'publicCheck':config['checks'][0]})
    base = module.base()
    base.STATE = destination
    await base.attempt(config, arm)


async def run():
    module, manifest, plan, destination = validate()
    # No overlap with the original two-way controller or its remaining actors.
    assert (STATE/'campaign-complete.json').exists(), 'Original campaign stopped; review before replacement admission'
    assert all((STATE/'results'/(j['task']+'-'+j['arm']+'.json')).exists() for j in manifest['jobs'])
    quota = module.load('replacement_quota', STATE/'runtime/benchmark/harnesstax-quota.py')
    destination.mkdir(parents=True, exist_ok=True)
    module.save(destination/'plan.json', plan)
    try:
        for job in plan['replacements']:
            name = job['task']+'-'+job['arm']
            if (destination/'results'/(name+'.json')).exists():
                continue
            assert not (destination/'trials'/name).exists(), 'Partial replacement needs review: '+name
            assert not (STATE/'STOP').exists(), 'Campaign STOP file'
            assert module.available_mib() >= manifest['minAvailableMiB'], 'Insufficient memory for admission'
            spent = 0
            for base in [STATE, destination]:
                for result in (base/'results').glob('*.json'):
                    receipt = base/'trials'/result.stem/'agent/receipts/worker.json'
                    if receipt.exists():spent += json.loads(receipt.read_text()).get('usage',{}).get('estimatedApiUsd',0)
            assert spent < manifest['admissionSpendStopUsd'], 'Campaign spend admission stop'
            q = await asyncio.to_thread(quota.read_quota)
            module.save(destination/'quota-latest.json', q)
            assert q['remainingPercent'] > 40, 'Weekly quota floor reached'
            print(json.dumps({'admittedReplacement':name,'active':1,'knownCampaignSpendFloorUsd':spent,'at':time.time()}),flush=True)
            proc = await asyncio.create_subprocess_exec(sys.executable,__file__,'one',job['task'],job['arm'])
            assert await proc.wait() == 0, 'Replacement process failed: '+name
            base = module.base()
            base.STATE = destination
            base.check_receipt(name)
            result = json.loads((destination/'results'/(name+'.json')).read_text())
            assert not result.get('exception_info'), 'Replacement grading interrupted; review before continuing'
        module.save(destination/'campaign-complete.json',{'at':time.time(),'completed':2,'replacementOutcomesSelectedRegardlessOfGrade':True})
    except Exception as error:
        module.save(destination/'controller-error.json',{'at':time.time(),'error':str(error)})
        raise


if __name__ == '__main__':
    if sys.argv[1] == 'validate':
        _, _, plan, _ = validate()
        print(json.dumps({'validated':len(plan['replacements']),'inference':False}))
    elif sys.argv[1] == 'one':asyncio.run(one(*sys.argv[2:4]))
    elif sys.argv[1] == 'run':asyncio.run(run())
    else:raise ValueError('validate | one | run')

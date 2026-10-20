"""Take ownership of the remaining HTML replay without restarting live grades."""
import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import time


async def main():
    source = Path(__file__).with_name('calibration-regrade.py')
    spec = importlib.util.spec_from_file_location('regrade_parallel_worker', source)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    plan = json.loads((module.DEST/'plan.json').read_text())
    assert module.sha(source) == plan['runnerSha256']
    # Separate process: the replay adapter's artifact environment variable cannot
    # race with the already running upfront adapter.
    arm = 'v2-selective'
    assert (module.DEST/'trials/filter-js-from-html-v2-upfront').exists()
    assert not (module.DEST/('trials/filter-js-from-html-'+arm)).exists()
    module.ARMS = (arm,)
    original_save = module.save

    def save(path, value):
        if path == module.DEST/'status.json':
            path = module.DEST/'status-selective.json'
        original_save(path, value)

    module.save = save
    original_save(module.DEST/'concurrency-amendment.json', {
        'at':time.time(), 'userAuthorized':True, 'remainingGradesConcurrent':True,
        'inference':False, 'availableMemoryMiBAtAdmission':5755,
        'limitsAndArtifactsUnchanged':True,
        'ownership':'Existing controller retains upfront; this process owns selective. '
                    'Existing controller may stop at its partial-trial guard when it reaches selective; '
                    'that is an admission handoff, not a grading failure.'})
    await module.run()
    while not all((module.DEST/'results'/('filter-js-from-html-'+a+'.json')).exists()
                  for a in ('v2-alone','v2-upfront','v2-selective')):
        await asyncio.sleep(10)
    original_save(module.DEST/'status.json', {'state':'complete', 'at':time.time(),
                                             'inference':False, 'concurrencyAmendment':True})


if __name__ == '__main__':asyncio.run(main())

"""Audited admission-only amendment. Never retries or alters a completed actor."""
import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import time

STATE=Path('/home/eric_qin/suffice-calibration-v1')

async def main():
    assert (STATE/'controller-error.json').exists(),'Original controller must have stopped'
    amendment=json.loads((STATE/'admission-amendment.json').read_text())
    assert amendment['concurrency']==2 and amendment['replaceCompletedAttempts'] is False
    spec=importlib.util.spec_from_file_location('frozen_calibration',STATE/'runtime/benchmark/calibration-campaign.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    original=module.validate
    def validate():return {**original(),'concurrency':amendment['concurrency']}
    module.validate=validate
    print(json.dumps({'resumedUntouchedJobs':True,'concurrency':2,'at':time.time()}),flush=True)
    await module.campaign()
if __name__=='__main__':asyncio.run(main())

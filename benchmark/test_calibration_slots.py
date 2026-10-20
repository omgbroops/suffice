import importlib.util
import asyncio
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('slots',Path(__file__).with_name('calibration-slots.py'))
slots=importlib.util.module_from_spec(spec);spec.loader.exec_module(slots)
DONE={'status':'completed','usage':{'estimatedApiUsd':.01,'costUnknown':False}}


class SlotTests(unittest.TestCase):
    def test_grading_releases_model_slot(self):
        self.assertTrue(slots.admission([None,DONE])['canAdmit'])
        self.assertEqual(slots.admission([None,DONE])['models'],1)

    def test_two_live_models_block_admission(self):
        self.assertFalse(slots.admission([None,None])['canAdmit'])

    def test_container_cap_applies_even_when_models_finished(self):
        self.assertFalse(slots.admission([DONE]*4)['canAdmit'])

    def test_unknown_usage_stops_admission(self):
        self.assertTrue(slots.admission([{'status':'cost_unknown','usage':{}}])['needsReview'])
        self.assertFalse(slots.admission([{'status':'completed','usage':{}}])['canAdmit'])

    def test_handoff_adopts_existing_grader_without_restarting_it(self):
        spec=importlib.util.spec_from_file_location('scheduler',Path(__file__).with_name('calibration-scheduler.py'))
        scheduler=importlib.util.module_from_spec(spec);spec.loader.exec_module(scheduler)
        with tempfile.TemporaryDirectory() as folder:
            state=Path(folder);scheduler.STATE=state;scheduler.ROOT=state
            def save(path,value):
                path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value))
            save(state/'trials/a-x/agent/receipts/worker.json',DONE)
            (state/'STOP').write_text('owned-handoff')
            save(state/'scheduler-amendment.json',{'manifestSha256':'pin','controllerInputs':{},'maxModels':2,'maxContainers':4,'handoffToken':'owned-handoff','adoptedTrials':['a-x']})
            manifest={'jobs':[{'task':name,'arm':'x'} for name in ['a','b','c']],'minAvailableMiB':1536,'admissionSpendStopUsd':10}
            frozen=SimpleNamespace(validate=lambda:manifest,sha=lambda p:'pin',available_mib=lambda:4096,save=save,
                base=lambda:SimpleNamespace(check_receipt=lambda name:None),load=lambda *args:SimpleNamespace(read_quota=lambda:{'remainingPercent':95}))
            scheduler.load=lambda name,path:frozen if name=='scheduler_frozen' else slots
            launched=[];original_sleep=asyncio.sleep
            async def scenario():
                async def finish(name):
                    await original_sleep(.02);save(state/'results'/(name+'.json'),{})
                async def spawn(*args):
                    name=args[-2]+'-'+args[-1];launched.append(name)
                    save(state/'trials'/name/'agent/receipts/worker.json',DONE)
                    task=asyncio.create_task(finish(name))
                    async def wait():await task;return 0
                    return SimpleNamespace(returncode=None,wait=wait)
                async def tick(_):await original_sleep(.01)
                adopted=asyncio.create_task(finish('a-x'))
                with patch.object(scheduler.asyncio,'create_subprocess_exec',spawn),patch.object(scheduler.asyncio,'sleep',tick):
                    await scheduler.run()
                await adopted
            asyncio.run(scenario())
            self.assertEqual(launched,['b-x','c-x'])
            self.assertTrue((state/'campaign-complete.json').exists())
            self.assertFalse((state/'STOP').exists())


if __name__=='__main__':unittest.main()

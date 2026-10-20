"""Admission tests with fake subprocesses and quota; no inference or Docker."""
import asyncio
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('campaign',Path(__file__).with_name('harnesstax-campaign.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)


class SchedulerTests(unittest.IsolatedAsyncioTestCase):
    async def run_schedule(self,memories,quotas,completed=0):
        with tempfile.TemporaryDirectory() as folder:
            state=Path(folder);(state/'results').mkdir();(state/'preflight-ok.json').write_text('{}')
            for i in range(completed): (state/'results'/('completed-'+str(i)+'.json')).write_text('{}')
            runtime=state/'runtime/benchmark';runtime.mkdir(parents=True)
            (state/'test-quota.json').write_text(json.dumps(quotas))
            (runtime/'harnesstax-quota.py').write_text(
                'import json\nfrom pathlib import Path\np=Path('+repr(str(state/'test-quota.json'))+')\n'
                'def read_quota():\n values=json.loads(p.read_text()); value=values.pop(0); p.write_text(json.dumps(values)); return {"remainingPercent":value}\n')
            tasks=[{'id':str(i),'environment':{'memory':m}} for i,m in enumerate(memories)]
            manifest={'concurrency':2,'tasks':tasks,'jobs':[{'task':t['id'],'arm':'v1'} for t in tasks]}
            active=[];peaks=[];admitted=[]
            async def spawn(*args):
                name=args[-2]+'-v1';mem=c.memory_gib(tasks[int(args[-2])]);active.append(mem)
                peaks.append((len(active),sum(active)));admitted.append(name)
                class Process:
                    async def wait(self):
                        await asyncio.sleep(.02)
                        active.remove(mem);(state/'results'/(name+'.json')).write_text('{}')
                        return 0
                return Process()
            with patch.object(c,'STATE',state),patch.object(c,'RUNTIME',state/'runtime'),patch.object(c,'validate',return_value=manifest),patch.object(c,'check_receipt'),patch.object(c.asyncio,'create_subprocess_exec',side_effect=spawn):
                await c.campaign()
            return admitted,peaks,(state/'paused-for-quota.json').exists()

    async def test_two_small_tasks_overlap(self):
        names,peaks,paused=await self.run_schedule(['2G']*4,[53]*4)
        self.assertEqual(len(names),4);self.assertIn((2,4),peaks);self.assertFalse(paused)

    async def test_large_tasks_run_alone(self):
        names,peaks,_=await self.run_schedule(['2G','4G','2G'],[53]*3)
        self.assertEqual(len(names),3);self.assertTrue(all(count==1 for count,_ in peaks))

    async def test_quota_pause_drains_active_work(self):
        names,peaks,paused=await self.run_schedule(['2G']*3,[53,40])
        self.assertEqual(names,['0-v1']);self.assertTrue(paused)

    async def test_near_completion_exception(self):
        names,_,paused=await self.run_schedule(['2G'],[40],completed=100)
        self.assertEqual(names,['0-v1']);self.assertFalse(paused)

    async def test_zero_quota_always_pauses(self):
        names,_,paused=await self.run_schedule(['2G'],[0],completed=100)
        self.assertEqual(names,[]);self.assertTrue(paused)


if __name__=='__main__': unittest.main()

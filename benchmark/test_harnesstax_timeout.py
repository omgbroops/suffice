"""Exercise the adapter's cancellation path against a fake environment, no model."""
import asyncio
import importlib.util
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('adapter',Path(__file__).with_name('harnesstax-agent.py'))
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)


class TimeoutTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancel_stops_actor_before_propagating_timeout(self):
        with tempfile.TemporaryDirectory() as folder:
            commands=[]
            class Environment:
                async def upload_file(self,*args): pass
                async def exec(self,command,**kwargs):
                    commands.append(command)
                    if command=='pwd': return SimpleNamespace(stdout='/app')
                    if ' start ' in command: raise asyncio.CancelledError()
                    return SimpleNamespace(return_code=0)
            agent=object.__new__(a.HarnessTaxAgent);agent.logs_dir=Path(folder)
            context=SimpleNamespace()
            with patch.dict(os.environ,{'HARNESS_TAX_ARM':'v1','HARNESS_TAX_TIMEOUT':'900'}):
                with self.assertRaises(asyncio.CancelledError):
                    await agent.run('public instruction',Environment(),context)
            self.assertTrue(commands[-1].endswith('harnesstax-process.mjs stop'))
            self.assertEqual(context.metadata['status'],'timeout')
            self.assertTrue(context.metadata['costUnknown'])


if __name__=='__main__': unittest.main()

"""Exercise the adapter's cancellation path against a fake environment, no model."""
import asyncio
import json
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
    async def test_private_receipt_is_read_inside_container_before_host_cleanup(self):
        with tempfile.TemporaryDirectory() as folder:
            commands=[]
            class Environment:
                async def upload_file(self,*args): pass
                async def exec(self,command,**kwargs):
                    commands.append((command,kwargs))
                    if command=='pwd': return SimpleNamespace(stdout='/app')
                    if command=='cat /receipts/worker.json':
                        return SimpleNamespace(return_code=0,stdout=json.dumps({'status':'completed',
                            'usage':{'input':10,'cacheRead':20,'output':5,'estimatedApiUsd':.001,'costUnknown':False}}))
                    return SimpleNamespace(return_code=0)
            agent=object.__new__(a.HarnessTaxAgent);agent.logs_dir=Path(folder);context=SimpleNamespace()
            with patch.dict(os.environ,{'HARNESS_TAX_ARM':'v1','HARNESS_TAX_TIMEOUT':'900'}):
                await agent.run('public instruction',Environment(),context)
            self.assertEqual(context.n_input_tokens,30)
            self.assertEqual(context.cost_usd,.001)
            self.assertEqual(commands[-1][1]['user'],'root')
            self.assertEqual(context.metadata['status'],'completed')

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

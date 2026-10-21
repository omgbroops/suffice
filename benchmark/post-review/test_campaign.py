"""Offline accounting regression checks; no model calls or private grading inputs."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('campaign',Path(__file__).with_name('campaign.py'))
campaign=importlib.util.module_from_spec(spec);spec.loader.exec_module(campaign)

class AccountingTests(unittest.TestCase):
    def test_partial_stages_do_not_double_count_provider_usage(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=root/'post-review/state/events/receipt.jsonl';path.parent.mkdir(parents=True)
            usage={'input':12,'output':3,'cost':{'total':.004}}
            path.write_text('\n'.join(json.dumps(e) for e in [
                {'type':'provider_usage','usage':usage},{'type':'assistant','usage':usage}])+'\n{"unfinished":')
            (root/'post-review/stage.json').write_text(json.dumps({'usage':{'estimatedApiUsd':.004}}))
            (root/'review-repair').mkdir()
            result=campaign.partial_worker(root)
            self.assertAlmostEqual(result['usage']['estimatedApiUsd'],.004)
            self.assertEqual(result['usage']['modelCalls'],1)
            self.assertEqual(result['reviewCalls'],1)
            self.assertEqual(result['repairs'],1)
            self.assertTrue(result['usage']['costUnknown'])

    def test_pi_partial_receipts_retain_cost_floor(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/'events.live.jsonl').write_text(json.dumps({'type':'assistant','usage':{'cost':{'total':.25}}})+'\n')
            result=campaign.partial_worker(root)
            self.assertEqual(result['usage']['estimatedApiUsd'],.25)
            self.assertEqual(result['stages'][0]['label'],'pi')
            self.assertTrue(result['usage']['costUnknown'])

    def test_missing_receipts_stay_unknown(self):
        with tempfile.TemporaryDirectory() as tmp:
            result=campaign.partial_worker(Path(tmp))
            self.assertTrue(result['usage']['costUnknown'])
            self.assertEqual(result['reviewCalls'],0)

if __name__=='__main__':unittest.main()

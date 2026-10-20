"""Selection and spend accounting tests; no Docker or model inference."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class ReplacementReportTests(unittest.TestCase):
    def report(self,replacement_reward,directory='replacements/receipt-permissions-r1'):
        with tempfile.TemporaryDirectory() as folder:
            state=Path(folder);out=state/'out'
            jobs=[{'task':'a','arm':'v1'},{'task':'b','arm':'pi'}]
            (state/'manifest.json').write_text(json.dumps({'jobs':jobs}))
            plan={'replacements':[jobs[0]]}
            if directory!='replacements/receipt-permissions-r1':plan['directory']=directory
            (state/'replacement-plan.json').write_text(json.dumps(plan))
            def receipt(base,job,reward,cost):
                name=job['task']+'-'+job['arm'];p=base/'results';p.mkdir(parents=True,exist_ok=True)
                (p/(name+'.json')).write_text(json.dumps({'verifier_result':None if reward is None else {'rewards':{'reward':reward}},
                    'exception_info':{'exception_type':'PermissionError'} if reward is None else None}))
                r=base/'trials'/name/'agent/receipts';r.mkdir(parents=True)
                (r/'worker.json').write_text(json.dumps({'status':'completed','identity':True,'usage':{'estimatedApiUsd':cost}}))
            receipt(state,jobs[0],None,3);receipt(state,jobs[1],1,1)
            if replacement_reward is not None:
                receipt(state/directory,jobs[0],replacement_reward,5)
            result=subprocess.run([sys.executable,str(Path(__file__).with_name('harnesstax-report.py'))],
                env={**os.environ,'HARNESS_TAX_REPORT_STATE':str(state),'HARNESS_TAX_REPORT_OUT':str(out)},
                stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            return json.loads((out/'results.json').read_text())

    def test_failed_replacement_counts_and_original_cost_remains_in_total(self):
        data=self.report(0)
        selected=next(r for r in data['attempts'] if r['task']=='a')
        self.assertFalse(selected['accepted']);self.assertEqual(selected['execution'],'replacement-r1')
        self.assertEqual(data['selectedKnownCostUsd'],6)
        self.assertEqual(data['excludedKnownCostUsd'],3)
        self.assertEqual(data['totalKnownSpendIncludingExcludedUsd'],9)
        self.assertEqual(data['completedExecutionsIncludingExcluded'],3)

    def test_pending_replacement_does_not_count_excluded_original(self):
        data=self.report(None)
        self.assertEqual([r['task'] for r in data['attempts']],['b'])
        self.assertEqual(len(data['excludedInfrastructureAttempts']),1)
        self.assertEqual(data['totalKnownSpendIncludingExcludedUsd'],4)

    def test_provider_replacement_directory_and_selected_receipt_provenance(self):
        directory='replacements/provider-interruptions-r1'
        data=self.report(1,directory)
        selected=next(r for r in data['attempts'] if r['task']=='a')
        self.assertTrue(selected['accepted'])
        self.assertEqual(selected['receiptStateRelative'],directory)
        self.assertEqual(data['selectedKnownCostUsd'],6)
        self.assertEqual(data['excludedKnownCostUsd'],3)
        self.assertEqual(data['totalKnownSpendIncludingExcludedUsd'],9)


if __name__=='__main__':unittest.main()

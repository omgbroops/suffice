"""Offline report regression tests; no actor or evaluator execution."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class AccountingReportTests(unittest.TestCase):
    def report(self, malformed=False):
        with tempfile.TemporaryDirectory() as folder:
            state=Path(folder);out=state/'out'
            (state/'manifest.json').write_text(json.dumps({'jobs':[{'task':'sample','arm':'v1'}]}))
            results=state/'results';results.mkdir()
            (results/'sample-v1.json').write_text(json.dumps({'verifier_result':{'rewards':{'reward':1}}}))
            root=state/'trials/sample-v1/agent/receipts'
            events=root/'solve/state/events';events.mkdir(parents=True)
            usage={'input':10,'cacheRead':5,'cacheWrite':0,'output':2,'estimatedApiUsd':0.1}
            (root/'worker.json').write_text(json.dumps({'status':'completed','usage':usage,'modelCalls':1,'toolCalls':1}))
            records=[
                {'type':'provider_request','model':'gpt-6.1-sol','reasoning':{'effort':'high'},'toolNames':['codemode']},
                {'type':'provider_usage','responseId':'response1','usage':{'input_tokens':15,'output_tokens':2}},
                {'type':'assistant','usage':{**usage,'cost':{'total':0.1}}},
                {'type':'tool_result','output':'binary-like\u0085text\u2028with\u2029legal separators'},
            ]
            data='\n'.join(json.dumps(r,ensure_ascii=False) for r in records)+'\n'
            if malformed:data+='{"type":"tool_result","output":"truncated'
            (events/'events.jsonl').write_text(data,encoding='utf-8')
            # The production script runs on Linux, whose default encoding is UTF-8.
            result=subprocess.run([sys.executable,'-X','utf8',str(Path(__file__).with_name('harnesstax-report.py'))],
                env={**os.environ,'HARNESS_TAX_REPORT_STATE':str(state),'HARNESS_TAX_REPORT_OUT':str(out)},
                capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            return json.loads((out/'results.json').read_text())['attempts'][0]

    def test_legal_unicode_separators_do_not_invalidate_reconciled_usage(self):
        row=self.report()
        self.assertTrue(row['receiptsMatched'])
        self.assertFalse(row['costUnknown'])
        self.assertTrue(row['policyValidSuccess'])
        self.assertEqual(row['costUsd'],0.1)

    def test_actual_truncation_still_marks_whole_attempt_cost_unknown(self):
        row=self.report(malformed=True)
        self.assertTrue(row['costUnknown'])
        self.assertFalse(row['policyValidSuccess'])
        self.assertEqual(row['knownCostUsd'],0.1)
        self.assertIsNone(row['costUsd'])


if __name__=='__main__':unittest.main()

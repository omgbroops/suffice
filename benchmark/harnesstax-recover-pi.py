"""Recover the existing Pi attempt after host controller disappearance.

No inference, no verifier execution, no grading feedback to any actor. Requires
the original container still be present and checks all exported receipt bytes.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import time

STATE=Path('/home/eric_qin/suffice-harnesstax-sol61')
NAME='adaptive-rejection-sampler-pi'
TRIAL=STATE/'trials'/NAME
CONTAINER=NAME+'__env-main-1'


def main():
    dest=STATE/'results'/(NAME+'.json')
    if dest.exists(): raise RuntimeError('Recovery already recorded; refusing replacement')
    root=TRIAL/'agent/receipts'
    listing=subprocess.check_output(['docker','exec',CONTAINER,'sh','-c',
        'cd /receipts && find . -type f -exec sha256sum {} +'],text=True)
    hashes={}
    for line in listing.splitlines():
        expected,name=line.split('  ',1)
        path=root/name
        assert hashlib.sha256(path.read_bytes()).hexdigest()==expected,name
        hashes[name]=expected
    worker=json.loads((root/'worker.json').read_text())
    assert worker['status']=='completed'
    reward=float((TRIAL/'verifier/reward.txt').read_text())
    proof={str(p.relative_to(TRIAL)):hashlib.sha256(p.read_bytes()).hexdigest()
        for p in [TRIAL/'lock.json',TRIAL/'config.json',TRIAL/'trial.log',
                  TRIAL/'verifier/reward.txt',TRIAL/'verifier/ctrf.json']}
    recovery={'at':time.time(),'reason':'Host controller disappeared during artifact collection; actor and official grader had already finished.',
        'actorRerun':False,'verifierRerun':False,'receiptHashesVerifiedAgainstContainer':hashes,
        'evidenceHashes':proof,'missing':['original Harbor trial ID','outer phase timings','complete artifact finalization']}
    result={'task_name':'adaptive-rejection-sampler','trial_name':NAME,
        'config':json.loads((TRIAL/'config.json').read_text()),
        'verifier_result':{'rewards':{'reward':reward}},'recovery':recovery,
        'agent_execution':None,'agent_setup':None,'exception_info':None}
    text=json.dumps(result,indent=2)+'\n'
    (TRIAL/'result-recovered.json').write_text(text);dest.write_text(text)
    print(json.dumps({'recovered':NAME,'officialReward':reward,'workerSeconds':worker['latencyMs']/1000,
        'costUsd':worker['usage']['estimatedApiUsd'],'receiptFilesVerified':len(hashes)}))


if __name__=='__main__': main()

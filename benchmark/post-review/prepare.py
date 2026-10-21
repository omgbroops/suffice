"""No-inference issue-contract preflight and immutable task/runtime freeze."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
ROOT=Path('/mnt/c/Users/Eric Qin/Documents/GitHub/suffice')
STATE=Path('/home/eric_qin/suffice-post-review-v1')
OLD=Path('/home/eric_qin/suffice-harnesstax-sol61')
spec=importlib.util.spec_from_file_location('checks',Path(__file__).with_name('checks.py'));checks=importlib.util.module_from_spec(spec);spec.loader.exec_module(checks)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,indent=2)+'\n')

def main():
    assert not (STATE/'manifest.json').exists(),'Already frozen'
    rows=json.loads((ROOT/'benchmark/post-review/candidates.json').read_text())
    positive=json.loads((STATE/'positive-controls-latest.json').read_text())
    assert len(positive)==12 and all(r['exitCode']==0 for r in positive),'Positive controls required'
    images={r['id']:r['image'] for r in json.loads((STATE/'images.json').read_text())}
    preflight=[]
    for row in rows:
        id=row['id'];task=STATE/'tasks'/id
        for name in ['environment','tests','public']: (task/name).mkdir(parents=True,exist_ok=True)
        (task/'instruction.md').write_text(row['actorTask'])
        (task/'public/check.mjs').write_text(checks.code(id))
        (task/'tests/check.mjs').write_text(checks.code(id,True))
        (task/'environment/Dockerfile').write_text(f'FROM suffice-post-review:{id}\nRUN mkdir -p /probe\nWORKDIR /app\n')
        (task/'task.toml').write_text('version = "1.0"\n[agent]\ntimeout_sec = 600\n[verifier]\ntimeout_sec = 180\n[environment]\nbuild_timeout_sec = 120\ncpus = 1\nmemory = "2G"\nstorage = "4G"\n')
        (task/'tests/test.sh').write_text('''#!/bin/bash
set -u
mkdir -p /logs/verifier /probe
cd /app
if node -e 'process.exit(require("./package.json").scripts?.build?0:1)'; then npm run build || { echo 0 > /logs/verifier/reward.txt; exit 0; }; fi
node /tests/check.mjs > /logs/verifier/contract.txt 2>&1
code=$?
if [ "$code" = 0 ]; then echo 1 > /logs/verifier/reward.txt; else echo 0 > /logs/verifier/reward.txt; fi
''')
        for mode in ['public','tests']:
            result=subprocess.run(['docker','run','--rm','--network','none','--cpus','1','--memory','2g',
                '-v',str(task/mode)+':/probe','--entrypoint','node','suffice-post-review:'+id,'/probe/check.mjs'],capture_output=True,text=True,timeout=90)
            record={'id':id,'mode':mode,'exitCode':result.returncode,'stdout':result.stdout,'stderr':result.stderr}
            preflight.append(record);save(STATE/'preflight-latest.json',preflight)
            assert result.returncode!=0, 'Candidate does not reproduce: '+id+' '+mode
            assert 'AssertionError' in result.stderr or 'TS136' in result.stdout or ('error TS' in result.stdout), 'Infrastructure error: '+id+' '+result.stderr[-1000:]
            print(json.dumps({'negativeControl':id,'mode':mode,'exit':result.returncode}),flush=True)
        # Check baseline is clean, identify the exact local Git commit and pin installed dependency lock.
        meta=subprocess.check_output(['docker','run','--rm','--entrypoint','sh','suffice-post-review:'+id,'-c',
            'git status --porcelain; git rev-parse HEAD; find node_modules -type f -name package.json -print0 | sort -z | xargs -0 sha256sum | sha256sum'],text=True).splitlines()
        assert len(meta)==2,(id,meta)
        row.update(imageId=images[id],initialGitHead=meta[0],installedDependencyManifestTreeSha256=meta[1].split()[0],
            timeoutSec=600,checks=[{'command':['node','/public-checks/check.mjs'],'timeoutMs':60000}])
    runtime=STATE/'runtime'
    assert not runtime.exists(),'Partial runtime requires review'
    for folder in ['src','packages/cli/src']:shutil.copytree(ROOT/folder,runtime/folder)
    for name in ['package.json','package-lock.json']:shutil.copy2(ROOT/name,runtime/name)
    shutil.copytree(OLD/'runtime/node_modules',runtime/'node_modules',symlinks=True,copy_function=os.link)
    shutil.copy2(OLD/'runtime/ca-certificates.crt',runtime/'ca-certificates.crt')
    (runtime/'benchmark').mkdir()
    shutil.copy2(ROOT/'benchmark/harnesstax-process.mjs',runtime/'benchmark/harnesstax-process.mjs')
    shutil.copy2(OLD/'runtime/benchmark/harnesstax-native-worker.mjs',runtime/'benchmark/harnesstax-native-worker.mjs')
    worker=(ROOT/'benchmark/harnesstax-worker.mjs').read_text()
    old='const r=JSON.parse(input);'
    assert worker.count(old)==1
    worker=worker.replace(old,"const r=JSON.parse(input);const reviewArm=r.arm;if(!['pi','alone','review'].includes(reviewArm))throw Error('Unknown arm');r.arm=reviewArm==='pi'?'pi':'v2';r.execution={strategy:reviewArm==='review'?'efficient-review':'efficient',executionScope:'isolated-task',features:{advice:false,repairs:false,solTakeover:false}};")
    worker=worker.replace('spent>=5','spent>=1')
    (runtime/'benchmark/harnesstax-worker.mjs').write_text(worker)
    adapter=(ROOT/'benchmark/harnesstax-agent.py').read_text().replace("'maxCostUsd': 5","'maxCostUsd': 1")
    (runtime/'benchmark/harnesstax-agent.py').write_text(adapter)
    files={str(p.relative_to(STATE)):sha(p) for folder in [STATE/'tasks',runtime/'src',runtime/'packages',runtime/'benchmark'] for p in folder.rglob('*') if p.is_file()}
    manifest={'version':'post-review-v1','created':time.time(),'tasks':rows,'files':files,'sourceHead':subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD'],text=True).strip(),
        'jobs':[{'task':row['id'],'arm':['alone','review','pi'][(i+j)%3]} for i,row in enumerate(rows) for j in range(3)],'limits':{'maxCostUsd':1,'maxTurns':100,'maxCalls':240,'concurrency':2,'admissionSpendStopUsd':10,'weeklyRemainingStopPercent':40},
        'models':{'alone':['gpt-6-luna','high'],'reviewWorker':['gpt-6-luna','high'],'reviewer':['gpt-6.1-sol','low'],'pi':['gpt-6.1-sol','high']},
        'grading':'Independently authored issue-contract checks, not Terminal-Bench official grading. Generated only from issue behavior and initial public source; no upstream fix patches used.'}
    save(STATE/'manifest.json',manifest);save(ROOT/'reports/post-review-v1/campaign/manifest.json',manifest)
    save(ROOT/'reports/post-review-v1/campaign/preflight.json',preflight)
    print(json.dumps({'frozenJobs':18,'inference':False}),flush=True)

if __name__=='__main__':main()

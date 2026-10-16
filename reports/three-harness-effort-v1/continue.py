"""Evaluator-only socket recovery, then remaining frozen tasks; never rerun a model attempt."""
import pathlib,os,time,json,subprocess,concurrent.futures,importlib.util
R=pathlib.Path(__file__).resolve().parents[2];D=R/'.suffice/three-harness-effort-v1';os.chdir(R)
while (D/'driver.lock').exists():
 pid=(D/'driver.lock').read_text().strip()
 if not pathlib.Path('/proc',pid).exists():raise RuntimeError('Stale lock; inspect interrupted actor before continuing')
 time.sleep(3)
state=json.loads((D/'driver-state.json').read_text());(D/'driver-before-evaluator-recovery.json').write_text(json.dumps(state,indent=2))
def recover(cell):
 arm,effort=cell;run=D/'attempts'/('n02-'+arm+'-'+effort)
 if not (run/'worker/execution-result.json').exists():raise RuntimeError('Actor did not finish; no automatic rerun')
 with (D/('recovery-n02-'+arm+'-'+effort+'.log')).open('a') as out:
  p=subprocess.run(['node','reports/three-harness-effort-v1/recovery.mjs','recover','n02',arm],env={**os.environ,'EFFORT':effort},stdout=out,stderr=subprocess.STDOUT)
 if p.returncode:raise RuntimeError('Evaluator recovery failed '+arm+' '+effort)
cells=[(a,e) for e in ['low','xhigh'] for a in ['suffice','stock-pi','codex']]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(recover,cells))
spec=importlib.util.spec_from_file_location('frozen_driver',R/'experiments/three-harness-effort-v1/driver.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
rows=mod.results()
if len(rows)!=12 or any(r['totalEstimatedUsd'] is None or not r['receiptsMatched'] or not r['identity'] or not r['tools'] for r in rows):raise RuntimeError('Missing/unknown first twelve records; dispatch paused')
(D/'evaluator-recovery-receipt.json').write_text(json.dumps({'reason':'Capture ignored runtime socket as ordinary file','inferenceReruns':0,'actorChanges':0,'originalFrozenInputsChanged':False,'recoveredTask':'n02','recordsBeforeContinuation':12,'knownUsd':sum(r['knownEstimatedUsd'] for r in rows)},indent=2))
f=(D/'driver.lock').open('x');f.write(str(os.getpid()));f.flush()
try:mod.phase(['n03','n04','n06'])
finally:
 mod.report();mod.save();f.close();(D/'driver.lock').unlink()
subprocess.run(['python3','-I','reports/three-harness-effort-v1/analyze.py'],check=True)

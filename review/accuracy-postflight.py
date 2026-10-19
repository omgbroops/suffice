"""Read-only remote verification plus a new observer receipt; no inference."""
import importlib.util,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('accuracy_transport',ROOT/'benchmark/accuracy-sonion.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
code="""import pathlib,json,hashlib,subprocess
root=pathlib.Path('/home/eric_qin/suffice-medium-accuracy');state=root/'.suffice/accuracy-bench-v1';runtime=root/'.suffice/accuracy-runtime'
if (state/'driver.lock').exists():raise RuntimeError('Campaign must stop before postflight')
manifest=json.loads((state/'manifest.json').read_text());checks={}
for group,base in [('inputs',root),('runtimeInputs',runtime),('externalInputs',pathlib.Path('/'))]:
 for rel,expected in manifest[group].items():
  p=base/rel;checks[group+':'+rel]=p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest()==expected
sync=json.loads((root/'.suffice/source-sync.json').read_text());source={rel:hashlib.sha256((root/rel).read_bytes()).hexdigest()==expected for rel,expected in sync.items()}
exposure={}
for taskId in manifest['tasks']:
 t=json.loads(pathlib.Path('/home/eric_qin/suffice-field-v1/.suffice/luna-sol-field-v1/tasks',taskId,'task.json').read_text())
 count=int(subprocess.check_output(['git','-C',t['baseDir'],'rev-list','--count','--all'],text=True).strip())
 available=subprocess.run(['git','-C',t['baseDir'],'cat-file','-e',t['fixCommit']],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
 exposure[taskId]={'reachableCommitCount':count,'fixCommitAvailable':available}
out={'frozenChecks':checks,'sourceSyncChecks':source,'gitExposure':exposure,'valid':all(checks.values()) and all(source.values()) and all(x['reachableCommitCount']==1 and not x['fixCommitAvailable'] for x in exposure.values())}
p=state/'postflight.json'
if p.exists():raise RuntimeError('Postflight receipt already exists')
p.write_text(json.dumps(out,indent=2)+chr(10));print(json.dumps({'valid':out['valid'],'frozenChecks':len(checks),'sourceSyncChecks':len(source),'gitExposure':exposure}))
"""
if __name__=='__main__':
 result=module.transport.run("python3 - <<'ACCURACY_POSTFLIGHT'\n"+code+"\nACCURACY_POSTFLIGHT",180)
 sys.stdout.buffer.write(result.stdout);sys.stderr.buffer.write(result.stderr)
 if result.returncode:raise SystemExit(result.returncode)

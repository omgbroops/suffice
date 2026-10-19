"""Observer-only remote source/task parity and exposure verification; no inference."""
import importlib.util,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('broad_transport',ROOT/'benchmark/broad-sonion.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
code="""import pathlib,json,hashlib,subprocess
root=pathlib.Path('/home/eric_qin/suffice-broad-v1');state=root/'.suffice/broad-bench-v1';runtime=root/'.suffice/broad-runtime'
if (state/'driver.lock').exists():raise RuntimeError('Campaign must stop before postflight')
manifest=json.loads((state/'manifest.json').read_text());checks={}
for group,base in [('inputs',root),('runtimeInputs',runtime),('externalInputs',pathlib.Path('/'))]:
 for rel,expected in manifest[group].items():
  p=base/rel;checks[group+':'+rel]=p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest()==expected
sync=json.loads((root/'.suffice/source-sync.json').read_text());source={rel:hashlib.sha256((root/rel).read_bytes()).hexdigest()==expected for rel,expected in sync.items()}
exposure={}
for taskId in manifest['tasks']:
 t=json.loads((state/'tasks'/taskId/'task.json').read_text());count=int(subprocess.check_output(['git','-C',t['baseDir'],'rev-list','--count','--all'],text=True).strip())
 available=subprocess.run(['git','-C',t['baseDir'],'cat-file','-e',t['fixCommit']],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
 exposure[taskId]={'reachableCommitCount':count,'fixCommitAvailable':available}
out={'frozenChecks':checks,'sourceSyncChecks':source,'gitExposure':exposure,'valid':all(checks.values()) and all(source.values()) and all(x['reachableCommitCount']==1 and not x['fixCommitAvailable'] for x in exposure.values())}
p=state/'postflight.json'
if p.exists():raise RuntimeError('Postflight receipt already exists')
p.write_text(json.dumps(out,indent=2)+chr(10));print(json.dumps({'valid':out['valid'],'frozenChecks':len(checks),'sourceSyncChecks':len(source),'tasks':len(exposure)}))
"""
if __name__=='__main__':
 r=module.transport.run("python3 - <<'BROAD_POSTFLIGHT'\n"+code+"\nBROAD_POSTFLIGHT",180);sys.stdout.buffer.write(r.stdout);sys.stderr.buffer.write(r.stderr)
 if r.returncode:raise SystemExit(r.returncode)

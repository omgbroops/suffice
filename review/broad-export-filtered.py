"""Observer-only filtered export excluding fixture trees and package payloads; explicit task/reference/lock metadata retained. Frozen campaign and transport helpers stay unchanged."""
import base64,hashlib,importlib.util,json,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('frozen_transport',ROOT/'benchmark/broad-sonion.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
code="""import pathlib,json,base64,hashlib,os
root=pathlib.Path('/home/eric_qin/suffice-broad-v1');state=root/'.suffice/broad-bench-v1';values={};excluded=[]
for folder,dirs,files in os.walk(state):
 parent=pathlib.Path(folder);kept=[]
 for d in dirs:
  if d in ['actors','workspace','control-actors','node_modules','.git','pi','tasks','fixtures','dependencies','source-archives'] or (parent.name=='codex-home' and d!='sessions'):
   excluded.append(str((parent/d).relative_to(root)))
  else:kept.append(d)
 dirs[:]=kept
 for name in files:
  p=parent/name
  if p.is_symlink() or name in ['auth.json','.env','credentials.json']:continue
  b=p.read_bytes();values[str(p.relative_to(root))]={'data':base64.b64encode(b).decode(),'sha256':hashlib.sha256(b).hexdigest()}
contracts={}
for taskId in json.loads((state/'manifest.json').read_text())['tasks']:
 taskPath=state/'tasks'/taskId/'task.json';t=json.loads(taskPath.read_text())
 for p in [taskPath,pathlib.Path(t['referencePatchJson']),pathlib.Path(t['dependencyDir']).parent/'package-lock.json']:
  b=p.read_bytes();values[p.relative_to(root).as_posix()]={'data':base64.b64encode(b).decode(),'sha256':hashlib.sha256(b).hexdigest()}
 contracts[taskId]={'repository':t['repository'],'issue':t['issue'],'title':t['title'],'publicBody':t['publicBody'],'nativeCommands':t['nativeCommands']}
print(json.dumps({'values':values,'excludedDirectories':excluded,'remoteSourceSync':json.loads((root/'.suffice/source-sync.json').read_text()),'publicContracts':contracts}))
"""
result=module.transport.run("python3 - <<'FILTERED_EXPORT'\n"+code+"\nFILTERED_EXPORT",180)
if result.returncode:sys.stderr.buffer.write(result.stderr);raise SystemExit(result.returncode)
data=json.loads(result.stdout);total=0
for rel,e in data['values'].items():
 p=pathlib.PurePosixPath(rel)
 if p.is_absolute() or '..' in p.parts or ':' in rel:raise RuntimeError('Unsafe exported path')
 b=base64.b64decode(e['data'],validate=True)
 if hashlib.sha256(b).hexdigest()!=e['sha256']:raise RuntimeError('Transport digest mismatch')
 dest=ROOT/rel
 if dest.exists() and dest.read_bytes()!=b:raise RuntimeError('Existing immutable receipt differs: '+rel)
 dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b);total+=len(b)
out=ROOT/'reports/broad-bench-v1';out.mkdir(parents=True,exist_ok=True)
(out/'public-contracts.json').write_text(json.dumps(data['publicContracts'],indent=2)+'\n',encoding='utf8')
(out/'export-manifest.json').write_text(json.dumps({'files':{rel:e['sha256'] for rel,e in data['values'].items()},'excludedDirectories':data['excludedDirectories'],'exclusionReason':'Actor/grading repositories, dependencies, credential files and native plugin/cache assets are not benchmark receipts. Native sessions plus all provider/assistant usage, process/control/grading receipts and patches are retained.','bytes':total,'remoteSourceSync':data['remoteSourceSync']},indent=2)+'\n',encoding='utf8')
print(json.dumps({'receipts':len(data['values']),'bytes':total,'excludedDirectories':len(data['excludedDirectories'])}))

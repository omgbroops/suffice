"""Observer-only filtered export; frozen campaign and transport helpers stay unchanged."""
import base64,hashlib,importlib.util,json,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('frozen_transport',ROOT/'benchmark/effort-sonion.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
code="""import pathlib,json,base64,hashlib,os
root=pathlib.Path('/home/eric_qin/suffice-effort-v1');state=root/'.suffice/effort-bench-v1';values={};excluded=[]
for folder,dirs,files in os.walk(state):
 parent=pathlib.Path(folder);kept=[]
 for d in dirs:
  if d in ['actors','workspace','control-actors','node_modules','.git','pi'] or (parent.name=='codex-home' and d!='sessions'):
   excluded.append(str((parent/d).relative_to(root)))
  else:kept.append(d)
 dirs[:]=kept
 for name in files:
  p=parent/name
  if p.is_symlink() or name in ['auth.json','.env','credentials.json']:continue
  b=p.read_bytes();values[str(p.relative_to(root))]={'data':base64.b64encode(b).decode(),'sha256':hashlib.sha256(b).hexdigest()}
contracts={}
for taskId in ['f16','f09','f11']:
 t=json.loads(pathlib.Path('/home/eric_qin/suffice-field-v1/.suffice/luna-sol-field-v1/tasks',taskId,'task.json').read_text());contracts[taskId]={'repository':t['repository'],'issue':t['issue'],'title':t['title'],'publicBody':t['publicBody'],'nativeCommands':t['nativeCommands']}
 if taskId=='f11':
  f=pathlib.Path(t['baseDir'])/'Readme.md';lines=f.read_text().splitlines();contracts[taskId]['publicReadme']={'path':'Readme.md','sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'firstLine':895,'lastLine':910,'text':chr(10).join(lines[894:910])}
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
out=ROOT/'reports/effort-bench-v1';out.mkdir(parents=True,exist_ok=True)
(out/'public-contracts.json').write_text(json.dumps(data['publicContracts'],indent=2)+'\n',encoding='utf8')
(out/'export-manifest.json').write_text(json.dumps({'files':{rel:e['sha256'] for rel,e in data['values'].items()},'excludedDirectories':data['excludedDirectories'],'exclusionReason':'Actor/grading repositories, dependencies, credential files and native plugin/cache assets are not benchmark receipts. Native sessions plus all provider/assistant usage, process/control/grading receipts and patches are retained.','bytes':total,'remoteSourceSync':data['remoteSourceSync']},indent=2)+'\n',encoding='utf8')
print(json.dumps({'receipts':len(data['values']),'bytes':total,'excludedDirectories':len(data['excludedDirectories'])}))

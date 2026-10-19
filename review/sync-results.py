"""Pull credential-free experiment receipts, excluding repository workspaces."""
import base64,hashlib,importlib.util,json,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('transport',ROOT.parent/'suffice-experiments/field-campaign-v1/scripts/sonion-ssh.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
code='''import pathlib,os,json,base64,hashlib
r=pathlib.Path('/home/eric_qin/suffice-v2');out={}
for folder in ['.suffice/packet-bench-v1','.suffice/packet-preflight-v1','reports']:
 for d,dirs,names in os.walk(r/folder,followlinks=False):
  dirs[:]=[x for x in dirs if x not in ['actors','control-actors','workspace','node_modules','.git','pi','__pycache__'] and not (pathlib.Path(d)/x).is_symlink()]
  for name in names:
   p=pathlib.Path(d)/name
   if p.is_symlink() or name in ['auth.json','credentials.json','.env'] or name.endswith('.zip'):continue
   b=p.read_bytes();out[p.relative_to(r).as_posix()]={'data':base64.b64encode(b).decode(),'sha256':hashlib.sha256(b).hexdigest()}
print(json.dumps(out))
'''
r=m.run("python3 - <<'V2_RECEIPTS'\n"+code+'\nV2_RECEIPTS',180)
if r.returncode:sys.stderr.buffer.write(r.stderr);raise SystemExit(r.returncode)
values=json.loads(r.stdout)
for rel,e in values.items():
 path=pathlib.PurePosixPath(rel)
 if path.is_absolute() or '..' in path.parts or ':' in rel:raise RuntimeError('Unsafe remote path')
 b=base64.b64decode(e['data'],validate=True)
 if hashlib.sha256(b).hexdigest()!=e['sha256']:raise RuntimeError('Corrupt receipt')
 p=ROOT/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
path=ROOT/'.suffice/receipt-sync.json';path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps({p:e['sha256'] for p,e in values.items()},indent=2)+'\n',encoding='utf8')
print(json.dumps({'files':len(values),'bytes':sum((ROOT/p).stat().st_size for p in values)}))

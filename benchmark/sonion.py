"""Allowlisted, credential-free source sync; runtime staging and remote commands."""
import base64,hashlib,importlib.util,json,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('transport',ROOT.parent/'suffice-experiments/field-campaign-v1/scripts/sonion-ssh.py')
transport=importlib.util.module_from_spec(spec);spec.loader.exec_module(transport)
REMOTE='/home/eric_qin/suffice-v2'

def command(script,timeout=60):
 r=transport.run(script,timeout);sys.stdout.buffer.write(r.stdout);sys.stderr.buffer.write(r.stderr)
 if r.returncode:raise SystemExit(r.returncode)

def push():
 files=[ROOT/p for p in ['package.json','package-lock.json','.gitignore','README.md','SOURCE-PROVENANCE.json']]
 for folder in ['src','packages','tests','benchmark']:
  files.extend(p for p in (ROOT/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
 values={p.relative_to(ROOT).as_posix():base64.b64encode(p.read_bytes()).decode() for p in files}
 code='''import base64,pathlib,json
r=pathlib.Path(REMOTE)
if (r/'.suffice/packet-bench-v1/manifest.json').exists():raise RuntimeError('Frozen campaign exists; source sync refused')
for name,data in VALUES.items():
 p=r/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(base64.b64decode(data))
dep=pathlib.Path('/home/eric_qin/suffice-general-runtime/app/node_modules')
if not (r/'node_modules').exists():(r/'node_modules').symlink_to(dep,target_is_directory=True)
runtime=r/'.suffice/runtime';runtime.mkdir(parents=True,exist_ok=True)
for name,data in VALUES.items():
 if name.startswith(('src/','packages/cli/src/')):
  p=runtime/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(base64.b64decode(data))
(runtime/'package.json').write_text('{"type":"module","private":true}\\n')
if not (runtime/'node_modules').exists():(runtime/'node_modules').symlink_to(dep,target_is_directory=True)
print(json.dumps({'copied':len(VALUES),'root':str(r)}))
'''.replace('REMOTE',repr(REMOTE)).replace('VALUES',repr(values))
 command("python3 - <<'V2_SYNC'\n"+code+'\nV2_SYNC',180)

def pull():
 code='''import pathlib,json,base64,hashlib
r=pathlib.Path(REMOTE);out={}
for folder in ['.suffice/packet-bench-v1','.suffice/packet-preflight-v1','.suffice/calibration','reports']:
 for p in (r/folder).rglob('*'):
  if not p.is_file() or p.is_symlink():continue
  rel=p.relative_to(r)
  if any(x in ['actors','workspace','node_modules','.git','pi'] for x in rel.parts) or p.name in ['auth.json','.env','credentials.json']:continue
  b=p.read_bytes();out[rel.as_posix()]={'data':base64.b64encode(b).decode(),'sha256':hashlib.sha256(b).hexdigest()}
print(json.dumps(out))
'''.replace('REMOTE',repr(REMOTE))
 r=transport.run("python3 - <<'V2_PULL'\n"+code+'\nV2_PULL',180)
 if r.returncode:sys.stderr.buffer.write(r.stderr);raise SystemExit(r.returncode)
 values=json.loads(r.stdout)
 for rel,e in values.items():
  p=pathlib.PurePosixPath(rel)
  if p.is_absolute() or '..' in p.parts or ':' in rel:raise RuntimeError('Unsafe receipt path')
  b=base64.b64decode(e['data'],validate=True)
  if hashlib.sha256(b).hexdigest()!=e['sha256']:raise RuntimeError('Transport hash mismatch')
  dest=ROOT/rel;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b)
 print(json.dumps({'downloaded':len(values),'bytes':sum((ROOT/p).stat().st_size for p in values)}))

if __name__=='__main__':
 if sys.argv[1]=='push':push()
 elif sys.argv[1]=='pull':pull()
 elif sys.argv[1]=='command':command(sys.stdin.read(),int(sys.argv[2]) if len(sys.argv)>2 else 60)
 else:raise SystemExit('push | pull | command [seconds]')

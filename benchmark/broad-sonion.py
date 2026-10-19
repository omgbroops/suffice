"""Credential-free source/receipt transport for the separate pipeline campaign."""
import base64,hashlib,json,pathlib,sys,subprocess,types
ROOT=pathlib.Path(__file__).resolve().parents[1]
SSH=['C:/Windows/System32/OpenSSH/ssh.exe','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=15','-o','ServerAliveInterval=20','-o','ServerAliveCountMax=3','sonion','wsl.exe -d Ubuntu -- nice -n 10 bash -s']
def run(script,timeout=None):
 source='set -euo pipefail\nexport PATH=/home/eric_qin/suffice-general-runtime/bin:/usr/bin:/bin\ncd /home/eric_qin/suffice-field-v1\n'+script.replace('\r\n','\n')+'\n'
 return subprocess.run(SSH,input=source.encode('utf8'),capture_output=True,timeout=timeout)
transport=types.SimpleNamespace(run=run)
REMOTE='/home/eric_qin/suffice-broad-v1'

def command(script,timeout=60):
 r=transport.run(script,timeout);sys.stdout.buffer.write(r.stdout);sys.stderr.buffer.write(r.stderr)
 if r.returncode:raise SystemExit(r.returncode)

def push():
 files=[ROOT/p for p in ['package.json','package-lock.json','SOURCE-PROVENANCE.json','README.md','.gitignore']]
 for folder in ['src','packages','tests']:
  files.extend(p for p in (ROOT/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
 files.extend(ROOT/'benchmark'/name for name in ['broad-runner.mjs','broad-driver.py','broad-sonion.py','broad-execution.mjs','broad-native-worker.mjs','broad-plan.md'])
 files.extend(p for p in (ROOT/'benchmark/broad').rglob('*') if p.is_file() and '__pycache__' not in p.parts)
 files.extend(p for p in (ROOT/'review').glob('broad-*') if p.is_file())
 values={p.relative_to(ROOT).as_posix():base64.b64encode(p.read_bytes()).decode() for p in files}
 digests={name:hashlib.sha256(base64.b64decode(data)).hexdigest() for name,data in values.items()}
 code="""import base64,pathlib,json,hashlib
r=pathlib.Path(REMOTE)
if (r/'.suffice/broad-bench-v1/manifest.json').exists():raise RuntimeError('Frozen pipeline campaign exists; source sync refused')
for name,data in VALUES.items():
 p=r/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(base64.b64decode(data))
dep=pathlib.Path('/home/eric_qin/suffice-general-runtime/app/node_modules')
if not (r/'node_modules').exists():(r/'node_modules').symlink_to(dep,target_is_directory=True)
runtime=r/'.suffice/broad-runtime';runtime.mkdir(parents=True,exist_ok=True)
for name,data in VALUES.items():
 if name.startswith(('src/','packages/cli/src/')):
  p=runtime/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(base64.b64decode(data))
(runtime/'package.json').write_text(json.dumps({'type':'module','private':True})+chr(10))
if not (runtime/'node_modules').exists():(runtime/'node_modules').symlink_to(dep,target_is_directory=True)
digests={name:hashlib.sha256(base64.b64decode(data)).hexdigest() for name,data in VALUES.items()}
(r/'.suffice/source-sync.json').write_text(json.dumps(digests,indent=2)+chr(10))
print(json.dumps({'copied':len(VALUES),'root':str(r)}))
""".replace('REMOTE',repr(REMOTE)).replace('VALUES',repr(values))
 command("python3 - <<'PIPELINE_SYNC'\n"+code+'\nPIPELINE_SYNC',180)
 receipt=ROOT/'.suffice/broad-source-sync.json';receipt.parent.mkdir(parents=True,exist_ok=True)
 receipt.write_text(json.dumps({'remote':REMOTE,'files':digests},indent=2)+'\n',encoding='utf8')

def pull():
 code="""import pathlib,json,base64,hashlib
r=pathlib.Path(REMOTE);out={}
for p in (r/'.suffice/broad-bench-v1').rglob('*'):
 if not p.is_file() or p.is_symlink():continue
 rel=p.relative_to(r)
 if any(x in ['actors','workspace','control-actors','node_modules','.git','pi'] for x in rel.parts) or p.name in ['auth.json','.env','credentials.json']:continue
 b=p.read_bytes();out[rel.as_posix()]={'data':base64.b64encode(b).decode(),'sha256':hashlib.sha256(b).hexdigest()}
print(json.dumps(out))
""".replace('REMOTE',repr(REMOTE))
 response=transport.run("python3 - <<'PIPELINE_PULL'\n"+code+'\nPIPELINE_PULL',180)
 if response.returncode:sys.stderr.buffer.write(response.stderr);raise SystemExit(response.returncode)
 values=json.loads(response.stdout)
 for rel,e in values.items():
  p=pathlib.PurePosixPath(rel)
  if p.is_absolute() or '..' in p.parts or ':' in rel:raise RuntimeError('Unsafe receipt path')
  b=base64.b64decode(e['data'],validate=True)
  if hashlib.sha256(b).hexdigest()!=e['sha256']:raise RuntimeError('Transport hash mismatch')
  dest=ROOT/rel
  if dest.exists() and dest.read_bytes()!=b:raise RuntimeError('Existing local receipt changed: '+rel)
  dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b)
 print(json.dumps({'downloaded':len(values),'bytes':sum((ROOT/p).stat().st_size for p in values)}))

if __name__=='__main__':
 if sys.argv[1]=='push':push()
 elif sys.argv[1]=='pull':pull()
 elif sys.argv[1]=='command':command(sys.stdin.read(),int(sys.argv[2]) if len(sys.argv)>2 else 60)
 else:raise SystemExit('push | pull | command [seconds]')

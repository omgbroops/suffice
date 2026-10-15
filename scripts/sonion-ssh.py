"""Lightweight SSH transport; all shell/test/install work runs on Sonion."""
import argparse,base64,hashlib,json,pathlib,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
REMOTE='/home/eric_qin/suffice-field-v1'
SSH=['C:/Windows/System32/OpenSSH/ssh.exe','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=15','-o','ServerAliveInterval=20','-o','ServerAliveCountMax=3','sonion','wsl.exe -d Ubuntu -- taskset -c 0,1 nice -n 10 bash -s']
def run(script,timeout=None):
 source='set -euo pipefail\nexport PATH=/home/eric_qin/suffice-general-runtime/bin:/usr/bin:/bin\ncd '+REMOTE+'\n'+script.replace('\r\n','\n')+'\n'
 return subprocess.run(SSH,input=source.encode('utf-8'),capture_output=True,timeout=timeout)
def pull(patterns):
 code='''import pathlib,json,base64,hashlib
r=pathlib.Path("/home/eric_qin/suffice-field-v1");out={}
for pattern in PATTERNS:
 for p in r.glob(pattern):
  if not p.is_file() or p.is_symlink():continue
  rel=p.relative_to(r).as_posix()
  if any(x in ["node_modules",".git","pi"] for x in p.relative_to(r).parts) or p.name in ["auth.json","credentials.json",".env"]:continue
  b=p.read_bytes();out[rel]={"sha256":hashlib.sha256(b).hexdigest(),"data":base64.b64encode(b).decode()}
print(json.dumps(out))
'''.replace('PATTERNS',repr(patterns))
 response=run("python3 - <<'SONION_PULL'\n"+code+'\nSONION_PULL',180)
 if response.returncode:raise RuntimeError(response.stderr.decode('utf-8',errors='replace'))
 values=json.loads(response.stdout);state=ROOT/'.suffice/remote-sync';state.mkdir(parents=True,exist_ok=True)
 manifest_path=state/'manifest.json';prior=json.loads(manifest_path.read_text(encoding='utf8')) if manifest_path.exists() else {}
 frozen=json.loads((ROOT/'reports/general-v1/frozen-configuration.json').read_text(encoding='utf8'))['inputs']
 rows=[]
 for rel,entry in values.items():
  p=pathlib.PurePosixPath(rel)
  if p.is_absolute() or '..' in p.parts or ':' in rel:raise RuntimeError('Unsafe remote relative path')
  data=base64.b64decode(entry['data'],validate=True)
  if hashlib.sha256(data).hexdigest()!=entry['sha256']:raise RuntimeError('Transport hash mismatch')
  dest=ROOT/rel
  if rel in frozen and entry['sha256']!=frozen[rel]:raise RuntimeError('Reject modification to frozen source: '+rel)
  old=hashlib.sha256(dest.read_bytes()).hexdigest() if dest.exists() else None
  if old and old!=entry['sha256'] and rel in prior and old!=prior[rel]:raise RuntimeError('Local change conflicts with remote: '+rel)
  dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);prior[rel]=entry['sha256'];rows.append({'path':rel,'sha256':entry['sha256'],'changed':old!=entry['sha256']})
 manifest_path.write_text(json.dumps(prior,indent=2)+'\n',encoding='utf8');print(json.dumps({'reconciled':len(rows),'changed':sum(r['changed'] for r in rows),'files':rows}))
def push(paths):
 values={}
 for rel in paths:
  p=pathlib.PurePosixPath(rel)
  if p.is_absolute() or '..' in p.parts or ':' in rel or any(x in ['pi','node_modules','.git'] for x in p.parts) or p.name in ['auth.json','credentials.json','.env']:raise RuntimeError('Unsafe source export')
  b=(ROOT/rel).read_bytes();values[rel]={'sha256':hashlib.sha256(b).hexdigest(),'data':base64.b64encode(b).decode()}
 code='''import pathlib,json,base64,hashlib
r=pathlib.Path("/home/eric_qin/suffice-field-v1");values=VALUES
frozen=json.loads((r/"reports/general-v1/frozen-configuration.json").read_text())["inputs"]
for rel,e in values.items():
 b=base64.b64decode(e["data"]);assert hashlib.sha256(b).hexdigest()==e["sha256"]
 if rel in frozen and e["sha256"]!=frozen[rel]:raise RuntimeError("Frozen source edit rejected")
 p=r/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
print(json.dumps({"pushed":list(values),"hashes":{p:e["sha256"] for p,e in values.items()}}))
'''.replace('VALUES',repr(values))
 response=run("python3 - <<'SONION_PUSH'\n"+code+'\nSONION_PUSH',180)
 sys.stdout.buffer.write(response.stdout);sys.stderr.buffer.write(response.stderr)
 if response.returncode:raise SystemExit(response.returncode)
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--command');ap.add_argument('--script');ap.add_argument('--pull',nargs='+');ap.add_argument('--push',nargs='+');ap.add_argument('--timeout',type=int);a=ap.parse_args()
 if a.pull:pull(a.pull)
 elif a.push:push(a.push)
 else:
  script=pathlib.Path(a.script).read_text(encoding='utf8') if a.script else a.command or sys.stdin.read()
  r=run(script,a.timeout);sys.stdout.buffer.write(r.stdout);sys.stderr.buffer.write(r.stderr);raise SystemExit(r.returncode)

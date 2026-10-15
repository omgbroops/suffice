from pathlib import Path
import subprocess,json,hashlib
ROOT=Path('/home/eric_qin/suffice-field-v1');TD=ROOT/'.suffice/field-campaign-v1/tasks/q04';BASE=TD/'base';PRIVATE=TD/'private';p=TD/'task.json';t=json.loads(p.read_text());assert t['ready'] is False
version='10.34.7'
lock=BASE/'pnpm-lock.yaml';before=hashlib.sha256(lock.read_bytes()).hexdigest()
command=['npm','exec','--yes','--package=pnpm@'+version,'--','pnpm','install','--frozen-lockfile','--ignore-scripts']
with (PRIVATE/'install-pnpm-frozen.log').open('w') as log:r=subprocess.run(command,cwd=BASE,stdout=log,stderr=subprocess.STDOUT)
assert r.returncode==0,'Frozen pnpm install failed; log retained'
assert hashlib.sha256(lock.read_bytes()).hexdigest()==before
subprocess.run(['git','-C',str(BASE),'rm','--cached','package-lock.json'],check=True,stdout=subprocess.DEVNULL)
subprocess.run(['git','-C',str(BASE),'commit','--amend','--no-edit'],check=True,stdout=subprocess.DEVNULL)
t['provenance']['lockSha256']=before;t['provenance']['dependencyLockFile']='pnpm-lock.yaml';t['provenance']['packageManager']='pnpm@'+version;t['provenance']['installCommand']=command;t['provenance']['installLog']=str(PRIVATE/'install-pnpm-frozen.log');t['provenance']['localBaseCommit']=subprocess.check_output(['git','-C',str(BASE),'rev-parse','HEAD'],text=True).strip();t['provenance']['dependencyResolutionNote']='Final install uses the original upstream pnpm-lock.yaml with pnpm10 frozen-lockfile/ignore-scripts, matching original CI policy. Initial npm failure and semver-resolution trial/dependencies/receipts preserved privately under npm-semver; they are not final controls.'
p.write_text(json.dumps(t,indent=2)+'\n');print('q04 frozen dependencies',version,flush=True)

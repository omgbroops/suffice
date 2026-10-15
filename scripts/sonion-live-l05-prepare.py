from pathlib import Path
import subprocess,json,hashlib,datetime
ROOT=Path('/home/eric_qin/suffice-field-v1');TD=ROOT/'.suffice/field-live-extension-v1/tasks/l05';BASE=TD/'base';P=TD/'private'
before={n:hashlib.sha256((BASE/n).read_bytes()).hexdigest() for n in ['package.json','package-lock.json']}
with (P/'install-npm-ci.log').open('w') as log:r=subprocess.run(['npm','ci','--no-audit','--no-fund'],cwd=BASE,stdout=log,stderr=subprocess.STDOUT)
assert r.returncode==0,'npm ci failed; see preserved log'
assert all(hashlib.sha256((BASE/n).read_bytes()).hexdigest()==h for n,h in before.items())
dep=TD/'dependencies/node_modules';(BASE/'node_modules').rename(dep);(BASE/'node_modules').symlink_to(dep.resolve(),target_is_directory=True)
paths=[str(p.relative_to(BASE)) for p in BASE.rglob('*') if p.is_file() and 'node_modules' not in p.parts]
for args in [['init','--initial-branch=live-source'],['config','user.name','Suffice Field Prep'],['config','user.email','field-prep@localhost'],['config','core.autocrlf','false'],['add','-f','--',*paths],['commit','-m','Current public source and provided dependency lock']]:subprocess.run(['git','-C',str(BASE),*args],check=True,stdout=subprocess.DEVNULL)
issue=json.loads((P/'issue.json').read_text());head=json.loads((P/'head.json').read_text())['sha']
t={'id':'l05','cohort':'live','repository':'uwdata/arquero','issue':329,'url':issue['html_url'],'title':issue['title'],'publicBody':issue['body'],'baseCommit':head,'baseDir':str(BASE),'dependencyDir':str(dep.resolve()),'nativeCommands':[],'acceptanceCommands':[],'graderOverlay':[],'controls':{'baselineAccepted':None,'knownNativeFailures':[]},'ready':False,'admission':'Screening current-HEAD reproduction and contract; no model permitted','provenance':{'fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'host':'sonion','issue':str(P/'issue.json'),'timeline':str(P/'timeline.json'),'openPulls':str(P/'open-pulls.json'),'head':str(P/'head.json'),'archiveSha256':hashlib.sha256((P/'head-source.tar.gz').read_bytes()).hexdigest(),'lockSha256':before['package-lock.json'],'providedLock':'package-lock.json','packageManager':subprocess.check_output(['npm','--version'],text=True).strip(),'nodeVersion':subprocess.check_output(['node','--version'],text=True).strip(),'localBaseCommit':subprocess.check_output(['git','-C',str(BASE),'rev-parse','HEAD'],text=True).strip()}}
(TD/'task.json').write_text(json.dumps(t,indent=2)+'\n');print('l05 installed',flush=True)

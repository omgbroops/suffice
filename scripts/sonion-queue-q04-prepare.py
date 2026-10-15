from pathlib import Path
import subprocess,json,hashlib,tarfile,datetime
ROOT=Path('/home/eric_qin/suffice-field-v1');TD=ROOT/'.suffice/field-campaign-v1/tasks/q04';PRIVATE=TD/'private';BASE=TD/'base';PRIVATE.mkdir(parents=True,exist_ok=True)
REPO='nanostores/nanostores';ISSUE=371;FIX='3206678515f9dd1985a7770d9c2a340a8f65a443';PARENT='8ad031dcde958413cf722b0fe46ceb65b547c747'
def download(url,path):
 subprocess.run(['curl','--fail','--silent','--show-error','--location','--retry','2','--user-agent','suffice-field-task-prep',url,'--output',str(path)],check=True)
 return path.read_bytes()
issue=json.loads(download(f'https://api.github.com/repos/{REPO}/issues/{ISSUE}',PRIVATE/'original-issue.json'))
fix=json.loads(download(f'https://api.github.com/repos/{REPO}/commits/{FIX}',PRIVATE/'fix-commit.json'));assert fix['parents'][0]['sha']==PARENT
(PRIVATE/'original-issue-body.md').write_bytes(issue['body'].encode())
archive=PRIVATE/'base-source.tar.gz';download(f'https://codeload.github.com/{REPO}/tar.gz/{PARENT}',archive)
BASE.mkdir();archive_paths=[]
with tarfile.open(archive) as tf:
 for member in tf:
  parts=Path(member.name).parts[1:]
  if not parts:continue
  target=BASE.joinpath(*parts)
  if member.isdir():target.mkdir(parents=True,exist_ok=True)
  elif member.isfile():target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(tf.extractfile(member).read());archive_paths.append('/'.join(parts))
references=[];patch=[]
for f in fix['files']:
 if f['filename'] not in ['atom/index.js','computed/index.js']:continue
 src=PRIVATE/'reference'/f['filename'];src.parent.mkdir(parents=True,exist_ok=True)
 data=download(f"https://raw.githubusercontent.com/{REPO}/{FIX}/{f['filename']}",src)
 assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==f['sha']
 references.append({'source':str(src),'target':f['filename']})
 patch.append('diff --git a/'+f['filename']+' b/'+f['filename']+'\n--- a/'+f['filename']+'\n+++ b/'+f['filename']+'\n'+f['patch']+'\n')
(PRIVATE/'reference-production.patch').write_text(''.join(patch))
with (PRIVATE/'install-sonion.log').open('w') as log:
 result=subprocess.run(['npm','exec','--yes','--package=pnpm@10.34.7','--','pnpm','install','--frozen-lockfile','--ignore-scripts'],cwd=BASE,stdout=log,stderr=subprocess.STDOUT)
assert result.returncode==0,'Install failed; preserve log'
for args in [['init','--initial-branch=task-base'],['config','user.name','Suffice Task Prep'],['config','user.email','task-prep@localhost'],['config','core.autocrlf','false'],['add','-f','--',*archive_paths],['commit','-m','Original pre-fix source and frozen dependency lock']]:subprocess.run(['git','-C',str(BASE),*args],check=True,stdout=subprocess.DEVNULL)
manifest={'id':'q04','cohort':'historical','repository':REPO,'issue':ISSUE,'url':issue['html_url'],'title':issue['title'],'publicBody':issue['body'],'baseCommit':PARENT,'fixCommit':FIX,'baseDir':str(BASE),'dependencyDir':str(BASE/'node_modules'),'nativeCommands':[],'acceptanceCommands':[],'graderOverlay':[],'referenceFiles':references,'referencePatch':str(PRIVATE/'reference-production.patch'),'controls':{'baselineAccepted':False,'referenceAccepted':False,'knownNativeFailures':[]},'ready':False,'complexity':'Cross-module reactive-state integration: atoms from one genuine module instance must invalidate computed values in another. Two production modules participate in epoch/cache coordination. Selected before controls using the explicit public expectation, not actor outcomes.','provenance':{'host':'sonion','fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'issue':str(PRIVATE/'original-issue.json'),'fix':str(PRIVATE/'fix-commit.json'),'archive':str(archive),'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'issueBodySha256':hashlib.sha256(issue['body'].encode()).hexdigest(),'preFixParentVerified':True,'lockSha256':hashlib.sha256((BASE/'pnpm-lock.yaml').read_bytes()).hexdigest(),'localBaseCommit':subprocess.check_output(['git','-C',str(BASE),'rev-parse','HEAD'],text=True).strip(),'nodeVersion':subprocess.check_output(['node','--version'],text=True).strip(),'nodeEngine':json.loads((BASE/'package.json').read_text())['engines']['node'],'freshness':'Previously harvested issue metadata only; no prior scored attempt or task package. q04 is a replacement selected after q03 contract hold, not a repair to q03.','dependencyLockFile':'pnpm-lock.yaml','packageManager':'pnpm@10.34.7','dependencyResolutionNote':'Original upstream pnpm lock, frozen installation with ignore-scripts matching original CI.','publicHints':'Original issue includes a proposed globalThis/Symbol approach; retained verbatim. Acceptance does not require this representation.'}}
(TD/'task.json').write_text(json.dumps(manifest,indent=2)+'\n');print('q04 prepared',flush=True)

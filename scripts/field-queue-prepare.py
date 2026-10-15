import pathlib, subprocess, json, tarfile, hashlib, shutil, datetime
ROOT=pathlib.Path(__file__).resolve().parent.parent
TASKS=ROOT/'.suffice/field-campaign-v1/tasks'
HIST=ROOT.parent/'github-field-test/research/historical/sindresorhus__p-queue'
SELECTION=[('q01',251,'Fixed-window limiter capacity and idle-window transitions; selected from public behavior and cross-suite regression scope before controls.'),('q02',249,'Queue size observer lifecycle across synchronous dequeues, concurrency changes and rate-limit ticks; selected before controls.'),('q03',168,'Cancellation and promise settlement interaction between running and waiting tasks; substantial public queue-state failure, selected before controls.')]
CAND=json.loads((ROOT.parent/'github-field-test/research/historical/screened-candidates-evaluator-only.json').read_text())['candidates']
def gh(endpoint):
 p=subprocess.run(['gh','api',endpoint],capture_output=True,check=True);return p.stdout
def save(p,b):p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
for ident,num,rationale in SELECTION:
 c=next(x for x in CAND if x['repo']=='sindresorhus/p-queue' and x['issue']==num)
 task=TASKS/ident;private=task/'private';base=task/'base';private.mkdir(parents=True,exist_ok=True)
 issuebytes=gh(f'repos/sindresorhus/p-queue/issues/{num}');issue=json.loads(issuebytes);save(private/'original-issue.json',issuebytes)
 fixbytes=gh(f"repos/sindresorhus/p-queue/commits/{c['fix_commit']}");fix=json.loads(fixbytes);save(private/'fix-commit.json',fixbytes)
 assert fix['parents'][0]['sha']==c['pre_fix_commit']
 save(private/'original-issue-body.md',issue['body'].encode())
 archive=private/'base-source.tar.gz'
 if not archive.exists(): subprocess.run(['curl.exe','-L','--fail','--silent','--show-error',f"https://codeload.github.com/sindresorhus/p-queue/tar.gz/{c['pre_fix_commit']}",'-o',str(archive)],check=True)
 if not base.exists():
  base.mkdir();
  with tarfile.open(archive) as tf:
   for member in tf:
    parts=pathlib.PurePosixPath(member.name).parts[1:]
    if not parts:continue
    target=base.joinpath(*parts)
    if member.isdir():target.mkdir(parents=True,exist_ok=True)
    elif member.isfile():save(target,tf.extractfile(member).read())
 patches=[];overlays=[]
 for f in fix['files']:
  path=f['filename']
  if path.startswith('source/'):
   patches.append('diff --git a/'+path+' b/'+path+'\n--- a/'+path+'\n+++ b/'+path+'\n'+f['patch']+'\n')
   data=gh(f"repos/sindresorhus/p-queue/contents/{path}?ref={c['fix_commit']}")
   import base64
   save(private/'reference'/path,base64.b64decode(json.loads(data)['content']))
  elif path.startswith('test/'):
   data=json.loads(gh(f"repos/sindresorhus/p-queue/contents/{path}?ref={c['fix_commit']}"))
   import base64
   src=private/'overlay'/path;save(src,base64.b64decode(data['content']));overlays.append({'source':str(src),'target':path})
 save(private/'reference-production.patch',''.join(patches).encode())
 manifest={'id':ident,'cohort':'historical','repository':'sindresorhus/p-queue','issue':num,'url':issue['html_url'],'title':issue['title'],'publicBody':issue['body'],'baseCommit':c['pre_fix_commit'],'fixCommit':c['fix_commit'],'baseDir':str(base),'dependencyDir':str(base/'node_modules'),'nativeCommands':[],'acceptanceCommands':[],'graderOverlay':overlays,'referencePatch':str(private/'reference-production.patch'),'controls':{'baselineAccepted':False,'referenceAccepted':False,'knownNativeFailures':[]},'ready':False,'complexity':rationale,'provenance':{'fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'issue':str(private/'original-issue.json'),'fix':str(private/'fix-commit.json'),'archive':str(archive),'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'issueBodySha256':hashlib.sha256(issue['body'].encode()).hexdigest(),'preFixParentVerified':True,'freshness':'No prior scored attempt; prior research only per campaign screening record.'}}
 save(task/'task.json',(json.dumps(manifest,indent=2)+'\n').encode())
 print(ident,num,c['pre_fix_commit'],flush=True)

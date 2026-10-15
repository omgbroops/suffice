import pathlib,json,urllib.request,tarfile,io,hashlib,datetime,subprocess,shutil
ROOT=pathlib.Path('C:/Users/Mohammed/Documents/GitHub/suffice-experiments/field-campaign-v1')
RESEARCH=ROOT/'research/field-campaign-v1/state'
TASKS=ROOT/'.suffice/field-campaign-v1/tasks'
OLD=ROOT.parent/'github-field-test/research/historical'
selected=[('s01','sindresorhus/emittery',118),('s02','nanostores/nanostores',323),('s03','nanostores/nanostores',416)]
for tid,repo,num in selected:
 p=RESEARCH/tid;p.mkdir(parents=True,exist_ok=True); base=TASKS/tid/'base';base.mkdir(parents=True,exist_ok=True)
 old=OLD/repo.replace('/','__')/str(num)
 for n in ['original-issue.json','original-issue-body.md','original-body-sha256.txt','fix-commit.json','timeline.json']:
  shutil.copyfile(old/n,p/n)
 fix=json.loads((p/'fix-commit.json').read_text());sha=fix['parents'][0]['sha']
 req=urllib.request.Request('https://api.github.com/repos/'+repo+'/commits/'+fix['sha'],headers={'User-Agent':'suffice-historical-task-control'})
 live=urllib.request.urlopen(req).read();(p/'live-fix-commit.json').write_bytes(live)
 assert json.loads(live)['parents'][0]['sha']==sha
 url=f'https://codeload.github.com/{repo}/tar.gz/{sha}'; data=urllib.request.urlopen(url).read();(p/'base.tar.gz').write_bytes(data)
 with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as tf:
  for m in tf.getmembers():
   bits=pathlib.PurePosixPath(m.name).parts[1:]
   if not bits:continue
   target=base.joinpath(*bits)
   if m.isdir():target.mkdir(parents=True,exist_ok=True)
   elif m.isfile():target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(tf.extractfile(m).read())
 private=p/'overlay';private.mkdir(exist_ok=True)
 for f in fix['files']:
  name=f['filename']; blob=urllib.request.urlopen(f'https://raw.githubusercontent.com/{repo}/{fix["sha"]}/{name}').read();dest=private/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(blob)
 (p/'provenance.json').write_text(json.dumps({'repository':repo,'issue':num,'baseCommit':sha,'fixCommit':fix['sha'],'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'archiveUrl':url,'archiveSha256':hashlib.sha256(data).hexdigest(),'selectedBeforeActors':True},indent=2))
 print(tid,sha,fix['sha'],flush=True)

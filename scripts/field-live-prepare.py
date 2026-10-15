import json, pathlib, subprocess, urllib.request, zipfile, io, sys, datetime, hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
RESEARCH=ROOT/'research/field-campaign-v1/live';RESEARCH.mkdir(parents=True,exist_ok=True)
repo,num,task=sys.argv[1:];num=int(num)
folder=RESEARCH/(repo.replace('/','__')+'-'+str(num));folder.mkdir(exist_ok=True)
def api(path):
 p=subprocess.run(['gh','api',path],capture_output=True,text=True,encoding='utf-8');p.check_returncode();return json.loads(p.stdout)
def save(name,obj): (folder/name).write_text(json.dumps(obj,indent=2,ensure_ascii=False),encoding='utf-8')
meta=api('repos/'+repo);head=api('repos/'+repo+'/commits/'+meta['default_branch']);issue=api(f'repos/{repo}/issues/{num}')
for name,obj in [('repository.json',meta),('head.json',head),('issue.json',issue),('comments.json',api(f'repos/{repo}/issues/{num}/comments?per_page=100')),('timeline.json',api(f'repos/{repo}/issues/{num}/timeline?per_page=100')),('open-prs.json',api(f'repos/{repo}/pulls?state=open&per_page=100'))]:save(name,obj)
base=ROOT/'.suffice/field-campaign-v1/tasks'/task/'base';base.mkdir(parents=True,exist_ok=False)
raw=urllib.request.urlopen(f'https://codeload.github.com/{repo}/zip/{head["sha"]}').read();(folder/'source.zip').write_bytes(raw)
with zipfile.ZipFile(io.BytesIO(raw)) as z:
 for item in z.infolist():
  parts=pathlib.PurePosixPath(item.filename).parts[1:]
  if item.is_dir() or not parts:continue
  if '..' in parts:raise RuntimeError('unsafe archive')
  dest=base.joinpath(*parts);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(z.read(item))
save('preparation.json',{'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'baseCommit':head['sha'],'baseDir':str(base),'archiveSha256':hashlib.sha256(raw).hexdigest()})
print(json.dumps({'task':task,'base':str(base),'sha':head['sha'],'scripts':json.loads((base/'package.json').read_text())['scripts']}))

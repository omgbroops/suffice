import json,subprocess,pathlib,datetime,concurrent.futures
root=pathlib.Path(r'C:\Users\Mohammed\Documents\GitHub\suffice-experiments\github-field-test\research\historical')
root.mkdir(parents=True,exist_ok=True)
candidates={'node-fetch/node-fetch':[1446,1442,1386,1574,1161,1123,1735], 'sindresorhus/p-queue':[255,256,251,249,168,200], 'sindresorhus/emittery':[126,118,113,102,51], 'nanostores/nanostores':[416,371,323], 'sindresorhus/p-limit':[110]}
def api(path):
 p=subprocess.run(['gh','api',path],capture_output=True,text=True,encoding='utf-8')
 if p.returncode: return {'error':p.stderr,'endpoint':path}
 return json.loads(p.stdout)
def job(pair):
 repo,n=pair; d=root/repo.replace('/','__')/str(n); d.mkdir(parents=True,exist_ok=True)
 issue=api(f'repos/{repo}/issues/{n}')
 (d/'original-issue.json').write_text(json.dumps(issue,ensure_ascii=False,indent=2),encoding='utf-8')
 (d/'original-issue-body.md').write_text(issue.get('body') or '',encoding='utf-8')
 timeline=api(f'repos/{repo}/issues/{n}/timeline?per_page=100')
 (d/'timeline.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf-8')
 comments=api(f'repos/{repo}/issues/{n}/comments?per_page=100')
 (d/'comments.json').write_text(json.dumps(comments,ensure_ascii=False,indent=2),encoding='utf-8')
 refs=[]
 if isinstance(timeline,list):
  for e in timeline:
   if e.get('event')=='closed': refs.append({'event':'closed','sha':e.get('commit_id')})
   if e.get('event')=='cross-referenced':
    s=e.get('source',{}).get('issue',{}); refs.append({'event':'ref','url':s.get('html_url'),'title':s.get('title'),'pr':bool(s.get('pull_request'))})
 return {'repo':repo,'number':n,'title':issue.get('title'),'state':issue.get('state'),'refs':refs}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
 rows=list(pool.map(job,[(r,n) for r,ns in candidates.items() for n in ns]))
(root/'harvest-index.json').write_text(json.dumps({'evaluator_only':True,'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidates':rows},indent=2),encoding='utf-8')
for row in rows: print(json.dumps(row))
for repo in candidates:
 d=root/repo.replace('/','__'); metadata=api(f'repos/{repo}'); (d/'repository-metadata.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
 print(json.dumps({'repo':repo,'pushed_at':metadata.get('pushed_at'),'archived':metadata.get('archived')}))

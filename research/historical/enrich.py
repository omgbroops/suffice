import json,subprocess,pathlib,datetime,concurrent.futures,base64
r=pathlib.Path(r'C:\Users\Mohammed\Documents\GitHub\suffice-experiments\github-field-test\research\historical')
choices=[('node-fetch/node-fetch',1386,'pr',1387),('node-fetch/node-fetch',1574,'pr',1578),('node-fetch/node-fetch',1446,'pr',1474),('node-fetch/node-fetch',1442,'pr',965),('sindresorhus/p-queue',255,'sha','22edad49b42214b9b5add8312391401c063d8b27'),('sindresorhus/p-queue',256,'sha','507e7eeab74970b991f1335b3f08cb5e08207ca3'),('sindresorhus/p-queue',251,'sha','08a012ac3ae20093ea90676a5b788ec4b73c58f6'),('sindresorhus/p-queue',249,'sha','d9cf2be011f3b7f127cac476de2d9927ed723491'),('sindresorhus/p-queue',168,'sha','81846550274256011a2d55b06aeb36b23877eb43'),('sindresorhus/emittery',126,'sha','a3c04ca97d9ebb13d04c8ba06031aa24d6f3382e'),('sindresorhus/emittery',118,'sha','dd6d78befbf664268471c61a8363884e96777cff'),('sindresorhus/emittery',113,'sha','fad52b902de9a91fd6c0ca934c3a610e17a57908'),('nanostores/nanostores',416,'pr',419),('nanostores/nanostores',371,'pr',396),('nanostores/nanostores',323,'pr',400),('sindresorhus/p-limit',110,'sha','9df0d27f82ab3cb6d7e1087f5bda94ce911d33ca')]
def api(p):
 p=subprocess.run(['gh','api',p],capture_output=True,text=True,encoding='utf-8')
 return json.loads(p.stdout) if p.returncode==0 else {'error':p.stderr}
def save(d,name,x): (d/name).write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf-8')
def job(c):
 repo,n,kind,ref=c; d=r/repo.replace('/','__')/str(n)
 if kind=='pr':
  pr=api(f'repos/{repo}/pulls/{ref}'); save(d,'fix-pull-request.json',pr); sha=pr.get('merge_commit_sha'); merged=pr.get('merged')
  fs=api(f'repos/{repo}/pulls/{ref}/files?per_page=100'); save(d,'fix-pr-files.json',fs)
 else: sha=ref; merged=None
 commit=api(f'repos/{repo}/commits/{sha}'); save(d,'fix-commit.json',commit)
 parents=commit.get('parents',[]); parent=parents[0]['sha'] if parents else None
 row={'repo':repo,'issue':n,'fix_kind':kind,'fix_ref':ref,'fix_commit':sha,'pre_fix_commit':parent,'pr_merged':merged,'fix_subject':commit.get('commit',{}).get('message','').split('\n')[0],'changes':[{k:f.get(k) for k in ['filename','status','additions','deletions']} for f in commit.get('files',[])]}
 if parent:
  package=api(f'repos/{repo}/contents/package.json?ref={parent}'); save(d,'pre-fix-package-api.json',package)
  if 'content' in package:
   package=json.loads(base64.b64decode(package['content'])); save(d,'pre-fix-package.json',package); row.update(scripts=package.get('scripts'),engines=package.get('engines'),dependencies=package.get('dependencies'),devDependencies=package.get('devDependencies'))
  tree=api(f'repos/{repo}/git/trees/{parent}?recursive=1'); save(d,'pre-fix-tree.json',tree)
 save(d,'evaluator-fix-summary.json',row); return row
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: rows=list(pool.map(job,choices))
save(r,'selected-16-evaluator-private.json',{'evaluator_only':True,'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidates':rows})
for x in rows: print(json.dumps(x))


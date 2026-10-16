import json,pathlib,subprocess,base64,concurrent.futures,hashlib,datetime
r=pathlib.Path(r'C:\Users\Mohammed\Documents\GitHub\suffice-experiments\github-field-test\research\historical')
data=json.loads((r/'selected-16-evaluator-private.json').read_text(encoding='utf-8'))
def api(p):
 q=subprocess.run(['gh','api',p],capture_output=True,text=True,encoding='utf-8'); return json.loads(q.stdout) if q.returncode==0 else {'error':q.stderr}
for issue in r.glob('*/*/original-issue.json'):
 i=json.loads(issue.read_text(encoding='utf-8')); b=(i.get('body') or '').encode('utf-8'); (issue.parent/'original-issue-body.md').write_bytes(b); (issue.parent/'original-body-sha256.txt').write_text(hashlib.sha256(b).hexdigest(),encoding='ascii')
def job(row):
 repo=row['repo']; n=row['issue']; d=r/repo.replace('/','__')/str(n); ref=row['pre_fix_commit']
 if repo=='node-fetch/node-fetch': paths=['test/main.js','test/utils/server.js','src/index.js']
 elif repo=='sindresorhus/p-queue': paths=['test/basic.ts' if n!=168 else 'test/test.ts','source/index.ts']
 elif repo=='sindresorhus/emittery': paths=['test/index.js','index.js']
 elif repo=='nanostores/nanostores': paths=['computed/index.test.ts','computed/index.js']
 else: paths=['test.js','index.js']
 fetched=[]
 for path in paths:
  x=api(f'repos/{repo}/contents/{path}?ref={ref}')
  if 'content' in x:
   target=d/'pre-fix-native-evidence'/path; target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(base64.b64decode(x['content'])); fetched.append(path)
  else: (d/('error-'+path.replace('/','__')+'.json')).write_text(json.dumps(x),encoding='utf-8')
 return {'repo':repo,'issue':n,'evidence':fetched}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
 for x in pool.map(job,data['candidates']): print(json.dumps(x))

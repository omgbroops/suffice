import pathlib,json,hashlib,zipfile,datetime
R=pathlib.Path(__file__).resolve().parents[2];D=R/'.suffice/three-harness-effort-v1';O=pathlib.Path(__file__).resolve().parent
secrets=[]
def collect(x):
 if isinstance(x,dict):
  for k,v in x.items():
   if k.lower() in ['access','refresh','access_token','refresh_token','api_key','key'] and isinstance(v,str) and len(v)>=12:secrets.append(v.encode())
   collect(v)
 elif isinstance(x,list):
  for v in x:collect(v)
for p in [R/'.suffice/pi/auth.json',R/'.suffice/codex-native-home/auth.json',*D.glob('attempts/*/worker/codex-home/auth.json')]:
 if p.exists():collect(json.loads(p.read_text()))
out=R/'.suffice/review-bundles';out.mkdir(parents=True,exist_ok=True);dest=out/('three-harness-effort-v1-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.zip');manifest={}
with zipfile.ZipFile(dest,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for folder in [R/'experiments/three-harness-effort-v1',O,D]:
  for p in sorted(folder.rglob('*')):
   if not p.is_file() or p.is_symlink():continue
   parts=p.relative_to(folder).parts
   if 'codex-home' in parts and 'sessions' not in parts:continue
   if any(x in ['dependencies','node_modules','.git','__pycache__','actors','evaluation','base','reference'] for x in parts):continue
   if p.name in ['auth.json','credentials.json','.env','models_cache.json','BUNDLE.json'] or p.suffix in ['.sqlite','.db','.shm','.wal'] or p.name.endswith(('-wal','-shm','-journal')):continue
   b=p.read_bytes()
   if any(s in b for s in secrets):raise RuntimeError('Credential literal found; archive not deliverable')
   rel=p.relative_to(R).as_posix();z.writestr(rel,b);manifest[rel]=hashlib.sha256(b).hexdigest()
 for rel in [*json.loads((R/'reports/general-v1/frozen-configuration.json').read_text())['inputs'],'.gitattributes','reports/general-v1/frozen-configuration.json','experiments/codex-sol-xhigh-v2/source-manifest.json',*['experiments/codex-sol-xhigh-v2/runtime-source/'+p for p in json.loads((R/'experiments/codex-sol-xhigh-v2/source-manifest.json').read_text())['inputs']]]:
  p=R/rel;b=p.read_bytes()
  if any(secret in b for secret in secrets):raise RuntimeError('Credential in frozen source')
  z.writestr(rel,b);manifest[rel]=hashlib.sha256(b).hexdigest()
 z.writestr('MANIFEST.json',json.dumps(manifest,indent=2)+'\n')
with zipfile.ZipFile(dest) as z:
 assert z.testzip() is None
 for rel,digest in manifest.items():assert hashlib.sha256(z.read(rel)).hexdigest()==digest
receipt={'path':str(dest),'bytes':dest.stat().st_size,'files':len(manifest),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'credentialLiteralsExcluded':True,'excludes':'Installed dependencies, full actor/evaluator copies, auth files, Git metadata and native state databases and native plugin/catalog caches. Public base/reference tarballs and scoped patches remain included.'}
(O/'BUNDLE.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True)

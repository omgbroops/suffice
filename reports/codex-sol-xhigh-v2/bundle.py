"""Export available comparison evidence; exclude credentials and installed runtimes."""
from pathlib import Path
import datetime,hashlib,json,os,zipfile
ROOT=Path(__file__).resolve().parents[2];REPORT=Path(__file__).resolve().parent
roots=['experiments/codex-sol-xhigh-v1','experiments/codex-sol-xhigh-v2','reports/codex-sol-xhigh-v1','reports/codex-sol-xhigh-v2','.suffice/codex-sol-xhigh-v1','.suffice/codex-sol-xhigh-v2','.suffice/codex-sol-xhigh-posthoc-v2','research/field-campaign-v1','.suffice/field-campaign-v1/tasks']
exclude={'node_modules','.git','__pycache__','actors','actor','evaluation','chart-runtime'}
selected={}
def add(p):
 if not p.is_file()or p.is_symlink():return
 rel=p.relative_to(ROOT)
 if any(x in exclude for x in rel.parts)or p.name in ['auth.json','credentials.json','host-id','host-id.json','BUNDLE.json']or p.name.startswith('.env'):return
 if p.suffix in ['.sqlite','.sqlite-shm','.sqlite-wal','.db']:return
 if 'codex-home'in rel.parts and 'sessions'not in rel.parts and p.name!='models_cache.json':return
 selected[rel.as_posix()]=p
for root in roots:
 for folder,dirs,names in os.walk(ROOT/root,followlinks=False):
  dirs[:]=[x for x in dirs if x not in exclude and not(Path(folder)/x).is_symlink()]
  for name in names:add(Path(folder)/name)
for pattern in ['scripts/sonion-*.py','scripts/sonion-*.mjs','scripts/freeze-general.mjs','docs/SONION-*.md','.gitattributes','.suffice/luna-baseline-v2/preflight/*/validated.json']:
 for p in ROOT.glob(pattern):add(p)
freeze=json.loads((ROOT/'reports/general-v1/frozen-configuration.json').read_text())
for rel,expected in freeze['inputs'].items():
 p=ROOT/rel;assert hashlib.sha256(p.read_bytes()).hexdigest()==expected,rel;add(p)
add(ROOT/'reports/general-v1/frozen-configuration.json')
case={}
for rel in selected:
 if rel.casefold()in case:raise RuntimeError('Case-colliding archive paths: '+rel)
 case[rel.casefold()]=rel
secrets=[]
def collect(v,k=''):
 if isinstance(v,dict):
  for key,x in v.items():collect(x,key)
 elif isinstance(v,list):
  for x in v:collect(x,k)
 elif isinstance(v,str)and len(v)>=24 and any(s in k.lower()for s in ['access','refresh','token','secret','password','api_key']):secrets.append(v.encode())
for p in [ROOT/'.suffice/pi/auth.json',ROOT/'.suffice/codex-native-home/auth.json',*(ROOT/'.suffice/codex-sol-xhigh-v2/attempts').glob('*/worker/codex-home/auth.json')]:
 if p.exists():collect(json.loads(p.read_text()))
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')
out=ROOT/'.suffice/review-bundles'/f'codex-sol-xhigh-v2-{stamp}.zip';out.parent.mkdir(exist_ok=True)
manifest={}
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=5)as z:
 for rel,p in sorted(selected.items()):
  b=p.read_bytes()
  if any(s in b for s in secrets):raise RuntimeError('Credential literal found; export blocked: '+rel)
  z.writestr(rel,b);manifest[rel]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
 readme='''# Suffice versus native Codex — Sol xhigh\n\nStart with reports/codex-sol-xhigh-v2/RESULTS.md and REVIEW.md.\nmetrics.json and attempts.csv contain the comparison. INDEX-METHOD.md\nexplains why ten-issue acceptance is not the Coding Agent Index.\n\nV1 contains a preserved interrupted first job and compatibility checks.\nV2 contains all planned matched sessions. Unknown costs remain unknown.\nFrozen grades and supplementary post-hoc findings are distinct.\nSource snapshots, before/after patch bytes, raw response usage, native\nrollouts, test commands, controls, available failures and manifests are\nincluded. Missing in-flight usage is disclosed, never manufactured.\n\nCredentials, installed dependencies, Git objects, full actor/evaluation\nworkspace copies and native state databases are excluded. Reconstruct\npatches from each task's public base/archive plus patch.json. Original\nactor test edits are preserved but restored during independent grading.\nPrivate references/graders are included for human review; actors could\nnot access these files. Never expose them to future evaluation actors.\n\nReproduction needs Linux/bubblewrap, the pinned Node/Pi/Codex releases,\nthe recorded dependencies and one's own authorized login. Rebase host\npaths only in a new copy. Prior baselines and artifacts are unchanged.\nNo PRs or maintainer messages were sent. API-equivalent benchmark\ninference is not subscription cash spending or total project cost.\n'''
 z.writestr('BUNDLE-README.md',readme);manifest['BUNDLE-README.md']={'bytes':len(readme.encode()),'sha256':hashlib.sha256(readme.encode()).hexdigest()}
 z.writestr('MANIFEST.json',json.dumps({'files':manifest,'credentialLiteralCheckPassed':True,'originalFrozenInputsVerified':len(freeze['inputs']),'exclusions':sorted(exclude)+['auth files','native state databases']},indent=2)+'\n')
with zipfile.ZipFile(out)as z:
 assert z.testzip()is None
 for rel,e in manifest.items():assert hashlib.sha256(z.read(rel)).hexdigest()==e['sha256'],rel
receipt={'path':out.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,'files':len(manifest),'credentialLiteralCheckPassed':True,'archiveIntegrityVerified':True}
(REPORT/'BUNDLE.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))

"""Export completed fresh cohort with SHA receipts; no credentials or installed deps."""
import pathlib,json,hashlib,zipfile,datetime,os
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'reports/luna-fresh-v1'
result=json.loads((OUT/'FINAL-RESULTS.json').read_text());assert result['complete'],'Do not label an incomplete campaign final'
assert all(result['integrity'][k] for k in ['allUsageMatched','frozenSourceInputsMatched','taskAndDependencyFreezeMatched'])
prefixes=['experiments/luna-fresh-v1','reports/luna-fresh-v1','research/luna-fresh-v1','.suffice/luna-fresh-v1']
exclude={'node_modules','.git','__pycache__','actors','actor','evaluation','public','workspace'};files={}
def add(p):
 if not p.is_file() or p.is_symlink():return
 rel=p.relative_to(ROOT).as_posix()
 if p.name in ['BUNDLE.json','LOCAL-RECONCILIATION.json','auth.json','credentials.json','host-id','host-id.json'] or p.name.startswith('.env'):return
 if any(x in exclude for x in p.relative_to(ROOT).parts):return
 files[rel]=p
for prefix in prefixes:
 for folder,dirs,names in os.walk(ROOT/prefix,followlinks=False):
  dirs[:]=[d for d in dirs if d not in exclude and not (pathlib.Path(folder)/d).is_symlink()]
  for name in names:add(pathlib.Path(folder)/name)
for pattern in ['scripts/audit-luna-fresh-*','scripts/report-luna-fresh.py','scripts/finalize-luna-fresh.py','scripts/package-luna-fresh.py','scripts/luna-fresh-handoff*','scripts/sonion-ssh.py','scripts/freeze-general.mjs']:
 for p in ROOT.glob(pattern):add(p)
for p in ROOT.glob('.suffice/luna-safeguards-v1/attempts/*-C/result.json'):add(p)
for rel in ['.suffice/field-campaign-v1/attempts/q02-suffice/result.json','reports/luna-safeguards-v1/posthoc-regressions.json','experiments/luna-safeguards-v1/variants/C/source-manifest.json']:add(ROOT/rel)
frozen=json.loads((ROOT/'reports/general-v1/frozen-configuration.json').read_text())['inputs']
for rel,h in frozen.items():assert hashlib.sha256((ROOT/rel).read_bytes()).hexdigest()==h;add(ROOT/rel)
add(ROOT/'reports/general-v1/frozen-configuration.json')
folded={}
for rel in files:
 key=rel.casefold()
 if key in folded:raise RuntimeError('Windows case collision: '+folded[key]+' / '+rel)
 folded[key]=rel
secrets=[]
def collect(v,key=''):
 if isinstance(v,dict):
  for k,x in v.items():collect(x,k)
 elif isinstance(v,list):
  for x in v:collect(x,key)
 elif isinstance(v,str) and len(v)>=16 and any(k in key.lower() for k in ['access','refresh','token','secret','password']):secrets.append(v.encode())
collect(json.loads((ROOT/'.suffice/pi/auth.json').read_text()))
readme='''# Fresh Luna xhigh comparison review bundle

Start with reports/luna-fresh-v1/RESULTS.md, FINAL-RESULTS.json and REVIEW.md.
Six fresh-to-actor GitHub issues, four repos (three p-map cases). A = frozen
ordinary Luna Extra High; B = same plus ONE original-public regression gate
with one bounded repair. Both have the same cumulative inference allowance.
Independent upstream issue/test provenance and parent assertion review are
documented; no second human/model reviewer or engineering subagents.

All task source bytes, original upstream snapshots, review mappings, reference
patches and private graders are included for HUMAN review only. Never mount
private graders/reference copies into a worker. Buggy/reference controls and
all setup failures, public gate JS/TS/mutation controls, worker patches,
provider usage/request/tool events and independent grading are preserved.
Dependencies use recorded locks; node_modules, Git object stores and full
actor/evaluation workspaces are omitted. Reconstruct from base + patch.json.

Costs are catalog-priced API-equivalent inference, including failed responses
and repairs when known. They exclude engineering-agent inference and are not
subscription cash charges. Old 7/10 issues are development reuse, separate
from this cohort. No new stock-Pi, Sol/Astra parity or universal superiority
claim is established by a Luna-only comparison.

Absolute Sonion paths are retained as evidence. Reproduction requires a NEW
host/path metadata copy, the pinned Node24.15/Pi1.2.0 runtime, one's own login,
Linux/bubblewrap, immutable dependencies and the archived task/prompt/model
hashes. Do not mutate archived frozen input files to rebase paths. A source
is byte-identical to the earlier xhigh baseline; general-v1 original14 hashes
are rechecked. Public AVA cache:false is an environment configuration only.

MANIFEST.json hashes all exported files. Optional handoff studies, if any,
are separate from the A/B primary outcomes; only public signals may trigger
Sol and combined Luna+Sol cost must remain within the task allowance.
'''
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S');archive=ROOT/'.suffice/review-bundles'/f'luna-fresh-v1-{stamp}.zip';archive.parent.mkdir(parents=True,exist_ok=True);manifest={};total=0
try:
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for rel,p in sorted(files.items()):
   b=p.read_bytes()
   if any(s in b for s in secrets):raise RuntimeError('Credential literal found; export stopped: '+rel)
   z.writestr(rel,b);manifest[rel]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()};total+=len(b)
  b=readme.encode();z.writestr('BUNDLE-README.md',b);manifest['BUNDLE-README.md']={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
  z.writestr('MANIFEST.json',json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':manifest,'credentialLiteralCheckPassed':True,'frozenOriginalInputsVerified':14,'excluded':sorted(exclude)},indent=2)+'\n')
 with zipfile.ZipFile(archive) as z:
  assert z.testzip() is None
  for rel,e in manifest.items():assert hashlib.sha256(z.read(rel)).hexdigest()==e['sha256']
 receipt={'path':archive.relative_to(ROOT).as_posix(),'bytes':archive.stat().st_size,'files':len(manifest),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'integrityVerified':True,'credentialLiteralCheckPassed':True,'completedAttempts':len(result['rows'])}
 (OUT/'BUNDLE.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
except BaseException:
 if archive.exists():archive.unlink()
 raise

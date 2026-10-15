"""Export the completed retry campaign and controls, excluding credentials."""
import pathlib,json,hashlib,zipfile,datetime,os
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'reports/luna-safeguards-v1';plan=json.loads((ROOT/'experiments/luna-safeguards-v1/plan.json').read_text(encoding='utf8'))
prefixes=['experiments/luna-safeguards-v1','experiments/luna-baseline-v1/runtime-source','reports/luna-safeguards-v1','.suffice/luna-safeguards-v1','.suffice/luna-safeguards-probe-audit-v1','.suffice/luna-safeguards-probe-audit-v2','.suffice/luna-safeguards-posthoc-v1','.suffice/luna-safeguards-gate-audit-v1','research/field-campaign-v1/audits/historical-patch-review/probes']
for id in plan['tasks']:prefixes+=['.suffice/field-campaign-v1/tasks/'+id,'.suffice/luna-baseline-v2/preflight/'+id]
exclude={'node_modules','.git','__pycache__','actors','actor','evaluation','public'};files={}
def add(p):
 if not p.is_file() or p.is_symlink():return
 rel=p.relative_to(ROOT).as_posix()
 if rel in ['reports/luna-safeguards-v1/BUNDLE.json','reports/luna-safeguards-v1/LOCAL-RECONCILIATION.json']:return
 if any(x in exclude for x in p.relative_to(ROOT).parts) or p.name in ['auth.json','credentials.json','host-id','host-id.json'] or p.name.startswith('.env'):return
 files[rel]=p
for prefix in prefixes:
 p=ROOT/prefix
 if not p.exists():continue
 for folder,dirs,names in os.walk(p,followlinks=False):
  dirs[:]=[d for d in dirs if d not in exclude and not (pathlib.Path(folder)/d).is_symlink()]
  for name in names:add(pathlib.Path(folder)/name)
for pattern in ['scripts/audit-luna-safeguards-*','scripts/report-luna-safeguards-final.py','scripts/package-luna-safeguards.py','scripts/sonion-ssh.py','scripts/freeze-general.mjs']:
 for p in ROOT.glob(pattern):add(p)
add(ROOT/'.suffice/luna-baseline-v2/driver-state.json')
for id in plan['tasks']:add(ROOT/'.suffice/luna-baseline-v2/attempts'/f'{id}-suffice/result.json')
frozen=json.loads((ROOT/'reports/general-v1/frozen-configuration.json').read_text(encoding='utf8'))['inputs']
for name,h in frozen.items():
 p=ROOT/name
 assert hashlib.sha256(p.read_bytes()).hexdigest()==h,('Original frozen drift',name)
 add(p)
add(ROOT/'reports/general-v1/frozen-configuration.json')
folded={}
for rel in files:
 key=rel.casefold()
 if key in folded:raise RuntimeError('Windows filename collision: '+folded[key]+' / '+rel)
 folded[key]=rel
secrets=[]
def collect(v,key=''):
 if isinstance(v,dict):
  for k,x in v.items():collect(x,k)
 elif isinstance(v,list):
  for x in v:collect(x,key)
 elif isinstance(v,str) and len(v)>=16 and any(x in key.lower() for x in ['access','refresh','token','secret','password']):secrets.append(v.encode())
collect(json.loads((ROOT/'.suffice/pi/auth.json').read_text(encoding='utf8')))
readme='''# Luna safeguards versus extra-high: review evidence

Start at reports/luna-safeguards-v1/RESULTS.md. Frozen primary scores are
2/10 ordinary-low, 3/10 low+safeguards, 7/10 xhigh. Separate post-hoc checks
found a regression in C/s01 and incomplete behavior in B/q02. Do not interpret
all primary passes as complete fixes. The gate has documented environment/
loader limitations and actor-generated probes vary in validity/relevance.

This is development reuse of ten issues, not a fresh holdout. No subagents,
new Sol/Astra/Pi comparison, baseline promotion or subsequent campaign ran.
All benchmark costs are known; engineering/preparation inference is excluded.
Catalog-priced API-equivalent estimates are not subscription cash charges.

The archive contains frozen runtime copies and exact substitutions, task
source snapshots and dependency manifests/locks, original private grading
and references for human review, reused preflight controls, all 30 attempts,
before/after repair patches, provider/usage/tool events, public check output,
original grading receipts and separate model-free post-hoc controls.

Installed dependencies, full actor/evaluation/public workspace copies, Git
object databases and credentials are excluded. Reconstruct from task base
plus patch.json; preserve original tests for grading. MANIFEST.json hashes
every exported file. Source and patch material are sufficient to reconstruct
the omitted working copies, but dependency installation is still required.

Reproduction requires one's own authorized login, pinned Node 24.15.0 /
Pi 1.2.0 / package locks, Linux or existing WSL with bubblewrap, and rebasing
absolute paths in NEW metadata copies. Original actor task bases contain one
public Git snapshot, not future fix history. Use plan.json and PROTOCOL.md;
set SUFFICE_SAFEGUARDS_ARM to A, B or C and stage its runtime copy. Replace
remote host paths in a new host adapter rather than changing archived inputs.
The historical control reuse and setup proofs are preserved, not asserted
to be freshly executed native/hidden controls in this campaign.
'''
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S');archive=ROOT/'.suffice/review-bundles'/f'luna-safeguards-v1-{stamp}.zip';archive.parent.mkdir(parents=True,exist_ok=True);manifest={};total=0
try:
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for rel,p in sorted(files.items()):
   b=p.read_bytes()
   if any(s in b for s in secrets):raise RuntimeError('Credential literal found; export stopped: '+rel)
   z.writestr(rel,b);manifest[rel]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()};total+=len(b)
  b=readme.encode();z.writestr('BUNDLE-README.md',b);manifest['BUNDLE-README.md']={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()};total+=len(b)
  z.writestr('MANIFEST.json',json.dumps({'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':manifest,'frozenOriginalInputsVerified':14,'credentialLiteralCheckPassed':True,'excluded':sorted(exclude)+['credentials']},indent=2)+'\n')
 with zipfile.ZipFile(archive) as z:
  assert z.testzip() is None
  for rel,e in manifest.items():assert hashlib.sha256(z.read(rel)).hexdigest()==e['sha256'],rel
 receipt={'path':archive.relative_to(ROOT).as_posix(),'archiveBytes':archive.stat().st_size,'uncompressedBytes':total,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':len(manifest),'frozenInputsVerified':14,'credentialLiteralCheckPassed':True,'integrityVerified':True,'completedAttempts':30}
 (OUT/'BUNDLE.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8');print(json.dumps(receipt))
except BaseException:
 if archive.exists():archive.unlink()
 raise

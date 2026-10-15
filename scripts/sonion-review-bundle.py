"""Export this campaign's complete review evidence, without auth or dependencies."""
import datetime, hashlib, json, os, pathlib, zipfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
prefixes=[
 'research/field-campaign-v1','research/field-live-extension-v1',
 'reports/field-accounting','reports/field-adjudication-v1','reports/field-campaign-v1','reports/real-github-field-v1',
 'reports/luna-baseline-v2','reports/luna-evidence-v1',
 'experiments/luna-baseline-v1','experiments/public-evidence-v1','experiments/luna-evidence-v1','experiments/luna-evidence-report-v1',
 '.suffice/field-campaign-v1','.suffice/field-campaign-v2',
 '.suffice/field-adjudication-v1','.suffice/field-live-repair-v1','.suffice/field-live-extension-v1',
 '.suffice/luna-baseline-v1','.suffice/luna-baseline-v2',
 '.suffice/luna-evidence-v1','.suffice/public-evidence-v1','.suffice/remote-ready',
]
exclude={'node_modules','.git','__pycache__','actors','actor','evaluation'}
files={}
def add(p):
 if not p.is_file() or p.is_symlink():return
 rel=p.relative_to(ROOT).as_posix()
 if rel=='reports/real-github-field-v1/BUNDLE.json':return  # Avoid a self-referential prior archive receipt.
 if any(s in exclude for s in p.relative_to(ROOT).parts):return
 if p.name in ['auth.json','credentials.json','host-id','host-id.json'] or p.name.startswith('.env'):return
 files[rel]=p
for prefix in prefixes:
 start=ROOT/prefix
 if not start.exists():continue
 for folder,dirs,names in os.walk(start,followlinks=False):
  dirs[:]=[d for d in dirs if d not in exclude and not (pathlib.Path(folder)/d).is_symlink()]
  for name in names:add(pathlib.Path(folder)/name)
frozen=json.loads((ROOT/'reports/general-v1/frozen-configuration.json').read_text())
for name,h in frozen['inputs'].items():
 p=ROOT/name
 assert hashlib.sha256(p.read_bytes()).hexdigest()==h,('Frozen input changed',name)
 add(p)
add(ROOT/'reports/general-v1/frozen-configuration.json')
for pattern in ['scripts/sonion-*','scripts/field-*','scripts/freeze-general.mjs','docs/SONION-*.md','docs/FIELD-CAMPAIGN-V1.md','docs/FIELD-ADJUDICATION-V1.md','docs/research/LUNA-EVIDENCE-RESEARCH.md']:
 for p in ROOT.glob(pattern):add(p)
# Compare credential token literals without printing them or exporting the file.
secrets=[]
auth=ROOT/'.suffice/pi/auth.json'
if auth.exists():
 def tokens(v,key=''):
  if isinstance(v,dict):
   for k,x in v.items():tokens(x,k)
  elif isinstance(v,list):
   for x in v:tokens(x,key)
  elif isinstance(v,str) and len(v)>=16 and any(s in key.lower() for s in ['access','refresh','token','secret','password']):secrets.append(v.encode())
 tokens(json.loads(auth.read_text()))
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')
out=ROOT/'.suffice/review-bundles'/f'real-github-field-v1-{stamp}.zip';out.parent.mkdir(parents=True,exist_ok=True)
manifest={};size=0
readme='''# Suffice real GitHub field review bundle

Start at reports/real-github-field-v1/OVERNIGHT.md (if present) and RESULTS.md.
Frozen primary results and posthoc review are distinct. Every initial model
attempt, operationally invalid integration attempt, failed provider event,
partial preparation, model-only calibration, optional evidence pilot and live
repair is retained in its own directory. API-equivalent costs exclude engineering
inference and are not subscription charges. Missing usage is unknown, not zero.

All original public source files, task metadata, dependency manifests/locks,
private references/graders, preflight and control receipts, submitted patch.json
before/after bytes, worker/transcript/provider-event logs and independent audits
are included. Reconstruct submitted source from task base + patch.json; test edits
are preserved as evidence but restored during independent grading. Full actor
and evaluation directory copies, installed dependencies, Git object databases,
credentials, and host identity are intentionally excluded. Source archives and
fix patches/blobs remain included. MANIFEST.json hashes every exported file.

Reproduction requires Linux/WSL with bubblewrap, the pinned Node/Pi versions in
the manifests and one's own authorized model login. Restore public bases from
the included source/archives, initialize a clean one-commit Git repository, install
the recorded dependency locks, and rebase absolute paths in a NEW copy of task
metadata. Do not change original campaign artifacts. The source includes the
original Windows draft, remote host adapter, corrected versioned evaluator,
hashed control-completion bridges and failed setup receipts. Follow the final
version/selection policy in reports/field-accounting/normalized.json; do not use
provisional v1 integration codingFailure labels as real coding failures.

Actor contexts never received the private references/graders included here for
human review. Public-evidence contexts were authored separately from original
issue/source only. Historical issues are exposed calibration, not proof of
unseen generalization. No upstream PR or maintainer communication occurred.
'''
try:
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for rel,p in sorted(files.items()):
   b=p.read_bytes()
   if any(secret in b for secret in secrets):raise RuntimeError('Credential literal found; export stopped: '+rel)
   z.writestr(rel,b);manifest[rel]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()};size+=len(b)
  z.writestr('BUNDLE-README.md',readme)
  manifest['BUNDLE-README.md']={'bytes':len(readme.encode()),'sha256':hashlib.sha256(readme.encode()).hexdigest()};size+=len(readme.encode())
  z.writestr('MANIFEST.json',json.dumps({'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':manifest,'exclusions':sorted(exclude)+['credentials','host identity'],'frozenGeneralInputsVerified':True,'credentialLiteralCheckPassed':True},indent=2)+'\n')
 with zipfile.ZipFile(out) as z:
  assert z.testzip() is None
  for rel,e in manifest.items():assert hashlib.sha256(z.read(rel)).hexdigest()==e['sha256'],rel
 receipt={'path':str(out.relative_to(ROOT)),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'archiveBytes':out.stat().st_size,'uncompressedBytes':size,'files':len(manifest),'frozenGeneralInputCount':len(frozen['inputs']),'credentialLiteralCheckPassed':True,'archiveIntegrityVerified':True}
 (ROOT/'reports/real-github-field-v1/BUNDLE.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps(receipt))
except BaseException:
 if out.exists():out.unlink()
 raise

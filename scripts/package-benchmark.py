"""Local-only review bundle, including public benchmark actor receipts, no auth/deps."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,zipfile,tarfile
ROOT=Path(__file__).resolve().parents[1]
LIMIT=160*1024**2
def digest(data):return hashlib.sha256(data).hexdigest()
def main():
 selections=['src','benchmarks/benchmark-v1','benchmarks/benchmark-staged-v1','reports/benchmark-v1','reports/benchmark-staged-v1','docs/benchmark-v1','package.json','package-lock.json','.gitattributes','scripts/benchmark-v1.mjs','scripts/benchmark-staged-pilot.mjs','scripts/audit-benchmark-receipts.mjs','scripts/package-benchmark.py','tests/benchmark-governance.test.mjs','tests/benchmark-receipts.test.mjs','.suffice/benchmark-v1/calibration-v1','.suffice/benchmark-staged-v1']
 paths=[]
 for rel in selections:
  p=ROOT/rel
  if not p.exists():continue
  paths.extend([p] if p.is_file() else p.rglob('*'))
 auth=ROOT/'.suffice/pi/auth.json';secrets=[]
 if auth.exists():
  for record in json.loads(auth.read_text(encoding='utf-8')).values():
   if isinstance(record,dict):
    secrets.extend(v.encode() for k,v in record.items() if k in ('access','refresh','key') and isinstance(v,str) and len(v)>12)
 # This exact 37-byte .env is public upstream fixture data, not machine auth.
 source=ROOT/'benchmarks/benchmark-v1/tasks/bottleneck-weighted-priority'
 provenance=json.loads((source/'source.json').read_text(encoding='utf-8'))
 archive=source/'download/upstream.tar.gz'
 if digest(archive.read_bytes())!=provenance['archiveSha256']:raise ValueError('Public archive hash')
 with tarfile.open(archive)as tar:
  member=next(m for m in tar.getmembers() if m.name.split('/',1)[-1]=='.env')
  public_env=tar.extractfile(member).read()
 env_sha=provenance['manifest']['.env']['sha256']
 if digest(public_env)!=env_sha:raise ValueError('Public fixture hash')
 entries={};total=0;public_env_paths=[]
 for p in sorted(set(paths)):
  if p.is_symlink() or (hasattr(p,'is_junction') and p.is_junction()):raise ValueError('Link in export')
  if not p.is_file():continue
  rel=p.relative_to(ROOT).as_posix()
  if 'independent-replay' in p.relative_to(ROOT).parts:continue
  if any(part in ('node_modules','.git','pi') for part in p.relative_to(ROOT).parts):raise ValueError('Forbidden selection')
  if p.name in ('auth.json','active.lock'):raise ValueError('Private or active file')
  data=p.read_bytes();total+=len(data)
  if p.name.startswith('.env'):
   if p.name!='.env' or digest(data)!=env_sha:raise ValueError('Unexpected environment file')
   public_env_paths.append(rel)
  if total>LIMIT:raise ValueError('Export bound')
  if any(secret in data for secret in secrets):raise ValueError('Credential match; no value printed')
  entries[rel]={'bytes':len(data),'sha256':digest(data),'source':p}
 target=ROOT/'.suffice/review-bundles'/('benchmark-v1-'+datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')+'.zip');target.parent.mkdir(parents=True,exist_ok=True)
 manifest={'files':[{k:v for k,v in {'path':rel,**item}.items() if k!='source'}for rel,item in entries.items()],'uncompressedBytes':total,'credentialMatches':0,'publicUpstreamEnvironmentFixture':{'sha256':env_sha,'bytes':len(public_env),'paths':public_env_paths,'archiveSha256':provenance['archiveSha256']},'scope':'Public real-repository fixtures, graders, authored reference, frozen calibration inputs and benchmark actor receipts. No engineering transcripts/auth/dependencies. Stock-agent comparisons not executed. Read STATUS and per-phase results for incomplete/unknown accounting.'}
 with zipfile.ZipFile(target,'x',zipfile.ZIP_DEFLATED,compresslevel=6)as z:
  for rel,item in entries.items():
   data=item['source'].read_bytes()
   if digest(data)!=item['sha256']:raise ValueError('File changed during packaging')
   z.writestr(rel,data)
  z.writestr('MANIFEST.json',json.dumps(manifest,indent=2))
 with zipfile.ZipFile(target)as z:
  if z.testzip() is not None:raise ValueError('CRC mismatch')
  for rel,item in entries.items():
   if digest(z.read(rel))!=item['sha256']:raise ValueError('Readback mismatch')
 receipt={'path':str(target),'sha256':digest(target.read_bytes()),'files':len(entries)+1,'uncompressedBytes':total,'zipBytes':target.stat().st_size,'verified':True,'credentialMatches':0}
 (ROOT/'reports/benchmark-v1/bundle-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print(json.dumps(receipt))
if __name__=='__main__':main()

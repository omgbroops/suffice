"""Export this completed paired pilot and all benchmark receipts, locally."""
import datetime, hashlib, json, re, tarfile, zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
campaign = root / '.suffice/external-pi-v1'
if (campaign / 'active.lock').exists():
    raise RuntimeError('Campaign is still active')
load = lambda p: json.loads(p.read_text(encoding='utf-8'))
sha = lambda b: hashlib.sha256(b).hexdigest()
m = load(campaign / 'manifest.json')
for name, digest in m['inputs'].items():
    if sha((root / name).read_bytes()) != digest:
        raise RuntimeError('Frozen input mismatch: ' + name)
tasks = ['fastq-resume-window', 'bottleneck-weighted-priority',
         'emittery-iterator-lifecycle', 'tinyqueue-heap-state']
folders = ['src', 'docs/external-pi', 'reports/external-pi',
           '.suffice/external-pi-v1', '.suffice/external-preflight']
folders += ['benchmarks/benchmark-v1/tasks/' + t for t in tasks]
files = ['package.json', 'package-lock.json', '.gitattributes',
         'scripts/external-pi.mjs', 'scripts/audit-external-pi.mjs',
         'scripts/audit-benchmark-receipts.mjs', 'scripts/package-external-pi.py',
         'tests/external-pi.test.mjs', 'docs/benchmark-v1/RESULTS.md',
         'reports/benchmark-v1/contract-review.json',
         'reports/benchmark-v1/contract-review.receipt-4.json',
         'reports/benchmark-v1/fixture-origins.json']
paths = {root / f for f in files}
for folder in folders:
    for p in (root / folder).rglob('*'):
        if p.is_symlink() or p.is_junction():
            raise RuntimeError('Unexpected link in explicit export scope')
        if p.is_file() and p.name not in {'BUNDLE.json', 'EXPORT-VALIDATION.json'}:
            paths.add(p)

# Only this exact public upstream environment fixture may be included.
archive = root / 'benchmarks/benchmark-v1/tasks/bottleneck-weighted-priority/download/upstream.tar.gz'
public_env = set()
with tarfile.open(archive) as tf:
    for member in tf.getmembers():
        if member.isfile() and Path(member.name).name == '.env':
            public_env.add(sha(tf.extractfile(member).read()))
patterns = [re.compile(rb'\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}'),
            re.compile(rb'\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}')]
payload = {}; public_env_files = 0
for p in sorted(paths):
    if p.name in {'auth.json', 'login-status.json', 'host-id', 'catalog.json', 'active.lock'} or 'node_modules' in p.parts:
        raise RuntimeError('Forbidden credential/dependency path in export')
    data = p.read_bytes()
    if p.name == '.env':
        if sha(data) not in public_env:
            raise RuntimeError('Environment file is not the pinned public fixture')
        public_env_files += 1
    if any(pattern.search(data) for pattern in patterns):
        raise RuntimeError('Credential-like content detected; no value printed')
    payload[p.relative_to(root).as_posix()] = data
if sum(map(len, payload.values())) > 128 * 1024**2:
    raise RuntimeError('Review bundle exceeds disk bound')
at = datetime.datetime.now(datetime.timezone.utc)
manifest = {'at': at.isoformat(), 'entrypoint': 'docs/external-pi/RESULTS.md',
            'scope': 'All eight live attempts, frozen inputs, model-free probes and referenced task/review evidence. No credentials, dependencies or parent engineering transcripts.',
            'files': {name: sha(data) for name, data in payload.items()}}
payload['BUNDLE-MANIFEST.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
outdir = root / '.suffice/review-bundles'; outdir.mkdir(parents=True, exist_ok=True)
target = outdir / ('external-pi-v1-' + at.strftime('%Y%m%d-%H%M%S') + '.zip')
with zipfile.ZipFile(target, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for name, data in payload.items(): z.writestr(name, data)
with zipfile.ZipFile(target) as z:
    if z.testzip() is not None or set(z.namelist()) != set(payload):
        raise RuntimeError('ZIP entry/CRC validation failed')
    if any(sha(z.read(name)) != sha(data) for name, data in payload.items()):
        raise RuntimeError('ZIP content hash validation failed')
receipt = {'at': at.isoformat(), 'path': str(target), 'sha256': sha(target.read_bytes()),
           'zipBytes': target.stat().st_size, 'files': len(payload),
           'uncompressedBytes': sum(map(len, payload.values())),
           'allEntryHashesVerified': True, 'credentialStoresExcluded': True,
           'credentialPatternMatches': 0, 'verifiedPublicEnvFiles': public_env_files}
encoded = (json.dumps(receipt, indent=2) + '\n').encode()
(root / 'reports/external-pi/BUNDLE.json').write_bytes(encoded)
Path('C:/Users/Mohammed/Documents/GitHub/suffice/reports/EXTERNAL-PI-BUNDLE.json').write_bytes(encoded)
print(json.dumps(receipt))

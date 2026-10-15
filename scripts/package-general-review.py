"""Export the completed general-v1 pilot; never read credentials/dependencies."""
import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.suffice/review-bundles'
REPORT = ROOT / 'reports/general-field-pilot-v1'
SKIP = {'node_modules', '.git', '__pycache__', '.pi', 'pi'}
SECRET_NAMES = {'auth.json', 'credentials.json', '.env', '.env.local'}
TOKEN = re.compile(rb'(?:sk-(?:proj-)?[A-Za-z0-9_-]{32,}|gh[pousr]_[A-Za-z0-9]{30,}|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,})')

def digest(data):
    return hashlib.sha256(data).hexdigest()

def load(path):
    return json.loads(path.read_text(encoding='utf-8'))

def main():
    for required in ['RESULTS.md', 'SETUP-INCIDENTS.md', 'results.json', 'validation.json',
                     'receipt-audit.json', 'independent-review.json', 'independent-review.md',
                     'independent-replay.json', 'independent-replay.md', 'final-preservation.json']:
        if not (REPORT / required).is_file():
            raise RuntimeError('Required final deliverable absent: ' + required)
    if not load(REPORT/'receipt-audit.json')['passed']:
        raise RuntimeError('Receipt audit must pass')
    files = {}

    def add(path, name):
        name = str(PurePosixPath(name))
        if name.startswith('/') or '..' in PurePosixPath(name).parts or ':' in name:
            raise RuntimeError('Unsafe archive path: ' + name)
        if path.is_symlink():
            raise RuntimeError('Unexpected export symlink: ' + str(path))
        if path.name in SECRET_NAMES or any(p in SKIP for p in PurePosixPath(name).parts):
            raise RuntimeError('Forbidden export: ' + name)
        data = path.read_bytes()
        if TOKEN.search(data):
            raise RuntimeError('Potential credential pattern; review locally: ' + name)
        if name in files:
            raise RuntimeError('Duplicate export path: ' + name)
        files[name] = data

    def tree(path, prefix):
        if not path.exists():
            return
        for directory, dirs, names in os.walk(path, followlinks=False):
            dirs[:] = sorted(d for d in dirs if d not in SKIP and not (Path(directory)/d).is_symlink())
            for name in sorted(names):
                p = Path(directory)/name
                if p == ROOT/'.suffice/compat/repo/outside-link':
                    # This deliberately escaping Linux test symlink is not a
                    # readable Windows file. Preserve its target as metadata.
                    target = subprocess.run(['wsl.exe', '-d', 'Ubuntu', '--', 'readlink',
                                             '/mnt/c/'+str(p)[3:].replace('\\', '/')],
                                            capture_output=True, text=True, check=True).stdout.strip()
                    if target != '/runtime/package.json':
                        raise RuntimeError('Compatibility fixture link drift')
                    files['compatibility/fixture-symlink.json'] = json.dumps({
                        'path': 'repo/outside-link', 'target': target,
                        'export': 'metadata only; intentionally escaping link, never followed'
                    }, indent=2).encode('utf-8')
                    continue
                if name in SECRET_NAMES or p.is_symlink():
                    continue
                add(p, PurePosixPath(prefix)/PurePosixPath(p.relative_to(path).as_posix()))

    for p in ['package.json', 'package-lock.json', '.gitattributes', 'configs/general-v1.json']:
        add(ROOT/p, 'harness/'+p)
    tree(ROOT/'src', 'harness/src')
    tree(ROOT/'docs/general-v1', 'harness/docs/general-v1')
    tree(ROOT/'reports/general-v1', 'harness/reports/general-v1')
    tree(REPORT, 'harness/reports/general-field-pilot-v1')
    for path in sorted((ROOT/'scripts').iterdir()):
        if path.is_file() and ('general' in path.name or path.name in ['audit-benchmark-receipts.mjs', 'repair-dependency-links.py']):
            add(path, 'harness/scripts/'+path.name)
    add(ROOT/'tests/general-compatibility.mjs', 'harness/tests/general-compatibility.mjs')

    campaign = ROOT/'.suffice/general-field-pilot-v1'
    add(campaign/'manifest.json', 'campaign/manifest.json')
    for id in ['001', '002', '003']:
        tree(campaign/id, 'campaign/'+id)
        for entry in load(campaign/id/'patch.json'):
            if entry['after'] is not None:
                import base64
                name = 'submissions/'+id+'/files/'+entry['path']
                parts = PurePosixPath(name).parts
                if '..' in parts or ':' in name or name.startswith('/'):
                    raise RuntimeError('Unsafe submitted path')
                data = base64.b64decode(entry['after'], validate=True)
                if TOKEN.search(data):
                    raise RuntimeError('Potential credential in submitted file')
                files[name] = data
    tree(campaign/'controls', 'campaign/controls')
    tree(ROOT/'.suffice/general-field-replay-v1/receipts', 'replay/receipts')
    tree(ROOT/'.suffice/general-field-replay-v1/logs', 'replay/logs')
    for p in sorted((ROOT/'.suffice/general-field-replay-v1').iterdir()):
        if p.is_file():
            add(p, 'replay/'+p.name)
    tree(ROOT/'.suffice/compat', 'compatibility')
    tree(ROOT/'.suffice/boundary-validation', 'boundary-validation')
    tree(ROOT/'.suffice/general-preflight', 'preflight')
    field = ROOT/'.suffice/field-v1'
    tree(field/'private', 'evaluator-only/private')
    tree(field/'dependency-receipts', 'preparation/dependency-receipts')
    tree(field/'setup-receipts', 'preparation/setup-receipts')
    for p in field.glob('*.log'):
        add(p, 'preparation/'+p.name)
    manifest = load(campaign/'manifest.json')
    for task in ['h02', 'l01']:
        for p, expected in manifest['inputs']['base/'+task].items():
            path = field/'bases'/task/p
            if digest(path.read_bytes()) != expected:
                raise RuntimeError('Frozen base drift: '+task+'/'+p)
            add(path, 'initial-source/'+task+'/'+p)
        add(ROOT.parent/'github-field-test/.suffice/field/archives'/(task+'.zip'), 'upstream-archives/'+task+'.zip')
    tree(ROOT.parent/'github-field-test/research/historical', 'evaluator-only/research/historical')
    tree(ROOT.parent/'github-field-test/research/live', 'evaluator-only/research/live')
    files['README.md'] = ('''# Suffice general-v1 review bundle

Start with `harness/reports/general-field-pilot-v1/RESULTS.md` and the independent review/replay reports beside it.
This includes evaluator-only requirements/provenance, hidden checks, historical reference source and research notes.
Do not mount evaluator-only material, this bundle, or other attempts into an agent's task workspace.
No credentials, node_modules, Git stores or runtime binaries are exported.

`campaign/001`, `002`, `003` preserve every scored attempt and raw provider/tool usage events.
`initial-source/` contains the exact public pre-attempt sources and generated dependency locks.
`submissions/` contains submitted final changed files, including agent tests; original tests were restored for grading.
`harness/` contains source, configuration, freeze manifests, evaluator utilities and reports.
Compatibility/setup failures are preserved where standalone receipts exist; the incident report describes limits.

Inference estimates are API-equivalent; engineering/evaluator inference and actual subscription spending are not priced here.
Pinned dependencies/runtime must be installed separately to reproduce tests. Local absolute paths in receipts are provenance,
not portable executable paths. See the replay helper and configuration documentation for commands and runtime setup.
SHA256-MANIFEST.json hashes every other archive member. The external bundle receipt records the ZIP hash and full CRC/hash verification.
''').encode('utf-8')
    hashes = {name: {'sha256': digest(data), 'bytes': len(data)} for name, data in sorted(files.items())}
    files['SHA256-MANIFEST.json'] = (json.dumps(hashes, indent=2)+'\n').encode('utf-8')
    OUT.mkdir(parents=True, exist_ok=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')
    destination = OUT/('general-field-pilot-v1-'+stamp+'.zip')
    with zipfile.ZipFile(destination, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for name, data in sorted(files.items()):
            z.writestr(name, data)
    with zipfile.ZipFile(destination) as z:
        if z.testzip() is not None or len(z.namelist()) != len(files):
            raise RuntimeError('Archive integrity failed')
        for name, entry in hashes.items():
            if digest(z.read(name)) != entry['sha256']:
                raise RuntimeError('Export hash mismatch: '+name)
    revision = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    receipt = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'path': str(destination),
               'sha256': digest(destination.read_bytes()), 'bytes': destination.stat().st_size,
               'members': len(files), 'crcAndEveryMemberHashPassed': True, 'revisionAtExport': revision,
               'excluded': ['authentication', 'node_modules', '.git', 'runtime binaries', 'bulk evaluation/replay directories'],
               'containsPrivateEvaluationMaterial': True, 'knownBenchmarkApiEquivalentUsd': 0.2380184}
    (REPORT/'bundle-receipt.json').write_text(json.dumps(receipt, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(receipt))

if __name__ == '__main__':
    main()

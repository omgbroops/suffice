"""Build a local, verified review archive without credentials or engineering transcripts.

Reviewable Git files are included for root and every named research worktree.
An optional reports/evidence-export.json in each tree may list extra public benchmark
artifacts as {"files": ["relative/path", ...]}. Its explicit list must be reviewed.
No inference, networking, dependency installation, or source mutations occur here.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zipfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
NAMES = ['adaptive-effort', 'retrieval', 'test-execution', 'cache-retention',
         'failure-recovery', 'nemotron-retrieval', 'evidence-record']
MAX_TOTAL = 150 * 1024 * 1024
MAX_FILE = 25 * 1024 * 1024


def digest(data):
    return hashlib.sha256(data).hexdigest()


def credentials():
    values = []
    env = ROOT / '.env'
    if env.exists():
        for line in env.read_text(encoding='utf-8-sig').splitlines():
            name, sep, value = line.partition('=')
            if sep and name.strip() in ('OPENROUTER_API_KEY', 'JEV_API_KEY'):
                values.append(value.strip().strip('\"\''))
    auth = ROOT / '.suffice/pi/auth.json'
    if auth.exists():
        for item in json.loads(auth.read_text(encoding='utf-8')).values():
            if isinstance(item, dict):
                values.extend(item.get(k) for k in ('access', 'refresh', 'key'))
    return [v.encode() for v in values if isinstance(v, str) and len(v) >= 12]


def allowed_file(tree, rel, extra=False):
    # Reject drive-qualified, absolute, traversal and private infrastructure paths.
    if not isinstance(rel, str) or ':' in rel or '\\' in rel:
        raise ValueError('Invalid relative export path')
    p = Path(rel)
    if p.is_absolute() or '..' in p.parts:
        raise ValueError('Export path escapes worktree')
    if any(x in ('.git', 'node_modules', 'pi') for x in p.parts):
        raise ValueError('Private/infrastructure path in export: ' + rel)
    if p.name.startswith('.env') or p.name in ('auth.json', 'transcript.json'):
        raise ValueError('Private transcript or credential path in export: ' + rel)
    if p.parts and p.parts[0] == '.suffice' and not extra:
        raise ValueError('Private state unexpectedly reviewable: ' + rel)
    current = tree
    for part in p.parts:
        current = current / part
        if current.is_symlink() or (hasattr(current, 'is_junction') and current.is_junction()):
            raise ValueError('Linked path cannot be exported: ' + rel)
    target = (tree / p).resolve(strict=True)
    if not target.is_relative_to(tree.resolve()) or not target.is_file():
        raise ValueError('Not a contained file: ' + rel)
    if target.stat().st_size > MAX_FILE:
        raise ValueError('Export file exceeds size bound: ' + rel)
    return target


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--include-export-manifests', action='store_true')
    args = parser.parse_args()
    output = Path(args.output).resolve()
    if output.exists():
        raise ValueError('Refusing to replace existing archive')
    trees = [('suffice', ROOT)] + [('suffice-experiments/' + name,
        ROOT.parent / 'suffice-experiments' / name) for name in NAMES]
    secrets = credentials()
    entries, inventories, total = [], [], 0
    for prefix, tree in trees:
        if not tree.is_dir():
            raise ValueError('Expected worktree missing: ' + prefix)
        result = subprocess.run(['git', 'ls-files', '--cached', '--others',
            '--exclude-standard', '-z'], cwd=tree, capture_output=True, check=True)
        paths = {p: False for p in result.stdout.decode('utf-8').split('\0') if p}
        export = tree / 'reports/evidence-export.json'
        if args.include_export_manifests and export.exists():
            for rel in json.loads(export.read_text(encoding='utf-8'))['files']:
                paths[rel] = True
        count = 0
        for rel, extra in sorted(paths.items()):
            # Template .env.example is optional and excluded by the same private-name rule.
            if Path(rel).name.startswith('.env'):
                if Path(rel).name == '.env.example':
                    continue
                raise ValueError('Credential file is not ignored')
            target = allowed_file(tree, rel, extra)
            data = target.read_bytes()
            if any(value in data for value in secrets):
                raise ValueError('Credential match in ' + prefix + '/' + rel)
            total += len(data)
            if total > MAX_TOTAL:
                raise ValueError('Uncompressed archive bound exceeded')
            entries.append((prefix + '/' + rel, target, len(data), digest(data)))
            count += 1
        inventories.append({'tree': prefix, 'files': count,
            'exportManifestIncluded': bool(args.include_export_manifests and export.exists())})
    manifest = {'createdAt': datetime.now(timezone.utc).isoformat(), 'trees': inventories,
        'uncompressedBytes': total, 'files': [{'path': n, 'bytes': size, 'sha256': sha}
            for n, _, size, sha in entries], 'credentialMatches': 0}
    readme = '''# Suffice research review bundle

This archive preserves the sibling worktree layout so relative report links work.
Start at suffice/reports/PARALLEL-EXPERIMENTS-RESULTS.md for the earlier six investigations,
and suffice/docs/EVIDENCE-EXPERIMENTS.md for the new retrieval/evidence-record round.
Latest conclusions are linked from suffice/STATUS.md. Child reports and implementation
files are included under suffice-experiments/<name>/, not just linked to another PC.

Reviewable source, protocols, reports and tests are included. If explicitly supplied
and selected, evidence-export.json lists additional public benchmark artifacts.
Complete engineering conversations, credentials, shared dependencies and raw private
transcripts are excluded. A hash audit proves artifact consistency, not that a grader
is semantically correct. Read each report's exclusions and independent-validation scope.
API-equivalent benchmark estimates exclude engineering inference and retain unknown costs.
The two new worktrees supply explicit public-evidence exports for cached reproduction.
Older worktrees supply their detailed reports and reviewable implementation; their full
ignored raw campaign archives are not included unless an export manifest says otherwise.

MANIFEST.json records every exported source file's SHA-256 and size. The archive is
read back and checked against it after creation. No code is run merely by opening it.
Do not rerun paid/live experiments casually: each protocol has explicit resource bounds.
'''
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for name, target, size, sha in entries:
            data = target.read_bytes()
            if len(data) != size or digest(data) != sha:
                raise ValueError('Source changed while packaging: ' + name)
            z.writestr(name, data)
        z.writestr('MANIFEST.json', json.dumps(manifest, indent=2))
        z.writestr('README.md', readme)
    with zipfile.ZipFile(output) as z:
        if len(z.namelist()) != len(entries) + 2 or z.testzip() is not None:
            raise ValueError('Archive inventory or CRC mismatch')
        for name, _, size, sha in entries:
            data = z.read(name)
            if len(data) != size or digest(data) != sha:
                raise ValueError('Archive hash mismatch: ' + name)
    print(json.dumps({'archive': str(output), 'files': len(entries),
        'uncompressedBytes': total, 'zipBytes': output.stat().st_size,
        'verified': True, 'credentialMatches': 0}))


if __name__ == '__main__':
    main()

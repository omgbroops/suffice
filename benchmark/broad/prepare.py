"""Prepare isolated historical sources/dependencies on Sonion; never invokes a model.

Inputs are reviewed cohort specs and grader files authored on the local machine.
No package lifecycle scripts run during dependency installation. Existing fixtures
are retained on failure; no recursive deletion or overwrite of ready tasks.
"""
import argparse, base64, hashlib, io, json, os, pathlib, re, subprocess, tarfile, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
STATE = ROOT / '.suffice/broad-bench-v1'

def read_json(path):
    return json.loads(path.read_text(encoding='utf8'))

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf8')

def digest(value):
    return hashlib.sha256(value).hexdigest()

def safe_relative(name):
    p = pathlib.PurePosixPath(name)
    if not name or p.is_absolute() or '..' in p.parts or ':' in name or '\\' in name:
        raise ValueError('Unsafe relative path: ' + name)
    return p

def download(repository, commit, destination, cache):
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
        raise ValueError('Invalid repository')
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Require full commit SHA')
    if not cache.exists():
        url = f'https://codeload.github.com/{repository}/tar.gz/{commit}'
        request = urllib.request.Request(url, headers={'User-Agent': 'Suffice-broad-evaluator'})
        with urllib.request.urlopen(request, timeout=90) as response:
            body = response.read(48 * 1024**2 + 1)
        if len(body) > 48 * 1024**2:
            raise ValueError('Source archive too large')
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(body)
    destination.mkdir(parents=True, exist_ok=True)
    total = 0
    with tarfile.open(fileobj=io.BytesIO(cache.read_bytes()), mode='r:gz') as archive:
        for member in archive:
            parts = pathlib.PurePosixPath(member.name).parts
            if len(parts) < 2:
                continue
            rel = safe_relative('/'.join(parts[1:]))
            if '.git' in rel.parts or 'node_modules' in rel.parts:
                raise ValueError('Archive contains excluded metadata/dependencies')
            target = destination.joinpath(*rel.parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                total += member.size
                if total > 160 * 1024**2 or member.size > 24 * 1024**2:
                    raise ValueError('Expanded source too large')
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.extractfile(member).read())
                target.chmod(0o755 if member.mode & 0o111 else 0o644)
            elif member.issym() or member.islnk():
                # Packages with source links need an explicit preparer amendment.
                raise ValueError('Source archive link requires review: ' + str(rel))
            else:
                raise ValueError('Unsupported source archive entry')
    return digest(cache.read_bytes())

def run(argv, cwd, log, timeout=360):
    if not isinstance(argv, list) or not argv or any(not isinstance(x, str) or '\0' in x for x in argv):
        raise ValueError('Commands require argv')
    with log.open('ab') as output:
        result = subprocess.run(argv, cwd=cwd, stdout=output, stderr=subprocess.STDOUT, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f'Command failed ({result.returncode}); see {log}')

def source_files(folder):
    return sorted(p for p in folder.rglob('*') if p.is_file() and not p.is_symlink()
                  and '.git' not in p.relative_to(folder).parts and 'node_modules' not in p.relative_to(folder).parts)

def protected(name):
    return bool(re.search(r'(^|/)(test|tests|test-d|spec|fixtures|__tests__|__fixtures__)(/|$)|(^|[./_-])(test|spec)([./_-]|$)', name))

def prepare(spec, revision='v1'):
    ident = spec['id']
    if not re.fullmatch(r'b\d{2}', ident):
        raise ValueError('Invalid task ID')
    if not re.fullmatch(r'[A-Za-z0-9_-]+', revision):
        raise ValueError('Invalid fixture revision')
    folder = STATE / 'fixtures' / revision / ident
    ready = folder / 'task.json'
    published = STATE / 'tasks' / ident / 'task.json'
    spec_hash = digest(json.dumps(spec, sort_keys=True).encode())
    if spec.get('setupCommands'):
        raise ValueError('Host-side repository setup commands are disabled; use source loaders or a separately reviewed sandboxed build: ' + ident)
    if ready.exists():
        prior = read_json(ready)
        if prior['preparation']['specSha256'] != spec_hash:
            raise RuntimeError('Ready task spec changed: ' + ident)
        (pathlib.Path(prior['dependencyDir']) / '.cache').mkdir(exist_ok=True)
        write_json(published, prior)
        print(json.dumps({'id': ident, 'ready': True, 'reused': True}), flush=True)
        return
    marker = folder / 'preparation-input.json'
    if folder.exists() and any(folder.iterdir()) and not marker.exists():
        raise RuntimeError('Unmarked partial preparation preserved: ' + ident)
    if marker.exists() and read_json(marker)['specSha256'] != spec_hash:
        raise RuntimeError('Changed partial preparation preserved; use a distinct task fixture revision: ' + ident)
    folder.mkdir(parents=True, exist_ok=True)
    write_json(marker, {'specSha256': spec_hash})
    base = folder / 'base'
    reference = folder / 'private/reference'
    caches = STATE / 'source-archives'
    cache_prefix = spec['repository'].replace('/', '--')
    base_archive = download(spec['repository'], spec['baseCommit'], base, caches / f'{cache_prefix}-{spec["baseCommit"]}.tgz')
    fix_archive = download(spec['repository'], spec['fixCommit'], reference, caches / f'{cache_prefix}-{spec["fixCommit"]}.tgz')
    package = read_json(base / 'package.json')
    dev = package.get('devDependencies', {})
    selected = list(dev) if spec.get('allDevDependencies') else spec.get('selectedDevDependencies', [])
    dependencies = {**package.get('dependencies', {}), **{name: dev[name] for name in selected if name in dev}, **spec.get('dependencyOverrides', {})}
    if any('/' in str(version) or ':' in str(version) or str(version).startswith('git+') for version in dependencies.values()):
        raise ValueError('Non-registry dependency requires explicit review: ' + ident)
    dependency_hash = digest(json.dumps(dependencies, sort_keys=True).encode())
    dependency_dir = STATE / 'dependencies' / dependency_hash[:20]
    dependency_dir.mkdir(parents=True, exist_ok=True)
    write_json(dependency_dir / 'package.json', {'private': True, 'dependencies': dependencies})
    if not (dependency_dir / 'installed.json').exists():
        run(['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--legacy-peer-deps'], dependency_dir, dependency_dir / 'install.log')
        # Empty dependency sets may omit node_modules; an empty ro directory is valid.
        (dependency_dir / 'node_modules').mkdir(exist_ok=True)
        write_json(dependency_dir / 'installed.json', {'dependencySha256': dependency_hash, 'installScriptsDisabled': True})
    (dependency_dir / 'node_modules/.cache').mkdir(exist_ok=True)
    for tree in [base, reference]:
        link = tree / 'node_modules'
        if not link.exists():
            link.symlink_to(dependency_dir / 'node_modules', target_is_directory=True)
    if not (base / '.git').exists():
        subprocess.run(['git', 'init', '-q', str(base)], check=True)
        names = [p.relative_to(base).as_posix() for p in source_files(base)]
        subprocess.run(['git', '-C', str(base), 'add', '--force', '--pathspec-from-file=-', '--pathspec-file-nul'], input=('\0'.join(names) + '\0').encode(), check=True)
        subprocess.run(['git', '-C', str(base), '-c', 'user.name=Suffice fixture', '-c', 'user.email=fixture@localhost', 'commit', '-qm', 'Public repository snapshot'], check=True)
    patch = []
    for name in spec['changedPaths']:
        safe_relative(name)
        if protected(name):
            raise ValueError('Reference production patch includes protected test path: ' + name)
        before = (base / name).read_bytes() if (base / name).is_file() else None
        after = (reference / name).read_bytes() if (reference / name).is_file() else None
        if before != after:
            patch.append({'path': name, 'before': None if before is None else base64.b64encode(before).decode(), 'after': None if after is None else base64.b64encode(after).decode(), 'protectedTest': False})
    if not patch:
        raise ValueError('No production reference change: ' + ident)
    reference_patch = folder / 'private/reference-patch.json'
    write_json(reference_patch, patch)
    overlay = []
    grader_hashes = {}
    for target, local_source in spec['graderFiles'].items():
        safe_relative(target)
        relative = safe_relative(local_source)
        source = ROOT.joinpath(*relative.parts)
        if not source.is_file():
            raise ValueError('Missing authored grader: ' + local_source)
        overlay.append({'source': str(source), 'target': target})
        grader_hashes[local_source] = digest(source.read_bytes())
    task = {'id': ident, 'repository': spec['repository'], 'issue': spec['issue'], 'title': spec['title'], 'publicBody': spec['publicBody'], 'url': spec['url'], 'baseCommit': spec['baseCommit'], 'fixCommit': spec['fixCommit'], 'baseDir': str(base), 'dependencyDir': str(dependency_dir / 'node_modules'), 'nativeCommands': spec['nativeCommands'], 'acceptanceCommands': spec['acceptanceCommands'], 'graderOverlay': overlay, 'referencePatchJson': str(reference_patch), 'nativeParser': spec.get('nativeParser', 'exit-only'), 'controls': {'baselineAccepted': False, 'referenceAccepted': True, 'nativeExitCodes': spec.get('nativeExitCodes', [0] * len(spec['nativeCommands']))}, 'ready': True, 'cohort': 'fresh-to-this-evaluation historical open-source issues', 'contractReview': {'reviewedBeforeInference': True, 'reviewer': 'separate evaluator preparation agents and parent; public issue/API contracts', 'sources': spec['sources'], 'notes': spec['contractNotes']}, 'preparation': {'specSha256': spec_hash, 'baseArchiveSha256': base_archive, 'fixArchiveSha256': fix_archive, 'graderSha256': grader_hashes, 'dependencySha256': dependency_hash, 'dependencyLockSha256': digest((dependency_dir / 'package-lock.json').read_bytes()), 'installScriptsDisabled': True}}
    write_json(ready, task)
    write_json(published, task)
    print(json.dumps({'id': ident, 'ready': True, 'repository': spec['repository']}), flush=True)

if __name__ == '__main__':
    if os.name != 'posix' or not str(ROOT).startswith('/home/eric_qin/'):
        raise SystemExit('Preparation runs on Sonion only')
    parser = argparse.ArgumentParser()
    parser.add_argument('--revision', default='v1')
    parser.add_argument('ids', nargs='*')
    args = parser.parse_args()
    cohort = read_json(ROOT / 'benchmark/broad/cohort.json')
    for spec in cohort['tasks']:
        if not args.ids or spec['id'] in args.ids:
            prepare(spec, args.revision)

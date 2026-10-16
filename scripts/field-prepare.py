"""Evaluator-only source acquisition. Never puts future Git objects in actor history."""
import io, json, pathlib, subprocess, sys, urllib.request, zipfile
ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = ROOT / '.suffice' / 'field'
def git(path, *args):
    return subprocess.check_output(['git', '-C', str(path), *args], text=True).strip()
def acquire(task, repo, revision):
    folder = BASE / 'bases' / task
    if folder.exists():
        raise RuntimeError('Preserve existing acquisition: ' + str(folder))
    url = f'https://codeload.github.com/{repo}/zip/{revision}'
    archive = urllib.request.urlopen(url, timeout=90).read()
    (BASE / 'archives').mkdir(parents=True, exist_ok=True)
    (BASE / 'archives' / (task + '.zip')).write_bytes(archive)
    folder.mkdir(parents=True)
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        for entry in z.infolist():
            parts = pathlib.PurePosixPath(entry.filename).parts[1:]
            if not parts or entry.is_dir(): continue
            if any(p in ('..', '.', '') or ':' in p for p in parts): raise RuntimeError('Unsafe archive')
            if ((entry.external_attr >> 16) & 0o170000) == 0o120000: raise RuntimeError('Link in archive')
            target = folder.joinpath(*parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(z.read(entry))
    git(folder, 'init', '-q')
    git(folder, 'config', 'core.autocrlf', 'false')
    git(folder, 'config', 'commit.gpgsign', 'false')
    (folder / '.git' / 'info' / 'exclude').write_text('\nnode_modules/\n', encoding='utf-8')
    git(folder, 'add', '--', '.')
    git(folder, '-c', 'user.name=Field evaluation', '-c', 'user.email=field@localhost', 'commit', '-qm', 'Pinned upstream source snapshot')
    print(json.dumps({'task': task, 'repo': repo, 'upstreamRevision': revision, 'base': str(folder), 'localRevision': git(folder, 'rev-parse', 'HEAD'), 'archiveBytes': len(archive)}))
if __name__ == '__main__': acquire(*sys.argv[1:])

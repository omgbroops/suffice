"""Reconstruct submitted patches and original tests; reuse pinned dependencies read-only."""
import hashlib, json, os, pathlib, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIELD = ROOT / '.suffice/field-v1'
OUT = ROOT / '.suffice/general-field-replay-v1'

def long(p): return pathlib.Path('\\\\?\\' + str(pathlib.Path(p).resolve()))
def linux(p):
    s = str(p).replace('\\', '/')
    if s.startswith('//?/'): s = s[4:]
    return '/mnt/' + s[0].lower() + s[2:]
def wsl(*args):
    r = subprocess.run(['wsl.exe', '-d', 'Ubuntu', '--', *map(str, args)], capture_output=True, text=True)
    if r.returncode: raise RuntimeError(r.stderr or r.stdout)
    return r.stdout
def digest(p): return hashlib.sha256(long(p).read_bytes()).hexdigest()
def copy_file(src, dst):
    dst = long(dst); dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(long(src), dst)
def copy_deps(src, dst):
    src, dst = long(src), long(dst)
    links, count, size = [], 0, 0
    def visit(folder):
        nonlocal count, size
        for entry in os.scandir(folder):
            source = pathlib.Path(entry.path); rel = source.relative_to(src)
            target = dst / rel
            if entry.is_symlink(): links.append(rel.as_posix())
            elif entry.is_dir(follow_symlinks=False):
                target.mkdir(parents=True, exist_ok=True); visit(source)
            elif entry.is_file(follow_symlinks=False):
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target); count += 1; size += entry.stat().st_size
    dst.mkdir(parents=True); visit(src)
    linkfile = OUT / (dst.parent.name + '-dependency-links.json')
    linkfile.write_text(json.dumps({'links': links}), encoding='utf8')
    result = wsl('python3', linux(ROOT/'scripts/repair-dependency-links.py'), linux(src), linux(dst), linux(linkfile))
    return {'filesCopied': count, 'bytesCopied': size, 'links': len(links), 'linkRestoration': result.strip(), 'sharedHardlinks': False}

if __name__ == '__main__':
    if OUT.exists() and ('--resume-preparation' not in sys.argv or (OUT/'reconstruction.json').exists()): raise RuntimeError('Preserve existing replay tree: ' + str(OUT))
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for ident, task in [('001','h02'), ('002','h02'), ('003','l01')]:
        base = FIELD/'bases'/task; dest = OUT/('attempt-'+ident)
        files = wsl('git','-C',linux(base),'ls-files','-z').split('\0')
        files = [p for p in files if p]
        initial = {p: digest(base/p) for p in files}
        for p in files: copy_file(base/p, dest/p)
        if {p: digest(dest/p) for p in files} != initial: raise RuntimeError('Base copy mismatch')
        patch = ROOT/'.suffice/general-field-pilot-v1'/ident/'tracked.patch'
        checked = wsl('env','GIT_CEILING_DIRECTORIES='+linux(OUT),'git','-C',linux(dest),'apply','--check',linux(patch))
        applied = wsl('env','GIT_CEILING_DIRECTORIES='+linux(OUT),'git','-C',linux(dest),'apply',linux(patch))
        submitted = {p: digest(dest/p) for p in files}
        restored = [p for p in files if p.startswith(('test/','tests/'))]
        for p in restored: copy_file(base/p, dest/p)
        dep_source = ROOT/'.suffice/general-field-pilot-v1/evaluation'/('attempt-'+ident)/'node_modules'
        if not dep_source.is_dir(): raise RuntimeError('Missing pinned evaluator dependencies')
        (dest/'node_modules').mkdir(exist_ok=True)
        deps = {'source':str(dep_source),'reusedPinnedEvaluatorDependencies':True,'readOnlyBindRequired':True,'partialIndependentCopyPreserved':ident=='001'}
        row = {'id':ident,'task':task,'workspace':str(dest),'baseRevision':wsl('git','-C',linux(base),'rev-parse','HEAD').strip(), 'patchSha256':digest(patch),'method':'Copied every tracked initial base file, git apply --check then git apply saved tracked.patch, restored every original test file; existing evaluator dependencies mounted read-only','initialHashes':initial,'submittedHashes':submitted,'gradedHashes':{p:digest(dest/p) for p in files},'originalTestsRestored':restored,'dependencies':deps}
        rows.append(row)
        (OUT/'reconstruction.json').write_text(json.dumps({'rows':rows,'complete':len(rows)==3},indent=2)+'\n',encoding='utf8')
        print(json.dumps({'id':ident,'prepared':True,'dependencies':deps}),flush=True)

import importlib.util, json, pathlib, subprocess, shutil, time
ROOT=pathlib.Path(__file__).resolve().parents[1];FIELD=ROOT/'.suffice/field-v1'
spec=importlib.util.spec_from_file_location('dependencies',ROOT/'scripts/copy-general-dependencies.py');deps=importlib.util.module_from_spec(spec);spec.loader.exec_module(deps)
def linux(p):
    s=str(pathlib.Path(p).resolve()).replace('\\','/');return '/mnt/'+s[0].lower()+s[2:]
def git(path,*args):
    r=subprocess.run(['wsl.exe','-d','Ubuntu','--','git','-C',linux(path),*args],capture_output=True,text=True)
    if r.returncode: raise RuntimeError(r.stderr or r.stdout)
    return r.stdout.strip()
tasks=json.loads((FIELD/'private/tasks.json').read_text(encoding='utf8'))
for run,task in [('001','h02'),('002','h02'),('003','l01')]:
    base=FIELD/'bases'/task;actor=FIELD/'actors'/run
    if actor.exists():
        archive=FIELD/'setup-receipts'/run/str(time.time_ns());archive.mkdir(parents=True,exist_ok=True)
        for name in ['dependency-copy.log','dependency-copy-process.json','dependency-integrity.json']:
            if (actor/name).exists(): shutil.move(actor/name,archive/name)
        if git(actor,'rev-parse','HEAD')!=tasks[task]['localRevision'] or git(actor,'status','--porcelain'):
            raise RuntimeError('Existing actor changed: '+run)
    else: git(base,'worktree','add','--detach',linux(actor),'HEAD')
    deps.copy_deps(base/'node_modules',actor/'node_modules')
    print('Actor',run,'prepared and verified',flush=True)

import hashlib, json, os, pathlib, shutil, subprocess, zipfile, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
OLD=ROOT.parent/'github-field-test'
FIELD=ROOT/'.suffice/field-v1'
RUNTIME='/home/mohammed/suffice-general-runtime'
def linux(p):
    s=str(pathlib.Path(p).resolve()).replace('\\','/')
    return '/mnt/'+s[0].lower()+s[2:]
def wsl(*args):
    r=subprocess.run(['wsl.exe','-d','Ubuntu','--',*map(str,args)],capture_output=True,text=True)
    if r.returncode: raise RuntimeError(r.stderr or r.stdout)
    return r.stdout.strip()
def git(path,*args): return wsl('git','-C',linux(path),*args)
FIELD.mkdir(parents=True,exist_ok=True)
(FIELD/'private').mkdir(exist_ok=True)
tasks={
 'h02':{'repository':'node-fetch/node-fetch','number':1446,'revision':'004b3ac8324e6cdbfb5d04b8bbdc6664ea48fbcf','track':'historical'},
 'l01':{'repository':'DirtyHairy/async-mutex','number':90,'revision':'b0bb4c5aa0e42eb5ffc8d9342e56bb6de1b95554','track':'live'}
}
for task,t in tasks.items():
    base=FIELD/'bases'/task
    resumed=base.exists()
    if resumed and '--resume' not in sys.argv: raise RuntimeError('Preserve existing task preparation; use --resume: '+str(base))
    archive=OLD/'.suffice/field/archives'/f'{task}.zip'
    base.mkdir(parents=True,exist_ok=resumed)
    with zipfile.ZipFile(archive) as z:
        for item in z.infolist():
            pieces=pathlib.PurePosixPath(item.filename).parts[1:]
            if not pieces or item.is_dir(): continue
            if any(p in ('..','.') or ':' in p for p in pieces): raise RuntimeError('Unsafe archive')
            if ((item.external_attr>>16)&0o170000)==0o120000: raise RuntimeError('Archive link')
            target=base.joinpath(*pieces);target.parent.mkdir(parents=True,exist_ok=True)
            if resumed:
                if target.read_bytes()!=z.read(item): raise RuntimeError('Partial preparation source drift: '+str(target))
            else: target.write_bytes(z.read(item))
    t['archiveSha256']=hashlib.sha256(archive.read_bytes()).hexdigest()
    print('Installing pinned task environment',task,flush=True)
    print(wsl('env','PATH='+RUNTIME+'/bin:/usr/bin:/bin','npm','install','--package-lock=true','--ignore-scripts','--no-audit','--no-fund','--prefix',linux(base)),flush=True)
    t['generatedLockSha256']=hashlib.sha256((base/'package-lock.json').read_bytes()).hexdigest()
    git(base,'init','-q');git(base,'config','core.autocrlf','false');git(base,'config','core.hooksPath','/dev/null')
    exclude=base/'.git/info/exclude';exclude.write_text('\nnode_modules/\n',encoding='utf8')
    git(base,'add','--','.')
    git(base,'-c','user.name=Field evaluation','-c','user.email=field@localhost','commit','-qm','Pinned upstream snapshot and generated dependency lock')
    t['localRevision']=git(base,'rev-parse','HEAD')
    t['base']=str(base)
    if task=='h02': issue=json.loads((OLD/'research/historical/node-fetch__node-fetch/1446/original-issue.json').read_text(encoding='utf8'))
    else: issue=json.loads((OLD/'research/live/snapshots/DirtyHairy__async-mutex/90/issue.json').read_text(encoding='utf8'))
    t['title']=issue['title'];t['publicBody']=issue['body'];t['bodySha256']=hashlib.sha256(issue['body'].encode()).hexdigest();t['url']=issue['html_url']
    (FIELD/'private'/f'{task}-issue.json').write_text(json.dumps(issue,indent=2),encoding='utf8')
    print('Prepared',task,flush=True)
for name in ['h02.test.mjs','l01-check.cjs']:
    shutil.copyfile(OLD/'.suffice/field/private'/name,FIELD/'private'/name)
shutil.copyfile(OLD/'.suffice/field/actors/reference-h02/src/index.js',FIELD/'private/h02-reference-index.js')
(FIELD/'private/tasks.json').write_bytes(json.dumps(tasks,indent=2).encode())
for run,task in [('001','h02'),('002','h02'),('003','l01')]:
    actor=FIELD/'actors'/run;actor.parent.mkdir(parents=True,exist_ok=True)
    git(FIELD/'bases'/task,'worktree','add','--detach',linux(actor),'HEAD')
    wsl('cp','-a',linux(FIELD/'bases'/task/'node_modules'),linux(actor/'node_modules'))
    print('Actor',run,'prepared',flush=True)
print(json.dumps({'tasks':list(tasks),'actors':3,'inferenceCalls':0}),flush=True)

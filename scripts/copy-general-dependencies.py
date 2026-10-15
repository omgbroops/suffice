import hashlib, json, os, pathlib, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
def linux(p):
    s=str(pathlib.Path(p).resolve()).replace('\\','/')
    if s.startswith('//?/'): s=s[4:]
    return '/mnt/'+s[0].lower()+s[2:]
def digest(root):
    rows={}
    def visit(folder):
        for entry in os.scandir(folder):
            p=pathlib.Path(entry.path);rel=p.relative_to(root).as_posix()
            if entry.is_symlink(): rows[rel]='L:'+os.readlink(p).replace('\\','/')
            elif entry.is_dir(follow_symlinks=False): visit(p)
            elif entry.is_file(follow_symlinks=False):
                rows[rel]='F:'+str(entry.stat().st_size)
                if p.name in ('package.json','package-lock.json','.package-lock.json'):
                    rows[rel]+=':'+hashlib.sha256(p.read_bytes()).hexdigest()
    visit(root)
    return rows
def copy_deps(source,dest,hardlink=False):
    source=pathlib.Path(source).resolve();dest=pathlib.Path(dest).resolve()
    bound=ROOT/'.suffice'
    assert source.is_relative_to(bound) and dest.is_relative_to(bound) and source!=dest
    assert source.name==dest.name=='node_modules'
    source=pathlib.Path('\\\\?\\'+str(source));dest=pathlib.Path('\\\\?\\'+str(dest))
    receipt_dir=ROOT/'.suffice/field-v1/dependency-receipts'/hashlib.sha256(str(dest).encode()).hexdigest()[:16]
    receipt_dir.mkdir(parents=True,exist_ok=True)
    before=digest(source)
    links={'links':[p for p,h in before.items() if h.startswith('L:')]}
    (receipt_dir/'links.json').write_text(json.dumps(links),encoding='utf8')
    dest.mkdir(parents=True,exist_ok=True)
    if hardlink:
        for folder,dirs,files in os.walk(source,followlinks=False):
            for name in files:
                src=pathlib.Path(folder)/name
                if src.is_symlink(): continue
                dst=dest/src.relative_to(source);dst.parent.mkdir(parents=True,exist_ok=True)
                if dst.exists(): raise RuntimeError('Preserve existing dependency file: '+str(dst))
                # CreateHardLinkW needs extended paths for old nested TS packages.
                os.link(src,dst)
    else:
        log=receipt_dir/'dependency-copy.log'
        r=subprocess.run(['robocopy.exe',str(source),str(dest),'/E','/SL','/R:0','/W:0','/COPY:DAT','/DCOPY:DAT','/MT:8','/NFL','/NDL','/NJH','/NJS','/NP','/LOG:'+str(log)],capture_output=True,text=True)
        (receipt_dir/'dependency-copy-process.json').write_text(json.dumps({'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr}),encoding='utf8')
    r=subprocess.run(['wsl.exe','-d','Ubuntu','--','python3',linux(ROOT/'scripts/repair-dependency-links.py'),linux(source),linux(dest),linux(receipt_dir/'links.json')],capture_output=True,text=True)
    if r.returncode: raise RuntimeError(r.stderr)
    after=digest(dest)
    differences=[p for p in set(before)|set(after) if before.get(p)!=after.get(p)]
    receipt={'source':str(source),'destination':str(dest),'hardlinkedForPrivateEvaluation':hardlink,'entries':len(before),'differences':differences,'metadataTreeSha256':hashlib.sha256(json.dumps(before,sort_keys=True).encode()).hexdigest(),'validation':'All file sizes and link targets, plus package manifest hashes. Data copied through native Win32 file copy, or exact hardlinks for evaluator only. This is not a full per-file dependency content hash audit.','passed':not differences}
    (receipt_dir/'dependency-integrity.json').write_text(json.dumps(receipt,indent=2),encoding='utf8')
    if differences: raise RuntimeError('Dependency copy drift: '+repr(differences[:10]))
    print(json.dumps({'entries':len(before),'passed':True,'hardlinkedForPrivateEvaluation':hardlink}),flush=True)
if __name__=='__main__': copy_deps(sys.argv[1],sys.argv[2],'--hardlink' in sys.argv)

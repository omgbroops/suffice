"""Run under WSL; restore only links present in the trusted dependency source."""
import json, os, pathlib, sys
source=pathlib.Path(sys.argv[1]).resolve();dest=pathlib.Path(sys.argv[2]).resolve()
assert source.name=='node_modules' and dest.name=='node_modules' and source!=dest
count=0
for relative in json.loads(pathlib.Path(sys.argv[3]).read_text())['links']:
        src=source/relative
        if not src.is_symlink(): raise RuntimeError('Trusted source link changed')
        target=dest/relative
        target.parent.mkdir(parents=True,exist_ok=True)
        value=os.readlink(src)
        if target.is_symlink() and os.readlink(target)==value: continue
        if os.path.lexists(target):
            if not target.is_symlink() and (not target.is_file() or target.stat().st_size!=0):
                raise RuntimeError('Unexpected nonempty link destination: '+str(target))
            target.unlink()
        os.symlink(value,target,target_is_directory=src.is_dir());count+=1
print(count,'dependency links restored')

"""Filesystem operations for the field evaluator; no model inference."""
import base64, hashlib, json, os, pathlib, shutil, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
def lp(p): return '/mnt/'+str(pathlib.Path(p).resolve())[0].lower()+str(pathlib.Path(p).resolve())[2:].replace('\\','/')
def long(p): return pathlib.Path('\\\\?\\'+str(pathlib.Path(p).resolve()))
def git(p,*args):
 r=subprocess.run(['wsl.exe','-d','Ubuntu','--','env','GIT_CEILING_DIRECTORIES='+lp(ROOT/'.suffice'),'git','-C',lp(p),*map(str,args)],capture_output=True,check=True)
 return r.stdout.decode('utf-8')
def files(p):
 out={}
 for folder,dirs,names in os.walk(long(p),followlinks=False):
  dirs[:]=[d for d in dirs if d not in ['.git','node_modules'] and not (pathlib.Path(folder)/d).is_symlink()]
  for n in names:
   if n in ['.git','node_modules']:continue
   f=pathlib.Path(folder)/n
   if f.is_symlink():continue
   rel=f.relative_to(long(p)).as_posix();out[rel]=f.read_bytes()
 return out
def public_files(base): return [p for p in git(base,'ls-files','-z').split('\0') if p and not p.startswith('node_modules/')]
def protected(p): return any(x in ['test','tests','__tests__','fixtures','__fixtures__'] for x in pathlib.PurePosixPath(p).parts) or '.test.' in p or '.spec.' in p
def put(folder,p,data):
 if pathlib.PurePosixPath(p).is_absolute() or '..' in pathlib.PurePosixPath(p).parts or ':' in p:raise RuntimeError('Unsafe relative path')
 f=long(folder)/p;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(data)
if __name__=='__main__':
 mode=sys.argv[1];task=json.loads(pathlib.Path(sys.argv[2]).read_text(encoding='utf8'));base=pathlib.Path(task['baseDir']);out=pathlib.Path(sys.argv[3])
 if mode=='actor':
  if out.exists():raise RuntimeError('Actor already exists; preserve partial attempt')
  out.parent.mkdir(parents=True,exist_ok=True);git(base,'worktree','add','--detach',lp(out),task.get('localBaseCommit','HEAD'))
  link=out/'node_modules'
  subprocess.run(['wsl.exe','-d','Ubuntu','--','ln','-s',lp(task['dependencyDir']),lp(link)],check=True)
  print(json.dumps({'workspace':str(out),'trackedHashes':{p:hashlib.sha256((long(out)/p).read_bytes()).hexdigest() for p in public_files(base)}}))
 elif mode=='freeze':
  hashes={p:hashlib.sha256((long(base)/p).read_bytes()).hexdigest() for p in public_files(base)}
  print(json.dumps({'baseHashes':hashes,'localCommit':git(base,'rev-parse','HEAD').strip()}))
 elif mode=='capture':
  initial={p:(long(base)/p).read_bytes() for p in public_files(base)};after=files(out);patch=[]
  for p in sorted(set(initial)|set(after)):
   a=initial.get(p);b=after.get(p)
   if a!=b:patch.append({'path':p,'before':None if a is None else base64.b64encode(a).decode(),'after':None if b is None else base64.b64encode(b).decode(),'protectedTest':protected(p)})
  print(json.dumps(patch))
 elif mode=='grade':
  if out.exists():raise RuntimeError('Evaluator workspace already exists')
  out.mkdir(parents=True)
  for p in public_files(base):put(out,p,(long(base)/p).read_bytes())
  patch=json.loads(pathlib.Path(sys.argv[4]).read_text(encoding='utf8'))
  for entry in patch:
   p=entry['path']
   if protected(p):continue
   if entry['after'] is None:(long(out)/p).unlink(missing_ok=True)
   else:put(out,p,base64.b64decode(entry['after']))
  subprocess.run(['wsl.exe','-d','Ubuntu','--','ln','-s',lp(task['dependencyDir']),lp(out/'node_modules')],check=True)
  print(json.dumps({'workspace':str(out),'protectedTestsRestored':True}))
 else:raise RuntimeError('Unknown mode')

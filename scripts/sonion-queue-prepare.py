import pathlib,json,subprocess,sys,hashlib,shutil
ROOT=pathlib.Path('/home/eric_qin/suffice-field-v1'); TASKS=ROOT/'.suffice/field-campaign-v1/tasks'
id=sys.argv[1]; td=TASKS/id;base=td/'base';private=td/'private'
mp=td/'task.json'; old=json.loads(mp.read_text())
if not (td/'task.windows.json').exists():(td/'task.windows.json').write_text(json.dumps(old,indent=2)+'\n')
oldroot='C:\\Users\\Mohammed\\Documents\\GitHub\\suffice-experiments\\field-campaign-v1'
def rebase(v):
 if isinstance(v,str) and v.startswith(oldroot):return str(ROOT)+v[len(oldroot):].replace('\\','/')
 if isinstance(v,list):return [rebase(x) for x in v]
 if isinstance(v,dict):return {k:rebase(x) for k,x in v.items()}
 return v
task=rebase(old);task['ready']=False;task['baseDir']=str(base)
if id=='q02':
 source=TASKS/'q01/base';a=json.loads((source/'package.json').read_text());b=json.loads((base/'package.json').read_text())
 assert all(a[k]==b[k] for k in ['dependencies','devDependencies','engines'])
 lock=json.loads((source/'package-lock.json').read_text());lock['version']=b['version'];lock['packages']['']['version']=b['version'];(base/'package-lock.json').write_text(json.dumps(lock,indent=2)+'\n')
 dep=source/'node_modules';(base/'node_modules').symlink_to(dep,target_is_directory=True)
else:
 dep=base/'node_modules'
 with (private/'install-sonion.log').open('w') as log:
  command=['npm','install','--no-audit','--no-fund','--package-lock=true']+(['--ignore-scripts'] if id=='q03' else [])
  result=subprocess.run(command,cwd=base,stdout=log,stderr=subprocess.STDOUT)
 if result.returncode:raise SystemExit(f'{id} npm failed {result.returncode}; see {private}/install-sonion.log')
task['dependencyDir']=str(dep)
if not (base/'.git').exists() or subprocess.run(['git','-C',str(base),'rev-parse','--verify','HEAD'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
 for args in [['init','--initial-branch=task-base'],['config','user.name','Suffice Task Prep'],['config','user.email','task-prep@localhost'],['add','.'],['add','-f','package-lock.json'],['commit','-m','Pre-fix public source and frozen dependency lock']]:
  subprocess.run(['git','-C',str(base)]+args,check=True,stdout=subprocess.DEVNULL)
task['provenance']['localBaseCommit']=subprocess.check_output(['git','-C',str(base),'rev-parse','HEAD'],text=True).strip()
task['provenance']['lockSha256']=hashlib.sha256((base/'package-lock.json').read_bytes()).hexdigest()
task['provenance']['nodeVersion']=subprocess.check_output(['node','--version'],text=True).strip();task['provenance']['nodeEngine']=json.loads((base/'package.json').read_text())['engines']['node']
task['provenance']['host']='sonion';task['provenance']['installLog']=str(private/'install-sonion.log') if id!='q02' else 'Reuses q01 identical dependency declarations and closure; lock root version changed to original q02 version.'
mp.write_text(json.dumps(task,indent=2)+'\n');print(id,'PREPARED',flush=True)

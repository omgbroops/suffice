import pathlib,subprocess,json,hashlib
root=pathlib.Path(__file__).resolve().parent.parent
for ident in ['q01','q02','q03']:
 td=root/'.suffice/field-campaign-v1/tasks'/ident;base=td/'base'
 if not (base/'package-lock.json').exists():continue
 if not (base/'.git').exists():
  for args in [['init','--initial-branch=task-base'],['config','user.name','Suffice Task Prep'],['config','user.email','task-prep@localhost'],['add','.'],['commit','-m','Pre-fix source and frozen dependency lock']]:
   r=subprocess.run(['git','-C',str(base)]+args,capture_output=True,text=True)
   if r.returncode:raise Exception(r.stderr)
  print(ident,'git initialized')
 manifest=json.loads((td/'task.json').read_text())
 manifest['provenance']['localBaseCommit']=subprocess.run(['git','-C',str(base),'rev-parse','HEAD'],capture_output=True,text=True,check=True).stdout.strip()
 manifest['provenance']['lockSha256']=hashlib.sha256((base/'package-lock.json').read_bytes()).hexdigest()
 (td/'task.json').write_text(json.dumps(manifest,indent=2)+'\n')

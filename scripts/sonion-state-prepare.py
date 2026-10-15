import pathlib,json,subprocess,shutil,hashlib,datetime
R=pathlib.Path('/home/eric_qin/suffice-field-v1');T=R/'.suffice/field-campaign-v1/tasks';P=R/'research/field-campaign-v1/state'
WIN='C:/Users/Mohammed/Documents/GitHub/suffice-experiments/field-campaign-v1'
def rebase(v):
 if isinstance(v,str):
  n=v.replace('\\','/')
  return str(R)+n[len(WIN):] if n.startswith(WIN) else v
 if isinstance(v,list):return [rebase(x) for x in v]
 if isinstance(v,dict):return {k:rebase(x) for k,x in v.items()}
 return v
for tid in ['s02','s01','s03']:
 p=T/tid;mf=p/'task.json';m=json.loads(mf.read_text())
 if not (p/'task.windows.json').exists():(p/'task.windows.json').write_text(json.dumps(m,indent=2)+'\n')
 m=rebase(m);base=pathlib.Path(m['baseDir']);dep=T/('s01' if tid=='s01' else 's02')/'dependencies'
 m['dependencyDir']=str(dep/'node_modules');m['ready']=False
 if tid!='s01':
  original=sorted(x.relative_to(base).as_posix() for x in base.rglob('*') if x.is_file() and x.name.endswith(('.test.ts','.test.js')))
  m['nativeCommands']=[['node','node_modules/better-node-test/bin.js',*original]]
 m['receipt']=str(P/tid/'sonion-controls.json');m['receipts']=str(P/tid/'receipts/sonion');m['host']='sonion'
 m['dependencyNote']='Pinned native behavioral-test dependency subset from original project ranges. Original behavioral test files run with original AVA/BNT runner; full lint, type, size and coverage CI orchestration is not claimed.'
 mf.write_text(json.dumps(m,indent=2)+'\n')
 print(tid,'original native files',len(m['nativeCommands'][0])-2,'rebased')

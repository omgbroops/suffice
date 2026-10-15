import json,pathlib,subprocess,shutil,sys,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
TASKS=ROOT/'.suffice/field-campaign-v1/tasks'
RESEARCH=ROOT/'research/field-campaign-v1/integration'
oldroot='C:/Users/Mohammed/Documents/GitHub/suffice-experiments/field-campaign-v1'
def convert(value):
 if isinstance(value,str):
  normalized=value.replace(chr(92),'/')
  if normalized.startswith(oldroot+'/'):return str(ROOT/normalized[len(oldroot)+1:])
  return value
 if isinstance(value,list):return [convert(x) for x in value]
 if isinstance(value,dict):return {k:convert(v) for k,v in value.items()}
 return value
for identifier in ['i01','i02','i03','i04']:
 path=TASKS/identifier/'task.json'; original=path.with_suffix('.windows.json')
 if not original.exists():shutil.copy2(path,original)
 meta=convert(json.loads(path.read_text()));path.write_text(json.dumps(meta,indent=2)+'\n')
for identifier in sys.argv[1:]:
 task=TASKS/identifier;deps=task/'dependencies';ev=RESEARCH/identifier
 deps.mkdir(exist_ok=True);shutil.copy2(task/'base/package.json',deps/'package.json')
 with (ev/'sonion-dependency-install.log').open('w') as log:
  subprocess.run(['npm','install','--ignore-scripts','--no-audit','--no-fund','--prefix',str(deps)],stdout=log,stderr=subprocess.STDOUT,check=True)
 shutil.copy2(deps/'package-lock.json',task/'base/package-lock.json')
 link=task/'base/node_modules'
 if link.is_symlink():link.unlink()
 if link.exists():raise RuntimeError('Unexpected existing node_modules directory')
 link.symlink_to(deps/'node_modules',target_is_directory=True)
 if identifier=='i03':(deps/'node_modules/.cache/ava').mkdir(parents=True,exist_ok=True)
 print(identifier,'installed',flush=True)

"""Copy filtered receipts to Windows and hash every copied byte; never copy auth."""
import hashlib, json, pathlib, re, shutil, sys
state=pathlib.Path(sys.argv[1]);destination=pathlib.Path(sys.argv[2]);destination.mkdir(parents=True,exist_ok=True)
selected=[]
for name in ['attempts','controls','grading','boundary-probe','tasks','discovery']:
 for p in (state/name).rglob('*'):
  if not p.is_file() or p.is_symlink():continue
  relative=p.relative_to(state)
  if any(s in ['workspace','node_modules','.git','sessions','base','reference'] for s in relative.parts):continue
  if p.suffix not in ['.json','.jsonl','.txt','.patch','.log']:continue
  selected.append(p)
for name in ['manifest.json','cohort.json','campaign.json','campaign-error.json']:
 if (state/name).is_file():selected.append(state/name)
for p in (state/'tasks').glob('*/task.json'):
 task=json.loads(p.read_text())
 selected.extend(pathlib.Path(task[k]) for k in ['referencePatchJson','upstreamReferencePatchJson'] if k in task)
 selected.append(pathlib.Path(task['dependencyDir']).parent/'package-lock.json')
selected=sorted(set(selected));receipts={}
for source in selected:
 if source.name=='auth.json':raise RuntimeError('Credential path rejected')
 data=source.read_bytes()
 # Refuse to publish likely JWT/bearer credentials accidentally emitted by tools.
 # Require a token boundary: random encrypted thinking signatures can contain
 # an embedded "sk-" substring. They are opaque response metadata, not API keys.
 if re.search(rb'(?<![A-Za-z0-9_-])(?:eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,})',data):
  raise RuntimeError('Possible credential content; inspect locally before export')
 relative=source.relative_to(state);target=destination/relative;target.parent.mkdir(parents=True,exist_ok=True)
 if target.exists() and target.read_bytes()!=data:raise RuntimeError('Existing export differs: '+str(relative))
 if not target.exists():shutil.copyfile(source,target)
 digest=hashlib.sha256(data).hexdigest();assert digest==hashlib.sha256(target.read_bytes()).hexdigest()
 receipts[relative.as_posix()]={'sha256':digest,'bytes':len(data)}
manifest={'source':str(state),'files':receipts,'fileCount':len(receipts),'bytes':sum(x['bytes'] for x in receipts.values())}
(destination/'export-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'fileCount':manifest['fileCount'],'bytes':manifest['bytes'],'verified':True}))

"""Download only evaluator inputs; never expose GitHub solutions to coding workers."""
import io,json,pathlib,subprocess,tarfile,urllib.request,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'research/three-harness-effort-v1'
TASKS=ROOT/'.suffice/three-harness-effort-v1/tasks'
SPECS=[
 ('n01','sindresorhus/p-queue',256,'507e7eeab74970b991f1335b3f08cb5e08207ca3'),
 ('n02','sindresorhus/p-memoize',62,'a8cec6126e39752f3aea09bb2ee4825cc9ea58a3'),
 ('n03','sindresorhus/p-throttle',49,'f92c248eef87d0f5fbb2610362560708e5c355c9'),
 ('n04','sindresorhus/p-retry',71,'95a3a4a667494ac585e6ba7ff5154f04d30941f2'),
 ('n06','sindresorhus/p-retry',100,'3c220355c7a60e563947049ea4f5fd38e113172f'),
]

def get(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Suffice-contract-research'}),timeout=60) as r:return r.read()
def unpack(data,dest):
 dest.mkdir(parents=True,exist_ok=True)
 with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
  for item in archive.getmembers():
   parts=pathlib.PurePosixPath(item.name).parts[1:]
   if not parts:continue
   if '..' in parts or item.issym() or item.islnk():raise RuntimeError('Unsafe archive')
   p=dest.joinpath(*parts)
   if item.isfile():p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(archive.extractfile(item).read())
for ident,repo,number,fix in SPECS:
 folder=TASKS/ident;private=folder/'private';private.mkdir(parents=True,exist_ok=True)
 metaFile=private/'fix.json'
 if not metaFile.exists():metaFile.write_bytes(get(f'https://api.github.com/repos/{repo}/commits/{fix}'))
 meta=json.loads(metaFile.read_text());base=meta['parents'][0]['sha']
 for kind,sha,dest in [('base',base,folder/'base'),('reference',fix,private/'reference')]:
  source=private/(kind+'.tar.gz')
  if not source.exists():source.write_bytes(get(f'https://codeload.github.com/{repo}/tar.gz/{sha}'))
  if not dest.exists():unpack(source.read_bytes(),dest)
 issue=json.loads(get(f'https://api.github.com/repos/{repo}/issues/{number}'))
 (private/'original-issue.json').write_text(json.dumps(issue,indent=2))
 for label in ['base','reference']:
  dest=folder/'base' if label=='base' else private/'reference'
  if not (dest/'.git').exists():
   for cmd in [['git','init','-q',str(dest)],['git','-C',str(dest),'add','--','.'],['git','-C',str(dest),'-c','user.name=Suffice Fixture','-c','user.email=fixture@localhost','commit','-qm','Public pre-fix source' if label=='base' else 'Evaluator reference']]:subprocess.run(cmd,check=True,capture_output=True)
 preliminary={'id':ident,'repository':repo,'issue':number,'url':issue['html_url'],'title':issue['title'],'publicBody':issue['body'],'baseCommit':base,'fixCommit':fix,'baseDir':str(folder/'base'),'dependencyDir':str(folder/'dependencies/node_modules'),'ready':False}
 (folder/'draft.json').write_text(json.dumps(preliminary,indent=2))
 print(json.dumps({'id':ident,'repo':repo,'issue':number,'base':base,'changes':[{'path':f['filename'],'patch':f.get('patch','')} for f in meta['files']],'package':json.loads((folder/'base/package.json').read_text())}),flush=True)


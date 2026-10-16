"""Download only evaluator inputs; never expose GitHub solutions to coding workers."""
import io,json,pathlib,subprocess,tarfile,urllib.request,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'research/luna-fresh-v1'
TASKS=ROOT/'.suffice/luna-fresh-v1/tasks'
SPECS=[
 ('f01','sindresorhus/p-map',94,'6194e492706ced044d0b409536de417ffb852b05'),
 ('f02','sindresorhus/p-map',76,'82b8cdc26d9910c1a9abe6813ddad5f3a55f88b2'),
 ('f03','sindresorhus/p-map',95,'1dc1d1f97512f69daabfcd917dc5802a5d79914e'),
 ('f04','sindresorhus/p-timeout',43,'fd93994892d0b3cba6da61787ac6b5da3ad3f2d5'),
 ('f05','sindresorhus/p-retry',97,'2aba573c0fdca165c4d95262f51ae56902f2f892'),
 ('f06','mcollina/fastq',88,'e295fb277f4e2b4f1cb5bf7909263743bd5bde1b'),
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
 issue=json.loads((OUT/(repo.replace('/','__')+'-'+str(number))/'issue.json').read_text())
 (private/'original-issue.json').write_text(json.dumps(issue,indent=2))
 for label in ['base','reference']:
  dest=folder/'base' if label=='base' else private/'reference'
  if not (dest/'.git').exists():
   for cmd in [['git','init','-q',str(dest)],['git','-C',str(dest),'add','--','.'],['git','-C',str(dest),'-c','user.name=Suffice Fixture','-c','user.email=fixture@localhost','commit','-qm','Public pre-fix source' if label=='base' else 'Evaluator reference']]:subprocess.run(cmd,check=True,capture_output=True)
 preliminary={'id':ident,'repository':repo,'issue':number,'url':issue['html_url'],'title':issue['title'],'publicBody':issue['body'],'baseCommit':base,'fixCommit':fix,'baseDir':str(folder/'base'),'dependencyDir':str(folder/'dependencies/node_modules'),'ready':False}
 (folder/'draft.json').write_text(json.dumps(preliminary,indent=2))
 print(json.dumps({'id':ident,'repo':repo,'issue':number,'base':base,'changes':[{'path':f['filename'],'patch':f.get('patch','')} for f in meta['files']],'package':json.loads((folder/'base/package.json').read_text())}),flush=True)

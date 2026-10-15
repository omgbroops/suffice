import pathlib,json,hashlib,tarfile,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
for identifier in sys.argv[1:]:
 task=ROOT/'.suffice/field-campaign-v1/tasks'/identifier
 ev=ROOT/'research/field-campaign-v1/integration'/identifier
 base=task/'base';matches=[];differences=[]
 with tarfile.open(ev/'base.tar.gz') as tar:
  for member in tar:
   if not member.isfile():continue
   name='/'.join(pathlib.PurePosixPath(member.name).parts[1:])
   expected=tar.extractfile(member).read();actual=(base/name).read_bytes()
   if expected!=actual:differences.append(name)
   else:matches.append(name)
 commits=subprocess.check_output(['git','rev-list','--all'],cwd=base,text=True).splitlines()
 tracked=subprocess.check_output(['git','ls-files'],cwd=base,text=True).splitlines()
 lock=(base/'package-lock.json').read_bytes()
 result={'archiveFilesVerified':len(matches),'archiveDifferences':differences,'localGitCommitCount':len(commits),'localGitCommits':commits,'lockTracked':'package-lock.json' in tracked,'lockSha256':hashlib.sha256(lock).hexdigest(),'privateOverlayInBase':(base/'field-acceptance.mjs').exists(),'sourceOnlyPreFix':not differences and len(commits)==1 and 'package-lock.json' in tracked and not (base/'field-acceptance.mjs').exists()}
 (ev/'source-audit.json').write_text(json.dumps(result,indent=2)+'\n')
 print(identifier,json.dumps(result))
 if not result['sourceOnlyPreFix']:raise RuntimeError('Base source audit failed')

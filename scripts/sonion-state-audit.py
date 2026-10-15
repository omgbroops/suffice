import pathlib,json,hashlib,tarfile,subprocess,datetime
R=pathlib.Path('/home/eric_qin/suffice-field-v1');T=R/'.suffice/field-campaign-v1/tasks';P=R/'research/field-campaign-v1/state';rows=[]
for tid in ['s01','s02','s03']:
 m=json.loads((T/tid/'task.json').read_text());base=pathlib.Path(m['baseDir']);meta=[];mismatch=[];count=0
 with tarfile.open(P/tid/'base.tar.gz') as tf:
  for f in tf.getmembers():
   parts=pathlib.PurePosixPath(f.name).parts[1:]
   if not parts or not f.isfile():continue
   rel='/'.join(parts);actual=(base/rel).read_bytes();expected=tf.extractfile(f).read();count+=1
   if actual!=expected:
    (meta if rel=='.gitignore' else mismatch).append(rel)
 assert not mismatch,(tid,mismatch)
 dirty=subprocess.check_output(['git','-C',str(base),'status','--porcelain'],text=True).strip();assert not dirty,(tid,dirty)
 history=subprocess.check_output(['git','-C',str(base),'rev-list','--all','--count'],text=True).strip();assert history=='1',(tid,history)
 r={'id':tid,'archiveFilesCompared':count,'sourceMismatches':mismatch,'packagingMetadataDifferences':meta,'gitCommitCount':int(history),'gitStatusClean':not dirty,'baseCommit':m['baseCommit'],'localBaseCommit':m['localBaseCommit'],'dependencyLockSha256':hashlib.sha256((base/'.field-dependencies/package-lock.json').read_bytes()).hexdigest(),'taskManifestSha256':hashlib.sha256((T/tid/'task.json').read_bytes()).hexdigest(),'privateTestsAbsentFromBase':all(not (base/f['target']).exists() for f in m['graderOverlay']),'ready':m['ready']}
 assert r['privateTestsAbsentFromBase'];rows.append(r)
versions={k:subprocess.check_output(cmd,text=True).strip() for k,cmd in {'node':['node','--version'],'npm':['npm','--version'],'yarn':['yarn','--version']}.items()}
size=subprocess.check_output(['du','-sb',*[str(T/tid/'dependencies/node_modules') for tid in ['s01','s02','s03']]],text=True)
report={'host':'sonion','timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'versions':versions,'dependenciesDuBytes':size,'tasks':rows,'ciLimitations':'Original native behavioral suites and issue-derived regression checks only. Full project lint/type/size/coverage build orchestration was not installed or run. Nanostores native reporter totals include file-level aggregate passes for tests with fake timers; counts are exactly as reported by original BNT/Node runner.'}
(P/'sonion-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))

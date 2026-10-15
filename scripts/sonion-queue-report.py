from pathlib import Path
import json,hashlib,datetime,subprocess,tarfile,os
r=Path('/home/eric_qin/suffice-field-v1');out=r/'research/field-campaign-v1/queue';out.mkdir(parents=True,exist_ok=True);rows=[]
for name in ['q01','q02','q03']:
 p=r/'.suffice/field-campaign-v1/tasks'/name;t=json.loads((p/'task.json').read_text());base=p/'base';private=p/'private'
 assert t['publicBody']==json.loads((private/'original-issue.json').read_text())['body']
 source_errors=[];checked=0
 with tarfile.open(private/'base-source.tar.gz') as tf:
  for item in tf:
   if not item.isfile():continue
   parts=Path(item.name).parts[1:]
   if not parts:continue
   checked+=1;target=base.joinpath(*parts)
   if not target.is_file() or target.read_bytes()!=tf.extractfile(item).read():source_errors.append('/'.join(parts))
 assert not source_errors,(name,source_errors)
 commitcount=int(subprocess.check_output(['git','-C',str(base),'rev-list','--all','--count'],text=True))
 assert commitcount==1
 subprocess.run(['git','-C',str(base),'ls-files','--error-unmatch','package-lock.json'],check=True,stdout=subprocess.DEVNULL)
 log=private/'sonion-controls';summaries={}
 for f in log.glob('*/process-stdout.txt'):
  text=f.read_text();summaries[f.parent.name]=[line for line in text.splitlines() if line.startswith(('# tests ','# pass ','# fail ','# cancelled '))]
 rows.append({'id':name,'issue':t['url'],'ready':t['ready'],'taskSha256':hashlib.sha256((p/'task.json').read_bytes()).hexdigest(),'baseCommit':t['baseCommit'],'fixCommit':t['fixCommit'],'nativeExitCodes':t['controls'].get('nativeExitCodes'),'referenceNativeExitCodes':[x['exitCode'] for x in t['controls'].get('reference',{}).get('native',[])],'baselineAccepted':t['controls']['baselineAccepted'],'referenceAccepted':t['controls']['referenceAccepted'],'knownNativeFailures':t['controls'].get('knownNativeFailures'),'dependencyDir':t['dependencyDir'],'lockSha256':t['provenance']['lockSha256'],'publicBodyVerifiedVerbatim':True,'originalArchiveFilesVerified':checked,'localGitCommits':commitcount,'testSummaries':summaries})
(out/'status.json').write_text(json.dumps({'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'host':'sonion','nodeVersion':subprocess.check_output(['node','--version'],text=True).strip(),'cpuAffinity':sorted(os.sched_getaffinity(0)),'tasks':rows},indent=2)+'\n')
notes='''# Queue historical task controls

q01 and q02 preserve the verbatim original issues, including their public diagnosis/repair-direction hints. These hints were not removed or supplemented. q03 is the older running/waiting cancellation report. Selection preceded controls and used state/API complexity and public-contract fidelity, not actor success.

Private acceptance uses upstream public behavior regressions. q01 uses four issue-251 fixed-window cases, omitting unrelated strict/re-entrant additions from the closing commit. q02 uses four onSizeLessThan settlement cases, omitting an exact listener-count assertion. q03 uses the simultaneous-abort regression. Every actual upstream production-only reference is validated against the unchanged pre-fix package/tsconfig; no implementation is replaced or simplified.

Modern native checks run the entire original node:test suite through original tsx, original TypeScript compilation, then tsd. The older task runs original TypeScript compilation and the complete original AVA suite through its original ts-node loader. AVA4 CLI ignores --no-cache; invocation therefore generates a temporary /tmp config with the original package.ava settings plus cache:false, then invokes the same native CLI. Dependencies remain read-only. The first AVA run's cache-write failure receipts and workspaces remain in q03/private/sonion-controls-v1-readonly-cache-failure and q03/private/sonion-control-workspaces-v1-readonly-cache-failure. The second ignored-flag run is preserved as sonion-controls-v2-ignored-cache-flag and matching workspaces. Temporary cache configuration changes no test selection or assertions. Lint and coverage reporting are not acceptance criteria; the native test/build/type entrypoints are explicit in each manifest.

q01 and q02 share one read-only dependency closure; original dependency/devDependency/engine declarations are equal. q02's generated lock differs only in the original root package version (9.3.0 vs 9.3.2). q03 retains its own original dependency ranges. Upstream .npmrc disables lockfiles, so install explicitly enables generated package-lock.json without editing .npmrc. All generated locks are force tracked in a new one-commit local base Git repository containing only original public files plus lock, with no upstream future fix objects.

All work after resume ran on Sonion ext4 under two-core affinity and nice10. Local operations were SSH transport and text/artifact reconciliation. No frozen general-v1 harness/configuration files changed, no scored model calls ran, and no upstream write actions occurred. Original source archives, API issue/commit metadata, production patches, private test overlays, generated locks and full native/hidden control receipts remain durable in the task packages. status.json records control outcomes and integrity checks.
'''
(out/'README.md').write_text(notes)
print(json.dumps({'tasks':[(x['id'],x['ready']) for x in rows],'report':str(out/'status.json')}))

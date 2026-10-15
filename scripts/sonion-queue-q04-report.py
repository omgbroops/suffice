from pathlib import Path
import json,hashlib,tarfile,subprocess,datetime,os
ROOT=Path('/home/eric_qin/suffice-field-v1');TD=ROOT/'.suffice/field-campaign-v1/tasks/q04';BASE=TD/'base';PRIVATE=TD/'private';OUT=ROOT/'research/field-campaign-v1/queue/q04';OUT.mkdir(parents=True,exist_ok=True)
t=json.loads((TD/'task.json').read_text());issue=json.loads((PRIVATE/'original-issue.json').read_text());assert t['publicBody']==issue['body'];assert t['title']==issue['title']
original=[]
with tarfile.open(PRIVATE/'base-source.tar.gz') as tf:
 for f in tf:
  if not f.isfile():continue
  rel='/'.join(Path(f.name).parts[1:]);assert (BASE/rel).read_bytes()==tf.extractfile(f).read(),rel;original.append(rel)
raw=subprocess.check_output(['git','-C',str(BASE),'ls-tree','-rz','--full-tree','HEAD']);tracked=[]
for entry in raw.split(b'\0'):
 if not entry:continue
 meta,name=entry.split(b'\t',1);mode,kind,blob=meta.split();name=name.decode();data=(BASE/name).read_bytes();actual=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest();assert actual==blob.decode(),name;tracked.append(name)
assert set(tracked)==set(original),(set(tracked)-set(original))
physical=[]
for folder,dirs,files in os.walk(BASE):
 dirs[:]=[d for d in dirs if d not in ['.git','node_modules']]
 physical.extend(str((Path(folder)/f).relative_to(BASE)) for f in files)
assert set(physical)==set(tracked)
assert subprocess.check_output(['git','-C',str(BASE),'status','--porcelain'],text=True)==''
assert subprocess.check_output(['git','-C',str(BASE),'rev-list','--all','--count'],text=True).strip()=='1'
assert subprocess.run(['git','-C',str(BASE),'cat-file','-e',t['fixCommit']+'^{commit}'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode!=0
pkg=json.loads((BASE/'package.json').read_text());assert hashlib.sha256((BASE/'pnpm-lock.yaml').read_bytes()).hexdigest()==t['provenance']['lockSha256'];assert not (BASE/'package-lock.json').exists();assert Path(t['dependencyDir']).is_dir() and not Path(t['dependencyDir']).is_symlink();assert Path(t['dependencyDir'])==BASE/'node_modules'
freeze=json.loads((ROOT/'reports/general-v1/frozen-configuration.json').read_text())['inputs'];assert all(hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h for p,h in freeze.items())
report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'task':'q04','ready':t['ready'],'taskSha256':hashlib.sha256((TD/'task.json').read_bytes()).hexdigest(),'repository':t['repository'],'issue':t['issue'],'baseCommit':t['baseCommit'],'fixCommit':t['fixCommit'],'nativeCommands':t['nativeCommands'],'nativeExitCodes':t['controls']['nativeExitCodes'],'referenceNativeExitCodes':[x['exitCode'] for x in t['controls']['reference']['native']],'baselineAccepted':t['controls']['baselineAccepted'],'referenceAccepted':t['controls']['referenceAccepted'],'originalArchiveFilesByteIdentical':len(original),'trackedPhysicalFilesEqualGitHead':len(tracked),'physicalBaseClean':True,'baseGitCommitCount':1,'futureFixObjectAbsent':True,'originalIssueBodyAndTitleVerbatim':True,'originalPackageAndPnpmLockMetadataUnmodified':True,'dependencyLockFile':'pnpm-lock.yaml','packageManager':t['provenance']['packageManager'],'controlsValidated':t.get('controlsValidated',False),'dependencyDir':t['dependencyDir'],'dependencyDirIsActualNodeModulesDirectory':True,'frozenInputsUnchanged':len(freeze),'cpuAffinity':sorted(os.sched_getaffinity(0)),'nativeReportingCaveat':'Original BNT emits Node spec reporter:46 entries; some are file-level passes, not an assertion count. All original test files are selected. nativeParser is omitted because output is not TAP.','receipts':str(PRIVATE/'sonion-controls')}
(OUT/'integrity-and-controls.json').write_text(json.dumps(report,indent=2)+'\n')
(OUT/'README.md').write_text('''# q04 original-contract replacement

Nano Stores #371 explicitly reports that atoms and computed stores from separately bundled modules have distinct epoch state and stale computed values. It expects consistent computed updates across modules. The original title/body are preserved verbatim, including a suggested globalThis/Symbol repair. That hint is disclosed; acceptance does not inspect a symbol, global variable, counter, function shape, source string, or exact error.

The hidden regression loads two complete actual source copies as distinct module instances. It uses the public atom/computed/listen/get/set APIs. One same-instance healthy control passes before and after. A mounted computed over one foreign atom and a mounted computed over multiple foreign atoms must publish the updated derived values. Both fail on the pre-fix baseline with stale public values; all three pass with the actual upstream atom/index.js and computed/index.js files. This models the reported module-instance boundary without requiring React, a specific bundler, or toy replacement source. Actual bundler/tree-shaking builds and unmounted computed chains are not covered.

The complete original 14 test files are executed through the repository's original Better Node Test runner in both controls. It reports 46 passing entries; some are file-level rather than individually enumerated inner assertions. This is not a claim of 46 total assertions or complete lint/type/size CI. Native baseline/reference exits are both zero. Acceptance independently reports baseline 1 pass/2 failures, reference 3 passes/0 failures.

The final dependency install uses the original upstream pnpm-lock.yaml with pinned pnpm10.34.7 --frozen-lockfile --ignore-scripts, matching original CI policy. The lock remains byte-identical. Initial npm resolution/semver trial dependencies, locks and receipts are preserved privately under npm-semver and are not the final controls. Public package.json and original lock metadata are unchanged.


Base physical bytes match Git HEAD for every tracked file, with the original provided pnpm lock. All archived original files and tests are byte-identical. Git has one local original-source-plus-lock commit, no future fixing commit object, no private tests or reference objects. dependencyDir points to the actual installed base/node_modules directory, mounted read-only for controls. Fix files and hidden tests live only under private/. q03 and its graders are preserved unchanged.

All preparation, installs and controls ran on Sonion under two-core affinity. No frozen general-v1 file changed and no model call was made. q04 is held for independent blind contract review before campaign admission.
''')
if t['ready']:
 p=OUT/'README.md';p.write_text(p.read_text().replace('q04 is held for independent blind contract review before campaign admission.', 'Independent blind contract review and final dependency/source recheck passed before admission.'))
print(json.dumps(report))

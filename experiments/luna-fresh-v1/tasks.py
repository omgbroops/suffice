"""Reviewable task admission and dependency setup. No inference."""
import base64,hashlib,json,pathlib,re,shutil,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[2]
TASKS=ROOT/'.suffice/luna-fresh-v1/tasks'
notes={
 'f01':('Consumer termination must stop further input/mapper scheduling while allowing already-started work to settle.','Original issue 94 reproduction and expected behavior; upstream break/return/throw tests. Exact speculative mapper counts are replaced with the observed count at close, avoiding an implementation-specific hidden constraint.'),
 'f02':('Async input with backpressure greater than concurrency must obey the configured simultaneous mapper bound and preserve results/order.','Issue 76 exact reproduction and expected sequential trace; upstream regression test reproduces it.'),
 'f03':('Each asynchronous source pull must subscribe to cold thenables once across the public mapping APIs and ordering modes; preserve ordinary promises, sync iteration, and rejection.','Issue 95 expressly lists these APIs and contains a public solution hint. Record this as hinted, not blind localization.'),
 'f04':('Handled input rejection with AbortSignal must not create an unhandled rejection; retain abort listener cleanup and other timeout behavior.','Issue 43 describes 6.1.3 regression. Upstream PR44 adds rejected-input cleanup test; AVA treats unhandled rejections as failures. Error text is generated in the test and checked for identity preservation, not a new library wording contract.'),
 'f05':('A signal already aborted before retry delay must stop the retry promptly with its reason, preserving normal retry and callback behavior.','Issue97 reproduction and expected immediate cancellation. Original body suggests throwIfAborted; record as hinted. Upstream timing control distinguishes immediate abort from the five-second delay.'),
 'f06':('A drained waiter registered immediately before same-turn async pushes waits for all queued tasks and preserves the existing drain callback ordering.','Issue88 exact expected event sequence and upstream PR89 regression. Exclude upstream undefined-drain case because the original issue does not require that unsupported assignment.'),
}
for folder in sorted(TASKS.iterdir()):
 t=json.loads((folder/'draft.json').read_text());ident=t['id'];private=folder/'private';base=folder/'base';ref=private/'reference'
 # One immutable install shared by the three compatible p-map snapshots.
 deps=TASKS/'f01/dependencies' if ident in ['f02','f03'] else folder/'dependencies'
 deps.mkdir(exist_ok=True)
 if not (deps/'node_modules').exists():
  package=json.loads((base/'package.json').read_text());needed={**package.get('dependencies',{}),**package.get('devDependencies',{})}
  needed={k:v for k,v in needed.items() if k not in ['xo','nyc','standard','snazzy','pre-commit']}
  (deps/'package.json').write_text(json.dumps({'name':'suffice-public-test-dependencies','private':True,'dependencies':needed},indent=2))
  with (private/'install.log').open('w') as output:subprocess.run(['npm','install','--ignore-scripts','--no-audit','--no-fund'],cwd=deps,stdout=output,stderr=subprocess.STDOUT,check=True,timeout=240)
 t['dependencyDir']=str(deps/'node_modules')
 link=base/'node_modules'
 if not link.exists():link.symlink_to(deps/'node_modules',target_is_directory=True)
 if ident=='f06':commands=[['node','node_modules/tape/bin/tape','test/test.js','test/promise.js'],['node','node_modules/typescript/bin/tsc','--project','test/tsconfig.json']]
 else:commands=[['node','node_modules/ava/entrypoints/cli.mjs','--serial','--timeout=90s','test.js'],['node','node_modules/tsd/dist/cli.js']]
 # Admission review excludes unrelated tests or implementation-specific counts.
 overlay=private/'overlay';overlay.mkdir(exist_ok=True)
 target='test/promise.js' if ident=='f06' else 'test.js';source=(ref/target).read_text()
 if ident=='f01':
  source=source.replace('t.is(mapperCalls, 3);','const callsAtClose = mapperCalls;',1)
  source=source.replace('t.is(mapperCalls, 3);','t.is(mapperCalls, callsAtClose);',1)
  source=source.replace('t.is(mapperCalls, 3);','const callsAtClose = mapperCalls;',1)
  source=source.replace('t.is(mapperCalls, 3);','t.is(mapperCalls, callsAtClose);',1)
  source=source.replace('t.is(mapperCalls, 3);','const callsAtClose = mapperCalls;',1)
  source=source.replace('t.is(mapperCalls, 3);','t.is(mapperCalls, callsAtClose);',1)
  # The fourth test's exact number of speculative in-flight tasks is not public contract.
  source=source[:source.index("test('pMapIterable - in-flight mappers still settle")]
 if ident=='f06':source=source[:source.index("test('drained should handle undefined drain function'")]
 op=overlay/target;op.parent.mkdir(parents=True,exist_ok=True);op.write_text(source)
 publicpaths=subprocess.check_output(['git','-C',str(base),'ls-files','-z'],text=True).split('\0')
 patch=[]
 for p in publicpaths:
  if not p or not (ref/p).is_file():continue
  before=(base/p).read_bytes();after=(ref/p).read_bytes()
  protected=any(x in ['test','tests','test-d','fixtures'] for x in pathlib.PurePosixPath(p).parts) or re.search(r'(^|[./_-])(test|spec)([./_-]|$)',p)
  if before!=after and not protected:patch.append({'path':p,'before':base64.b64encode(before).decode(),'after':base64.b64encode(after).decode(),'protectedTest':False})
 (private/'reference-patch.json').write_text(json.dumps(patch,indent=2))
 t.update({'cohort':'fresh-historical','nativeCommands':commands,'acceptanceCommands':[commands[0]],'graderOverlay':[{'source':str(op),'target':target}], 'referencePatchJson':str(private/'reference-patch.json'),'nativeParser':'exit-only','complexity':notes[ident][0],'contractReview':{'reviewedBeforeInference':True,'reviewer':'parent operator; separate from coding actor, not a second human','independentEvidence':'upstream issue authors and upstream regression-test authors','mapping':notes[ident][1],'originalSuitePreservation':True,'noNewExactErrorWording':True},'controls':{'nativeExitCodes':[0]*len(commands),'baselineAccepted':False,'referenceAccepted':True},'ready':False})
 (folder/'task.json').write_text(json.dumps(t,indent=2)+'\n')
 print(json.dumps({'id':ident,'prepared':True,'deps':str(deps),'review':t['contractReview']}),flush=True)

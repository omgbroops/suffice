"""Author and prepare the four public issue fixtures before any actor inference."""
import importlib.util, json, pathlib, base64
ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('prep', ROOT / 'benchmark/broad/prepare.py')
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)
prep.ROOT = ROOT
prep.STATE = ROOT / '.suffice/shared-core-v1'
tasks = []
native = {
 'b01': [['node','--test','test.js']],
 'b02': [['node','--import=/public-contracts/typescript-loader.mjs','--test','test.ts']],
 'b03': [['node','node_modules/ava/entrypoints/cli.mjs','test.js']],
 'b04': [['node','node_modules/ava/entrypoints/cli.mjs','test.js']],
}
dev = {'b01':[], 'b02':['serialize-javascript','p-defer','p-state'],
       'b03':['ava','delay','in-range','p-cancelable','sinon','time-span'], 'b04':['ava','delay']}
statements = {
 'b01': ('A waiting debounce batch rejects with the abort reason even after an earlier running invocation finishes.',
         'Expected: the second call rejects with the abort reason and its timer is cancelled. The already-running first call still completes as usual.'),
 'b02': ('Synchronous custom cache.has failures do not permanently memoize rejection.',
         'Expected: one failure, followed by successful retries. The cache should be checked again after the rejected attempt.'),
 'b03': ('Timer functions support detached invocation without an illegal receiver.',
         '7.0.0` goes back to calling `customTimers.setTimeout` directly (instead of calling via `.call(undefined, ...)`)'),
 'b04': ('AbortSignal abortion stops a retry immediately before entering the retry delay.',
         'When the AbortSignal is aborted we expected the retry loop to immediately stop and print "finally".'),
}
for folder in sorted((prep.STATE / 'discovery').iterdir()):
 ident = folder.name
 issue = json.loads((folder / 'issue.json').read_text())
 commit = json.loads((folder / 'commit.json').read_text())
 name = issue['repository_url'].split('/')[-1]
 # Preserve the full public issue, including its public suggested fix. This is a
 # small, comparatively easy pilot, not a claim about unseen real-world difficulty.
 task = dict(id=ident, repository='sindresorhus/'+name, issue=issue['number'], title=issue['title'],
             publicBody=issue['body'], url=issue['html_url'], baseCommit=commit['parents'][0]['sha'],
             fixCommit=commit['sha'], changedPaths=['index.ts' if ident=='b02' else 'index.js'],
             nativeCommands=native[ident], selectedDevDependencies=dev[ident],
             dependencyOverrides={'execa':'^9.5.2'} if ident=='b04' else {'typescript':'5.9.3'} if ident=='b02' else {},
             acceptanceCommands=[['node','/public-contracts/'+ident+'.mjs'],['node','.suffice-independent.mjs']],
             graderFiles={'.suffice-independent.mjs':'benchmark/shared/private/'+ident+'.mjs'},
             sources=[issue['html_url']],
             contractNotes='Reviewed before inference against public issue; private variants authored by the same evaluation engineer, not a separate independent reviewer. Only issue scope is graded. Existing source tests are restored for grading.')
 prep.prepare(task,revision='public-v5')
 taskFile=prep.STATE / 'tasks' / ident / 'task.json'
 published=json.loads(taskFile.read_text())
 if ident=='b02':
  # The full upstream commit also changes a pre-existing clear-cache error message.
  # Preserve that failed upstream control, and use a focused public-issue repair
  # as the positive control without weakening any existing test assertions.
  base=(pathlib.Path(published['baseDir'])/'index.ts').read_bytes()
  needle=b'const promise = (async (): Promise<AsyncReturnType<FunctionToMemoize>> => {\n'
  assert base.count(needle)==1
  after=base.replace(needle,needle+b'\t\t\tawait Promise.resolve();\n')
  focused=pathlib.Path(published['referencePatchJson']).with_name('focused-issue-reference.json')
  focused.write_text(json.dumps([{'path':'index.ts','before':base64.b64encode(base).decode(),
                                 'after':base64.b64encode(after).decode(),'protectedTest':False}]))
  published['upstreamReferencePatchJson']=published['referencePatchJson']
  published['referencePatchJson']=str(focused)
  published['referenceControl']='Evaluator-authored one-line microtask deferral from the public issue suggestion; full upstream patch fails a pre-existing unrelated cache-clear message assertion.'
 # Correct inherited preparer description: no separate preparation agents here.
 published['contractReview']['reviewer']='single evaluation engineer; public issue contracts'
 published['contractVerification']={
   'requirements':[{'id':'issue','statement':statements[ident][0],
                    'source':{'kind':'issue','reference':issue['html_url'],'excerpt':statements[ident][1]}}],
   'checks':[{'id':'public-reproducer','command':['node','/public-contracts/'+ident+'.mjs'],
              'covers':['issue'],'timeoutMs':5000}], 'maxCheckMs':5000}
 taskFile.write_text(json.dumps(published,indent=2)+'\n')
 tasks.append({'id':ident,'repository':task['repository'],'issue':task['issue'],'baseCommit':task['baseCommit'],
               'fixCommit':task['fixCommit'],'url':task['url']})
(prep.STATE / 'cohort.json').write_text(json.dumps(tasks,indent=2)+'\n')

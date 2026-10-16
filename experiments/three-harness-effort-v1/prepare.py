import pathlib,json,subprocess,base64,re,concurrent.futures
R=pathlib.Path(__file__).resolve().parents[2];T=R/'.suffice/three-harness-effort-v1/tasks'
IDS=['n01','n02','n03','n04','n06']
checks={
'n01':'''import assert from 'node:assert/strict';
import PQueue from './source/index.ts';
for(const timeout of [undefined,5000]) {
 const q=new PQueue({concurrency:1,timeout});const c=new AbortController();const reason=new Error('cancel');let release;const gate=new Promise(r=>release=r);
 const p=q.add(()=>{c.abort(reason);return gate;},{signal:c.signal});
 const rejected=await Promise.race([p.then(()=>false,e=>e===reason),new Promise(r=>setTimeout(()=>r(false),100))]);release();assert.equal(rejected,true);
 assert.equal(await q.add(()=>42),42);await q.onIdle();assert.equal(q.pending,0);
}
''',
'n02':'''import assert from 'node:assert/strict';import pMemoize from './index.ts';
let lookups=0;const cache={has(){if(++lookups===1)throw new Error('temporary');return false;},get(){},set(){},delete(){}};
const f=pMemoize(async k=>'ok:'+k,{cache});await assert.rejects(f('k'),/temporary/);assert.equal(await f('k'),'ok:k');assert.equal(await f('k'),'ok:k');assert.ok(lookups>=2);
''',
'n04':'''import assert from 'node:assert/strict';import {getEventListeners} from 'node:events';import pRetry from './index.js';
const c=new AbortController();for(let i=0;i<4;i++){assert.equal(await pRetry(()=>42,{signal:c.signal,retries:0}),42);assert.equal(getEventListeners(c.signal,'abort').length,0);}
await assert.rejects(pRetry(()=>{throw new Error('failed');},{signal:c.signal,retries:0}));assert.equal(getEventListeners(c.signal,'abort').length,0);
''',
'n06':'''import assert from 'node:assert/strict';import pRetry from './index.js';
for(const retries of [0.1,1.5,2.9]) {let calls=0;await assert.rejects(pRetry(()=>{calls++;return 42;},{retries}),TypeError);assert.equal(calls,0);}
assert.equal(await pRetry(()=>42,{retries:0}),42);
''',
'n03':'''import assert from 'node:assert/strict';import pThrottle from './index.js';
const realNow=Date.now,realSet=globalThis.setTimeout,realClear=globalThis.clearTimeout;let now=10000,id=0;const jobs=new Map();
Date.now=()=>now;globalThis.setTimeout=(fn,delay=0)=>{const key=++id;jobs.set(key,{fn,at:now+Math.max(0,delay)+(delay===100?25:7)});return key;};globalThis.clearTimeout=key=>jobs.delete(key);
try {const times=[];const f=pThrottle({limit:5,interval:100,strict:true})(()=>times.push(now));const pending=Array.from({length:40},()=>f());
 for(let guard=0;jobs.size&&guard<2000;guard++){const [key,job]=[...jobs].sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];jobs.delete(key);now=job.at;job.fn();await Promise.resolve();}
 await Promise.all(pending);assert.equal(times.length,40);for(let i=0;i<times.length;i++)assert.ok(times.filter(t=>t>=times[i]&&t<times[i]+100).length<=6,'strict rate exceeded under timer drift');
}finally{Date.now=realNow;globalThis.setTimeout=realSet;globalThis.clearTimeout=realClear;}
'''
}
def prepare(ident):
 f=T/ident;t=json.loads((f/'draft.json').read_text());b=f/'base';priv=f/'private';ref=priv/'reference';pkg=json.loads((b/'package.json').read_text());d=f/'dependencies';d.mkdir(exist_ok=True)
 # Public test-runner configuration only: AVA ignores the undocumented CLI no-cache flag.
 if ident not in ['n01','n02']:
  pkg.setdefault('ava',{})['cache']=False;(b/'package.json').write_text(json.dumps(pkg,indent=2)+'\n')
  refpkg=json.loads((ref/'package.json').read_text());refpkg.setdefault('ava',{})['cache']=False;(ref/'package.json').write_text(json.dumps(refpkg,indent=2)+'\n')
 deps={**pkg.get('dependencies',{}),**pkg.get('devDependencies',{})};deps={k:v for k,v in deps.items() if k not in ['xo','nyc','standard','snazzy','pre-commit']};deps.setdefault('typescript','^5.9.0');deps.setdefault('tsx','^4.20.0')
 (d/'package.json').write_text(json.dumps({'private':True,'dependencies':deps}))
 if not (d/'node_modules').exists():
  with (priv/'install.log').open('w') as out:subprocess.run(['npm','install','--ignore-scripts','--no-audit','--no-fund'],cwd=d,stdout=out,stderr=subprocess.STDOUT,timeout=300,check=True)
 if not (b/'node_modules').exists():(b/'node_modules').symlink_to(d/'node_modules',target_is_directory=True)
 if ident=='n01':native=[['node','--import=tsx/esm','--test',*[p.relative_to(b).as_posix() for p in sorted((b/'test').glob('*.ts'))]],['node','node_modules/typescript/bin/tsc','--noEmit']]
 elif ident=='n02':native=[['node','--import=tsx/esm','--test','test.ts'],['node','node_modules/typescript/bin/tsc','--noEmit']]
 else:
  ava='node_modules/ava/entrypoints/cli.mjs' if (d/'node_modules/ava/entrypoints/cli.mjs').exists() else 'node_modules/ava/cli.js'
  native=[['node',ava,'--serial','--no-cache','--timeout=90s',*(['--match=!aborts with an AbortSignal'] if ident=='n04' else []),'test.js']]
 test=priv/'acceptance.mjs';test.write_text(checks[ident]);patch=[]
 for p in subprocess.check_output(['git','-C',str(b),'ls-files','-z']).decode().split('\0'):
  if not p or not (ref/p).is_file():continue
  before=(b/p).read_bytes();after=(ref/p).read_bytes();after=after.replace(b"cache can",b"cache Map can") if ident=='n02' else after;protected=any(x in ['test','tests','test-d','fixtures'] for x in pathlib.PurePosixPath(p).parts) or re.search(r'(^|[./_-])(test|spec)([./_-]|$)',p)
  if before!=after and not protected:patch.append({'path':p,'before':base64.b64encode(before).decode(),'after':base64.b64encode(after).decode(),'protectedTest':False})
 rp=priv/'reference-patch.json';rp.write_text(json.dumps(patch))
 notes={'n01':'Original issue explicitly specifies synchronous abort, released concurrency slot and preservation of task-error precedence; solution hint disclosed.', 'n02':'Original issue specifies recovery after synchronous cache.has throws; solution hint disclosed. Broader unrelated clear behavior in fixing commit is not required.', 'n03':'Strict sliding-window rate limit under delayed timers. Deterministic fake clock tests contract rather than exact spacing; excludes unrelated upstream limit-zero and exact-spacing assertions.', 'n04':'Listener cleanup after task settlement. Native Node24 abort wording mismatch excluded by exact named test for both actors; independent signal cleanup checks success and failure.','n06':'Fractional retry count validation from original issue. Requires TypeError and no input execution; no exact error message requirement.'}
 t.update({'cohort':'historical','dependencyDir':str(d/'node_modules'),'nativeCommands':native,'acceptanceCommands':[['node',*(['--import=tsx/esm'] if ident in ['n01','n02'] else []),'suffice-hidden-acceptance.mjs']], 'graderOverlay':[{'source':str(test),'target':'suffice-hidden-acceptance.mjs'}],'referencePatchJson':str(rp),'nativeParser':'exit-only','controls':{'baselineAccepted':False,'referenceAccepted':True,'nativeExitCodes':[0]*len(native)},'ready':True,'contractReview':{'reviewedBeforeInference':True,'reviewer':'parent evaluator, not a second human','mapping':notes[ident],'originalIssueOnly':True}})
 (f/'task.json').write_text(json.dumps(t,indent=2)+'\n');print('prepared '+ident,flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(prepare,IDS))

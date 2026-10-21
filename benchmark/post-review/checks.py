"""Issue-derived public reproducers and independent contract variants; no upstream fixes."""
import re
COMMON="""import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync,readFileSync} from 'node:fs';
process.chdir('/app');
const grade=GRADE;
if(!grade){
 const pkg=JSON.parse(readFileSync('/app/package.json','utf8'));
 if(pkg.scripts?.build)execFileSync('npm',['run','build'],{cwd:'/app',stdio:'inherit',timeout:45000});
}
"""
CASES={
'queue-aborted':"""
const {default:PQueue}=await import('/app/dist/index.js');
for(const paused of (grade?[false,true]:[false])){
 const queue=new PQueue({concurrency:1,autoStart:!paused});let release;
 const gate=new Promise(r=>release=r);let running;
 if(!paused)running=queue.add(()=>gate);
 const controller=new AbortController();controller.abort();let invoked=false;
 const result=queue.add(()=>{invoked=true;},{signal:controller.signal}).then(()=>({resolved:true}),error=>({error}));
 const settled=await Promise.race([result,new Promise(r=>setTimeout(()=>r(null),500))]);
 release();if(paused)queue.start();await running;await queue.onIdle();
 assert.ok(settled?.error,'Already aborted queued add must reject before capacity becomes available');
 assert.equal(settled.error.name,'AbortError');assert.equal(invoked,false);
}
const ordinary=new PQueue({concurrency:1});assert.equal(await ordinary.add(()=>42),42);await ordinary.onIdle();
""",
'queue-timeout':"""
const {default:PQueue}=await import('/app/dist/index.js');
for(const timeout of (grade?[0,-1,NaN,Infinity]:[0])){
 const queue=new PQueue({concurrency:1,timeout:1000});let invoked=false;
 const error=await queue.add(()=>{invoked=true;return 1;},{timeout}).then(()=>null,error=>error);
 assert.ok(error instanceof TypeError,'Invalid per-task timeout must reject clearly');
 assert.match(error.message,/timeout/i);assert.equal(invoked,false,'Invalid task must not start');
 assert.equal(await queue.add(()=>7,{timeout:1000}),7);await queue.onIdle();
}
""",
'ky-progress':"""
const {default:ky}=await import('/app/distribution/index.js');
for(const body of (grade?['','hello','longer public content']:[''])){
 const events=[];const bytes=new TextEncoder().encode(body);
 const stream=new ReadableStream({start(c){if(bytes.length)c.enqueue(bytes);c.close();}});
 const response=await ky('https://example.invalid/progress',{retry:0,fetch:async()=>new Response(stream,{headers:{'content-length':String(bytes.length)}}),onDownloadProgress:p=>events.push(p)});
 assert.equal(await response.text(),body);assert.equal(events.at(-1)?.percent,1,'Finished empty response must report completion');
 assert.equal(events.at(-1).transferredBytes,bytes.length);
}
""",
'ky-signal':"""
const {default:ky,replaceOption}=await import('/app/distribution/index.js');
for(const mode of (grade?['replace','undefined','null']:['replace'])){
 const parent=new AbortController(),child=new AbortController();
 const base=ky.create({signal:parent.signal,retry:0,fetch:async request=>{request.signal.throwIfAborted();return new Response('ok');}});
 const extended=base.extend({signal:mode==='replace'?replaceOption(child.signal):mode==='null'?null:undefined});
 parent.abort();let text;await assert.doesNotReject(async()=>{text=await extended('https://example.invalid/signal').text();});assert.equal(text,'ok','Removed/replaced parent signal must not abort child');
 if(mode==='replace'){child.abort();await assert.rejects(extended('https://example.invalid/abort'));}
}
""",
'pall-types':"""
const source=`import pAll from '/app/index.js';
const values=[1,2,3];
const result=await pAll(values.map(n=>()=>Promise.resolve().then(()=>({n}))),{concurrency:2});
const checked: {n:number}[]=result;
// @ts-expect-error wrong result must not become any
const wrong: string[]=result;
${grade?"const named=await pAll([async()=>({id:'a'})]);const id:string=named[0].id;":''}
`;
writeFileSync('/probe/type-check.mts',source);
execFileSync('/opt/checker/node_modules/.bin/tsc',['--noEmit','--strict','--module','NodeNext','--moduleResolution','NodeNext','--target','ES2022','--skipLibCheck','/probe/type-check.mts'],{stdio:'inherit'});
const {default:pAll}=await import('/app/index.js');assert.deepEqual(await pAll([()=>Promise.resolve(1),async()=>2]),[1,2]);
""",
'emitter-value':"""
const source=`import Emitter, {EventEmitter as Named} from '/app/index.mjs';
const emitter=new Emitter();emitter.on('data',(x: number)=>{});emitter.emit('data',1);
${grade?"const named=new Named();named.once('x',()=>{});const same:typeof Emitter=Named;":''}
`;
writeFileSync('/probe/type-check.mts',source);
execFileSync('/opt/checker/node_modules/.bin/tsc',['--noEmit','--strict','--module','NodeNext','--moduleResolution','NodeNext','--target','ES2022','--skipLibCheck','/probe/type-check.mts'],{stdio:'inherit'});
const {default:Emitter}=await import('/app/index.mjs');const e=new Emitter();let seen=0;e.on('x',()=>seen++);e.emit('x');assert.equal(seen,1);
"""}

def code(task,grade=False):
    body=CASES[task]
    body=re.sub(r'\(grade\?(\[.*?\]):(\[.*?\])\)',lambda m:m[1] if grade else m[2],body)
    body=re.sub(r'\$\{grade\?"(.*?)":\'\'\}',lambda m:m[1] if grade else '',body)
    return COMMON.replace('GRADE','true' if grade else 'false')+body+"\nconsole.log('Public contract checks passed');\n"

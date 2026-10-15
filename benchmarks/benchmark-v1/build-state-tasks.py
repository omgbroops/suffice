"""Author/freeze two offline injected-defect tasks; never invokes package scripts."""
from pathlib import Path
import hashlib, json, shutil, subprocess, datetime, re

ROOT = Path(__file__).resolve().parent
TASKS = ROOT / 'tasks'
SPECS = [
    ('rfdc-builtins-state', 'calibration', 'rfdc'),
    ('tinyqueue-heap-state', 'reserve', 'tinyqueue'),
]

def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8', newline='\n')

def dump(path, value):
    write(path, json.dumps(value, indent=2) + '\n')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def check_replace(text, old, new, count):
    assert text.count(old) == count, (old, text.count(old), count)
    return text.replace(old, new)

# This assignment is written before creating either defective actor or running any tests.
split_freeze = {
    'schemaVersion': 1, 'frozenAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'tasks': [{'id': i, 'split': s, 'repository': n} for i,s,n in SPECS],
    'selectionPolicy': 'Fixed before injection, validation, or repair attempts. No live inference.',
}
freeze_path = ROOT / 'state-task-split-freeze.json'
if freeze_path.exists():
    assert json.loads(freeze_path.read_text())['tasks'] == split_freeze['tasks']
else:
    dump(freeze_path, split_freeze)

RFDC_REQ = [
 ('R1', 'Keep existing deep copying of ordinary nested arrays/objects, primitive/function values and Date values.'),
 ('R2', 'Nested Map keys and values and nested Set values must be deeply copied, including when inside arrays or containers, in all four combinations of proto/circles options; modifying cloned ordinary data must not change the input.'),
 ('R3', 'Nested Buffer values must preserve their Buffer type, bytes and length with independent mutable bytes. Nested typed arrays must preserve their constructor, visible contents, length and byte offset with independent backing storage. Nested DataViews that extend from their byte offset to the end of their backing buffer have the same preservation and storage requirements. Cover object and array positions and Map/Set containers in all four option combinations. Buffer byte offsets, shorter DataViews, root binary views and preservation of shared-buffer identity between cloned views are out of scope.'),
 ('R4', 'User constructorHandlers must override built-in handlers and apply to exact matching constructors (not subclasses) at object, array and container positions in all four option combinations.'),
 ('R5', 'With circles:true, ordinary object ancestor back-references must point to the corresponding cloned ancestor, including object cycles reached via arrays; successive calls to the same clone function must produce independent outputs. Cyclic arrays themselves and self-referential Map/Set objects are out of scope.'),
 ('R6', 'proto:false copies own enumerable object properties only; proto:true also copies inherited enumerable object properties into own output properties, including ordinary objects reached via Map/Set and custom handlers that recurse with the supplied clone callback.'),
]
RFDC_VISIBLE = """import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const W = process.env.SUFFICE_WORKSPACE || process.cwd();
const rfdc = createRequire(resolve(W, 'src/package.json'))('./index.js');
test('ordinary nested values remain independent', () => {
 const input={a:[1,{b:2}],nil:null,missing:undefined}; const output=rfdc()(input);
 assert.deepEqual(output,input); output.a[1].b=7; assert.equal(input.a[1].b,2);
});
test('dates keep their value and ordinary self cycles are preserved', () => {
 const input={date:new Date(1000)}; input.self=input; const output=rfdc({circles:true})(input);
 assert.equal(output.self,output); assert.equal(output.date.getTime(),1000); assert.notEqual(output.date,input.date);
});
"""
RFDC_HIDDEN = """import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const W = process.env.SUFFICE_WORKSPACE || process.cwd();
const rfdc = createRequire(resolve(W, 'src/package.json'))('./index.js');
const modes=[{}, {proto:true}, {circles:true}, {proto:true,circles:true}];
test('map keys and values are recursively independent in every mode', () => {
 for(const opts of modes){
  const key={label:{id:1}}, value={list:[{score:2}]};
  const input={map:new Map([[key,value]])}; const out=rfdc(opts)(input);
  const [[k,v]]=out.map; assert.ok(out.map instanceof Map); assert.deepEqual(k,key); assert.deepEqual(v,value);
  assert.notEqual(k,key); assert.notEqual(v,value); k.label.id=9; v.list[0].score=8;
  assert.equal(key.label.id,1); assert.equal(value.list[0].score,2);
 }
});
test('maps inside arrays and sets recursively clone entries', () => {
 for(const opts of modes){
  const original={state:{n:3}}; const input=[new Set([new Map([['k',original]])])];
  const out=rfdc(opts)(input); assert.ok(out[0] instanceof Set); const map=[...out[0]][0];
  assert.ok(map instanceof Map); assert.deepEqual(map.get('k'),original);
  map.get('k').state.n=5; assert.equal(original.state.n,3);
 }
});
test('typed subviews preserve type offset length and independent storage', () => {
 for(const opts of modes){
  const buffer=new ArrayBuffer(16); const view=new Uint16Array(buffer,4,3); view.set([12,34,56]);
  const out=rfdc(opts)({view}).view;
  assert.ok(out instanceof Uint16Array); assert.equal(out.byteOffset,4); assert.equal(out.length,3);
  assert.deepEqual([...out],[12,34,56]); assert.notEqual(out.buffer,buffer);
  out[1]=99; assert.equal(view[1],34); view[0]=88; assert.equal(out[0],12);
 }
});
test('dataviews in arrays preserve the visible bytes and isolate writes', () => {
 for(const opts of modes){
  const buffer=new ArrayBuffer(8); const view=new DataView(buffer,2,6); view.setUint8(0,17);
  const out=rfdc(opts)([view])[0];
  assert.ok(out instanceof DataView); assert.equal(out.byteOffset,2); assert.equal(out.byteLength,6);
  assert.equal(out.getUint8(0),17); assert.notEqual(out.buffer,buffer);
  out.setUint8(0,61); assert.equal(view.getUint8(0),17);
 }
});
test('buffers and binary values nested through containers are copied', () => {
 for(const opts of modes){
  const bytes=Buffer.from([4,5]); const typed=new Int8Array([-2,3]);
  const input={set:new Set([bytes]), map:new Map([['typed',typed]])}; const out=rfdc(opts)(input);
  const b=[...out.set][0], t=out.map.get('typed');
  assert.ok(Buffer.isBuffer(b)); assert.deepEqual([...b],[4,5]); assert.ok(t instanceof Int8Array); assert.deepEqual([...t],[-2,3]);
  b[0]=9; t[0]=7; assert.equal(bytes[0],4); assert.equal(typed[0],-2);
 }
});
test('custom constructors work at object array and container positions', () => {
 class Box{constructor(value){this.value=value;}}
 for(const opts of modes){
  const clone=rfdc({...opts,constructorHandlers:[[Box,(o,fn)=>new Box(fn(o.value))]]});
  const original=new Box({n:4});
  const output=clone({object:original,array:[original],set:new Set([original]),map:new Map([['box',original]])});
  for(const box of [output.object,output.array[0],[...output.set][0],output.map.get('box')]){
   assert.ok(box instanceof Box); assert.deepEqual(box.value,{n:4}); assert.notEqual(box.value,original.value);
   box.value.n=6; assert.equal(original.value.n,4);
  }
 }
});
test('custom handlers override builtins without matching subclasses', () => {
 class SpecialDate extends Date{}
 for(const opts of modes){
  const clone=rfdc({...opts,constructorHandlers:[[Date,()=>({handled:true})]]});
  assert.deepEqual(clone({date:new Date(0)}).date,{handled:true});
  assert.deepEqual(clone([new SpecialDate(0)])[0],{});
 }
});
test('ordinary ancestor cycles through arrays and repeated calls stay independent', () => {
 for(const proto of [false,true]){
  const root={id:'root'}, child={parent:root}; root.children=[child]; child.self=child;
  const clone=rfdc({proto,circles:true}), a=clone(root), b=clone(root);
  assert.equal(a.children[0].parent,a); assert.equal(a.children[0].self,a.children[0]);
  assert.equal(b.children[0].parent,b); assert.notEqual(a,b); assert.notEqual(a.children,b.children);
  a.id='changed'; assert.equal(root.id,'root'); assert.equal(b.id,'root');
 }
});
test('prototype property policy survives container and handler recursion', () => {
 class Box{constructor(value){this.value=value;}}
 for(const opts of modes){
  const value=Object.assign(Object.create({inherited:{n:9}}),{own:{n:2}});
  const clone=rfdc({...opts,constructorHandlers:[[Box,(o,fn)=>new Box(fn(o.value))]]});
  const out=clone({plain:value,map:new Map([['v',value]]),set:new Set([value]),box:new Box(value)});
  for(const item of [out.plain,out.map.get('v'),[...out.set][0],out.box.value]){
   assert.deepEqual(item.own,{n:2}); assert.notEqual(item.own,value.own);
   assert.equal(Object.hasOwn(item,'inherited'),!!opts.proto);
   if(opts.proto){assert.deepEqual(item.inherited,{n:9}); assert.notEqual(item.inherited,value.inherited);}
  }
 }
});
"""
RFDC_MAP = [
 ('map keys and values are recursively independent in every mode',['R2'],'Checks both entry positions, nested data and mutation isolation across all option modes.'),
 ('maps inside arrays and sets recursively clone entries',['R2'],'Exercises recursive containers without assuming alias identity or ordering beyond Map/Set semantics.'),
 ('typed subviews preserve type offset length and independent storage',['R3'],'Uses a nonzero-offset typed view and checks writes in both directions.'),
 ('dataviews in arrays preserve the visible bytes and isolate writes',['R3'],'Checks an array position and a supported DataView whose visible span reaches the end of its buffer.'),
 ('buffers and binary values nested through containers are copied',['R2','R3'],'Checks Buffer and signed typed data through Set and Map.'),
 ('custom constructors work at object array and container positions',['R2','R4'],'Checks supplied recursive handler and isolation in each supported position.'),
 ('custom handlers override builtins without matching subclasses',['R4'],'Explicit built-in override plus exact-constructor matching.'),
 ('ordinary ancestor cycles through arrays and repeated calls stay independent',['R5'],'Checks ancestor/self back-references and independence between calls.'),
 ('prototype property policy survives container and handler recursion',['R2','R4','R6'],'Checks own and inherited enumerable data through every relevant recursion path.'),
]

TINY_REQ = [
 ('Q1','The constructor must heapify any supplied dense array using the supplied comparator; default ordering is ascending. The existing API may mutate the supplied array.'),
 ('Q2','push must preserve heap order for arbitrarily interleaved insertions, including inserts requiring movement through multiple ancestors.'),
 ('Q3','pop must return the highest-priority item according to the comparator and restore the heap after replacement, including when the better child is on either side or only the left child exists.'),
 ('Q4','length must equal the number of queued items after each operation; peek returns the next pop value without removal. Empty pop and peek return undefined. Draining and reusing a queue must not leave stale entries.'),
 ('Q5','Custom comparators, including reverse numeric ordering and object-priority comparators, must govern construction, push, peek and pop. Duplicate priorities must retain all inserted entries; tie stability is not required.'),
]
TINY_PRELUDE = """import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const W = process.env.SUFFICE_WORKSPACE || process.cwd();
const {default:TinyQueue} = await import(pathToFileURL(resolve(W,'src/index.js')));
"""
TINY_VISIBLE = TINY_PRELUDE + """test('new empty queue has no item', () => {
 const q=new TinyQueue(); assert.equal(q.length,0); assert.equal(q.peek(),undefined); assert.equal(q.pop(),undefined);
});
test('ascending pushes expose the smallest item', () => {
 const q=new TinyQueue(); q.push(2); q.push(5); q.push(9);
 assert.equal(q.length,3); assert.equal(q.peek(),2); assert.equal(q.peek(),2);
});
"""
TINY_HIDDEN = TINY_PRELUDE + """test('constructor heapifies unsorted odd and even arrays', () => {
 for(const values of [[7,2,6,1,5,0,4],[9,8,7,6,5,4],[2,1],[3]]){
  const q=new TinyQueue([...values]); const expected=[...values].sort((a,b)=>a-b);
  assert.equal(q.length,values.length); assert.equal(q.peek(),expected[0]);
  const actual=[]; for(let i=0;i<values.length;i++) actual.push(q.pop());
  assert.deepEqual(actual,expected); assert.equal(q.length,0);
 }
});
test('insertion repairs every ancestor for both child positions', () => {
 const q=new TinyQueue(); const model=[];
 for(const value of [12,10,8,6,4,2,0,-2,-4,-6,-8]){
  q.push(value);model.push(value);model.sort((a,b)=>a-b);
  assert.equal(q.length,model.length);assert.equal(q.peek(),model[0]);
 }
 assert.deepEqual(Array.from({length:model.length},()=>q.pop()),model);
});
test('replacement selects either better child and handles left-only children', () => {
 for(const values of [[0,3,1,7,6,2,5],[0,1,3,2,6,5],[0,1,2,3]]){
  const q=new TinyQueue(); for(const n of values) q.push(n);
  assert.deepEqual(Array.from({length:values.length},()=>q.pop()),[...values].sort((a,b)=>a-b));
 }
});
test('emptying and reusing preserves peek pop and length', () => {
 const q=new TinyQueue();
 for(let round=0;round<4;round++){
  q.push(round);assert.equal(q.peek(),round);assert.equal(q.length,1);
  assert.equal(q.pop(),round);assert.equal(q.length,0);assert.equal(q.peek(),undefined);
  assert.equal(q.pop(),undefined);assert.equal(q.length,0);assert.equal(q.peek(),undefined);
 }
});
test('reverse comparator governs construction and later insertions', () => {
 const compare=(a,b)=>b-a, q=new TinyQueue([2,8,4,0,6],compare); const model=[2,8,4,0,6];
 for(const n of [10,3,12,1]){q.push(n);model.push(n);assert.equal(q.peek(),Math.max(...model));}
 model.sort(compare);assert.deepEqual(Array.from({length:model.length},()=>q.pop()),model);
});
test('object comparators retain all equal-priority entries', () => {
 const entries=[{id:'a',priority:3},{id:'b',priority:1},{id:'c',priority:2},{id:'d',priority:1},{id:'e',priority:4}];
 const q=new TinyQueue(entries.slice(0,3),(a,b)=>a.priority-b.priority);q.push(entries[3]);q.push(entries[4]);
 const out=Array.from({length:entries.length},()=>q.pop());
 assert.deepEqual(out.map(x=>x.priority),[1,1,2,3,4]);
 assert.deepEqual(out.map(x=>x.id).sort(),entries.map(x=>x.id).sort());
 for(const item of out)assert.ok(entries.includes(item));
});
test('deterministic mixed operations agree with a sorted-array model', () => {
 let seed=11939; const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 const q=new TinyQueue(),model=[];
 for(let step=0;step<240;step++){
  if(next()%3!==0||model.length===0){const value=(next()%101)-50;q.push(value);model.push(value);model.sort((a,b)=>a-b);}
  else assert.equal(q.pop(),model.shift());
  assert.equal(q.length,model.length);assert.equal(q.peek(),model[0]);assert.equal(q.peek(),model[0]);
 }
 while(model.length){assert.equal(q.pop(),model.shift());assert.equal(q.length,model.length);assert.equal(q.peek(),model[0]);}
 assert.equal(q.pop(),undefined);assert.equal(q.peek(),undefined);assert.equal(q.length,0);
});
"""
TINY_MAP = [
 ('constructor heapifies unsorted odd and even arrays',['Q1','Q3','Q4'],'Heapifies distinct lengths then drains with exact count tracking.'),
 ('insertion repairs every ancestor for both child positions',['Q2','Q3','Q4'],'Descending insertions require multiple levels and both index parities.'),
 ('replacement selects either better child and handles left-only children',['Q2','Q3'],'Several heap shapes cover both-child and left-only sift-down.'),
 ('emptying and reusing preserves peek pop and length',['Q4'],'Singleton drain and repeated reuse catch stale storage without checking private representation.'),
 ('reverse comparator governs construction and later insertions',['Q1','Q2','Q3','Q4','Q5'],'Reverse ordering governs heapify, push, peek and complete drain.'),
 ('object comparators retain all equal-priority entries',['Q1','Q2','Q3','Q5'],'Checks priorities, complete membership and object identity without imposing tie order.'),
 ('deterministic mixed operations agree with a sorted-array model',['Q1','Q2','Q3','Q4'],'240 fixed-seed operations compare all observable state with a simple independent model.'),
]

for ident, split, name in SPECS:
    taskdir = TASKS / ident
    source = ROOT / 'sources' / name
    meta = json.loads((ROOT / 'sources' / f'{name}-source.json').read_text())
    for variant in ('actor','reference'):
        shutil.copytree(source, taskdir / variant / 'src', dirs_exist_ok=True)
    shutil.copy2(ROOT / 'sources' / f'{name}-{meta["commit"]}.tar.gz', taskdir / 'source.tar.gz')
    shutil.copy2(source / 'LICENSE', taskdir / 'SOURCE-LICENSE')
    original = (source / 'index.js').read_text()
    if name == 'rfdc':
        broken = check_replace(original,'cur.buffer.slice(), cur.byteOffset, cur.length','cur.buffer, cur.byteOffset, cur.length',1)
        broken = check_replace(broken,'new Map(cloneArray(Array.from(o), fn))','new Map(o)',2)
        # Only the circles:true registration loop loses exact-constructor registration.
        prefix, circular = broken.split('function rfdcCircles (opts) {')
        circular = check_replace(circular,'constructorHandlers.set(handler[0], handler[1])','constructorHandlers.set(handler[0].prototype, handler[1])',1)
        broken = prefix + 'function rfdcCircles (opts) {' + circular
        requirements, visible, hidden, mapping = RFDC_REQ, RFDC_VISIBLE, RFDC_HIDDEN, RFDC_MAP
        summary = 'Repair injected deep-clone regressions in rfdc: maps alias their inputs, binary views share storage, and custom constructor handlers fail in circular mode.'
        injections = ['copyBuffer reuses the original ArrayBuffer instead of a copy','Map handlers shallow-copy entries in both option implementations','circular-mode custom handlers are registered under prototype instead of constructor']
    else:
        broken = check_replace(original,'(pos - 1) >> 1','pos >> 1',1)
        broken = check_replace(broken,'compare(data[right], data[bestChild]) < 0','compare(data[right], data[bestChild]) > 0',1)
        broken = check_replace(broken,'if (--this.length > 0)','if (--this.length >= 0)',1)
        requirements, visible, hidden, mapping = TINY_REQ, TINY_VISIBLE, TINY_HIDDEN, TINY_MAP
        summary = 'Repair injected TinyQueue heap regressions affecting insertion paths, replacement ordering and empty-state reuse.'
        injections = ['sift-up uses the wrong parent for even child positions','sift-down selects the worse right child','singleton pop writes an item back after length becomes zero']
    write(taskdir / 'actor/src/index.js',broken)
    for variant in ('actor','reference'):
        write(taskdir / variant / 'tests/visible.test.mjs',visible)
        write(taskdir / variant / 'README.md',summary + '\n\nThe complete pinned upstream repository is in src/, including its original documentation and development tests. The benchmark visible checks are dependency-free. Run from this workspace: node --test tests/visible.test.mjs. Do not install dependencies or run upstream package scripts.\n')
    write(taskdir / 'private/acceptance.test.mjs',hidden)
    prompt = summary + '\n\nThese are benchmark-authored defects in pinned real source, not claims of upstream bugs. Repair src/index.js while preserving the existing public API. The full repository is in src/. No installs, network access, subprocesses or package scripts are required. Run node --test tests/visible.test.mjs from the workspace.\n\nPublic acceptance contract:\n' + '\n'.join(f'{i}: {t}' for i,t in requirements)
    write(taskdir / 'actor/TASK.md',prompt+'\n')
    write(taskdir / 'reference/TASK.md',prompt+'\n')
    task = {
        'id':ident,'split':split,'repository':meta['repository'],'url':'https://github.com/'+meta['repository'],
        'scopeTier':1,
        'engineeringScope':{
            'modulesNeedingChange':['src/index.js'],
            'integrationBoundaries': ['Public clone factory to recursive built-in and custom constructor handlers; four option combinations'] if name == 'rfdc' else ['Public queue operations to internal sift-up/sift-down and backing-array state'],
            'stages':['Inspect source and public requirements','Repair the interacting regressions within the implementation module','Validate visible behavior and reason about additional states'],
            'exAnteRationale':'Single-component repair with several interacting branches, not a multi-component or long-duration task. Scope assigned before any model repair attempts; failure counts do not establish difficulty or task length.',
        },
        'sourceCommit':meta['commit'],
        'provenance':{'kind':'injected-defect','archivePath':'source.tar.gz','archiveUrl':meta['url'],'archiveSha256':meta['sha256'],'downloadBytes':meta['bytes'],'licensePath':'SOURCE-LICENSE','upstreamEntrySha256':sha(source/'index.js'),'referenceRepair':'Pristine pinned upstream index.js; no authored feature changes.','injectedChanges':injections,'primarySources':['https://github.com/'+meta['repository'],'https://github.com/'+meta['repository']+'/tree/'+meta['commit']]},
        'publicPrompt':prompt,'requirements':[{'id':i,'text':t} for i,t in requirements],
        'workspaceDir':'actor','referenceDir':'reference','acceptancePath':'private/acceptance.test.mjs','visiblePath':'actor/tests/visible.test.mjs',
        'allowedEditPaths':['src/index.js'],
        'assertionMap':[{'test':n,'requirementIDs':r,'rationale':why} for n,r,why in mapping],
    }
    dump(taskdir/'task.json',task)
    assert set(re.findall(r"test\('([^']+)'",hidden)) == {n for n,_,_ in mapping}

receipts = []
for ident, split, name in SPECS:
    taskdir=TASKS/ident
    item={'id':ident,'split':split,'runs':[]}
    for variant in ('actor','reference'):
        for suite in ('visible','acceptance'):
            script=taskdir/variant/'tests/visible.test.mjs' if suite=='visible' else taskdir/'private/acceptance.test.mjs'
            import os
            env=dict(os.environ, SUFFICE_WORKSPACE=str(taskdir/variant))
            result=subprocess.run(['node','--test','--test-reporter=tap',str(script)],cwd=taskdir/variant,env=env,capture_output=True,text=True,timeout=30)
            log=f'validation/{variant}-{suite}.tap'
            write(taskdir/log,result.stdout+result.stderr)
            counts={k:int(v) for k,v in re.findall(r'^# (tests|pass|fail) (\d+)$',result.stdout,re.M)}
            expected=0 if variant=='reference' or suite=='visible' else 1
            assert result.returncode==expected,(ident,variant,suite,result.stdout)
            item['runs'].append({'variant':variant,'suite':suite,'exitCode':result.returncode,'counts':counts,'logPath':log,'logSha256':sha(taskdir/log)})
    item['files']={str(p.relative_to(taskdir)).replace('\\','/'):sha(p) for p in sorted(taskdir.rglob('*')) if p.is_file() and 'validation' not in p.relative_to(taskdir).parts}
    item['validationPolicy']='Native Node tests only. No package scripts, installation, network, subprocess or credentials in test code. Author validation launcher uses Node subprocesses offline. No model repair attempts.'
    dump(taskdir/'validation/frozen.json',item)
    receipts.append({k:v for k,v in item.items() if k!='files'})
dump(ROOT/'state-task-validation.json',{'nodeVersion':subprocess.run(['node','--version'],capture_output=True,text=True).stdout.strip(),'splitFreezeSha256':sha(ROOT/'state-task-split-freeze.json'),'totalArchiveDownloadBytes':sum(json.loads((ROOT/'sources'/f'{n}-source.json').read_text())['bytes'] for _,_,n in SPECS),'tasks':receipts})
print(json.dumps(receipts,indent=2))

"""Prepare bounded public historical fixtures; no models/dependency installation."""
import pathlib,tarfile,json
ROOT=pathlib.Path(__file__).resolve().parents[1]
UP=ROOT/'.suffice/friction-upstream'; DEST=ROOT/'.suffice/friction-fixtures'
BENCH=ROOT/'benchmarks/friction'; BENCH.mkdir(parents=True,exist_ok=True)
PRE="""import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const W=process.env.SUFFICE_WORKSPACE;
const require=createRequire(resolve(W,'package.json'));
"""
specs={
'json5':{
 'prompt':"Repair JSON5 string serialization so that strings containing a NUL character immediately followed by any decimal digit produce valid JSON5 and round-trip without changing the string. Preserve handling of isolated NULs, NULs followed by non-digits, object keys, nested values and supported quote options. Locate the relevant implementation in the repository and keep unrelated serialization behavior intact.",
 'visible':"""const api=require(resolve(W,'src'));
test('basic parsing',()=>assert.deepEqual(api.parse('{name:1,}'),{name:1}));
test('ordinary stringify roundtrip',()=>{const v={a:[true,null,'text'],b:2};assert.deepEqual(api.parse(api.stringify(v)),v);});
test('replacer and indentation',()=>assert.deepEqual(api.parse(api.stringify({a:1,b:2},['a'],2)),{a:1}));
""",
 'hidden':"""const api=require(resolve(W,'src'));
test('NUL followed by every decimal digit',()=>{for(let d=0;d<10;d++){const v='before'+String.fromCharCode(0)+d+'after';const s=api.stringify(v);assert.doesNotThrow(()=>api.parse(s));assert.equal(api.parse(s),v);}});
test('other NUL contexts remain valid',()=>{for(const v of ['a'+String.fromCharCode(0),'a'+String.fromCharCode(0)+'z',String.fromCharCode(0,0)+'8'])assert.equal(api.parse(api.stringify(v)),v);});
test('nested arrays and property keys',()=>{const v={['a'+String.fromCharCode(0)+'3']:[String.fromCharCode(0)+'0',{x:String.fromCharCode(0)+'9'}]};assert.deepEqual(api.parse(api.stringify(v)),v);});
test('supported quote choices',()=>{for(const quote of ["'",'"']){const v=String.fromCharCode(0)+'4';assert.equal(api.parse(api.stringify(v,{quote})),v);}});
"""},
'dotenv':{
 'prompt':"Repair dotenv's handling of explicit configuration paths. When an explicit file path or array of paths is provided, attempt those paths rather than falling back to the working directory's .env when files are missing. Return the filesystem error for missing files, preserve successfully parsed values from other supplied files, and keep normal default-path behavior plus first-file precedence and override behavior. Locate the implementation in the repository; keep parse/populate APIs compatible.",
 'visible':"""const api=require(resolve(W,'src'));
test('parse ordinary values',()=>assert.deepEqual(api.parse('A=one\\nB="two"'),{A:'one',B:'two'}));
test('populate preserves existing by default',()=>{const v={A:'old'};api.populate(v,{A:'new',B:'two'});assert.deepEqual(v,{A:'old',B:'two'});});
test('populate supports override',()=>{const v={A:'old'};api.populate(v,{A:'new'},{override:true});assert.equal(v.A,'new');});
""",
 'hidden':"""const api=require(resolve(W,'src')); const missing=resolve(W,'fixtures/absent.env'),first=resolve(W,'fixtures/first.env'),second=resolve(W,'fixtures/second.env');
test('missing explicit path never falls back',()=>{const env={};const r=api.configDotenv({path:missing,processEnv:env});assert.deepEqual(env,{});assert.deepEqual(r.parsed,{});assert.equal(r.error?.code,'ENOENT');});
test('all-missing explicit array reports error',()=>{const env={};const r=api.configDotenv({path:[missing,missing+'2'],processEnv:env});assert.deepEqual(env,{});assert.deepEqual(r.parsed,{});assert.equal(r.error?.code,'ENOENT');});
test('mixed valid and missing paths retain values and error',()=>{const env={};const r=api.configDotenv({path:[first,missing],processEnv:env});assert.equal(env.ORDER,'first');assert.equal(r.parsed.ORDER,'first');assert.equal(r.error?.code,'ENOENT');assert.equal(env.FALLBACK_MARKER,undefined);});
test('array precedence and override remain intact',()=>{for(const override of [false,true]){const env={};api.configDotenv({path:[first,second],override,processEnv:env});assert.equal(env.ORDER,override?'second':'first');}});
test('default config still uses cwd file',()=>{const env={};const r=api.configDotenv({processEnv:env});assert.equal(r.parsed.FALLBACK_MARKER,'yes');assert.equal(r.error,undefined);});
"""},
'flatted':{
 'prompt':"Repair flatted parsing for large top-level collections whose objects reference one another. Parsing a collection of thousands of mutually linked entries should avoid exhausting the JavaScript call stack, retain object identity and cycles, and preserve ordinary parse/stringify and reviver behavior. Keep the CommonJS and ES module entry points consistent. This request concerns wide linked collections; it does not require arbitrary-depth nested JSON support. Discover the relevant entry points in the repository.",
 'visible':"""const api=require(resolve(W,'src'));
test('roundtrip ordinary object',()=>assert.deepEqual(api.parse(api.stringify({a:1,b:'text'})),{a:1,b:'text'}));
test('cycle identity',()=>{const v={n:1};v.self=v;const r=api.parse(api.stringify(v));assert.equal(r.self,r);});
test('reviver still transforms numbers',()=>{const r=api.parse(api.stringify({a:2}),(_k,v)=>typeof v==='number'?v+1:v);assert.equal(r.a,3);});
""",
 'hidden':"""const cjs=require(resolve(W,'src/cjs/index.js'));const esm=await import(pathToFileURL(resolve(W,'src/esm/index.js')));
const wide=n=>JSON.stringify([Array.from({length:n},(_,i)=>String(i+1)),...Array.from({length:n},(_,i)=>({index:i,next:String((i+1)%n+1)}))]);
test('CommonJS wide linked collection',()=>{let r;assert.doesNotThrow(()=>{r=cjs.parse(wide(6000));});assert.equal(r.length,6000);for(let i=0;i<r.length;i++)assert.equal(r[i].next,r[(i+1)%r.length]);});
test('ESM wide linked collection',()=>{let r;assert.doesNotThrow(()=>{r=esm.parse(wide(6000));});assert.equal(r.length,6000);assert.equal(r[5999].next,r[0]);});
test('shared references and literal strings',()=>{for(const api of [cjs,esm]){const shared={value:'123'};const r=api.parse(api.stringify({a:shared,b:shared}));assert.equal(r.a,r.b);assert.equal(r.a.value,'123');}});
test('reviver receiver and root call',()=>{for(const api of [cjs,esm]){let root=false,receiver=false;const r=api.parse(api.stringify({a:2}),function(k,v){if(k==='')root=true;if(k==='a')receiver=this.a===2;return typeof v==='number'?v+1:v;});assert.equal(r.a,3);assert.ok(root);assert.ok(receiver);}});
"""}}
tasks=[]
for name,spec in specs.items():
 meta=json.loads((UP/(name+'.json')).read_text())
 for phase,rev in [('baseline',meta['base']),('reference',meta['fix'])]:
  target=DEST/name/phase;target.mkdir(parents=True,exist_ok=True)
  with tarfile.open(UP/(name+'-'+rev+'.tar.gz')) as tar:
   for member in tar:
    if not member.isfile():continue
    parts=pathlib.PurePosixPath(member.name).parts[1:]
    if not parts or '..' in parts:raise ValueError('invalid archive member')
    short='/'.join(parts)
    allowed=short in ['package.json','README.md','LICENSE','LICENSE.md'] or (short.startswith(('lib/','cjs/','esm/')) and short.endswith(('.js','package.json')))
    if not allowed:continue
    if member.size>200000:raise ValueError('fixture file too large')
    dest=target/'src'/short;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(tar.extractfile(member).read())
  (target/'tests').mkdir(exist_ok=True);(target/'tests/visible.test.mjs').write_text(PRE+spec['visible'],encoding='utf-8')
  (target/'README.md').write_text('Public historical '+meta['repository']+' snapshot under src/. Production implementation modules and package entry metadata retain upstream layout. Use files/navigation to discover relevant code. tests/visible.test.mjs contains a bounded public regression sample; hidden final acceptance checks the full requested task. Only production .js files under src/lib, src/cjs or src/esm may change. No dependencies need installation.\n',encoding='utf-8')
  if name=='dotenv':
   (target/'fixtures').mkdir(exist_ok=True);(target/'.env').write_text('FALLBACK_MARKER=yes\n');(target/'fixtures/first.env').write_text('ORDER=first\nA=one\n');(target/'fixtures/second.env').write_text('ORDER=second\nB=two\n')
 hidden=BENCH/(name+'.acceptance.mjs');hidden.write_text(PRE+spec['hidden'],encoding='utf-8')
 baseline=DEST/name/'baseline'
 tasks.append({**meta,'prompt':spec['prompt'],'workspaceDir':str(baseline),'referenceDir':str(DEST/name/'reference'),'acceptancePath':str(hidden),'sourceFiles':sorted(str(p.relative_to(baseline)).replace('\\','/') for p in (baseline/'src').rglob('*.js')),'taskStatus':'fresh relative to existing Suffice campaigns; researcher public-PR-authored, not contamination-free','regressionScope':'complete frozen authored Node sample, not the full original upstream suite'})
# Separate synthetic activation pilot, never pooled into the historical scored cohort.
pilot=DEST/'pilot'/'baseline';(pilot/'src/collections').mkdir(parents=True,exist_ok=True);(pilot/'tests').mkdir(exist_ok=True)
(pilot/'src/package.json').write_text('{"type":"commonjs"}')
(pilot/'src/collections/queue.js').write_text('exports.drain = queue => { const result = queue.slice(); return result; };\n')
(pilot/'src/collections/stack.js').write_text('exports.pop = stack => stack.pop();\n')
(pilot/'README.md').write_text('Small queue utility under src/. Locate and repair production implementation; only existing .js files may change.\n')
visible="const api=require(resolve(W,'src/collections/queue.js'));\ntest('returns queued values',()=>assert.deepEqual(api.drain([1,2]),[1,2]));\n"
(pilot/'tests/visible.test.mjs').write_text(PRE+visible,encoding='utf-8')
hidden=BENCH/'pilot.acceptance.mjs';hidden.write_text(PRE+"const api=require(resolve(W,'src/collections/queue.js'));\ntest('drain empties original queue',()=>{const q=[1,2];assert.deepEqual(api.drain(q),[1,2]);assert.deepEqual(q,[]);});\n",encoding='utf-8')
tasks.append({'id':'pilot','repository':'synthetic activation pilot','prompt':'Fix queue draining so it returns all queued values in order and leaves the original queue empty. Discover the implementation under src/.','workspaceDir':str(pilot),'sourceFiles':['src/collections/queue.js','src/collections/stack.js'],'acceptancePath':str(hidden),'taskStatus':'development activation pilot only'})
(BENCH/'tasks.json').write_text(json.dumps(tasks,indent=2),encoding='utf-8')
print(json.dumps({'tasks':[t['id'] for t in tasks],'sourceFiles':[len(t['sourceFiles']) for t in tasks]}))

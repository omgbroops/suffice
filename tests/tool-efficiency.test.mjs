import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve,dirname} from 'node:path';
import {compactObservation,observationTools,providerFailureKind} from '../src/tool-observations.mjs';import {indexJavaScript,createNavigation} from '../src/symbol-navigation.mjs';import {validateCases,caseTestSource} from '../src/real-policy.mjs';
async function temp(t){const base=await mkdtemp(resolve(tmpdir(),'suffice-efficiency-'));t.after(async()=>{assert.equal(dirname(base),resolve(tmpdir()));assert.ok(base.split(/[\\/]/).at(-1).startsWith('suffice-efficiency-'));await rm(base,{recursive:true,force:true});});return base;}
test('compact source observations preserve every returned source character and omissions',()=>{
  const source='10: const x = "a\\nb";\n11: // do not lose this comment';const data={path:'src/a.js',offset:10,totalLines:30,omittedBefore:9,omittedAfter:19,text:source,version:'a'.repeat(64)};
  const compact=compactObservation('file_read',data,'o1');assert.ok(compact.includes(source));assert.match(compact,/omitted before=9, after=19/);assert.match(compact,/o1/);assert.ok(compact.length<JSON.stringify(data).length);
});
test('passing tests omit TAP detail but preserve status and counts',()=>{
  const data={status:'passed',exitCode:0,tests:7,passed:7,failed:0,skipped:0,cancelled:0,todo:0,stdout:'irrelevant pass log '.repeat(400),stderr:'',truncated:false};const out=compactObservation('test',data,'o9');
  assert.match(out,/passed; exit=0; tests=7 passed=7 failed=0/);assert.doesNotMatch(out,/irrelevant/);assert.ok(out.length<250);
});
test('failed and infrastructure tests keep actionable diagnostics and cannot become passed',()=>{
  const data={status:'failed',exitCode:1,tests:2,passed:1,failed:1,stdout:'# Subtest: good\nok 1 - good\n# Subtest: broken\nnot ok 2 - broken\n expected: 3\n actual: 2\n',stderr:'warning'};const out=compactObservation('test',data,'o3');
  assert.match(out,/failed; exit=1/);assert.match(out,/expected: 3/);assert.match(out,/actual: 2/);assert.match(out,/stderr: warning/);assert.doesNotMatch(out,/# Subtest: good/);
  assert.match(compactObservation('test',{status:'infrastructure_error',errorCode:'ENOENT'},'o4'),/infrastructure_error.*ENOENT/);
});
test('full original observations survive compact formatting and paging',async t=>{
  const dir=await temp(t);const data={path:'src/a.js',offset:1,totalLines:1,omittedBefore:0,omittedAfter:0,text:'1: hello',version:'x'.repeat(64)};
  const observed=observationTools({tools:[{name:'file_read',async execute(){return {structuredContent:data,content:[{type:'text',text:JSON.stringify(data)}]};}}],compact:true,directory:dir});const [tool,recover]=observed.tools;
  const response=await tool.execute('call',{});assert.deepEqual(response.structuredContent,data);
  assert.equal(observed.render({parentToolCallId:'parent',toolName:'file_read',content:response.content}),undefined);
  const rendered=observed.render({toolName:'codemode',content:response.content});assert.match(rendered.content[0].text,/src\/a.js lines/);assert.ok(rendered.content[0].text.includes('1: hello'));
  const batched=observed.render({toolName:'codemode',content:[{type:'text',text:`==> text 1/2 <==\n${JSON.stringify(data)}\n==> text 2/2 <==\nuntouched free-form output`}]});
  assert.match(batched.content[0].text,/src\/a.js lines/);assert.match(batched.content[0].text,/untouched free-form output$/);assert.doesNotMatch(batched.content[0].text,/"version"/);
  const full=await recover.execute('read',{reference:'o1'});assert.deepEqual(JSON.parse(full.structuredContent.text),data);
  assert.deepEqual(JSON.parse(await readFile(resolve(dir,'o1.json'),'utf8')).data,data);
});
test('navigation resolves functions methods imports and reindexes edited source',async t=>{
  const dir=await temp(t);await mkdir(resolve(dir,'src'));const path='src/a.js';await writeFile(resolve(dir,path),'const dep = require("./b")\nconst fn = (x) => dep(x)\nclass Box { run(x) { return fn(x) } }\n');
  const nav=createNavigation({workspace:dir});const find=nav.find(t=>t.name==='symbols'),read=nav.find(t=>t.name==='symbol_read');
  let list=(await find.execute('a',{query:'run'})).structuredContent;assert.equal(list.matches[0].name,'Box.run');
  let block=(await read.execute('b',{path,name:'fn'})).structuredContent;assert.match(block.text,/const fn =/);assert.equal(block.imports[0].module,'./b');
  await writeFile(resolve(dir,path),'const changed = () => 123\n');list=(await find.execute('c',{query:'changed'})).structuredContent;assert.equal(list.matches[0].name,'changed');
  assert.equal((await read.execute('d',{path,name:'fn'})).structuredContent.error,'not_found');
});
test('navigation ignores identifiers in comments and strings and reports parse failures',async t=>{
  const indexed=indexJavaScript('function real(){ return 1 }\n// function fake(){}\nconst text="function imaginary(){}";\nreal();','src/a.js');
  assert.ok(indexed.symbols.some(s=>s.name==='real'));assert.ok(!indexed.symbols.some(s=>['fake','imaginary'].includes(s.name)));assert.equal(indexed.references.filter(r=>r.symbol==='real').length,1);
  const dir=await temp(t);await writeFile(resolve(dir,'bad.js'),'function {');const tools=createNavigation({workspace:dir});const found=(await tools[0].execute('x',{})).structuredContent;assert.deepEqual(found.unparsed,['bad.js']);
});
test('returned symbol pages report remaining source instead of silently dropping it',async t=>{
  const dir=await temp(t);await writeFile(resolve(dir,'a.js'),'function f(){\n const a=1\n const b=2\n return a+b\n}\n');const read=createNavigation({workspace:dir})[1];
  const first=(await read.execute('a',{path:'a.js',name:'f',limit:2})).structuredContent;assert.equal(first.remaining,3);
  const next=(await read.execute('b',{path:'a.js',name:'f',offset:2,limit:3})).structuredContent;assert.equal(next.remaining,0);assert.match(next.text,/return a\+b/);
});
test('recovered 503 subscription service error is not confused with invalid authorization',()=>{
  assert.equal(providerFailureKind(['OpenAI API error (503): subscription_sharing_user_unavailable']),'transient');
  assert.equal(providerFailureKind(['401 unauthorized token expired']),'authorization_or_limit');assert.equal(providerFailureKind(['quota exceeded']),'authorization_or_limit');
});
test('public API checks permit safe object projections without arbitrary property access',()=>{
  const cases=[{method:'coerce',args:['1.0.0-1a',{includePrerelease:true}],field:'version',expected:'1.0.0-1a'}];assert.deepEqual(validateCases(cases),cases);assert.match(caseTestSource(cases),/value\?\.\[c.field\]/);
  assert.throws(()=>validateCases([{...cases[0],field:'constructor'}]));
});

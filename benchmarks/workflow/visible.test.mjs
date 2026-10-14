import test from 'node:test';import assert from 'node:assert/strict';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const y=await import(pathToFileURL(resolve(process.env.SUFFICE_WORKSPACE,'src/src/index.ts')).href);
test('basic mapping sequence and scalar loading',()=>{
  for(const [source,value]of [['a: 1\nb: [true, null, x]',{a:1,b:[true,null,'x']}],['[1, 2, 3]',[1,2,3]],['{}',{}],['[]',[]],['null',null],['"12"','12'],['a:\n  b: false',{a:{b:false}}]])assert.deepEqual(y.load(source),value);
});
test('core json and yaml11 scalar and collection round trips',()=>{
  // JSON_SCHEMA's empty-string dump is already broken in these baselines; it is outside these repairs.
  for(const schema of [y.CORE_SCHEMA,y.JSON_SCHEMA,y.YAML11_SCHEMA])for(const value of [null,true,false,0,-0,1,-5,0.5,1e-5,'hello','true','001','line\nbreak',[1,'x',null],{a:2,b:[true,'z']}])assert.deepEqual(y.load(y.dump(value,{schema}),{schema}),value);
});
test('document streams and explicit endings',()=>{
  assert.deepEqual(y.loadAll('---\na: 1\n...\n---\nb: 2\n'),[{a:1},{b:2}]);assert.deepEqual(y.loadAll('---\n---\n'),[null,null]);assert.throws(()=>y.load('---\na\n---\nb\n'));
});
test('valid event constructor and AST presentation agree',()=>{
  for(const source of ['a: [1, 2]\nb: null','[{}, [], {key: val}]','k: >\n  first\n  second\n','k: |\n  first\n  second\n']){
    const events=y.parseEvents(source,{});assert.deepEqual(y.constructFromEvents(events,{source}),[y.load(source)]);
    const docs=y.eventsToAst(events,{source,schema:y.CORE_SCHEMA});assert.deepEqual(y.loadAll(y.present(docs,{schema:y.CORE_SCHEMA})),[y.load(source)]);
  }
});
test('scalar escaping unicode and line width preserve values',()=>{
  for(const value of ['hello: world','a # b','[x]','{a: b}','emoji 😀','\tword','a\n\nb\n', 'many words '.repeat(30)])for(const lineWidth of [20,80])assert.equal(y.load(y.dump(value,{lineWidth})),value);
});
test('anchors aliases and schema-specific loading',()=>{
  const v=y.load('a: &a {x: 1}\nb: *a\n');assert.equal(v.a,v.b);assert.equal(y.load('yes',{schema:y.CORE_SCHEMA}),'yes');assert.equal(y.load('yes',{schema:y.YAML11_SCHEMA}),true);
});
test('invalid syntax and explicit scalar tags reject',()=>{
  for(const source of ['[1, 2','{a: 1','!!int nope','!!bool maybe'])assert.throws(()=>y.load(source));
});

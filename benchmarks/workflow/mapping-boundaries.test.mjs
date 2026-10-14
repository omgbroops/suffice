import test from 'node:test';import assert from 'node:assert/strict';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const y=await import(pathToFileURL(resolve(process.env.SUFFICE_WORKSPACE,'src/src/index.ts')).href);
test('mapping values survive start and end markers',()=>{
  for(const key of ['a','missing','one two'])for(const marker of ['---\nx: 1\n','...\n']){
    const source=`${key}:\n${marker}`;assert.deepEqual(y.loadAll(source),marker.startsWith('---')?[{[key]:null},{x:1}]:[{[key]:null}]);
    const scalars=y.parseEvents(source,{}).filter(e=>e.type===y.EVENT_SCALAR).map(e=>y.getScalarValue(source,e));assert.deepEqual(scalars,marker.startsWith('---')?[key,'','x','1']:[key,'']);
  }
});
test('nested missing values and document boundaries remain distinct',()=>{
  for(const ending of ['...\n','---\nnext: yes\n']){
    assert.deepEqual(y.loadAll(`outer:\n  child:\n${ending}`),ending.startsWith('---')?[{outer:{child:null}},{next:'yes'}]:[{outer:{child:null}}]);
  }
});
test('both event consumers reject unpaired root and nested mapping keys',()=>{
  for(const source of ['key: value','outer:\n  key: value','[{a: b}]']){
    const events=y.parseEvents(source,{});events.splice(events.findLastIndex(e=>e.type===y.EVENT_SCALAR),1);
    assert.throws(()=>y.constructFromEvents(events,{source}),y.YAMLException);
    assert.throws(()=>y.eventsToAst(events,{source,schema:y.CORE_SCHEMA}));
  }
});
test('valid null and empty collections survive both consumers',()=>{
  for(const source of ['{a: null, b: [], c: {}}','[null, {}, [], {x: 2}]','outer:\n  a: 1\n  b:\n']){
    const expected=y.load(source),events=y.parseEvents(source,{});assert.deepEqual(y.constructFromEvents(events,{source}),[expected]);
    const ast=y.eventsToAst(events,{source,schema:y.CORE_SCHEMA});assert.deepEqual(y.loadAll(y.present(ast,{schema:y.CORE_SCHEMA})),[expected]);
  }
});

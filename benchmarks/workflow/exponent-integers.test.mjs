import test from 'node:test';import assert from 'node:assert/strict';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const y=await import(pathToFileURL(resolve(process.env.SUFFICE_WORKSPACE,'src/src/index.ts')).href);
test('large numbers round trip across every supported numeric schema',()=>{
  assert.doesNotThrow(()=>{
  for(const schema of [undefined,y.CORE_SCHEMA,y.JSON_SCHEMA,y.YAML11_SCHEMA])for(const value of [1e21,1.5e21,-1e21,1e22,-7e30,1e100,Number.MAX_VALUE,-Number.MAX_VALUE]){
    const options=schema?{schema}:{};assert.equal(y.load(y.dump(value,options),options),value);
    const nested={value,list:[value,-value]};assert.deepEqual(y.load(y.dump(nested,options),options),nested);
  }
  });
});
test('regular numeric values keep exact identities',()=>{
  for(const schema of [y.CORE_SCHEMA,y.JSON_SCHEMA,y.YAML11_SCHEMA])for(const value of [0,-0,1,-1,123,1e20,-1e20,0.5,-0.5,1e-10,Number.MIN_VALUE])assert.ok(Object.is(y.load(y.dump(value,{schema}),{schema}),value));
});
test('explicit integer validation stays strict',()=>{
  for(const schema of [y.CORE_SCHEMA,y.JSON_SCHEMA,y.YAML11_SCHEMA])for(const source of ['!!int 1e21','!!int -1e+22','!!int 1.5'])assert.throws(()=>y.load(source,{schema}),/cannot resolve/);
});

import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {resolve} from 'node:path';
const s=createRequire(resolve(process.env.SUFFICE_WORKSPACE,'src/package.json'))('./index.js');
test('exact caret lower bound excludes earlier prereleases',()=>{
  for(const v of ['0.0.3','0.0.7','0.2.3','0.8.1','1.2.3','2.0.0'])for(const tag of ['alpha','beta.2','rc.1']){
    assert.equal(s.satisfies(`${v}-${tag}`,`^${v}`,{includePrerelease:true}),false,v);
    assert.equal(s.satisfies(v,`^${v}`,{includePrerelease:true}),true,v);
  }
});
test('partial and explicit prerelease caret bounds keep intended behavior',()=>{
  assert.equal(s.satisfies('0.2.0-alpha','^0.2',{includePrerelease:true}),true);
  assert.equal(s.satisfies('0.0.3-beta.2','^0.0.3-beta.1',{includePrerelease:true}),true);
  assert.equal(s.satisfies('0.0.3-beta.0','^0.0.3-beta.1',{includePrerelease:true}),false);
  assert.equal(s.satisfies('0.2.4-alpha','^0.2.3',{includePrerelease:true}),true);
});
test('caret upper boundaries remain exclusive',()=>{
  for(const [range,upper]of [['^0.0.3','0.0.4'],['^0.2.3','0.3.0'],['^1.2.3','2.0.0']])for(const v of [upper,`${upper}-alpha`])assert.equal(s.satisfies(v,range,{includePrerelease:true}),false);
});

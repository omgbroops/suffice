import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {resolve} from 'node:path';
const s=createRequire(resolve(process.env.SUFFICE_WORKSPACE,'src/package.json'))('./index.js');
test('prerelease to different stable core uses actual highest changed component',()=>{
  for(const [a,b,want]of [['1.7.2-1','1.8.1','minor'],['1.1.1-pre','2.1.1','major'],['1.4.0-1','2.3.5','major'],['1.6.1-5','1.7.2','minor'],['3.2.1-rc.2','3.2.4','patch'],['4.3.1-alpha','5.2.7','major']]){
    assert.equal(s.diff(a,b),want,`${a} -> ${b}`);assert.equal(s.diff(b,a),want);
  }
});
test('same core and initial major stabilization remain compatible',()=>{
  for(const [a,b,want]of [['1.2.3-1','1.2.3','patch'],['1.2.0-1','1.2.0','minor'],['2.0.0-1','2.1.1','major'],['1.0.0-1','1.0.0','major']])assert.equal(s.diff(a,b),want);
});
test('prerelease targets and equal versions retain classifications',()=>{
  for(const [a,b,want]of [['1.1.1-pre','2.1.1-pre','premajor'],['1.0.0-1','1.1.0-1','preminor'],['1.0.0-1','1.0.1-1','prepatch'],['1.2.3-a','1.2.3-b','prerelease'],['1.2.3','1.2.3',null]])assert.equal(s.diff(a,b),want);
});

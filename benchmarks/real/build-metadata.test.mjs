import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require=createRequire(resolve(process.env.SUFFICE_WORKSPACE,'src/package.json'));
const s=require('./index.js');
test('long build metadata cannot become a version suffix',()=>{
  for(const size of [250,251,300,501]) for(const suffix of ['3','x6','']) {
    const input='4.17.0+'+'a'.repeat(size)+suffix;
    assert.equal(s.validRange(input,{loose:true}),'4.17.0');
    assert.equal(s.satisfies('4.17.0',input,{loose:true}),true);
    assert.equal(s.satisfies('4.17.1',input,{loose:true}),false);
  }
});
test('build metadata invariance across range forms',()=>{
  const b='a'.repeat(251);
  const cases=[['v1.0+'+b+'x6','v1.0'],['1.2.3+'+b+' - 2.0.0','1.2.3 - 2.0.0'],['> 1.2.3+'+b,'> 1.2.3'],['>= 1.2.3+'+b,'>= 1.2.3'],['~1.2.3+'+b,'~1.2.3'],['^1.2.3+'+b,'^1.2.3'],['1.2.3+'+b+' || 2.0.0+'+b,'1.2.3 || 2.0.0']];
  for(const options of [undefined,{loose:true}]) for(const [input,plain] of cases) assert.equal(s.validRange(input,options),s.validRange(plain,options),input);
});
test('prereleases and ordinary metadata retain meaning',()=>{
  for(const options of [undefined,{loose:true},{includePrerelease:true}]) {
    assert.equal(s.validRange('^1.2.3-beta.2+build',options),s.validRange('^1.2.3-beta.2',options));
    assert.equal(s.validRange('1.2.x+build',options),s.validRange('1.2.x',options));
    assert.equal(s.validRange('garbage',options),null);
  }
});

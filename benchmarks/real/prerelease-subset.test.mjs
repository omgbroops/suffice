import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require=createRequire(resolve(process.env.SUFFICE_WORKSPACE,'src/package.json'));
const {subset,Range}=require('./index.js');
test('inclusive prerelease lower bounds within caret ranges',()=>{
  for(const major of [1,7,10,31]) for(const tag of ['alpha','beta','rc']) {
    assert.equal(subset(`^${major}.2.0-${tag}.2`,`^${major}.2.0-${tag}.1`),true);
    assert.equal(subset(`^${major}.2.0-${tag}.1`,`^${major}.2.0-${tag}.2`),false);
  }
});
test('inclusive prerelease upper bounds across comparators',()=>{
  for(const tag of ['alpha','beta','rc']) {
    const sub=`>=1.2.3-${tag}.1 <=1.2.3-${tag}.4`, dom=`>=1.2.3-${tag}.0 <1.2.3`;
    assert.equal(subset(sub,dom),true);
    assert.equal(subset(new Range(sub),new Range(dom)),true);
    assert.equal(subset(`>=1.2.3-${tag}.0 <=1.2.3-${tag}.4`,sub),false);
  }
});
test('prerelease gating remains distinct from comparator checks',()=>{
  assert.equal(subset('^1.2.3-beta.2','^1.2.3'),false);
  assert.equal(subset('^1.2.3-beta.2','>=1.0.0'),false);
  assert.equal(subset('^1.2.3-beta.2','>=1.0.0',{includePrerelease:true}),true);
  assert.equal(subset('>2 <1','3'),true);
  assert.equal(subset('>=1.2.3 <=2.0.0','>=1.2.3 <2.0.0'),false);
});

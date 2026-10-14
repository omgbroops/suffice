import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require=createRequire(resolve(process.env.SUFFICE_WORKSPACE,'src/package.json'));
const s=require('./index.js');
test('matching dotted identifier continues numeric sequence',()=>{
  for(const prefix of ['alpha.beta','rc.preview','alpha.beta.5']) for(const n of [0,4,19]) {
    const original=`3.0.0-${prefix}.${n}`, expected=`3.0.0-${prefix}.${n+1}`;
    assert.equal(s.inc(original,'prerelease',false,prefix),expected);
    assert.equal(s.inc(original,'pre',false,prefix),expected);
  }
  assert.equal(s.inc('3.0.0-alpha.beta.5.4','prerelease',false,'alpha.beta'),'3.0.0-alpha.beta.5.5');
});
test('mismatched and nonnumeric suffixes reset appropriately',()=>{
  assert.equal(s.inc('3.0.0-alpha.beta.gamma','prerelease',false,'alpha.beta'),'3.0.0-alpha.beta.0');
  assert.equal(s.inc('3.0.0-alpha.gamma.7','prerelease',false,'alpha.beta'),'3.0.0-alpha.beta.0');
  assert.equal(s.inc('3.0.0-alpha.4','prerelease',false,'alpha.beta'),'3.0.0-alpha.beta.0');
});
test('identifier base and input object contracts',()=>{
  assert.equal(s.inc('3.0.0-alpha.beta.gamma','prerelease',false,'alpha.beta',1),'3.0.0-alpha.beta.1');
  assert.equal(s.inc('3.0.0','prerelease',false,'alpha.beta',false),'3.0.1-alpha.beta');
  assert.equal(s.inc('3.0.0','prerelease',false,'alpha..beta'),null);
  const v=new s.SemVer('3.0.0-alpha.beta.4+build'), before=JSON.stringify(v);
  assert.equal(s.inc(v,'prerelease',false,'alpha.beta'),'3.0.0-alpha.beta.5');
  assert.equal(JSON.stringify(v),before);
});

import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {resolve} from 'node:path';
const s=createRequire(resolve(process.env.SUFFICE_WORKSPACE,'src/package.json'))('./index.js');
test('coercion retains complete digit-prefixed identifiers',()=>{
  for(const tag of ['1a','12ab','1234xyz','alpha.12ab','alpha.1234.23cd','nightly.abc123']){
    const v=`1.0.0-${tag}`;assert.equal(s.coerce(v,{includePrerelease:true}).version,v);
    assert.deepEqual(s.coerce(v,{includePrerelease:true}).prerelease,new s.SemVer(v).prerelease);
  }
});
test('prerelease and build fields remain distinct',()=>{
  const v=s.coerce('release 2.3.4-12ab.7+build.1a',{includePrerelease:true});
  assert.equal(v.version,'2.3.4-12ab.7');assert.deepEqual(v.prerelease,['12ab',7]);assert.deepEqual(v.build,['build','1a']);
  assert.equal(s.coerce('1.0.0-1a').version,'1.0.0');assert.deepEqual(s.coerce('1.0.0-123',{includePrerelease:true}).prerelease,[123]);
});
test('increment and validation do not truncate identifiers',()=>{
  assert.equal(s.inc('1.2.3','prerelease',false,'12ab'),'1.2.4-12ab.0');
  assert.equal(s.inc('1.2.3','prerelease',false,'alpha..beta'),null);
  assert.equal(s.valid('1.2.3-01'),null);assert.equal(s.valid('1.2.3-12ab+build.7'),'1.2.3-12ab');
});

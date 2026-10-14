import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));
const semver = require('./index.js');
const fixture = name => require(`./test/fixtures/${name}.js`);
test('upstream range parsing fixtures', () => {
  for (const [range, expected, options] of fixture('range-parse')) assert.equal(semver.validRange(range, options), expected, JSON.stringify([range,options]));
});
test('upstream range inclusion fixtures', () => {
  for (const [range, version, options] of fixture('range-include')) assert.equal(semver.satisfies(version,range,options),true,JSON.stringify([range,version,options]));
});
test('upstream range exclusion fixtures', () => {
  for (const [range, version, options] of fixture('range-exclude')) assert.equal(semver.satisfies(version,range,options),false,JSON.stringify([range,version,options]));
});
test('upstream increment fixtures and object nonmutation', () => {
  for (const [pre, what, expected, options, id, base] of fixture('increments')) {
    assert.equal(semver.inc(pre,what,options,id,base),expected,JSON.stringify([pre,what,options,id,base]));
    const parsed=semver.parse(pre,options);
    if(parsed){const before=JSON.stringify(parsed);semver.inc(parsed,what,options,id,base);assert.equal(JSON.stringify(parsed),before);}
  }
});
test('upstream version comparison fixtures', () => {
  for (const [a,b,options] of fixture('comparisons')) {assert.equal(semver.gt(a,b,options),true);assert.equal(semver.lt(b,a,options),true);assert.equal(semver.eq(a,b,options),false);}
});
test('upstream version equality fixtures', () => {
  for (const [a,b,options] of fixture('equality')) assert.equal(semver.eq(a,b,options),true,JSON.stringify([a,b,options]));
});
test('upstream subset fixtures and range object inputs',()=>{
  const cases=JSON.parse(readFileSync(resolve(process.env.SUFFICE_WORKSPACE,'tests/upstream-subset-cases.json'),'utf8'));
  for(const [sub,dom,expected,options]of cases){
    assert.equal(semver.subset(sub,dom,options),expected,JSON.stringify([sub,dom,options]));
    assert.equal(semver.subset(new semver.Range(sub,options),new semver.Range(dom,options),options),expected);
  }
});

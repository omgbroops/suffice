import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {parseRoute} from '../packages/cli/src/auto-command.mjs';
import {detectTestCommand,verifyDir} from '../packages/cli/src/verify.mjs';

test('parseRoute accepts each valid route and falls back to other',()=>{
  assert.equal(parseRoute('{"route":"repair"}'),'repair');
  assert.equal(parseRoute('{"route":"feature"}'),'feature');
  assert.equal(parseRoute('{"route":"other"}'),'other');
  assert.equal(parseRoute('{"route":"bogus"}'),'other');
  assert.equal(parseRoute('not json'),'other');
  assert.equal(parseRoute(''),'other');
  assert.equal(parseRoute('{"route":"repair"} trailing'),'other');
});

test('detectTestCommand finds an npm test script and skips the placeholder',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'auto-cmd-'));
  try{
    assert.equal(await detectTestCommand(dir),null);
    await writeFile(join(dir,'package.json'),JSON.stringify({scripts:{test:'node --test tests'}}));
    const spec=await detectTestCommand(dir);
    assert.equal(spec.command,'npm');
    assert.deepEqual(spec.args,['test']);
    await writeFile(join(dir,'package.json'),JSON.stringify({scripts:{test:'echo "Error: no test specified" && exit 1'}}));
    assert.equal(await detectTestCommand(dir),null);
  }finally{ await rm(dir,{recursive:true,force:true}); }
});

test('verifyDir passes a green suite and fails a red one',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'auto-cmd-'));
  try{
    let result=await verifyDir(dir);
    assert.equal(result.ranTests,false);
    await mkdir(join(dir,'tests'),{recursive:true});
    await writeFile(join(dir,'package.json'),JSON.stringify({scripts:{test:'node tests/ok.test.mjs'}}));
    await writeFile(join(dir,'tests','ok.test.mjs'),'process.exit(0)');
    result=await verifyDir(dir);
    assert.equal(result.ranTests,true);
    assert.equal(result.passed,true);
    await writeFile(join(dir,'tests','ok.test.mjs'),'console.error("1 failing");process.exit(1)');
    result=await verifyDir(dir);
    assert.equal(result.ranTests,true);
    assert.equal(result.passed,false);
    assert.match(result.detail,/failing/);
  }finally{ await rm(dir,{recursive:true,force:true}); }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseOptions} from '../src/options.mjs';
import {repositoryTools} from '../src/tools.mjs';
import {repositoryPath} from '../src/workspace.mjs';

test('CLI entrypoint works outside the repository and validates options',()=>{
  const entry=resolve(import.meta.dirname,'../bin/suffice.mjs');
  const version=spawnSync(process.execPath,[entry,'--version'],{cwd:tmpdir(),encoding:'utf8'});
  assert.equal(version.status,0);assert.match(version.stdout,/^Suffice 0\.1\.0-alpha\.1/);
  assert.doesNotMatch(version.stdout,/Pi v/);
  assert.throws(()=>parseOptions(['--max-cost','NaN']),/positive/);
  assert.throws(()=>parseOptions(['--timeout','-1']),/positive/);
  assert.throws(()=>parseOptions(['--effort','extreme']),/Invalid effort/);
  assert.throws(()=>parseOptions(['--unknown']),/Unknown option/);
});

test('native tools edit multiple packages, root and hidden config, then run project verification',async()=>{
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-cli-tools-'));
  try {
    await mkdir(resolve(dir,'packages/a'),{recursive:true});await mkdir(resolve(dir,'packages/b'),{recursive:true});
    await writeFile(resolve(dir,'packages/a/index.js'),'export function answer() { return 41; }\n');
    await writeFile(resolve(dir,'packages/b/index.ts'),'export function typed(value: number): number { return value + 1; }\n');
    const tools=repositoryTools({workspace:dir}), find=name=>tools.find(t=>t.name===name);
    await find('edit').execute('a',{path:'packages/a/index.js',edits:[{oldText:'return 41;',newText:'return 42;'}]});
    await find('write').execute('b',{path:resolve(dir,'packages/b/config.json'),content:'{"enabled":true}\n'});
    await find('write').execute('c',{path:'.github/workflows/ci.yml',content:'name: ci\n'});
    await find('write').execute('d',{path:'verify.mjs',content:"import assert from 'node:assert/strict';import {answer} from './packages/a/index.js';assert.equal(answer(),42);console.log('VERIFIED');"});
    const run=await find('bash').execute('e',{command:'node verify.mjs',timeout:10});
    assert.ok(run.content.some(c=>c.text?.includes('VERIFIED')));assert.notEqual(run.isError,true);
    const js=await find('symbols').execute('f',{path:'packages/a/index.js',query:'answer'});
    assert.equal(js.structuredContent.matches[0].name,'answer');
    const ts=await find('symbol_read').execute('g',{path:'packages/b/index.ts',name:'typed'});
    assert.match(ts.structuredContent.text,/value: number/);
    assert.equal(await readFile(resolve(dir,'.github/workflows/ci.yml'),'utf8'),'name: ci\n');
    await assert.rejects(find('write').execute('h',{path:'../escape.txt',content:'no'}),/outside/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('file scope rejects an escaping directory link, including for new files',async()=>{
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-cli-scope-'));
  try {
    const repo=resolve(dir,'repo'),outside=resolve(dir,'outside');
    await mkdir(repo);await mkdir(outside);
    await symlink(outside,resolve(repo,'linked'),process.platform==='win32'?'junction':'dir');
    await assert.rejects(repositoryPath(repo,'linked/new.txt'),/leaves/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

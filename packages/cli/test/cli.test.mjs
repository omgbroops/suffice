import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseOptions,VERSION} from '../src/options.mjs';
import {repositoryTools} from '../src/tools.mjs';
import {repositoryPath} from '../src/workspace.mjs';
import {resolveProject, rememberProject, recentProjects} from '../src/projects.mjs';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {createSufficeSession} from '../src/session.mjs';
import {sufficeInterface} from '../src/interactive.mjs';

test('CLI entrypoint works outside the repository and validates options',()=>{
  const entry=resolve(import.meta.dirname,'../bin/suffice.mjs');
  const version=spawnSync(process.execPath,[entry,'--version'],{cwd:tmpdir(),encoding:'utf8'});
  assert.equal(version.status,0);assert.equal(version.stdout.trim(),`Suffice ${VERSION}`);
  assert.doesNotMatch(version.stdout,/Pi v/);
  assert.throws(()=>parseOptions(['--max-cost','NaN']),/positive/);
  assert.throws(()=>parseOptions(['--timeout','-1']),/positive/);
  assert.throws(()=>parseOptions(['--effort','extreme']),/Invalid effort/);
  assert.throws(()=>parseOptions(['--unknown']),/Unknown option/);
  assert.equal(parseOptions(['--cwd','.']).cwdExplicit,true);
  assert.equal(parseOptions([]).cwdExplicit,undefined);
});

test('project selection supports recent and quoted paths and rejects files',async()=>{
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-cli-projects-'));
  try {
    const first=resolve(dir,'first project'),second=resolve(dir,'second');
    await mkdir(first);await mkdir(second);
    const a=await resolveProject(first),b=await resolveProject(second);
    await rememberProject(dir,a);await rememberProject(dir,b);await rememberProject(dir,a);
    assert.deepEqual(await recentProjects(dir),[a,b]);
    assert.equal(await resolveProject('"../second"',first),b);
    await writeFile(resolve(dir,'not-directory'),'x');
    await assert.rejects(resolveProject('not-directory',dir),/not a file/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('native Pi project command creates a valid empty session and preserves state on invalid input',async()=>{
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-cli-native-ui-'));
  try {
    const repo=resolve(dir,'repo');await mkdir(repo);
    const commands=new Map(),events=new Map(),errors=[],switched=[];
    sufficeInterface({home:dir})({on:(n,fn)=>events.set(n,fn),registerCommand:(n,c)=>commands.set(n,c)});
    const ctx={cwd:dir,waitForIdle:async()=>{},ui:{
      select:async(_title,items)=>items[0],input:async()=>repo,notify:(s,type)=>errors.push({s,type})
    },switchSession:async path=>{switched.push(JSON.parse((await readFile(path,'utf8')).trim()));return {cancelled:false};}};
    await commands.get('project').handler('',ctx);
    assert.equal(switched.length,1);assert.equal(switched[0].type,'session');
    assert.equal(switched[0].cwd,await resolveProject(repo));
    await commands.get('project').handler('nonexistent-directory',ctx);
    assert.equal(switched.length,1);assert.equal(errors.at(-1).type,'error');
    assert.ok(events.has('session_start'));
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('project sessions load distinct repository instructions and history locations without inference',async()=>{
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-cli-isolation-'));
  const agents=[];
  try {
    const home=resolve(dir,'home'),first=resolve(dir,'first'),second=resolve(dir,'second');
    for(const p of [home,first,second]) await mkdir(p);
    await writeFile(resolve(first,'AGENTS.md'),'PROJECT_FIRST_UNIQUE_CONTRACT');
    await writeFile(resolve(second,'AGENTS.md'),'PROJECT_SECOND_UNIQUE_CONTRACT');
    const runtime=await ModelRuntime.create({authPath:resolve(home,'auth.json'),refreshOnCreate:false,allowModelNetwork:false});
    for(const cwd of [first,second]) agents.push(await createSufficeSession({...parseOptions([]),cwd,home},runtime));
    assert.match(agents[0].session.systemPrompt,/PROJECT_FIRST_UNIQUE_CONTRACT/);
    assert.doesNotMatch(agents[0].session.systemPrompt,/PROJECT_SECOND_UNIQUE_CONTRACT/);
    assert.match(agents[1].session.systemPrompt,/PROJECT_SECOND_UNIQUE_CONTRACT/);
    assert.doesNotMatch(agents[1].session.systemPrompt,/PROJECT_FIRST_UNIQUE_CONTRACT/);
    assert.notEqual(agents[0].sessionPath(),agents[1].sessionPath());
    for(const agent of agents) {assert.equal(agent.session.messages.length,0);assert.equal(agent.totals.modelCalls,0);}
  } finally {for(const agent of agents) await agent.dispose();await rm(dir,{recursive:true,force:true});}
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

test('serve parses its flags and only accepts them for serve',()=>{
  assert.equal(parseOptions(['serve']).command,'serve');
  const o=parseOptions(['serve','--port','8080','--max','4']);
  assert.equal(o.command,'serve');assert.equal(o.port,8080);assert.equal(o.max,4);
  assert.throws(()=>parseOptions(['serve','--port','0']),/positive integer/);
  assert.throws(()=>parseOptions(['--port','8080']),/only apply to serve/);
});

test('serve runs the backend binary with the home backend dir and forwards its exit code',async()=>{
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-serve-'));
  const fake=resolve(dir,'fake-backend.sh');
  await writeFile(fake,'#!/bin/sh\necho "$@"\nexit 0\n');
  await (await import('node:fs/promises')).chmod(fake,0o755);
  const entry=resolve(import.meta.dirname,'../bin/suffice.mjs');
  const home=resolve(dir,'home');
  const run=spawnSync(process.execPath,[entry,'serve','--port','9100','--home',home],{encoding:'utf8',env:{...process.env,SUFFICE_BACKEND_BIN:fake}});
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,new RegExp(`serve --dir ${home.replaceAll('/','\\/')}/backend --port 9100`));
  await rm(dir,{recursive:true,force:true});
});

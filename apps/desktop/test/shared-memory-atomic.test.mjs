// Instances sharing SUFFICE_HOME write project memory concurrently; a reader must never see a partial file.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {rememberProject,projectContext} from '../electron/engine-settings.mjs';
test('rememberProject replaces the file atomically and leaves no temp files',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'sfx-mem-')),cwd=resolve(home,'proj');await mkdir(cwd);
 await rememberProject(home,cwd,'a');
 const dir=resolve(home,'project-memory'),[f]=await readdir(dir),ino=(await stat(resolve(dir,f))).ino;
 await rememberProject(home,cwd,'b');
 assert.notEqual((await stat(resolve(dir,f))).ino,ino,'write must rename a temp file over the target');
 const texts=[...Array(8)].map((_,i)=>String(i).repeat(3000+i));
 await Promise.all(texts.map(t=>rememberProject(home,cwd,t)));
 assert.ok(texts.includes(await readFile(resolve(dir,f),'utf8')),'final file is exactly one writer\'s text');
 assert.deepEqual(await readdir(dir),[f]);
});

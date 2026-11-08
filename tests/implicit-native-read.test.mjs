import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {resolve,relative,isAbsolute,sep} from 'node:path';import {tmpdir} from 'node:os';
import {createReadTool} from '@earendil-works/pi-coding-agent';
import {implicitToolAdapter} from '../packages/cli/src/implicit-tools.mjs';
test('native read spans respect its real default, byte truncation and absent source',async t=>{
 const root=await mkdtemp(resolve(tmpdir(),'suffice-native-span-'));t.after(async()=>{const rel=relative(tmpdir(),root);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel)&&!rel.includes(sep));await rm(root,{recursive:true,force:true});});
 const captured=[],adapter=implicitToolAdapter({workspace:root,tools:[createReadTool(root)],context:true,engineFactory:class{read(record){captured.push(record);return null;}dispose(){}}});t.after(()=>adapter.dispose());const tool=adapter.tools[0];
 await writeFile(resolve(root,'full.ts'),Array.from({length:400},(_,i)=>`export const value${i}=${i};`).join('\n'));const full=await tool.execute('full',{path:'full.ts'});assert.equal(full.structuredContent.split('\n').length,400);assert.equal(captured.at(-1).endLine,400);
 await writeFile(resolve(root,'bytes.ts'),Array.from({length:400},(_,i)=>`// ${i} ${'x'.repeat(200)}`).join('\n'));const bytes=await tool.execute('bytes',{path:'bytes.ts'});assert.ok(bytes.details.truncation.truncated);assert.equal(captured.at(-1).endLine,bytes.details.truncation.outputLines);
 await writeFile(resolve(root,'long.ts'),'x'.repeat(60000));const before=captured.length;await tool.execute('long',{path:'long.ts'});assert.equal(captured.length,before);
});

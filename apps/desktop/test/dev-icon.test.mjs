import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {patchExecutableIcons} from '../electron/dev-icon.mjs';
test('development icon replacement stays inside existing PE resources',{skip:process.platform!=='win32'},async()=>{
 const bytes=await readFile(electronPath),icon=await readFile(resolve('apps/desktop/assets/suffice-logo.ico'));
 const header=bytes.readUInt32LE(60),optional=header+24,table=optional+bytes.readUInt16LE(header+20);let start,end;
 for(let i=0;i<bytes.readUInt16LE(header+6);i++){const at=table+i*40;if(bytes.toString('ascii',at,at+8).replaceAll('\0','')==='.rsrc'){start=bytes.readUInt32LE(at+20);end=start+bytes.readUInt32LE(at+16);}}
 assert.ok(start&&end);const hash=(a,b)=>createHash('sha256').update(bytes.subarray(a,b)).digest('hex'),prefix=hash(0,start),suffix=hash(end,bytes.length),resources=hash(start,end);
 assert.ok(patchExecutableIcons(bytes,icon)>0);assert.equal(hash(0,start),prefix);assert.equal(hash(end,bytes.length),suffix);assert.notEqual(hash(start,end),resources);
 assert.throws(()=>patchExecutableIcons(Buffer.alloc(256),icon),/Invalid executable/);
});

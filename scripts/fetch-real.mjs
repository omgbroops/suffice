import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {stateDir} from '../src/runtime.mjs';
import {hash} from '../src/workspace.mjs';
import {baseRevision,upstreamDir} from '../benchmarks/real/tasks.mjs';
const directory=resolve(stateDir,'upstream/semver'),archive=resolve(directory,'source.tar.gz');
const expected='e5d07eb248ffb4f311de2be058d6266cfb0c6cbaae3689108048f1c703f88206';
await mkdir(directory,{recursive:true});
let bytes;
try{bytes=await readFile(archive);}catch(e){
  if(e.code!=='ENOENT')throw e;
  const response=await fetch(`https://codeload.github.com/npm/node-semver/tar.gz/${baseRevision}`,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Upstream download failed: ${response.status}`);
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>2*1024*1024)throw new Error('Download exceeds 2 MiB cap');chunks.push(chunk);}
  bytes=Buffer.concat(chunks);
  if(hash(bytes)!==expected)throw new Error('Pinned source archive checksum mismatch');
  await writeFile(archive,bytes,{flag:'wx'});
}
if(hash(bytes)!==expected)throw new Error('Existing source archive checksum mismatch');
let present=true;try{await access(resolve(upstreamDir,'package.json'));}catch{present=false;}
if(!present){
  const result=spawnSync('tar',['-xzf',archive,'-C',directory],{windowsHide:true,encoding:'utf8'});
  if(result.status!==0)throw new Error('Could not extract verified source archive; tar is required');
}
console.log(JSON.stringify({repository:'npm/node-semver',revision:baseRevision,bytes:bytes.length,sha256:expected,alreadyPresent:present}));

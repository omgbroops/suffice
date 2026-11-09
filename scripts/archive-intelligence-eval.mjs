import {readFile,writeFile,readdir,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const directory=resolve(import.meta.dirname,'../reports/repository-intelligence-eval-v2',process.argv[2]??'luna-xhigh-v2');
const checksum=bytes=>createHash('sha256').update(bytes).digest('hex'),records=[];
for(const phase of ['pilot','main'])for(const file of await readdir(resolve(directory,phase))){
  if(!/\.(?:events|session)\.jsonl$/.test(file))continue;
  const path=resolve(directory,phase,file),raw=await readFile(path),packed=gzipSync(raw,{level:9});
  if(checksum(gunzipSync(packed))!==checksum(raw))throw new Error('Archive verification failed');
  await writeFile(path+'.gz',packed,{flag:'wx'});records.push({path:phase+'/'+file+'.gz',sha256:checksum(raw),rawBytes:raw.length,gzipBytes:packed.length});await unlink(path);
}
await writeFile(resolve(directory,'archives.json'),JSON.stringify(records,null,2));console.log(JSON.stringify({files:records.length,rawBytes:records.reduce((n,r)=>n+r.rawBytes,0),gzipBytes:records.reduce((n,r)=>n+r.gzipBytes,0)}));

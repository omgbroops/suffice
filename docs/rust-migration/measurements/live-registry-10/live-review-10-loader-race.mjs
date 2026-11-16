import {createRequire,syncBuiltinESMExports} from 'node:module';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {sessionArtifactName} from '../scripts/rust-migration/session-native-artifact.mjs';
const req=createRequire(import.meta.url),fs=req('node:fs/promises'),dir=mkdtempSync(join(tmpdir(),'suffice-firstload-review-'));
const name=sessionArtifactName(), file=join(dir,name), hash=s=>createHash('sha256').update(s).digest('hex'), license='fixture';
function stage(label){writeFileSync(file,label);writeFileSync(join(dir,'suffice-session-'+process.platform+'-'+process.arch+'-LICENSES.txt'),license);writeFileSync(file+'.json',JSON.stringify({schemaVersion:1,platform:process.platform,arch:process.arch,nodeApi:6,source:'crates/suffice-session-addon/Cargo.toml',profile:'release',locked:true,bytes:label.length,sha256:hash(label),licensesBytes:license.length,licensesSha256:hash(license)}));}
const contexts=new AsyncLocalStorage(),counts={},waiting={A:Promise.withResolvers(),B:Promise.withResolvers()},release={A:Promise.withResolvers(),B:Promise.withResolvers()};
const read=fs.readFile, extension=req.extensions['.node'];
try{
 fs.readFile=async function(path,...args){const tag=contexts.getStore();if(path===file&&tag){counts[tag]=(counts[tag]||0)+1;if(counts[tag]===2){waiting[tag].resolve();await release[tag].promise;}}return read.call(this,path,...args);};syncBuiltinESMExports();
 req.extensions['.node']=(m,p)=>m.exports={label:readFileSync(p,'utf8')};
 const {loadDesktopBinding}=await import('../apps/desktop-bridge/native-binding.mjs');
 const run=tag=>contexts.run(tag,()=>loadDesktopBinding(dir)).then(b=>({ok:true,label:b.label}),e=>({ok:false,error:e.message}));
 stage('generation A');const a=run('A');
 const watched=await Promise.race([waiting.A.promise.then(()=>true),delay(750).then(()=>false)]);
 if(!watched)throw Error('review instrumentation no longer matches the loader; rerun using its new first-load observation point');
 stage('generation B');const b=run('B');await Promise.race([waiting.B.promise,delay(200)]);release.A.resolve();const first=await a;release.B.resolve();
 const second=await b; const later=await run('C');console.log(JSON.stringify({first,second,laterB:later}));
}finally{release.A.resolve();release.B.resolve();req.extensions['.node']=extension;fs.readFile=read;syncBuiltinESMExports();rmSync(dir,{recursive:true,force:true});}

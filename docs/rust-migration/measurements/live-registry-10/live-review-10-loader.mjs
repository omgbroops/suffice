import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadDesktopBinding} from '../apps/desktop-bridge/native-binding.mjs';
import {sessionArtifactName} from '../scripts/rust-migration/session-native-artifact.mjs';
const req=createRequire(import.meta.url), base=mkdtempSync(join(tmpdir(),'suffice-verified-loader-'));
const name=sessionArtifactName(),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const license='fixture license',suffix='suffice-session-'+process.platform+'-'+process.arch+'-LICENSES.txt';
function publish(dir,label) {
 const bytes=Buffer.from(label);
 writeFileSync(join(dir,name),bytes);writeFileSync(join(dir,suffix),license);
 writeFileSync(join(dir,name+'.json'),JSON.stringify({schemaVersion:1,platform:process.platform,arch:process.arch,nodeApi:6,source:'crates/suffice-session-addon/Cargo.toml',profile:'release',locked:true,bytes:bytes.length,sha256:hash(bytes),licensesBytes:Buffer.byteLength(license),licensesSha256:hash(license)}));
}
const old=req.extensions['.node'];
req.extensions['.node']=(mod,file)=>{mod.exports={label:readFileSync(file,'utf8')};};
try{
 const dir=join(base,'real'),alias=join(base,'alias');mkdirSync(dir);symlinkSync(dir,alias);publish(dir,'build A');
 console.log('first trusted load', (await loadDesktopBinding(dir)).label);
 publish(dir,'build B');try{const value=await loadDesktopBinding(alias);console.log('same canonical file via alternate name: delivered',value.label,'while current receipt covers build B');}catch(e){console.log('alternate alias rejected',e.message);}
 const d2=join(base,'prepopulated');mkdirSync(d2);publish(d2,'build A');req(join(d2,name));publish(d2,'build B');
 try{console.log('prepopulated CommonJS cache first verified load: delivered',(await loadDesktopBinding(d2)).label,'while receipt covers build B');}catch(e){console.log('preload rejected',e.message);}
}finally{req.extensions['.node']=old;rmSync(base,{force:true,recursive:true});}

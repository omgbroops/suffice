import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {sessionArtifactName} from '../../../scripts/rust-migration/session-native-artifact.mjs';
import {loadDesktopBinding} from '../native-binding.mjs';

test('verified loader serializes canonical aliases and revokes an ambiguous first load',async t=>{
 const root=mkdtempSync(join(tmpdir(),'suffice-binding-race-')),require=createRequire(import.meta.url);
 const name=sessionArtifactName(),license='Fixture',hash=value=>createHash('sha256').update(value).digest('hex');
 const publish=(dir,bytes)=>{
  writeFileSync(join(dir,name),bytes);writeFileSync(join(dir,name.replace('.node','-LICENSES.txt')),license);
  writeFileSync(join(dir,name+'.json'),JSON.stringify({schemaVersion:1,platform:process.platform,arch:process.arch,nodeApi:6,source:'crates/suffice-session-addon/Cargo.toml',profile:'release',locked:true,bytes:bytes.length,sha256:hash(bytes),licensesBytes:license.length,licensesSha256:hash(license)}));
 };
 const real=join(root,'real'),alias=join(root,'alias'),race=join(root,'race'),preloaded=join(root,'preloaded'),broken=join(root,'broken');
 for(const dir of [real,race,preloaded,broken]){mkdirSync(dir);publish(dir,'A');}
 symlinkSync(real,alias,process.platform==='win32'?'junction':'dir');
 const original=require.extensions['.node'];let raceLoads=0,failedLoads=0;
 require.extensions['.node']=(module,file)=>{
  if(file===require.resolve(join(broken,name))){failedLoads++;throw Error('Initialization failed');}
  module.exports={label:readFileSync(file,'utf8')};
  if(file===require.resolve(join(race,name))){raceLoads++;publish(race,'B');}
 };
 t.after(()=>{require.extensions['.node']=original;rmSync(root,{recursive:true,force:true});});
 assert.equal((await loadDesktopBinding(real)).label,'A');
 publish(real,'B');await assert.rejects(loadDesktopBinding(alias),/Restart/);
 require(join(preloaded,name));publish(preloaded,'B');await assert.rejects(loadDesktopBinding(preloaded),/Restart/);
 const mixed=await Promise.allSettled([loadDesktopBinding(race),loadDesktopBinding(race)]);
 assert.ok(mixed.every(result=>result.status==='rejected'));assert.equal(raceLoads,1);
 publish(race,'A');await assert.rejects(loadDesktopBinding(race),/Restart/);
 await assert.rejects(loadDesktopBinding(broken),/Initialization failed/);
 assert.equal(require.cache[require.resolve(join(broken,name))],undefined);
 await assert.rejects(loadDesktopBinding(broken),/Restart/);assert.equal(failedLoads,1);
});

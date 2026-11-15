import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {nativeArtifactFiles} from '../scripts/rust-migration/native-artifact.mjs';

test('staging accepts absent optimization but rejects incomplete or stale native groups',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'suffice-native-artifact-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const platform='win32',arch='x64',name=`suffice-fs-${platform}-${arch}.node`,binary=Buffer.from('fixture native bytes'),license=Buffer.from('fixture upstream notice'),hash=b=>createHash('sha256').update(b).digest('hex');
 assert.deepEqual(await nativeArtifactFiles(dir,platform,arch),[]);
 await writeFile(join(dir,name),binary);
 await assert.rejects(nativeArtifactFiles(dir,platform,arch),{code:'ENOENT'});
 const receipt={schemaVersion:1,platform,arch,bytes:binary.length,sha256:hash(binary),licensesBytes:license.length,licensesSha256:hash(license)};
 await writeFile(join(dir,name+'.json'),JSON.stringify(receipt));
 await assert.rejects(nativeArtifactFiles(dir,platform,arch),{code:'ENOENT'});
 await writeFile(join(dir,'THIRD-PARTY-LICENSES.txt'),license);
 assert.deepEqual(await nativeArtifactFiles(dir,platform,arch),[name,name+'.json','THIRD-PARTY-LICENSES.txt']);
 await writeFile(join(dir,name+'.json'),JSON.stringify({...receipt,arch:'arm64'}));await assert.rejects(nativeArtifactFiles(dir,platform,arch),/integrity/);
 await writeFile(join(dir,name+'.json'),JSON.stringify(receipt));await writeFile(join(dir,name),'changed binary');await assert.rejects(nativeArtifactFiles(dir,platform,arch),/integrity/);
 await writeFile(join(dir,name),binary);await writeFile(join(dir,'THIRD-PARTY-LICENSES.txt'),'changed notice');await assert.rejects(nativeArtifactFiles(dir,platform,arch),/integrity/);
});

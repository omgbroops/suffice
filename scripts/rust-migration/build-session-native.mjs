import {spawnSync} from 'node:child_process';
import {mkdir,copyFile,rename,readFile,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {nativeLicenses} from './licenses.mjs';
import {sessionArtifactName,sessionNativeArtifactFiles} from './session-native-artifact.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
export async function buildSessionNative(){
 const source='crates/suffice-session-addon/Cargo.toml',manifest=join(root,source);
 const build=spawnSync('cargo',['build','--locked','--release','--manifest-path',manifest,'--message-format=json-render-diagnostics'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','inherit'],windowsHide:true});
 if(build.error)throw build.error;if(build.status!==0)throw Error(`Session addon release build failed (${build.status})`);
 const records=build.stdout.split('\n').filter(Boolean).map(line=>JSON.parse(line));
 const artifact=records.findLast(record=>record.reason==='compiler-artifact'&&record.target?.name==='suffice_session_addon'&&record.target.crate_types.includes('cdylib'));
 const binary=artifact?.filenames.find(path=>/\.(dylib|so|dll)$/.test(path));if(!binary)throw Error('Cargo did not report session addon library');
 // Experimental bridge output is deliberately outside CLI/production manifests.
 const directory=join(root,'apps/desktop-bridge/native');await mkdir(directory,{recursive:true});
 const name=sessionArtifactName(),license=`suffice-session-${process.platform}-${process.arch}-LICENSES.txt`;
 const bytes=await readFile(binary),licenses=await nativeLicenses(manifest,{label:'Suffice experimental session reader'}),hash=value=>createHash('sha256').update(value).digest('hex');
 const receipt={schemaVersion:1,platform:process.platform,arch:process.arch,nodeApi:6,source,profile:'release',locked:true,bytes:bytes.length,sha256:hash(bytes),licensesBytes:Buffer.byteLength(licenses),licensesSha256:hash(licenses)};
 const targets=[join(directory,name),join(directory,license),join(directory,name+'.json')],temporary=targets.map(path=>path+'.'+randomUUID()+'.tmp');
 try{await copyFile(binary,temporary[0]);await writeFile(temporary[1],licenses,{flag:'wx'});await writeFile(temporary[2],JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});for(let i=0;i<targets.length;i++)await rename(temporary[i],targets[i]);}
 finally{for(const path of temporary)await rm(path,{force:true});}
 await sessionNativeArtifactFiles(directory);console.log(JSON.stringify({experimental:true,directory,...receipt}));return join(directory,name);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])await buildSessionNative();

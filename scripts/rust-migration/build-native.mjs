import {spawnSync} from 'node:child_process';
import {mkdir,copyFile,rename,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {nativeLicenses} from './licenses.mjs';
import {nativeArtifactFiles} from './native-artifact.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
export async function buildNative(){
 const manifest=join(root,'crates/suffice-fs-addon/Cargo.toml');
 const build=spawnSync('cargo',['build','--locked','--release','--manifest-path',manifest,'--message-format=json-render-diagnostics'],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,stdio:['ignore','pipe','inherit']});
 if(build.error)throw build.error;
 if(build.status!==0)throw new Error(`Native traversal release build failed (${build.status})`);
 const records=build.stdout.split('\n').filter(Boolean).map(line=>JSON.parse(line));
 const artifact=records.findLast(record=>record.reason==='compiler-artifact'&&record.target?.name==='suffice_fs_addon'&&record.target.crate_types.includes('cdylib'));
 const binary=artifact?.filenames.find(name=>/\.(dll|so|dylib)$/.test(name));
 if(!binary)throw new Error('Cargo did not report the native traversal dynamic library');
 const directory=join(root,'packages/cli/native');await mkdir(directory,{recursive:true});
 const name=`suffice-fs-${process.platform}-${process.arch}.node`,target=join(directory,name);
 const licenses=await nativeLicenses(manifest);
 const bytes=await readFile(binary),metadata={schemaVersion:1,platform:process.platform,arch:process.arch,nodeApi:6,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),licensesBytes:Buffer.byteLength(licenses),licensesSha256:createHash('sha256').update(licenses).digest('hex'),source:'crates/suffice-fs-addon/Cargo.toml',profile:'release',locked:true};
 const targets=[target,join(directory,'THIRD-PARTY-LICENSES.txt'),join(directory,name+'.json')],suffix='.'+randomUUID()+'.tmp',temporaries=targets.map(path=>path+suffix);
 try{
  await copyFile(binary,temporaries[0]);await writeFile(temporaries[1],licenses,{flag:'wx'});await writeFile(temporaries[2],JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});
  // Receipt commits last; interrupted groups fail integrity validation at staging.
  for(let index=0;index<targets.length;index++)await rename(temporaries[index],targets[index]);
 }finally{for(const path of temporaries)await rm(path,{force:true});}
 await nativeArtifactFiles(directory);
 console.log('Built native traversal:',name,metadata.bytes,'bytes',metadata.sha256);
 return target;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])await buildNative();

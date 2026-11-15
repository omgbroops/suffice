import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

export async function nativeArtifactFiles(directory,platform=process.platform,arch=process.arch){
 const name=`suffice-fs-${platform}-${arch}.node`;
 let binary;try{binary=await readFile(join(directory,name));}catch(error){if(error.code==='ENOENT')return [];throw error;}
 const metadata=JSON.parse(await readFile(join(directory,name+'.json'),'utf8'));
 const licenses=await readFile(join(directory,'THIRD-PARTY-LICENSES.txt'));
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 if(metadata.schemaVersion!==1||metadata.platform!==platform||metadata.arch!==arch||metadata.bytes!==binary.length||metadata.sha256!==hash(binary)||metadata.licensesBytes!==licenses.length||metadata.licensesSha256!==hash(licenses))throw Error('Native artifact receipt, binary or license integrity mismatch');
 return [name,name+'.json','THIRD-PARTY-LICENSES.txt'];
}

import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

export const sessionArtifactName=(platform=process.platform,arch=process.arch)=>`suffice-session-${platform}-${arch}.node`;
export async function sessionNativeArtifactFiles(directory,platform=process.platform,arch=process.arch){
 const name=sessionArtifactName(platform,arch),license=`suffice-session-${platform}-${arch}-LICENSES.txt`;
 let bytes;try{bytes=await readFile(join(directory,name));}catch(error){if(error.code==='ENOENT')return [];throw error;}
 const receipt=JSON.parse(await readFile(join(directory,name+'.json'),'utf8')),licenses=await readFile(join(directory,license));
 const hash=data=>createHash('sha256').update(data).digest('hex');
 if(receipt.schemaVersion!==1||receipt.platform!==platform||receipt.arch!==arch||receipt.nodeApi!==6||receipt.source!=='crates/suffice-session-addon/Cargo.toml'||receipt.profile!=='release'||receipt.locked!==true||receipt.bytes!==bytes.length||receipt.sha256!==hash(bytes)||receipt.licensesBytes!==licenses.length||receipt.licensesSha256!==hash(licenses))throw Error('Experimental session artifact integrity mismatch');
 return [name,name+'.json',license];
}

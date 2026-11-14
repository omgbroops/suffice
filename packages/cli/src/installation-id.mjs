import {mkdir,readFile,writeFile,link,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

// CLI and desktop share one stable OAuth installation identity, without replacing existing IDs.
export async function installationId(home){
 const file=resolve(home,'host-id');
 const read=async()=>{const id=(await readFile(file,'utf8')).trim();if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new Error('Suffice installation ID is invalid');return id;};
 await mkdir(home,{recursive:true,mode:0o700});
 try{return await read();}catch(error){if(error.code!=='ENOENT')throw error;}
 const temporary=file+'.'+randomUUID()+'.tmp';await writeFile(temporary,randomUUID(),{flag:'wx',mode:0o600});
 try{await link(temporary,file);}catch(error){if(error.code!=='EEXIST')throw error;}finally{await unlink(temporary);}
 return read();
}

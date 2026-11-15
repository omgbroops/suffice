import {readFile,writeFile,rename,realpath,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {stampChatGitRoot,bindChatGitToProject} from './chat-git.mjs';
export async function moveThreadFile(file,destination,{home,id}={}){
 const cwd=await realpath(destination);if(!(await stat(cwd)).isDirectory())throw new Error('Project is not a directory');
 const source=await readFile(file,'utf8'),newline=source.indexOf('\n');if(newline<0)throw new Error('Invalid session journal');const header=JSON.parse(source.slice(0,newline));if(header.type!=='session')throw new Error('Invalid session header');
 if(home&&/^[a-f0-9]{32}$/.test(id||'')){const receipt=resolve(home,'chat-changes',id+'.json');try{const saved=JSON.parse(await readFile(receipt,'utf8'));if(!saved.root){saved.root=header.cwd;const temporary=receipt+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(saved),{mode:0o600});await rename(temporary,receipt);}}catch(error){if(error.code!=='ENOENT')throw error;}}
 const tracked=home&&/^[a-f0-9]{32}$/.test(id||'');if(tracked)await stampChatGitRoot(home,id,header.cwd);
 header.cwd=cwd;const temporary=file+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(header)+source.slice(newline),{mode:0o600});await rename(temporary,file);
 if(tracked)await bindChatGitToProject(home,id,cwd);return cwd;
}

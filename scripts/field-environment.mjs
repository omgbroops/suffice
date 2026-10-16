import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve('.suffice/field');
const run=(cmd,args,cwd)=>{const r=spawnSync(cmd,args,{cwd,encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error(r.stderr||r.stdout);return r.stdout.trim();};
const git=(cwd,...args)=>run('git',args,cwd);
export async function makeActor(id,task){
 const base=resolve(root,'bases',task),actor=resolve(root,'actors',id);
 await mkdir(resolve(root,'actors'),{recursive:true});
 git(base,'worktree','add','--detach',actor,'HEAD');
 run('C:/Python314/python.exe',['-I','-c','import os,shutil,sys; shutil.copytree(sys.argv[1],sys.argv[2],copy_function=os.link)',resolve(base,'node_modules'),resolve(actor,'node_modules')]);
 return actor;
}
if(process.argv.includes('--prepare')){
 for(const id of ['h02','l01']){const b=resolve(root,'bases',id);git(b,'add','--','tests/visible.test.mjs');git(b,'-c','user.name=Field evaluation','-c','user.email=field@localhost','commit','-qm','Add deterministic bridge to unchanged upstream suites');}
 await mkdir(resolve(root,'private'),{recursive:true});
 const ref=await makeActor('reference-h02','h02');
 const metadata=JSON.parse(await readFile('research/historical/node-fetch__node-fetch/1446/fix-commit.json'));
 const encoded=run('gh',['api','repos/node-fetch/node-fetch/contents/src/index.js?ref=043a5fcfc82884155bcb2afba2a82333b2f29c02','--jq','.content']);
 await writeFile(resolve(ref,'src/index.js'),Buffer.from(encoded,'base64'));
 await writeFile(resolve(root,'private/reference-h02.json'),JSON.stringify({revision:metadata.sha,reference:ref,productionFiles:['src/index.js']},null,2));
}

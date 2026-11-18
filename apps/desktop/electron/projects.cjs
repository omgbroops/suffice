const {readFile,writeFile,mkdir,rename}=require('node:fs/promises');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const exec=promisify(execFile),key=value=>process.platform==='win32'?value.toLowerCase():value;
const colors=new Set(['gray','red','orange','amber','yellow','lime','green','emerald','teal','cyan','sky','blue','indigo','violet','purple','fuchsia','pink','rose']);
exports.createProjectStore=directory=>{
 const file=path.join(directory,'projects.json');let tail=Promise.resolve();
 async function records(){try{const values=JSON.parse(await readFile(file,'utf8'));if(!Array.isArray(values))throw new Error('Invalid project registry');return values;}catch(error){if(error.code==='ENOENT')return [];throw error;}}
 async function mutate(change){const job=tail.catch(()=>{}).then(async()=>{const values=await records(),result=change(values);await mkdir(directory,{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(values,null,2),{mode:0o600});await rename(temporary,file);return result;});tail=job;return job;}
 const list=async()=>(await records()).filter(item=>!item.removed);
 const add=folder=>mutate(values=>{let item=values.find(p=>key(p.path)===key(folder));if(item){delete item.removed;return item;}item={id:randomUUID(),name:path.basename(folder),path:folder};values.push(item);return item;});
 const remove=folder=>mutate(values=>{let item=values.find(p=>key(p.path)===key(folder));if(!item){item={id:randomUUID(),name:path.basename(folder),path:folder};values.push(item);}item.removed=true;return true;});
 const update=(folder,patch)=>mutate(values=>{const item=values.find(p=>key(p.path)===key(folder)&&!p.removed);if(!item)throw new Error('Project not found');if(!patch||typeof patch!=='object')throw new Error('Invalid project details');
  if(patch.name!==undefined){if(typeof patch.name!=='string'||!patch.name.trim()||patch.name.length>90)throw new Error('Use a project name of 1-90 characters');item.name=patch.name.trim();}
  if(patch.pinned!==undefined){if(typeof patch.pinned!=='boolean')throw new Error('Invalid pin state');item.pinned=patch.pinned;}
  if(patch.projectIcon!==undefined){const icon=patch.projectIcon;if(icon!==null&&(!icon||!['monogram','emoji','lucide'].includes(icon.kind)||icon.kind==='lucide'&&(typeof icon.name!=='string'||!/^[a-zA-Z][a-zA-Z0-9-]{0,63}$/.test(icon.name))||icon.color&&!colors.has(icon.color)||icon.kind==='monogram'&&(typeof icon.text!=='string'||Array.from(icon.text).length>2)||icon.kind==='emoji'&&(typeof icon.emoji!=='string'||!icon.emoji||icon.emoji.length>32)))throw new Error('Invalid project icon');item.projectIcon=icon;}
  if(patch.projectImage!==undefined){if(patch.projectImage!==null&&(typeof patch.projectImage!=='string'||patch.projectImage.length>300000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(patch.projectImage)))throw new Error('Invalid project image');item.projectImage=patch.projectImage;}
  if(patch.envSetup!==undefined){if(typeof patch.envSetup!=='string'||patch.envSetup.length>8000)throw new Error('Use a setup script under 8000 characters');if(patch.envSetup.trim())item.envSetup=patch.envSetup;else delete item.envSetup;}return item;});
 async function git(folder){let worktree=false;try{const {stdout}=await exec('git',['-C',folder,'rev-parse','--git-dir','--git-common-dir'],{windowsHide:true,timeout:5000});const [dir,common]=stdout.trim().split(/\r?\n/);worktree=!!(dir&&common&&path.resolve(folder,dir)!==path.resolve(folder,common));}catch{}try{const {stdout}=await exec('git',['-C',folder,'symbolic-ref','--short','HEAD'],{windowsHide:true,timeout:5000});return {branch:stdout.trim(),worktree};}catch{try{const {stdout}=await exec('git',['-C',folder,'rev-parse','--short','HEAD'],{windowsHide:true,timeout:5000});return {branch:stdout.trim(),detached:true,worktree};}catch{return {branch:null};}}}
 return {list,add,git,remove,update,hidden:async()=>(await records()).filter(p=>p.removed).map(p=>p.path)};
};

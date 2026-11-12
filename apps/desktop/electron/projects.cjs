const {readFile,writeFile,mkdir}=require('node:fs/promises');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const path=require('node:path');
const exec=promisify(execFile);
exports.createProjectStore=directory=>{
 const file=path.join(directory,'projects.json');let projects=[];
 async function list(){try{projects=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}return projects;}
 async function add(folder){await list();const found=projects.find(p=>p.path.toLowerCase()===folder.toLowerCase());if(found)return found;const item={id:require('node:crypto').randomUUID(),name:path.basename(folder),path:folder};projects.push(item);await mkdir(directory,{recursive:true});await writeFile(file,JSON.stringify(projects,null,2));return item;}
 async function git(folder){try{const {stdout}=await exec('git',['-C',folder,'symbolic-ref','--short','HEAD'],{windowsHide:true,timeout:5000});return {branch:stdout.trim()};}catch{try{const {stdout}=await exec('git',['-C',folder,'rev-parse','--short','HEAD'],{windowsHide:true,timeout:5000});return {branch:stdout.trim(),detached:true};}catch{return {branch:null};}}}
 return {list,add,git};
};

// Saved project folders (projects.json) and the branch shown beside each.
const path=require('node:path');
const crypto=require('node:crypto');
const store=require('./json-store.cjs');
const defaultGit=require('./git.cjs').git;
exports.createProjectStore=(directory,{git:run=defaultGit}={})=>{
 const file=path.join(directory,'projects.json');
 const load=()=>{const saved=store.read(file,[]);return Array.isArray(saved)?saved.filter(p=>p&&typeof p.id==='string'&&typeof p.path==='string'):[];};
 const list=async()=>load();
 const paths=()=>load().map(p=>p.path);
 async function add(folder){
  const projects=load(),found=projects.find(p=>p.path.toLowerCase()===folder.toLowerCase());
  if(found)return found;
  const item={id:crypto.randomUUID(),name:path.basename(folder),path:folder};
  projects.push(item);store.write(file,projects,2);return item;
 }
 async function git(folder){
  try{return {branch:await run(folder,['symbolic-ref','--short','HEAD'],{timeout:5000})};}
  catch{try{return {branch:await run(folder,['rev-parse','--short','HEAD'],{timeout:5000}),detached:true};}catch{return {branch:null};}}
 }
 return {list,add,git,paths};
};

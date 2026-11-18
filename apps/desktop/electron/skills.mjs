import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
const starter=(id,name,description,instructions)=>({id:'starter-'+id,name,description,instructions,files:[],starter:true});
export const STARTER_SKILLS=[
 starter('code-review','Code review','Review a change for bugs, risk and missing tests.','Review the change the user points at (default: the uncommitted diff).\n1. Read the diff, then the code around each change.\n2. Report only real problems: wrong logic, unhandled errors, security holes, broken callers, missing tests. Skip style nits.\n3. Order findings by severity. Give file:line, what breaks, and the smallest fix.\n4. End with one line: ship, or what must change first.'),
 starter('write-tests','Write tests','Add focused tests that fail without the change.','Write tests for the code the user names.\n1. Find the existing test setup and match its framework, naming and helpers.\n2. Cover the normal path, each branch, and the failure cases. Use real inputs, not mocks, where practical.\n3. Run the tests. Confirm each new test fails when the behavior is broken, then passes.\n4. Never weaken an existing test to get green.'),
 starter('explain-codebase','Explain codebase','Map an unfamiliar repository quickly.','Explain this repository to someone new.\n1. Read the README, manifests and top-level layout.\n2. Name what it does, the main entry points, and how the parts connect.\n3. Trace one real request or command end to end, citing file paths.\n4. List where to start reading, and what to avoid touching first. Keep it under one page.'),
 starter('fix-ci','Fix CI','Find why CI fails and fix the cause.','Fix the failing CI run.\n1. Read the workflow files and the failing job log (use gh run view --log-failed when available).\n2. Reproduce the failing step locally with the same command.\n3. Fix the root cause, not the symptom. Do not skip, disable or loosen checks.\n4. Re-run the exact CI commands locally and report their results.')
];
const clip=(v,n,what)=>{if(typeof v!=='string'||v.length>n)throw new Error(what+' is too long');return v.trim();};
function clean(p){
 const name=clip(p.name,60,'Name');if(!name)throw new Error('Name is required');
 const instructions=clip(p.instructions,50000,'Instructions');if(!instructions)throw new Error('Instructions are required');
 const files=p.files??[];if(!Array.isArray(files)||files.length>5)throw new Error('Attach up to 5 files');
 let size=0;
 return {name,description:clip(p.description??'',300,'Description'),instructions,files:files.map(f=>{size+=f?.text?.length||0;if(size>100000)throw new Error('Files are too large');return {name:clip(f?.name,100,'File name')||'file',text:typeof f.text==='string'?f.text:''};})};
}
export function createSkillLibrary(home){
 const file=resolve(home,'skill-library.json');let tail=Promise.resolve();
 const read=async()=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {user:STARTER_SKILLS,projects:{}};}};
 const write=data=>{const job=tail.then(async()=>{await mkdir(home,{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(data,null,2),{mode:0o600});await rename(tmp,file);});tail=job.catch(()=>{});return job;};
 const view=(data,project)=>[...data.user.map(s=>({...s,scope:'user'})),...(project?data.projects[project]||[]:[]).map(s=>({...s,scope:'project'}))];
 return {
  list:async project=>view(await read(),project),
  async save(p,project){
   if(!p||typeof p!=='object')throw new Error('Invalid skill');
   const data=await read(),fields=clean(p);
   const lists=[data.user,...(project?[data.projects[project]||=[]]:[])],existing=p.id&&lists.flatMap(l=>l).find(s=>s.id===p.id);
   if(p.id&&!existing)throw new Error('Unknown skill');
   if(existing)Object.assign(existing,fields,p.files===undefined?{files:existing.files}:{});
   else{if(p.scope==='project'&&!project)throw new Error('Choose a project first');(p.scope==='project'?data.projects[project]:data.user).push({id:randomUUID().slice(0,8),...fields});}
   await write(data);return view(data,project);
  },
  async remove(id,project){const data=await read();if(typeof id!=='string')throw new Error('Invalid skill');data.user=data.user.filter(s=>s.id!==id);if(project&&data.projects[project])data.projects[project]=data.projects[project].filter(s=>s.id!==id);await write(data);return view(data,project);},
  // System context for a run: skill text is user-authored instructions, bounded to 60k chars.
  async context(ids,project){
   if(!Array.isArray(ids)||!ids.length)return '';
   const picked=view(await read(),project).filter(s=>ids.includes(s.id));if(!picked.length)return '';
   const text=picked.map(s=>`### ${s.name}\n${s.description?s.description+'\n':''}${s.instructions}${s.files.map(f=>`\n\nFile ${f.name}:\n${f.text}`).join('')}`).join('\n\n');
   return '\nSkills attached to this thread by the user. Follow them as instructions:\n'+text.slice(0,60000)+'\n';
  }
 };
}

// Local issues, kept in the same user-data folder as projects.json and keyed by project id. Same atomic write as the project store.
const {readFile,writeFile,mkdir,rename}=require('node:fs/promises');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const STATUS=['backlog','todo','progress','review','done','canceled'],PRIORITY=['none','low','medium','high','urgent'];
const text=(value,max,label,{required=false}={})=>{if(typeof value!=='string'||required&&!value.trim()||value.length>max)throw new Error(`Invalid issue ${label}`);return required?value.trim():value;};
// A pull request is a bare number or a github.com pull URL; anything else is rejected.
function pullRef(input){
 const raw=String(input??'').trim(),url=raw.match(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+)(?:[/?#].*)?$/),bare=raw.match(/^#?(\d{1,7})$/);
 if(url)return {ref:'#'+url[1],url:raw.slice(0,300)};
 if(bare)return {ref:'#'+bare[1]};
 throw new Error('Paste a pull request number or a GitHub pull request link');
}
function clean(patch,create){
 if(!patch||typeof patch!=='object')throw new Error('Invalid issue');
 const out={};
 if(create||patch.title!==undefined)out.title=text(patch.title,200,'title',{required:true});
 if(patch.body!==undefined)out.body=text(patch.body,20000,'description');
 if(patch.status!==undefined){if(!STATUS.includes(patch.status))throw new Error('Invalid issue status');out.status=patch.status;}
 if(patch.priority!==undefined){if(!PRIORITY.includes(patch.priority))throw new Error('Invalid issue priority');out.priority=patch.priority;}
 if(patch.assignee!==undefined){out.assignee=patch.assignee===null?null:text(patch.assignee,40,'assignee',{required:true});}
 if(patch.threads!==undefined){if(!Array.isArray(patch.threads)||patch.threads.length>50)throw new Error('Invalid issue threads');out.threads=patch.threads.map(t=>({id:text(t?.id,120,'thread',{required:true}),title:text(t?.title??'',200,'thread')}));}
 if(patch.prs!==undefined){if(!Array.isArray(patch.prs)||patch.prs.length>20)throw new Error('Invalid issue pull requests');out.prs=patch.prs.map(p=>pullRef(p?.url||p?.ref));}
 return out;
}
exports.STATUS=STATUS;exports.PRIORITY=PRIORITY;exports.pullRef=pullRef;
exports.createIssueStore=directory=>{
 const file=path.join(directory,'issues.json');let tail=Promise.resolve();
 async function records(){try{const values=JSON.parse(await readFile(file,'utf8'));if(!Array.isArray(values))throw new Error('Invalid issue file');return values;}catch(error){if(error.code==='ENOENT')return [];throw error;}}
 function mutate(change){const job=tail.catch(()=>{}).then(async()=>{const values=await records(),result=change(values);await mkdir(directory,{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(values,null,2),{mode:0o600});await rename(temporary,file);return result;});tail=job;return job;}
 const list=async projectId=>(await records()).filter(i=>i.projectId===projectId);
 const create=(projectId,fields)=>mutate(values=>{
  if(typeof projectId!=='string'||!projectId)throw new Error('Invalid project');
  const now=Date.now(),n=values.filter(i=>i.projectId===projectId).reduce((m,i)=>Math.max(m,i.n),0)+1;
  const issue={id:randomUUID(),projectId,n,body:'',status:'todo',priority:'none',assignee:null,threads:[],prs:[],...clean(fields,true),created:now,modified:now};
  values.push(issue);return issue;
 });
 const update=(id,patch)=>mutate(values=>{const issue=values.find(i=>i.id===id);if(!issue)throw new Error('Issue not found');Object.assign(issue,clean(patch,false),{modified:Date.now()});return issue;});
 const remove=id=>mutate(values=>{const at=values.findIndex(i=>i.id===id);if(at<0)throw new Error('Issue not found');values.splice(at,1);return true;});
 return {list,create,update,remove};
};

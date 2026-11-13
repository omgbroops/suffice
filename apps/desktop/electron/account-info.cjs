const {git,run}=require('./git.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');

const gitConfig=(key,cwd)=>(cwd?git(cwd,['config',key],{timeout:5000}):run('git',['config',key],undefined,{timeout:5000})).catch(()=>'');

// Any string in auth.json shaped like a JWT is decoded (no verification: display only). Missing or odd shapes give nulls.
function claims(home){
 return fs.readFile(path.join(home,'auth.json'),'utf8').then(text=>{
  const out={email:null,plan:null};
  const visit=v=>{
   if(typeof v==='string'&&/^[\w-]+\.[\w-]+\.[\w-]*$/.test(v)){
    try{
     const p=JSON.parse(Buffer.from(v.split('.')[1],'base64url').toString('utf8'));
     const auth=p['https://api.openai.com/auth']||{},profile=p['https://api.openai.com/profile']||{};
     out.plan=out.plan||auth.chatgpt_plan_type||null;out.email=out.email||profile.email||p.email||null;
    }catch{}
  }else if(v&&typeof v==='object')Object.values(v).forEach(visit);
  };
  visit(JSON.parse(text));return out;
 }).catch(()=>({email:null,plan:null}));
}

const DAYS=30,MAX_FILE=64*1024*1024;
async function usage(home){
 const since=Date.now()-DAYS*864e5,days=new Map(),models=new Map();
 let dirs=[];try{dirs=await fs.readdir(path.join(home,'sessions'),{withFileTypes:true});}catch{return {days:[],models:[],tokens:0,cost:0};}
 for(const dir of dirs){
  if(!dir.isDirectory())continue;
  const base=path.join(home,'sessions',dir.name);
  for(const name of await fs.readdir(base).catch(()=>[])){
   if(!name.endsWith('.jsonl'))continue;
   let text;try{const file=path.join(base,name);if((await fs.stat(file)).size>MAX_FILE)continue;text=await fs.readFile(file,'utf8');}catch{continue;}
   for(const line of text.split('\n')){
    if(!line.includes('"usage"'))continue;
    let entry;try{entry=JSON.parse(line);}catch{continue;}
    const m=entry.type==='message'?entry.message:null,u=m?.usage;
    if(!u)continue;
    const when=Number.isFinite(m.timestamp)?m.timestamp:Date.parse(entry.timestamp);
    if(!Number.isFinite(when)||when<since)continue;
    const tokens=['input','output','cacheRead','cacheWrite'].reduce((s,k)=>s+(Number.isFinite(u[k])?u[k]:0),0),cost=Number.isFinite(u.cost?.total)?u.cost.total:0;
    if(!tokens&&!cost)continue;
    const d=new Date(when),day=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const add=(map,key)=>{const r=map.get(key)||{tokens:0,cost:0};r.tokens+=tokens;r.cost+=cost;map.set(key,r);};
    add(days,day);add(models,m.model||'unknown');
   }
  }
 }
 const rows=map=>[...map].map(([k,v])=>({key:k,...v}));
 const d=rows(days).map(({key,...r})=>({day:key,...r})).sort((a,b)=>b.day.localeCompare(a.day));
 const mo=rows(models).map(({key,...r})=>({model:key,...r})).sort((a,b)=>b.tokens-a.tokens);
 return {days:d,models:mo,tokens:d.reduce((s,r)=>s+r.tokens,0),cost:d.reduce((s,r)=>s+r.cost,0)};
}

// usage reads every saved session of the last 30 days, so only the Usage page asks for it
async function accountInfo(home,project,withUsage=false){
 const [gitName,gitEmail,auth,use]=await Promise.all([gitConfig('user.name',project),gitConfig('user.email',project),claims(home),withUsage?usage(home):null]);
 return {gitName,gitEmail,email:auth.email,plan:auth.plan,usage:use};
}
module.exports={accountInfo};

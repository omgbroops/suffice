// Automations: saved prompts that run on a schedule against a project, while the app is open.
// Pure helpers (validate, nextRunAt) plus a small store/scheduler; the real run goes through main.cjs runTask.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const HOUR=3600000,KINDS=['hourly','daily','weekdays'],EFFORTS=['off','minimal','low','medium','high','xhigh','max'];

function fail(message){throw new Error(message);}
const str=(value,label,max,min=1)=>{if(typeof value!=='string')fail(`${label} must be text`);const v=value.trim();if(v.length<min||v.length>max)fail(`${label} must be ${min}-${max} characters`);return v;};

// Returns a clean item body (no ids or run state) or throws a user-readable Error.
function validate(input){
  if(!input||typeof input!=='object'||Array.isArray(input))fail('Invalid automation');
  const name=str(input.name,'Name',80),prompt=str(input.prompt,'Prompt',20000),projectPath=str(input.projectPath,'Project',4096);
  if(!path.isAbsolute(projectPath))fail('Project must be an absolute path');
  let stat;try{stat=fs.statSync(projectPath);}catch{fail('Project folder does not exist');}
  if(!stat.isDirectory())fail('Project is not a folder');
  const s=input.schedule;if(!s||typeof s!=='object'||!KINDS.includes(s.kind))fail('Schedule must be hourly, daily or weekdays');
  const schedule={kind:s.kind};
  if(s.kind==='hourly'){const n=s.everyHours===undefined?1:s.everyHours;if(!Number.isInteger(n)||n<1||n>168)fail('Hours must be a whole number from 1 to 168');schedule.everyHours=n;}
  else{if(typeof s.at!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.at))fail('Time must be HH:MM');schedule.at=s.at;}
  const out={name,prompt,projectPath,schedule,effort:'medium'};
  if(input.effort!==undefined&&input.effort!==''){if(!EFFORTS.includes(input.effort))fail('Unknown effort');out.effort=input.effort;}
  const has=v=>v!==undefined&&v!==null&&v!=='';
  if(has(input.model)||has(input.provider)){out.model=str(input.model,'Model',200);out.provider=str(input.provider,'Provider',200);}
  return out;
}

// Next due time (ms) after `base` in local time; weekdays skips Sat/Sun.
function nextRunAt(item,base){
  const s=item.schedule;
  if(s.kind==='hourly')return base+s.everyHours*HOUR;
  const [h,m]=s.at.split(':').map(Number),d=new Date(base);d.setHours(h,m,0,0);
  while(d.getTime()<=base||(s.kind==='weekdays'&&[0,6].includes(d.getDay())))d.setDate(d.getDate()+1),d.setHours(h,m,0,0);
  return d.getTime();
}
const dueAt=item=>item.enabled?nextRunAt(item,Math.max(item.lastRunAt||0,item.anchorAt)):null;

// run(item)->Promise<{threadId}>; busy()->bool. Both injected so tests need no Electron.
function createAutomations({file,now=Date.now,run,busy=()=>false}){
  let items=null,active=false;
  const load=()=>{if(!items){try{items=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(items))items=[];}catch{items=[];}
    // a run that was in flight when the app quit cannot still be running
    for(const i of items)if(i.lastStatus==='running')i.lastStatus='error',i.lastError='Interrupted by app exit';}return items;};
  const persist=()=>{fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify(items,null,1));fs.renameSync(tmp,file);};
  const view=i=>({...i,nextRunAt:dueAt(i)});
  const find=id=>{const i=load().find(x=>x.id===id);if(!i)fail('Automation not found');return i;};
  const list=()=>load().map(view);
  function save(input){
    const body=validate(input);
    if(input.id===undefined||input.id===null){
      const item={id:crypto.randomUUID(),...body,enabled:true,createdAt:now(),anchorAt:now(),lastRunAt:null,lastStatus:null,lastThreadId:null,lastError:null};
      load().push(item);persist();return view(item);
    }
    const item=find(input.id);
    for(const k of ['model','provider'])delete item[k];
    Object.assign(item,body,{anchorAt:now()});persist();return view(item);
  }
  function remove(id){const a=load(),i=a.findIndex(x=>x.id===id);if(i<0)fail('Automation not found');a.splice(i,1);persist();return true;}
  function toggle(id,enabled){const item=find(id);if(typeof enabled!=='boolean')fail('Invalid toggle');item.enabled=enabled;item.anchorAt=now();persist();return view(item);}
  // scheduled=false (Run now) still records the run; a skipped-busy result keeps lastRunAt so the next tick retries.
  async function runItem(item){
    if(active||busy()){item.lastStatus='skipped: busy';persist();return view(item);}
    active=true;item.lastStatus='running';item.lastError=null;persist();
    try{const result=await run(item);item.lastStatus='ok';if(result?.threadId)item.lastThreadId=result.threadId;}
    catch(error){item.lastStatus='error';item.lastError=String(error?.message||error).slice(0,500);}
    finally{active=false;item.lastRunAt=now();persist();}
    return view(item);
  }
  const runNow=id=>runItem(find(id));
  async function tick(){
    if(active)return;
    const t=now(),due=load().find(i=>i.enabled&&dueAt(i)<=t);
    if(due)await runItem(due);
  }
  return {list,save,remove,toggle,runNow,tick};
}
module.exports={validate,nextRunAt,createAutomations};

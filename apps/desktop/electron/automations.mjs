import {mkdir,readFile,writeFile,rename,readdir,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const EFFORTS=['off','minimal','low','medium','high','xhigh','max'];
const KINDS=['hourly','daily','cron','push','file'];
const RANGES=[[0,59],[0,23],[1,31],[1,12],[0,6]];

// Five-field cron: lists, ranges, steps and *. Day-of-week 7 counts as Sunday. Throws on bad input.
export function parseCron(expression){
 const parts=String(expression).trim().split(/\s+/);if(parts.length!==5)throw new Error('Use five cron fields: minute hour day month weekday');
 return parts.map((part,index)=>{const [low,high]=RANGES[index],set=new Set();
  for(const piece of part.split(',')){
   const match=/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(piece);if(!match)throw new Error('Invalid cron field "'+part+'"');
   const step=match[2]===undefined?1:Number(match[2]);if(step<1)throw new Error('Invalid cron step');
   let from=low,to=high;if(match[1]!=='*'){const [a,b]=match[1].split('-').map(Number);from=a;to=b??(match[2]===undefined?a:high);}
   if(from<low||to>(index===4?7:high)||from>to)throw new Error('Cron value out of range in "'+part+'"');
   for(let n=from;n<=to;n+=step)set.add(index===4&&n===7?0:n);
  }
  return {set,any:part==='*'};});
}
export const cronOf=trigger=>trigger.kind==='hourly'?`${trigger.minute} * * * *`:trigger.kind==='daily'?`${Number(trigger.time.slice(3))} ${Number(trigger.time.slice(0,2))} * * *`:trigger.cron;
// First minute strictly after `from` (ms) that matches. Local time, like cron.
export function nextCron(expression,from){
 const [minute,hour,day,month,week]=parseCron(expression),date=new Date(from);date.setSeconds(0,0);date.setMinutes(date.getMinutes()+1);
 for(let i=0;i<527040*2;i++,date.setMinutes(date.getMinutes()+1)){
  if(!month.set.has(date.getMonth()+1)||!hour.set.has(date.getHours())||!minute.set.has(date.getMinutes()))continue;
  // cron rule: when both day fields are restricted, either may match.
  const dom=day.set.has(date.getDate()),dow=week.set.has(date.getDay());
  if(day.any||week.any?dom&&dow:dom||dow)return date.getTime();
 }
 throw new Error('This schedule never runs');
}
export const isSchedule=trigger=>['hourly','daily','cron'].includes(trigger.kind);
export const nextRun=(automation,from)=>automation.enabled&&isSchedule(automation.trigger)?nextCron(cronOf(automation.trigger),from):null;

const clean=(value,max,label,required=true)=>{if(value===undefined||value===null||value===''){if(required)throw new Error(label+' is required');return undefined;}if(typeof value!=='string'||value.length>max)throw new Error('Invalid '+label.toLowerCase());return value;};
function validate(input,projects){
 const name=clean(input?.name?.trim?.(),80,'Name'),prompt=clean(input?.prompt?.trim?.(),20000,'Prompt'),project=clean(input?.project,4000,'Project');
 if(!projects.includes(project))throw new Error('Project not found');
 const t=input.trigger;if(!t||!KINDS.includes(t.kind))throw new Error('Choose when this runs');
 const trigger={kind:t.kind};
 if(t.kind==='hourly'){if(!Number.isInteger(t.minute)||t.minute<0||t.minute>59)throw new Error('Minute must be 0 to 59');trigger.minute=t.minute;}
 if(t.kind==='daily'){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.time))throw new Error('Use a time like 09:00');trigger.time=t.time;}
 if(t.kind==='cron'){trigger.cron=clean(t.cron?.trim?.(),100,'Cron');parseCron(trigger.cron);}
 const effort=input.effort??'medium';if(!EFFORTS.includes(effort))throw new Error('Invalid effort');
 const model=clean(input.model,200,'Model',false),provider=clean(input.provider,200,'Provider',false);if(!!model!==!!provider)throw new Error('Choose a model and its provider together');
 return {name,prompt,project,trigger,effort,...(model?{model,provider}:{})};
}

// Fingerprints for the event triggers. A push is a remote-tracking ref updated by "git push"; fetches log differently.
export async function pushFingerprint(project){
 try{const {stdout}=await exec('git',['-C',project,'rev-parse','--git-common-dir'],{timeout:5000}),logs=resolve(project,stdout.trim(),'logs/refs/remotes'),lines=[];
  const walk=async dir=>{for(const entry of await readdir(dir,{withFileTypes:true}).catch(()=>[])){const file=join(dir,entry.name);if(entry.isDirectory())await walk(file);else{const last=(await readFile(file,'utf8')).trimEnd().split('\n').pop();if(last.includes('update by push'))lines.push(file.slice(logs.length)+' '+last.split('\t')[0]);}}};
  await walk(logs);return lines.sort().join('\n');}catch{return '';}
}
const SKIP=new Set(['.git','node_modules','dist','build','.next','target','.venv']);
// shortcut: polls a bounded walk (20000 entries) instead of fs.watch, so it works the same on every platform; upgrade to a watcher if projects outgrow the cap.
export async function fileFingerprint(project){
 let count=0,newest=0,size=0;
 const walk=async dir=>{for(const entry of await readdir(dir,{withFileTypes:true}).catch(()=>[])){if(count>=20000)return;if(SKIP.has(entry.name))continue;const file=join(dir,entry.name);if(entry.isDirectory())await walk(file);else if(entry.isFile()){const info=await stat(file).catch(()=>null);if(!info)continue;count++;newest=Math.max(newest,info.mtimeMs);size+=info.size;}}};
 await walk(project);return `${count}:${Math.round(newest)}:${size}`;
}

// The scheduler. `run(automation)` starts a thread and resolves {threadId}. `now` is injectable; tick() is the only clock edge.
export function createAutomations({home,now=Date.now,run,projectPaths,probes={push:pushFingerprint,file:fileFingerprint},onChange=()=>{},tickMs=30000,cooldownMs=60000}){
 const file=resolve(home,'automations.json'),inflight=new Map();let items=null,timer=null,tail=Promise.resolve();
 async function load(){if(items)return items;try{const data=JSON.parse(await readFile(file,'utf8'));items=Array.isArray(data)?data:[];for(const item of items)if(item.lastRun?.status==='running')item.lastRun={...item.lastRun,status:'error',error:'Interrupted by a restart'};}catch(error){if(error.code!=='ENOENT')throw error;items=[];}return items;}
 const save=()=>{const job=tail.catch(()=>{}).then(async()=>{await mkdir(home,{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(items,null,2),{mode:0o600});await rename(temporary,file);});tail=job;return job;};
 const find=async id=>{const found=(await load()).find(item=>item.id===id);if(!found)throw new Error('Automation not found');return found;};
 const view=item=>({...item,running:inflight.has(item.id)});
 async function list(){return (await load()).map(view);}
 async function put(input,id){
  const fields=validate(input,await projectPaths());await load();let item=id?await find(id):null;
  if(!item){if(items.length>=100)throw new Error('Delete an automation before adding another');item={id:randomUUID(),enabled:true,createdAt:now(),lastRun:null};items.push(item);}
  Object.assign(item,fields);delete item.fingerprint;item.nextRun=nextRun(item,now());await save();onChange();return view(item);
 }
 async function toggle(id,enabled){const item=await find(id);if(typeof enabled!=='boolean')throw new Error('Invalid state');item.enabled=enabled;delete item.fingerprint;item.nextRun=nextRun(item,now());await save();onChange();return view(item);}
 async function remove(id){await find(id);items=items.filter(item=>item.id!==id);await save();onChange();return true;}
 function fire(item,reason){
  if(inflight.has(item.id))return inflight.get(item.id);
  item.lastRun={at:now(),status:'running',reason};
  const job=(async()=>{await save();onChange();
   try{const result=await run(item);item.lastRun={...item.lastRun,status:'ok',threadId:result?.threadId};}
   catch(error){item.lastRun={...item.lastRun,status:'error',error:String(error?.message||error).slice(0,300)};}
   // Re-baseline so the agent's own edits and pushes do not trigger the next run.
   if(probes[item.trigger.kind])item.fingerprint=await probes[item.trigger.kind](item.project).catch(()=>item.fingerprint);
   item.lastRun.finishedAt=now();await save();onChange();})().finally(()=>inflight.delete(item.id));
  inflight.set(item.id,job);return job;
 }
 async function tick(){
  const at=now();
  for(const item of await load()){
   if(!item.enabled||inflight.has(item.id))continue;
   if(isSchedule(item.trigger)){if(item.nextRun!=null&&item.nextRun<=at){item.nextRun=nextRun(item,at);void fire(item,'schedule');}continue;}
   const current=await probes[item.trigger.kind](item.project).catch(()=>null);if(current===null)continue;
   if(item.fingerprint===undefined){item.fingerprint=current;await save();continue;}
   if(current!==item.fingerprint&&at-(item.lastRun?.at??0)>=cooldownMs){item.fingerprint=current;void fire(item,item.trigger.kind);}
  }
 }
 return {
  list,tick,idle:()=>Promise.all([...inflight.values()]),
  create:input=>put(input),update:(id,input)=>put(input,id),toggle,remove,
  runNow:async id=>{const item=await find(id);void fire(item,'manual');return view(item);},
  start(){if(timer)return;void tick().catch(()=>{});timer=setInterval(()=>void tick().catch(()=>{}),tickMs);timer.unref?.();},
  stop(){clearInterval(timer);timer=null;},
 };
}

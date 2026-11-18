// Task queue: runs prompts as background threads, at most `limit` at a time.
// Pure logic over an injected api, clock and storage so tests drive it with fakes.
const KEY='suffice-task-board';
const MAX_LIMIT=8;
export const columnOf=task=>task.status==='queued'?'queued':task.status==='running'?(task.waiting.length?'needs':'running'):task.status==='failed'?'needs':'done';
export const splitTasks=text=>String(text||'').split('\n').map(line=>line.trim()).filter(Boolean);

export const formatElapsed=ms=>{const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?`${h}h ${String(m).padStart(2,'0')}m`:`${m}:${String(s%60).padStart(2,'0')}`;};
export const formatCost=cost=>cost==null?'—':cost>0&&cost<0.01?'<$0.01':'$'+cost.toFixed(2);
// Accepts owner/repo or a github.com URL; read-only GET of open issues, pull requests dropped.
export async function fetchIssues(ref,fetcher=globalThis.fetch){
 const match=/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\/.*)?$/.exec(String(ref).trim());if(!match)throw new Error('Enter owner/repo');
 const response=await fetcher(`https://api.github.com/repos/${match[1]}/${match[2]}/issues?state=open&per_page=30`,{headers:{Accept:'application/vnd.github+json'}});
 if(!response.ok)throw new Error(`GitHub returned ${response.status}`);
 return (await response.json()).filter(issue=>!issue.pull_request).map(issue=>`Resolve ${match[1]}/${match[2]}#${issue.number}: ${issue.title}`);
}


export function createTaskBoard({api,selection=()=>({effort:'low'}),now=Date.now,setInterval:every=globalThis.setInterval,clearInterval:stop=globalThis.clearInterval,storage=globalThis.localStorage,tickMs=1000}={}){
 let tasks=[],limit=2,seq=0,timer=null,ticks=0;const subs=new Set();
 const save=()=>{try{storage?.setItem(KEY,JSON.stringify({limit,seq,tasks}));}catch{}};
 const emit=()=>{save();for(const fn of subs)fn();};
 try{const saved=JSON.parse(storage?.getItem(KEY)||'null');if(saved){limit=Math.min(MAX_LIMIT,Math.max(1,saved.limit|0||2));seq=saved.seq|0;tasks=(saved.tasks||[]).map(task=>task.status==='running'?{...task,status:'failed',waiting:[],error:'Interrupted when Suffice closed',endedAt:task.endedAt||now()}:{...task,waiting:[]});}}catch{}
 const find=id=>tasks.find(task=>task.id===id);
 const owner=event=>tasks.find(task=>task.status==='running'&&((event.clientId&&task.clientId===event.clientId)||(task.threadId&&(event.threadId===task.threadId||event.id===task.threadId))));
 function end(task,status,error){if(task.status!=='running')return;task.status=status;task.error=error;task.waiting=[];task.endedAt=now();task.activity='';void poll(task);pump();}
 async function poll(task){if(!task.threadId||!api?.usage)return;try{const usage=await api.usage(task.threadId);if(Number.isFinite(usage?.cost)){task.cost=usage.cost;emit();}}catch{}}
 function start(task){
  task.status='running';task.startedAt=now();task.endedAt=null;task.cost=null;task.error=undefined;task.threadId=undefined;task.waiting=[];task.activity='Starting';task.clientId='task:'+(++seq)+':'+task.id;task.cancelling=false;
  const clientId=task.clientId;
  Promise.resolve().then(()=>api.runBackground({prompt:task.text,...selection(),effort:selection().effort||'low',clientId})).then(result=>{if(task.clientId!==clientId)return;if(result?.threadId)task.threadId=result.threadId;end(task,result?.interrupted?'cancelled':'done');emit();},error=>{if(task.clientId!==clientId)return;end(task,'failed',String(error?.message||'').replace(/^Error invoking remote method '[^']*': (Error: )?/,'')||'Task failed');emit();});
 }
 function pump(){while(tasks.filter(task=>task.status==='running').length<limit){const next=tasks.find(task=>task.status==='queued');if(!next)break;start(next);}ensureTimer();}
 function ensureTimer(){const live=tasks.some(task=>task.status==='running');if(live&&!timer)timer=every(tick,tickMs);else if(!live&&timer){stop(timer);timer=null;}}
 function tick(){ticks++;if(ticks%2===0)for(const task of tasks)if(task.status==='running')void poll(task);emit();}
 return {
  tasks:()=>tasks,limit:()=>limit,find,
  subscribe:fn=>{subs.add(fn);return()=>subs.delete(fn);},
  add(texts){const added=texts.map(text=>({id:'t'+(++seq)+'-'+Math.random().toString(36).slice(2,6),text,status:'queued',waiting:[],cost:null,createdAt:now(),attempts:1}));tasks=[...tasks,...added];pump();emit();return added;},
  setLimit(n){limit=Math.min(MAX_LIMIT,Math.max(1,n|0));pump();emit();},
  cancel(id){const task=find(id);if(!task)return;if(task.status==='queued'){task.status='cancelled';task.endedAt=now();}else if(task.status==='running'){const threadId=task.threadId;task.cancelling=true;end(task,'cancelled');if(threadId)void Promise.resolve(api.abort(threadId)).catch(()=>{});else task.abortOnStart=true;}else return;emit();},
  retry(id){const task=find(id);if(!task||!['failed','cancelled'].includes(task.status))return;task.status='queued';task.attempts++;task.error=undefined;task.waiting=[];task.threadId=undefined;pump();emit();},
  clearDone(){tasks=tasks.filter(task=>!['done','cancelled'].includes(task.status));emit();},
  handleEvent(event){
   if(!event)return;const task=owner(event)||(event.event==='thread_started'||event.event==='background_started'?tasks.find(t=>t.abortOnStart&&t.clientId===event.clientId):null);if(!task)return;
   const id=event.threadId||event.id;
   if((event.event==='thread_started'||event.event==='background_started')&&id){task.threadId=id;if(task.abortOnStart){task.abortOnStart=false;void Promise.resolve(api.abort(id)).catch(()=>{});}}
   if(task.status!=='running')return;
   if(event.event==='approval'){if(!task.waiting.includes(event.requestId))task.waiting=[...task.waiting,event.requestId];task.activity='Waiting for approval';}
   else if(event.event==='approval_resolved'){task.waiting=task.waiting.filter(r=>r!==event.requestId);task.activity='Working';}
   else if(event.event==='tool_start'||event.event==='tool')task.activity=`Running ${event.name}`;
   else if(event.event==='assistant_start')task.activity='Working';
   else if(event.event==='run_completed')end(task,event.error?'failed':event.result?.interrupted?'cancelled':'done',event.error||undefined);
   emit();
  },
  elapsed:task=>task.startedAt?Math.max(0,(task.endedAt||now())-task.startedAt):0,
 };
}

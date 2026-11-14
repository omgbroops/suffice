// Fake cloud provider for the Cloud thread panels. No network: one larder fixture per thread, kept in memory.
// Field names follow the rewind-timeline, mcp-tester and go-live specs.
const at=(h,m)=>new Date(2026,10,13,h,m).getTime();
const pad=n=>String(n).padStart(2,'0');
export const clock=ms=>{const d=new Date(ms);return `${pad(d.getHours())}:${pad(d.getMinutes())}`;};
export const chips=entry=>`code ${entry.state.code} · db ${entry.state.db_rows.toLocaleString('en-US')} rows · memory ${entry.state.memory_mb} MB`;
export const previewHtml=`<!doctype html><meta charset="utf-8"><title>larder</title><style>
body{margin:0;font:14px/1.5 system-ui,sans-serif;background:#0c0c0c;color:#d8d8d8}header{display:flex;justify-content:space-between;padding:16px 24px;border-bottom:1px solid #ffffff12;color:#efefef;font-weight:600}
main{padding:24px;max-width:520px}h1{font-size:18px;margin:0 0 16px;color:#efefef}.row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #ffffff12}small{color:#a0a0a0}.bad{color:#ff6b6b}p.bad{margin:12px 0 0;font-size:12px}
button{margin-top:20px;padding:8px 14px;border:0;border-radius:8px;background:#e6e6e6;color:#333;font:inherit}</style>
<header><span>larder</span><span>Cart (2)</span></header><main><h1>Your pantry order</h1>
<div class="row"><span>Oat milk<br><small>1 L, quantity -1</small></span><span class="bad">−$4.00</span></div>
<div class="row"><span>Rye flour<br><small>2 kg, quantity 1</small></span><span>$6.50</span></div>
<div class="row"><strong>Total</strong><strong class="bad">$2.50</strong></div><p class="bad">Total should be $6.50. A quantity below 1 was accepted.</p><button>Check out</button></main>`;
const fixture=()=>({
 app:{name:'larder',stack:'Vite + Supabase import',address:'larder-4f2a.suffice.app',boot_ms:1900,vm_id:'vm_larder_01'},
 timeline:[
  {id:'cp_05',label:'Saved after the tests ran',trigger:'save',created:at(22,43),pinned:false,state:{code:'7d03b8',db_rows:3212,memory_mb:431}},
  {id:'cp_04',label:'Edited cart quantity handling',trigger:'agent_edit',created:at(22,41),pinned:false,state:{code:'7d03b8',db_rows:3212,memory_mb:428}},
  {id:'cp_03',label:'Saved before the edit',trigger:'agent_edit',created:at(22,39),pinned:true,state:{code:'41a9c2',db_rows:3212,memory_mb:412}},
  {id:'cp_02',label:'Supabase data imported',trigger:'save',created:at(22,34),pinned:false,state:{code:'2e8f5a',db_rows:3212,memory_mb:396}},
  {id:'cp_01',label:'First boot',trigger:'deploy',created:at(22,31),pinned:false,state:{code:'2e8f5a',db_rows:0,memory_mb:188}},
 ],
 runs:[
  {id:'run_2',name:'Checkout test',created:at(22,43),passed:false,
   steps:[{index:0,action:'Open the larder home page',ok:true,ms:420},{index:1,action:'Add oat milk to the cart',ok:true,ms:310},{index:2,action:'Open the cart',ok:true,ms:280},{index:3,action:'Set the quantity to −1',ok:false,ms:640},{index:4,action:'Place the order',ok:null,ms:0}],
   failing_step:{index:3,text:'Set the quantity to −1',reason:'The cart total showed −$4.00. A quantity below 1 should be refused.'},
   evidence:{http_status:200,console_errors:[],dom_text:'Total −$4.00'},replay_id:'rp_8c1e',rewind_to:'cp_03'},
  {id:'run_1',name:'Agent tests',created:at(22,36),passed:true,
   steps:['Home page loads','Pantry list shows 3,212 items','Search finds oat milk','Add to cart','Cart keeps its items after a reload','Order summary renders'].map((action,index)=>({index,action,ok:true,ms:240+index*37})),
   failing_step:null,evidence:{http_status:200,console_errors:[],dom_text:'6 of 6 passed'},replay_id:'rp_71aa',rewind_to:null},
 ],
});
// Activity rows between messages: `at` is when it happened, `after` is the index of the message it follows (0 = the user's, 1 = the reply).
const activity=f=>[
 {id:'boot',text:`Booted on a microVM · ${(f.app.boot_ms/1000).toFixed(1)} s`,tab:'preview',at:at(22,31),after:0},
 {id:'tests-ok',text:'Agent tests · 6 of 6 passed',tab:'tests',at:at(22,36),after:0},
 {id:'saved',text:'Saved before the edit · Rewind',tab:'timeline',at:at(22,39),after:1},
 {id:'tests-fail',text:`Checkout test failed at step ${f.runs[0].failing_step.index+1}`,tab:'tests',status:'error',at:at(22,43),after:1},
];
const threads=new Map();
export function cloudProvider(threadId='default'){
 if(!threads.has(threadId))threads.set(threadId,fixture());
 const f=threads.get(threadId);
 return {
  app:()=>f.app,timeline:()=>[...f.timeline].sort((a,b)=>b.created-a.created),runs:()=>f.runs,activity:()=>activity(f),
  // rewind(cid,"inplace"|"fork"): inplace adds a saved state for the move so it can be undone.
  rewind(id,mode='inplace'){
   const entry=f.timeline.find(e=>e.id===id);if(!entry)throw new Error('That saved state no longer exists.');
   if(!['inplace','fork'].includes(mode))throw new Error('Rewind mode must be inplace or fork.');
   const created=Math.max(...f.timeline.map(e=>e.created))+60000;
   f.timeline.push({id:'cp_'+pad(f.timeline.length+1),label:`${mode==='fork'?'Forked from':'Rewound to'} ${clock(entry.created)}`,trigger:'save',created,pinned:false,state:{...entry.state}});
   return {ok:true,mode,restored:entry.id};
  },
  goLive:()=>({name:f.app.name,address:f.app.address,url:`https://${f.app.address}`,vm_id:f.app.vm_id,always_on:true,timeline:f.timeline.map(e=>({id:e.id,created_at:e.created})),domains:[]}),
  agentPrompt(run){
   if(run.passed)return `The ${run.name} passed all ${run.steps.length} steps.`;
   const s=run.failing_step;return `The ${run.name} failed at step ${s.index+1} of ${run.steps.length}: ${s.text}. ${s.reason} The page answered with HTTP ${run.evidence.http_status}. Fix the cart so it refuses a quantity below 1, then run the test again.`;
  },
 };
}

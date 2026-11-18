import {createMenu} from './menu.js';
import {fuzzyRank} from './fuzzy.js';
import {icon} from './ui.js';
import {getThreadDirectory} from './thread-directory.js';
import {threadViewState as viewState} from './thread-view-state.js';
// Slash commands and @-mentions for the standard composer. Keys are taken at capture so the textarea keeps focus.
const REVIEW='Review the uncommitted changes in this project. Flag bugs, risky edits and missing tests, citing file and line.';
const TEST="Run this project's tests, then fix any failures and re-run until they pass.";
const COMMANDS=[
 {name:'model',detail:'Switch model',arg:true},
 {name:'effort',detail:'Set reasoning effort',arg:true},
 {name:'clear',detail:'Start a new session'},
 {name:'fork',detail:'Fork this conversation'},
 {name:'review',detail:'Review uncommitted changes',fill:REVIEW},
 {name:'test',detail:'Run the tests and fix failures',fill:TEST}
];
const label=value=>String(value).charAt(0).toUpperCase()+String(value).slice(1);
export function connectComposerQuick({form,prompt,api,toast}){
 const pop=document.createElement('div');pop.className='popover slash-menu composer-suggest';pop.hidden=true;const menu=createMenu(pop);
 let rows=[],index=0,dismissed=null,files={at:0,pending:null};
 const open=()=>rows.length>0&&pop.dataset.open==='true';
 function close(){if(!rows.length)return;rows=[];menu.close();}
 function mark(next){index=next;[...pop.querySelectorAll('.menu-item')].forEach((button,i)=>{button.toggleAttribute('data-active',i===next);button.setAttribute('aria-selected',String(i===next));if(i===next){button.scrollIntoView({block:'nearest'});prompt.setAttribute('aria-activedescendant',button.id||(button.id='quick-option-'+i));}});}
 function show(list,heading){
  if(!list.length){close();return;}
  if(!pop.isConnected)document.body.append(pop);// attached on first use so the session composer's own .slash-menu stays unique
  rows=list;form.setAttribute('aria-expanded','false');// menu.open() toggles closed when its trigger already reads expanded
  menu.open(form,list.map((row,i)=>({label:row.label,icon:row.icon,action:'quick:'+i,separator:row.separator})),heading);
  pop.setAttribute('role','listbox');pop.querySelectorAll('.menu-item').forEach((button,i)=>{button.setAttribute('role','option');if(rows[i].detail){const detail=document.createElement('span');detail.className='slash-detail';detail.textContent=rows[i].detail;button.append(detail);}});
  const r=form.getBoundingClientRect();pop.style.width=r.width+'px';pop.style.left=r.left+'px';pop.style.setProperty('--menu-max-height',Math.min(320,Math.max(120,r.top-24))+'px');pop.style.top=Math.max(12,r.top-pop.offsetHeight-8)+'px';pop.style.setProperty('--popover-origin','bottom left');
  mark(0);prompt.focus();
 }
 const state=()=>form.modelState?.()||{models:[]};
 function slashRows(value){
  const [,name,rest]=/^\/(\S*)(?:\s+(.*))?$/s.exec(value)||[];
  if(name===undefined||value.includes('\n'))return null;
  const command=COMMANDS.find(c=>c.name===name);
  if(command?.arg&&rest!==undefined){
   const {models,model,effort,locked}=state();
   if(locked)return {heading:'Locked in this session',rows:[]};
   if(command.name==='model')return {heading:'Model',rows:fuzzyRank(models.filter(m=>m.available!==false),rest,m=>m.name+' '+m.id,8).map(m=>({label:m.name,detail:m.provider,icon:'agent',run:()=>chose({provider:m.provider,id:m.id},m.name)}))};
   return {heading:'Effort',rows:(model?.efforts||[]).filter(level=>label(level).toLowerCase().startsWith(rest.trim().toLowerCase())).map(level=>({label:label(level),detail:level===effort?'Current':'',icon:'bolt',run:()=>chose({effort:level},label(level))}))};
  }
  if(rest!==undefined)return null;
  return {heading:'Commands',rows:fuzzyRank(COMMANDS,name,c=>c.name,6).map(c=>({label:'/'+c.name,detail:c.detail,icon:'slash',complete:c.arg?'/'+c.name+' ':null,run:()=>command_(c)}))};
 }
 function chose(selection,name){if(form.chooseModel?.(selection)){toast(`${selection.effort?'Effort':'Model'}: ${name}`);setPrompt('');}else toast('Model is locked in this session');}
 function setPrompt(text){prompt.value=text;prompt.dispatchEvent(new Event('input',{bubbles:true}));prompt.focus();prompt.setSelectionRange(text.length,text.length);}
 function command_(c){
  if(c.fill){setPrompt(c.fill);return;}
  setPrompt('');
  if(c.name==='clear')document.querySelector('.new-session').click();
  else if(c.name==='fork'){if(viewState.id)document.dispatchEvent(new CustomEvent('suffice-fork-thread',{detail:{id:viewState.id}}));else toast('Open a thread to fork it');}
 }
 // The pending promise is cached so keystrokes during the first fetch share it instead of seeing an empty list.
 function fileList(){
  if(!files.pending||Date.now()-files.at>=8000){files.at=Date.now();files.pending=Promise.resolve().then(()=>api.fileIndex()).catch(()=>[]);}
  return files.pending;
 }
 async function mentionRows(query,token){
  const list=await fileList();if(prompt.value!==token.value)return null;
  const found=fuzzyRank(list,query,p=>p,6).map(path=>({label:path.slice(path.lastIndexOf('/')+1),detail:path.includes('/')?path.slice(0,path.lastIndexOf('/')):'',icon:'file',insert:'@'+path}));
  const threads=fuzzyRank(getThreadDirectory().threads.filter(t=>t.id!==viewState.id),query,t=>t.title,3).map((t,i)=>({label:t.title,detail:t.project||'Thread',icon:'message',separator:i===0&&found.length>0,insert:`@"${t.title.replace(/"/g,"'")}"`}));
  return {heading:'Files and threads',rows:[...found,...threads]};
 }
 async function update(){
  if(form.dataset.session!==undefined){close();return;}// live CLI sessions have their own slash menu (sessions-controls)
  const value=prompt.value;
  if(dismissed===value){return;}dismissed=null;
  const slash=slashRows(value);
  if(slash){show(slash.rows,slash.heading);return;}
  const before=value.slice(0,prompt.selectionStart),hit=/(^|\s)@([^\s@]*)$/.exec(before);
  if(hit&&api.fileIndex){const token={value},result=await mentionRows(hit[2],token);if(result&&prompt.value===value){token.start=before.length-hit[2].length-1;mentionStart=token.start;show(result.rows,result.heading);return;}if(result===null)return;}
  close();
 }
 let mentionStart=0;
 function accept(row){
  if(!row)return;
  if(row.insert){const end=prompt.selectionStart;setPrompt(prompt.value.slice(0,mentionStart)+row.insert+' '+prompt.value.slice(end));return;}
  if(row.complete){setPrompt(row.complete);return;}
  row.run();
 }
 form.addEventListener('keydown',event=>{
  if(event.target!==prompt)return;
  if((event.metaKey||event.ctrlKey)&&event.key==='ArrowUp'&&!open()){const last=[...document.querySelectorAll('.thread-user')].at(-1);if(last&&viewState.id&&form.dataset.running!=='true'){event.preventDefault();document.dispatchEvent(new CustomEvent('suffice-edit-last',{detail:{text:last.textContent}}));}return;}
  if(!open())return;
  const stop=()=>{event.preventDefault();event.stopImmediatePropagation();};
  if(event.key==='Escape'){stop();dismissed=prompt.value;close();}
  else if(event.key==='ArrowDown'||event.key==='ArrowUp'){stop();mark((index+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length);}
  else if((event.key==='Enter'||event.key==='Tab')&&!event.shiftKey&&!event.isComposing){stop();const row=rows[index];close();accept(row);}
 },true);
 pop.addEventListener('click',event=>{const row=event.target.closest('[data-menu-action]');if(!row)return;const picked=rows[Number(row.dataset.menuAction.split(':')[1])];close();accept(picked);});
 pop.addEventListener('pointermove',event=>{const row=event.target.closest('[data-menu-action]');if(row)mark(Number(row.dataset.menuAction.split(':')[1]));});
 pop.addEventListener('pointerdown',event=>event.preventDefault());
 prompt.addEventListener('input',()=>void update());prompt.addEventListener('click',()=>void update());
 prompt.addEventListener('blur',()=>setTimeout(()=>{if(document.activeElement!==prompt)close();},120));
 viewState.subscribe(event=>{if(event.type==='select')files.at=0;});
 return {close};
}

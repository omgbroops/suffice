import './compare.css';
import {icon} from './ui.js';

// Best-of-N compare: one prompt, 2-3 models in isolated worktrees, pick one to keep.
export const compareMenuItems=()=>window.sufficeDesktop?.compareRun?[{label:'Compare models',detail:'Run this prompt on 2-3 models side by side',action:'compare:open',separator:true}]:[];

const h=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const effortFor=model=>model.efforts?.includes('medium')?'medium':model.efforts?.[0]||'off';
const money=item=>item.usd==null?'Cost unknown':`${item.costUnknown?'At least ':''}$${item.usd.toFixed(4)}`;
const seconds=ms=>ms<10000?`${(ms/1000).toFixed(1)}s`:`${Math.round(ms/1000)}s`;
const TESTS={pass:'Tests pass',fail:'Tests fail',none:'No tests'};

export function openCompare({api,prompt,toast}){
  const dialog=h('dialog','compare-dialog');dialog.setAttribute('aria-labelledby','compare-title');
  const body=h('div','compare-body'),title=h('h2','compare-title','Compare models');title.id='compare-title';
  const close=h('button','button compare-close');close.type='button';close.setAttribute('aria-label','Close');close.innerHTML=icon('close');
  const head=h('div','compare-head');head.append(title,close);dialog.append(head,body);document.body.append(dialog);
  let sessionId=null,token=0;
  const finish=()=>{token++;if(sessionId){void api.compareDiscard(sessionId).catch(()=>{});sessionId=null;}dialog.close();};
  close.onclick=finish;
  dialog.addEventListener('close',()=>{token++;if(sessionId){void api.compareDiscard(sessionId).catch(()=>{});sessionId=null;}dialog.remove();});
  dialog.addEventListener('click',event=>{if(event.target===dialog)finish();});
  dialog.showModal();
  void setup();

  async function setup(){
    body.replaceChildren(h('p','compare-note','Loading models'));
    let models;try{models=await api.compareModels();}catch(error){body.replaceChildren(h('p','compare-note',error.message));return;}
    const field=h('textarea','compare-prompt');field.rows=4;field.value=prompt.value;field.placeholder='What should each model do?';field.setAttribute('aria-label','Prompt');
    const list=h('div','compare-models');list.setAttribute('role','group');list.setAttribute('aria-label','Models');
    const run=h('button','button button--primary compare-run','Compare');run.type='button';
    const picked=new Set(models.slice(0,2).map(model=>model.id+'|'+model.provider));
    const sync=()=>{run.disabled=!field.value.trim()||picked.size<2||picked.size>3;for(const row of list.children){const on=picked.has(row.dataset.key);row.setAttribute('aria-checked',String(on));row.disabled=!on&&picked.size>=3;}};
    for(const model of models){const row=h('button','compare-model');row.type='button';row.setAttribute('role','checkbox');row.dataset.key=model.id+'|'+model.provider;row.append(h('span','compare-model-name',model.name||model.id),h('span','compare-model-provider',model.provider));row.onclick=()=>{if(picked.has(row.dataset.key))picked.delete(row.dataset.key);else picked.add(row.dataset.key);sync();};list.append(row);}
    if(!models.length)list.append(h('p','compare-note','Connect a provider in Settings to compare models.'));
    field.addEventListener('input',sync);
    const foot=h('div','compare-foot');foot.append(h('span','compare-hint','Each model works in its own copy of the project. Pick two or three.'),run);
    body.replaceChildren(field,list,foot);sync();field.focus();
    run.onclick=()=>start(field.value,models.filter(model=>picked.has(model.id+'|'+model.provider)));
  }

  async function start(text,chosen){
    const mine=++token;
    body.replaceChildren(columns(chosen.map(model=>({label:model.name||model.id,working:true}))));
    title.textContent='Comparing';
    let outcome;try{outcome=await api.compareRun({prompt:text,candidates:chosen.map(model=>({model:model.id,provider:model.provider,label:model.name||model.id,effort:effortFor(model)}))});}
    catch(error){if(mine===token)await setup(),toast(error.message);return;}
    if(mine!==token){void api.compareDiscard(outcome.id).catch(()=>{});return;}
    sessionId=outcome.id;title.textContent='Pick one to keep';
    const grid=columns(outcome.results.map((item,index)=>({...item,keep:()=>keep(item,index)})));
    const discard=h('button','button button--subtle','Discard all');discard.type='button';discard.onclick=finish;
    const foot=h('div','compare-foot');foot.append(h('span','compare-hint','The others are removed. Nothing is committed.'),discard);
    body.replaceChildren(grid,foot);grid.querySelector('.compare-keep:not([disabled])')?.focus();
  }

  async function keep(item,index){
    const id=sessionId;sessionId=null;
    try{const result=await api.compareKeep({id,index});dialog.close();toast(result.applied?`Kept ${item.label}. Its changes are in your project.`:`Kept ${item.label}. It made no file changes.`);}
    catch(error){sessionId=id;toast(error.message);}
  }

  function columns(items){
    const grid=h('div','compare-grid');grid.dataset.count=String(items.length);
    for(const item of items){
      const card=h('section','compare-card');card.setAttribute('aria-label',item.label);
      card.append(h('h3','compare-card-title',item.label));
      if(item.working){card.dataset.state='working';card.append(h('p','compare-working','Working'),h('div','compare-answer compare-skeleton'));grid.append(card);continue;}
      card.dataset.state=item.status;
      const stats=h('div','compare-stats');
      if(item.status==='failed')stats.append(h('span','compare-badge compare-badge--fail','Failed'));
      else{stats.append(h('span','compare-diff',''),h('span',`compare-badge compare-badge--${item.tests}`,TESTS[item.tests]));const diff=stats.firstChild;diff.append(h('span','compare-add','+'+item.added),h('span','compare-del','−'+item.removed),h('span','compare-files',`${item.files} ${item.files===1?'file':'files'}`));}
      const meta=h('div','compare-meta');meta.append(h('span','',money(item)),h('span','',seconds(item.ms)));
      const answer=h('div','compare-answer',item.status==='failed'?item.error:item.text||'No reply text.');answer.tabIndex=0;answer.setAttribute('aria-label',`${item.label} reply`);
      const pick=h('button','button button--primary compare-keep','Keep this');pick.type='button';pick.disabled=item.status==='failed';pick.onclick=item.keep;
      if(item.tests==='fail'&&item.testOutput){card.title=item.testOutput;}
      card.append(stats,meta,answer,pick);grid.append(card);
    }
    return grid;
  }
}

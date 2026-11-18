import {icon} from './ui.js';
import './thread-worktree.css';

const ACTIONS=[['diff','Open diff'],['merge','Merge into current branch'],['pr','Create PR'],['discard','Discard']];

// Branch strip under a thread header for threads that run in their own worktree.
export function connectThreadWorktree({api,workspace,toast}){
 const bar=document.createElement('div');bar.className='worktree-bar';bar.hidden=true;bar.setAttribute('role','group');bar.setAttribute('aria-label','Thread worktree');
 const branch=document.createElement('span');branch.className='worktree-branch';
 const note=document.createElement('span');note.className='worktree-note';note.setAttribute('role','status');
 const buttons=document.createElement('span');buttons.className='worktree-actions';
 bar.append(branch,note,buttons);workspace.prepend(bar);
 const dialog=document.createElement('div');dialog.className='popover worktree-diff';dialog.hidden=true;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','Worktree diff');
 const dialogTitle=document.createElement('div');dialogTitle.className='worktree-diff-title';const patch=document.createElement('pre');
 const close=document.createElement('button');close.type='button';close.className='button';close.textContent='Close';close.addEventListener('click',()=>{dialog.hidden=true;});
 dialog.append(dialogTitle,patch,close);workspace.append(dialog);
 dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();dialog.hidden=true;}});
 let id=null,armed=false,token=0,busy=false;
 const buttonFor={};
 for(const [action,label] of ACTIONS){const b=document.createElement('button');b.type='button';b.className='button worktree-action';b.dataset.action=action;b.textContent=label;b.addEventListener('click',()=>act(action));buttons.append(b);buttonFor[action]=b;}
 function say(text){note.textContent=text;}
 function setBusy(value){busy=value;for(const b of Object.values(buttonFor))b.disabled=value;}
 function paint(state){
  workspace.classList.toggle('has-worktree',!!state);bar.hidden=!state;if(!state){dialog.hidden=true;return;}
  branch.innerHTML=icon('worktree');const name=document.createElement('span');name.textContent=state.branch;branch.append(name);branch.title=state.path;
  buttonFor.merge.textContent='Merge into '+(state.target||'current branch');buttonFor.merge.disabled=!state.target;
  say(`${state.commits} commit${state.commits===1?'':'s'}, ${state.files} uncommitted`);
 }
 async function refresh(next=id){
  id=next;armed=false;buttonFor.discard.textContent='Discard';const mine=++token;
  if(!id||id.startsWith('pending:')){paint(null);return;}
  try{const state=await api.threadWorktree(id);if(mine===token)paint(state);}catch{if(mine===token)paint(null);}
 }
 async function act(action){
  if(busy||!id)return;
  if(action==='discard'&&!armed){armed=true;buttonFor.discard.textContent='Confirm discard';say('Removes the worktree');return;}
  armed=false;buttonFor.discard.textContent='Discard';setBusy(true);const mine=token;
  try{
   const result=await api.threadWorktreeAction({id,action});
   if(action==='diff'){dialogTitle.textContent=result.stat||'No changes';patch.textContent=result.patch+(result.truncated?'\n… truncated':'');dialog.hidden=false;}
   else if(action==='discard'){toast('Worktree discarded');paint(null);return;}
   else if(action==='pr')toast(result.dryRun?'PR dry run: '+result.commands.join(' ; '):'PR created '+result.url);
   else toast('Merged into '+result.target);
  }catch(error){toast(error.message);}
  finally{setBusy(false);if(mine===token)await refresh();}
 }
 document.addEventListener('suffice-thread-active',e=>{void refresh(e.detail?.id||null);});
 return {refresh};
}

import {parseHunks,locate,anchorLine} from '../shared/diff-hunks.mjs';
import {rejectHunk} from './hunk-apply.mjs';
import {renderPrompt,parseOutcomes} from './review-prompt.mjs';
// Batched inline review: comments, hunk reject and the one-turn send. Everything the process owns is injected
// (cwdFor, diffFor, checkpoint, run) so the tests drive it with fakes.
export function createReviewIpc({store,cwdFor,diffFor,isRunning,checkpoint,run}){
 const diffs=async(cwd,files)=>{const map=new Map();for(const file of files)try{map.set(file,await diffFor(cwd,file));}catch{map.set(file,null);}return map;};
 const sending=new Set();
 return {
  state:id=>store.state(id),
  add:async(id,input)=>{await store.add(id,input);return store.state(id);},
  remove:async(id,commentId)=>{await store.remove(id,commentId);return store.state(id);},
  accept:async(id,hunkId,on)=>{await store.accept(id,hunkId,on);return store.state(id);},
  reopen:async(id,commentId)=>{await store.reopen(id,commentId);return store.state(id);},
  async reject(id,{file,hunkId}){
   if(isRunning(id)||sending.has(id))throw new Error('Stop this thread before rejecting changes');
   sending.add(id);// claimed synchronously so a Send cannot start during reject's awaits
   try{
   const cwd=cwdFor(id),result=await diffFor(cwd,file);
   if(result.untracked||!result.text)throw new Error('A new file cannot be rejected by hunk');
   // The checkpoint goes first so Rewind undoes the reject.
   await checkpoint(cwd,id,`Before rejecting a change in ${file}`);
   await rejectHunk(cwd,result.text,hunkId);await store.dropHunk(id,file,hunkId);
   }finally{sending.delete(id);}
   return store.state(id);
  },
  // Reviewer findings become the same cards; findings without a diff row stay as plain notes in the UI.
  async importFindings(id,findings){
   const cwd=cwdFor(id),map=await diffs(cwd,[...new Set(findings.map(f=>f.path))]),{comments}=await store.state(id);
   for(const f of findings){
    const text=map.get(f.path)?.text,at=text&&anchorLine(parseHunks(text).hunks,f.line);if(!at)continue;
    if(comments.some(c=>c.file===f.path&&c.origin==='reviewer'&&c.text===f.message))continue;
    await store.add(id,{file:f.path,...at,line:f.line,text:f.message,origin:'reviewer',severity:f.severity,fix:f.fix});
   }
   return store.state(id);
  },
  async send(id,{model,provider,effort}){
   // markSent claims the open cards atomically, so a second quick click finds none and cannot start another turn.
   if(sending.has(id))throw new Error('This thread is busy; wait for the current change to finish');
   sending.add(id);
   try{
   const open=await store.markSent(id);if(!open.length)throw new Error('No comments to send');
   try{
   const cwd=cwdFor(id),map=await diffs(cwd,[...new Set(open.map(c=>c.file))]);
   const items=open.map(c=>{const text=map.get(c.file)?.text,at=text&&locate(parseHunks(text).hunks,c.hunkId,c.rel);return {id:c.id,file:c.file,line:at?.line??c.line,excerpt:at?.excerpt||'',text:c.text+(c.fix?`\nSuggested fix: ${c.fix}`:'')};});
    const reply=await run({prompt:renderPrompt(items),effort,model,provider,threadId:id});
    await store.settle(id,parseOutcomes(reply?.text,items.map(i=>i.id)),'The agent gave no outcome for this comment');
   }catch(error){await store.fail(id,error.message);}
    }finally{sending.delete(id);}
   return store.state(id);
  },
 };
}

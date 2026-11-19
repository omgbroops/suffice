import {parseHunks,locate,anchorLine} from '../shared/diff-hunks.mjs';
import {rejectHunk} from './hunk-apply.mjs';
import {renderPrompt,parseOutcomes} from './review-prompt.mjs';
// Batched inline review: comments, hunk reject and the one-turn send. Everything the process owns is injected
// (cwdFor, diffFor, checkpoint, run) so the tests drive it with fakes.
export function createReviewIpc({store,cwdFor,diffFor,isRunning,checkpoint,run}){
 const diffs=async(cwd,files)=>{const map=new Map();for(const file of files)try{map.set(file,await diffFor(cwd,file));}catch{map.set(file,null);}return map;};
 return {
  state:id=>store.state(id),
  add:async(id,input)=>{await store.add(id,input);return store.state(id);},
  remove:async(id,commentId)=>{await store.remove(id,commentId);return store.state(id);},
  accept:async(id,hunkId,on)=>{await store.accept(id,hunkId,on);return store.state(id);},
  reopen:async(id,commentId)=>{await store.reopen(id,commentId);return store.state(id);},
  async reject(id,{file,hunkId}){
   if(isRunning(id))throw new Error('Stop this thread before rejecting changes');
   const cwd=cwdFor(id),result=await diffFor(cwd,file);
   if(result.untracked||!result.text)throw new Error('A new file cannot be rejected by hunk');
   // The checkpoint goes first so Rewind undoes the reject.
   await checkpoint(cwd,id,`Before rejecting a change in ${file}`);
   await rejectHunk(cwd,result.text,hunkId);await store.dropHunk(id,file,hunkId);return store.state(id);
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
   const {comments}=await store.state(id),open=comments.filter(c=>c.state==='open');if(!open.length)throw new Error('No comments to send');
   const cwd=cwdFor(id),map=await diffs(cwd,[...new Set(open.map(c=>c.file))]);
   const items=open.map(c=>{const text=map.get(c.file)?.text,at=text&&locate(parseHunks(text).hunks,c.hunkId,c.rel);return {id:c.id,file:c.file,line:at?.line??c.line,excerpt:at?.excerpt||'',text:c.text+(c.fix?`\nSuggested fix: ${c.fix}`:'')};});
   await store.markSent(id);
   try{
    const reply=await run({prompt:renderPrompt(items),effort,model,provider,threadId:id});
    await store.settle(id,parseOutcomes(reply?.text,items.map(i=>i.id)),'The agent gave no outcome for this comment');
   }catch(error){await store.fail(id,error.message);}
   return store.state(id);
  },
 };
}

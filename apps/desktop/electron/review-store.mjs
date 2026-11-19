import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
// Review comments per thread: {id,file,hunkId,rel,line,text,state,origin}. state: open|sent|fixed|skipped|noop.
// hunkId is a content hash of the hunk, rel the row offset inside it (see shared/diff-hunks.mjs), so the
// comment follows its hunk when the file is reflowed; line is only the number at the time it was written.
export const STATES=['open','sent','fixed','skipped','noop'];
const idOk=id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
export function createReviewStore(home){
 const dir=resolve(home,'review');let chain=Promise.resolve();
 const file=id=>{if(!idOk(id))throw new Error('Invalid thread');return resolve(dir,id+'.json');};
 async function load(id){try{const data=JSON.parse(await readFile(file(id),'utf8'));return {comments:Array.isArray(data.comments)?data.comments:[],accepted:Array.isArray(data.accepted)?data.accepted:[]};}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return {comments:[],accepted:[]};throw error;}}
 async function save(id,data){await mkdir(dir,{recursive:true});const target=file(id),temp=target+'.'+process.pid+'.tmp';await writeFile(temp,JSON.stringify(data));await rename(temp,target);}
 // Writes are serialised so two quick clicks cannot overwrite each other.
 const change=(id,fn)=>{const next=chain.then(async()=>{const data=await load(id),result=await fn(data);await save(id,data);return result;});chain=next.catch(()=>{});return next;};
 const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
 return {
  state:id=>chain.then(()=>load(id)),
  add:(id,input)=>change(id,data=>{
   const body=text(input?.text,Infinity);if(!body)throw new Error('Write a comment first');
   if(body.length>2000)throw new Error('Comment is over 2000 characters');
   if(typeof input.file!=='string'||!input.file||typeof input.hunkId!=='string'||!Number.isInteger(input.rel)||input.rel<0)throw new Error('Invalid comment position');
   const comment={id:randomUUID().slice(0,8),file:input.file,hunkId:input.hunkId,rel:input.rel,line:Number.isInteger(input.line)?input.line:null,text:body,state:'open',origin:input.origin==='reviewer'?'reviewer':'you'};
   if(comment.origin==='reviewer'){comment.severity=['high','medium','low'].includes(input.severity)?input.severity:'medium';comment.fix=text(input.fix,600);}
   data.comments.push(comment);return comment;}),
  remove:(id,commentId)=>change(id,data=>{data.comments=data.comments.filter(c=>c.id!==commentId);}),
  accept:(id,hunkId,on=true)=>change(id,data=>{data.accepted=data.accepted.filter(h=>h!==hunkId);if(on)data.accepted.push(hunkId);}),
  reopen:(id,commentId)=>change(id,data=>{const c=data.comments.find(item=>item.id===commentId&&item.state==='sent');if(c){c.state='open';delete c.error;}}),
  // A rejected hunk no longer exists: its unsent comments and accepted mark go with it.
  dropHunk:(id,path,hunkId)=>change(id,data=>{data.comments=data.comments.filter(c=>!(c.file===path&&c.hunkId===hunkId&&c.state==='open'));data.accepted=data.accepted.filter(h=>h!==hunkId);}),
  markSent:id=>change(id,data=>{const moved=data.comments.filter(c=>c.state==='open');for(const c of moved){c.state='sent';delete c.error;}return moved.map(c=>({...c}));}),
  // Outcomes land only on sent cards. A sent card without an outcome stays sent with an error, never 'fixed'.
  settle:(id,outcomes,message)=>change(id,data=>{
   const byId=new Map(outcomes.map(o=>[o.id,o.outcome]));
   for(const c of data.comments){if(c.state!=='sent')continue;const outcome=byId.get(c.id);if(['fixed','skipped','noop'].includes(outcome)){c.state=outcome;delete c.error;}else c.error=message;}}),
  fail:(id,message)=>change(id,data=>{for(const c of data.comments)if(c.state==='sent')c.error=message;}),
 };
}

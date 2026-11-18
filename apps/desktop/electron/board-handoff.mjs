// Thread handoff + project memory notes, backed by packages/backend/src/board (no model: deterministic summary).
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {createHandoff,createMemory,compact} from '../../../packages/backend/src/board/index.mjs';
import {normalize} from './thread-export.mjs';

const clock={now:()=>Date.now()};
const first=s=>String(s).split('\n').find(l=>l.trim())?.trim().slice(0,160)||'';
const clip=(s,n)=>s.length>n?s.slice(0,n-1)+'…':s;

export function createBoardHandoff({root}){
 const memory=project=>createMemory({dir:join(root,'memory',createHash('sha256').update(project).digest('hex').slice(0,16)),clock});
 const handoffs=createHandoff({dir:join(root,'handoffs'),clock});
 return {
  notes:project=>memory(project).list(),
  async saveNote(project,note){const m=memory(project),saved=await m.save(note);await m.index();return saved;},
  async removeNote(project,name){const m=memory(project),ok=await m.remove(name);await m.index();return ok;},
  // Writes the handoff record and returns the text that seeds the new thread.
  async handoff(thread,project){
   const turns=normalize(thread.messages),edited=[...new Set(turns.flatMap(t=>t.tools.filter(x=>x.diff).map(x=>x.input?.path||x.input?.file_path||x.input?.file||'file')))];
   const last=turns.at(-1),lastUser=[...turns].reverse().find(t=>t.role==='user'),lastAssistant=[...turns].reverse().find(t=>t.role==='assistant'&&t.text);
   const failed=[...new Set(turns.flatMap(t=>t.tools.filter(x=>x.isError).map(x=>x.name)))];
   const done=edited.length?[...edited.slice(0,8).map(f=>'Edited '+f),...(edited.length>8?['+'+(edited.length-8)+' more edited (listed in the handoff record)']:[])]:lastAssistant?[first(lastAssistant.text)]:[];
   const open=[...(last?.role==='user'?['Unanswered: '+first(last.text)]:[]),...failed.map(n=>'Failed tool: '+n)];
   if(!done.length&&!open.length)throw new Error('This thread has nothing to hand off yet');
   const next=open[0]?'Resolve: '+open[0].replace(/^[^:]+: /,''):lastUser?'Continue from: '+first(lastUser.text):'Continue';
   const runId='h'+Date.now().toString(36)+createHash('sha256').update(String(thread.title)+Math.random()).digest('hex').slice(0,6);
   await handoffs.writeHandoff({runId,done,open,next,pointers:edited});
   const recent=compact(turns.map(t=>({role:t.role,content:(t.role==='user'?'You: ':'Assistant: ')+clip(t.text||'(tool use)',400)})),{maxChars:3000,keep:4}).map(m=>m.content).join('\n');
   const notes=await memory(project).recall([thread.title,turns.find(t=>t.role==='user')?.text,lastUser?.text].filter(Boolean).join(' ')||'project',{limit:3}).catch(()=>[]);
   const list=(t,a)=>a.length?`${t}\n${a.map(x=>'- '+x).join('\n')}\n\n`:'';
   const text=`Handoff from "${thread.title||'Untitled thread'}"\n\n${list('Done',done)}${list('Open',open)}Next\n${next}\n\n${list('Project notes',notes.map(n=>`${n.name}: ${n.description}`))}Recent conversation\n${recent}\n`;
   return {runId,text};
  },
 };
}

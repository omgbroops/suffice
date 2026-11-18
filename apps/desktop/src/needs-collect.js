export const GROUPS=[['wait','Waiting on you'],['failed','Failed'],['done','Finished, not seen yet']];
// Pure: what needs the user, from thread and session records. A dismissal is tied to the record's modified time, so a new failure resurfaces.
export function collectNeeds({threads,sessions,dismissed={}}){
 const out=[];
 const add=(record,kind)=>{
  if(record.archived)return;
  const status=record.status;
  const group=status==='approval'||status==='input'?'wait':status==='failed'&&dismissed[record.id]!==record.modified?'failed':kind==='thread'&&status==='done'&&record.unread?'done':null;
  if(group)out.push({group,kind,record});
 };
 for(const thread of threads)add(thread,'thread');
 for(const session of sessions)add(session,'session');
 return out.sort((a,b)=>GROUPS.findIndex(g=>g[0]===a.group)-GROUPS.findIndex(g=>g[0]===b.group)||b.record.modified-a.record.modified);
}


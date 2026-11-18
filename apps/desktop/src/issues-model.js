// Pure issue helpers shared by the page and its tests.
export const STATUSES=[['backlog','Backlog'],['todo','Todo'],['progress','In progress'],['review','In review'],['done','Done'],['canceled','Canceled']];
export const PRIORITIES=[['none','No priority'],['low','Low'],['medium','Medium'],['high','High'],['urgent','Urgent']];
export const label=(table,value)=>table.find(([v])=>v===value)?.[1]||value;
export const isOpen=issue=>issue.status!=='done'&&issue.status!=='canceled';
export const code=issue=>'ISS-'+issue.n;
// "Open" hides finished work; "All" shows every group. Newest edit first inside a group; empty groups are dropped.
export function groupIssues(issues,tab='open'){
 return STATUSES.map(([status,name])=>({status,name,items:issues.filter(i=>i.status===status&&(tab==='all'||isOpen(i))).sort((a,b)=>b.modified-a.modified)})).filter(g=>g.items.length);
}
export function ago(ms,now=Date.now()){const s=Math.max(0,Math.floor((now-ms)/1000));return s<60?'now':s<3600?Math.floor(s/60)+'m':s<86400?Math.floor(s/3600)+'h':Math.floor(s/86400)+'d';}
// Prompt a thread starts from: the title, then the description.
export const threadPrompt=issue=>`${issue.title}${issue.body?.trim()?'\n\n'+issue.body.trim():''}`;

// Hunks of one file's unified diff, keyed by a hash of their body (not the @@ numbers), so a comment
// stays on its hunk when lines above it are added or removed. Shared by the renderer and the main process.
const HEAD=/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
// 53-bit string hash (cyrb53): sync, no node:crypto, so the renderer can use it too.
function hash(text){let a=0xdeadbeef,b=0x41c6ce57;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,2654435761);b=Math.imul(b^c,1597334677);}
 a=Math.imul(a^(a>>>16),2246822507)^Math.imul(b^(b>>>13),3266489909);b=Math.imul(b^(b>>>16),2246822507)^Math.imul(a^(a>>>13),3266489909);return (4294967296*(2097151&b)+(a>>>0)).toString(16);}
export function parseHunks(text){
 const header=[],hunks=[],seen=new Map();let current=null;
 for(const line of String(text||'').replace(/\n$/,'').split('\n')){
  const match=HEAD.exec(line);
  if(match){current={head:line,oldStart:+match[1],newStart:+match[2],lines:[]};hunks.push(current);continue;}
  if(current)current.lines.push(line);else header.push(line);
 }
 for(const hunk of hunks){const base=hash(hunk.lines.join('\n')),n=(seen.get(base)||0)+1;seen.set(base,n);hunk.id=n>1?`${base}-${n}`:base;}
 return {header,hunks};
}
// Same rows the renderer paints: lines that are not +, - or context (no-newline markers) are skipped.
export function hunkRows(hunk){
 let old=hunk.oldStart,now=hunk.newStart;const rows=[];
 for(const line of hunk.lines){
  const mark=line[0];
  if(mark==='+')rows.push({kind:'addition',text:line.slice(1),old:null,new:now++});
  else if(mark==='-')rows.push({kind:'deletion',text:line.slice(1),old:old++,new:null});
  else if(mark===' ')rows.push({kind:'context',text:line.slice(1),old:old++,new:now++});
 }
 return rows;
}
// Current position of a stored comment: its hunk by id, then the row by offset.
export function locate(hunks,hunkId,rel){
 const hunk=hunks.find(item=>item.id===hunkId);if(!hunk)return null;
 const rows=hunkRows(hunk),row=rows[rel];if(!row)return null;
 const from=Math.max(0,rel-3),excerpt=rows.slice(from,rel+4).map(item=>({addition:'+',deletion:'-',context:' '}[item.kind])+item.text).join('\n');
 return {hunk,line:row.new??row.old,excerpt};
}
// Reviewer findings carry a new-file line; find the hunk row for it.
export function anchorLine(hunks,line){
 for(const hunk of hunks){const rel=hunkRows(hunk).findIndex(row=>row.new===line);if(rel>=0)return {hunkId:hunk.id,rel};}
 return null;
}
// Renderer rows (with 'hunk' rows) get hunkId and rel so the UI can place gutter buttons and cards.
export function tagRows(rows,text){
 const {hunks}=parseHunks(text);let index=-1,rel=0;
 for(const row of rows){if(row.kind==='hunk'){index++;rel=0;row.hunkId=hunks[index]?.id;continue;}row.hunkId=hunks[index]?.id;row.rel=rel++;}
 return rows;
}

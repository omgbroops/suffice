import {icon} from './ui.js';
import {fileIcon} from './file-icons.js';

export function textElement(tag,className,text){const el=document.createElement(tag);el.className=className;el.textContent=text;return el;}
function fillFolderRow(row,name,expanded){
 row.classList.add('explorer-folder-row');row.setAttribute('aria-expanded',String(expanded));
 row.innerHTML=icon('chevron','tree-chevron')+icon('folder');
 row.append(textElement('span','panel-file-name',name));
}
export function parseUnifiedDiff(text){
 const rows=[];let oldLine=0,newLine=0,inHunk=false;
 for(const line of text.split('\n')){
  const hunk=line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if(hunk){oldLine=Number(hunk[1]);newLine=Number(hunk[2]);inHunk=true;rows.push({kind:'hunk',text:line,old:null,new:null});continue;}
  if(!inHunk||line.startsWith('\\'))continue;
  if(line.startsWith('+'))rows.push({kind:'addition',text:line.slice(1),old:null,new:newLine++});
  else if(line.startsWith('-'))rows.push({kind:'deletion',text:line.slice(1),old:oldLine++,new:null});
  else if(line.startsWith(' '))rows.push({kind:'context',text:line.slice(1),old:oldLine++,new:newLine++});
 }
 return rows;
}
export function renderCode(container,result,isDiff=false){
 if(result.binary){container.append(textElement('p','panel-inline-note','Binary file'));return;}
 const diff=isDiff&&!result.untracked;
 const rows=diff?parseUnifiedDiff(result.text):result.text.split('\n').map((text,index)=>({kind:'context',text,old:null,new:index+1}));
 const limit=5000;
 if(result.truncated||rows.length>limit)container.append(textElement('p','panel-inline-note','Preview truncated'));
 const code=document.createElement('div');code.className='panel-code'+(diff?' panel-diff':'');code.setAttribute('role','region');code.setAttribute('aria-label',diff?'File diff':'File contents');
 for(const line of rows.slice(0,limit)){
  const row=document.createElement('div');row.className='code-line '+line.kind;
  if(diff){const old=textElement('span','code-number',line.old??'');old.setAttribute('aria-hidden','true');row.append(old);}
  const number=textElement('span','code-number',line.new??'');number.setAttribute('aria-hidden','true');
  const mark=textElement('span','code-sign',line.kind==='addition'?'+':line.kind==='deletion'?'−':'');mark.setAttribute('aria-hidden','true');
  const content=textElement('code','code-text',line.text||' ');row.append(number,mark,content);code.append(row);
 }
 if(!rows.length)container.append(textElement('p','panel-inline-note',diff?'No text diff':'Empty file'));else container.append(code);
 // Paint text immediately, then color tokens without replacing the scroll surface.
 if(rows.length)void import('./code-highlight.js').then(async({highlightLines,appendTokens})=>{
  const source=rows.slice(0,limit).map(row=>row.kind==='hunk'?'':row.text).join('\n');
  const tokens=await highlightLines(source,result.path);
  if(!code.isConnected)return;
  code.querySelectorAll('.code-text').forEach((element,index)=>{if(rows[index].kind!=='hunk')appendTokens(element,tokens[index]||[]);});
 }).catch(()=>{/* Unsupported or malformed grammars retain the readable plain text. */});
 if(diff){const added=rows.filter(line=>line.kind==='addition').length,removed=rows.filter(line=>line.kind==='deletion').length;const stats=document.createElement('span');stats.className='panel-diff-stats';stats.setAttribute('aria-label',`${added} additions, ${removed} deletions`);stats.append(textElement('span','diff-added','+'+added),textElement('span','diff-removed','−'+removed));container.parentElement.querySelector('.panel-content-bar')?.insertBefore(stats,container.parentElement.querySelector('.panel-content-bar > button:last-child'));}
}

export function renderFileTree(container,{directories,expanded,onFolder,onFile}){
 const tree=document.createElement('div');tree.className='file-tree';tree.setAttribute('role','tree');tree.setAttribute('aria-label','Project files');container.append(tree);
 function children(directory,level=1){for(const entry of directories.get(directory)?.entries??[]){
  const row=document.createElement('button');row.type='button';row.className='panel-file-row tree-row';row.setAttribute('role','treeitem');row.setAttribute('aria-level',String(level));row.dataset.path=entry.path;row.title=entry.path;row.style.setProperty('--tree-depth',level-1);row.tabIndex=-1;row.disabled=entry.kind==='link';
  const folder=entry.kind==='directory';row.dataset.folder=String(folder);
  if(folder){fillFolderRow(row,entry.name,expanded.includes(entry.path));}else{row.setAttribute('aria-selected','false');row.innerHTML='<span class="tree-chevron-spacer"></span>'+icon('file');}
  if(!folder){row.querySelector('.icon')?.remove();row.append(fileIcon(entry.path));}
  if(!folder)row.append(textElement('span','panel-file-name',entry.name));row.addEventListener('click',()=>folder?onFolder(entry.path):onFile(entry.path));tree.append(row);
  if(folder&&expanded.includes(entry.path))children(entry.path,level+1);
 }}
 children('');
 const visible=()=>[...tree.querySelectorAll('.tree-row:not([hidden]):not(:disabled)')];
 const focus=row=>{if(!row)return;tree.querySelectorAll('.tree-row').forEach(el=>el.tabIndex=-1);row.tabIndex=0;row.focus();};
 visible()[0]?.setAttribute('tabindex','0');
 tree.addEventListener('focusin',event=>{const row=event.target.closest('.tree-row');if(row){tree.querySelectorAll('.tree-row').forEach(el=>el.tabIndex=el===row?0:-1);}});
 tree.addEventListener('keydown',event=>{
  if(!['ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
  event.preventDefault();const rows=visible(),row=event.target.closest('.tree-row'),index=rows.indexOf(row);
  if(event.key==='ArrowDown'||event.key==='ArrowUp')focus(rows[Math.max(0,Math.min(rows.length-1,index+(event.key==='ArrowDown'?1:-1)))]);
  if(event.key==='Home')focus(rows[0]);if(event.key==='End')focus(rows.at(-1));
  if(event.key==='ArrowRight'&&row?.dataset.folder==='true'){if(row.getAttribute('aria-expanded')==='false')onFolder(row.dataset.path);else focus(rows[index+1]);}
  if(event.key==='ArrowLeft'&&row){if(row.getAttribute('aria-expanded')==='true')onFolder(row.dataset.path);else{const parent=row.dataset.path.split('/').slice(0,-1).join('/');focus(rows.find(el=>el.dataset.path===parent));}}
 });
 return query=>{const rows=[...tree.querySelectorAll('.tree-row')],needle=query.toLowerCase().trim();const matches=rows.filter(row=>row.dataset.path.toLowerCase().includes(needle));for(const row of rows)row.hidden=!!needle&&!matches.some(match=>match===row||match.dataset.path.startsWith(row.dataset.path+'/'));const available=rows.filter(row=>!row.hidden&&!row.disabled);rows.forEach(row=>row.tabIndex=row===available[0]?0:-1);};
}

export function renderChanges(container,{entries,collapsed=[],onGroup,onFile}){
 const groups=new Map();
 for(const entry of entries){const parts=entry.path.split('/'),name=parts.pop(),folder=parts.join('/');if(!groups.has(folder))groups.set(folder,[]);groups.get(folder).push({...entry,name});}
 const groupNodes=[];
 for(const [folder,files] of [...groups].sort(([a],[b])=>a.localeCompare(b))){
  const group=document.createElement('section');group.className='change-group';const list=document.createElement('div');list.className='change-group-files';
  if(folder){const heading=document.createElement('button');heading.type='button';heading.className='panel-file-row tree-row change-folder';heading.style.setProperty('--tree-depth',0);fillFolderRow(heading,folder,!collapsed.includes(folder));heading.append(textElement('span','change-folder-count',String(files.length)));heading.addEventListener('click',()=>onGroup(folder));group.append(heading);list.hidden=collapsed.includes(folder);}
  for(const entry of files){const row=document.createElement('button');row.type='button';row.className='panel-file-row change-row';row.title=entry.path;row.dataset.path=entry.path;row.append(fileIcon(entry.path));row.append(textElement('span','panel-file-name',entry.name));const kind=entry.status==='??'||entry.status.includes('A')?'added':entry.status.includes('D')?'deleted':/[RC]/.test(entry.status)?'renamed':'modified';const status=textElement('span','panel-file-status',{added:'A',deleted:'D',modified:'M',renamed:'R'}[kind]);status.dataset.kind=kind;row.setAttribute('aria-description',{added:'New file',deleted:'Deleted file',modified:'Modified file',renamed:'Renamed file'}[kind]);row.append(status);row.addEventListener('click',()=>onFile(entry.path));list.append(row);}group.append(list);container.append(group);groupNodes.push(group);
 }
 return query=>{const needle=query.trim().toLowerCase();for(const group of groupNodes){let any=false;for(const row of group.querySelectorAll('.change-row')){row.hidden=!!needle&&!row.dataset.path.toLowerCase().includes(needle);if(!row.hidden)any=true;}group.hidden=!any;if(needle&&any)group.querySelector('.change-group-files').hidden=false;else{const heading=group.querySelector('.change-folder');if(heading)group.querySelector('.change-group-files').hidden=heading.getAttribute('aria-expanded')==='false';}}};
}

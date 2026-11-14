import {icon} from './ui.js';
import {fileIcon} from './file-icons.js';
import {setProjectGroupExpanded} from './project-group-motion.js';
import {createCollectionNavigation} from './components/ui/collection-navigation.js';

export function textElement(tag,className,text){const el=document.createElement(tag);el.className=className;el.textContent=text;return el;}
function fillFolderRow(row,name,expanded){
 row.classList.add('explorer-folder-row');row.setAttribute('aria-expanded',String(expanded));
 row.innerHTML=icon('chevron','tree-chevron');
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
export function splitDiffRows(rows){
 const result=[];
 for(let index=0;index<rows.length;){const row=rows[index];if(row.kind==='hunk'){result.push({hunk:row});index++;continue;}if(row.kind==='context'){result.push({left:row,right:row});index++;continue;}
  const deleted=[],added=[];while(index<rows.length&&['addition','deletion'].includes(rows[index].kind)){const line=rows[index++];(line.kind==='deletion'?deleted:added).push(line);}for(let pair=0;pair<Math.max(deleted.length,added.length);pair++)result.push({left:deleted[pair]??null,right:added[pair]??null});
 }return result;
}
export function renderCode(container,result,isDiff=false,{wrap=false,diffLayout='unified'}={}){
 if(result.binary){container.append(textElement('p','panel-inline-note','Binary file'));return;}
 const diff=isDiff;
 const rows=diff&&!result.untracked?parseUnifiedDiff(result.text):(result.text?result.text.split('\n'):[]).slice(0,result.text.endsWith('\n')?-1:undefined).map((text,index)=>({kind:diff?'addition':'context',text,old:null,new:index+1}));
 const limit=5000,sourceRows=rows.slice(0,limit),paint=[];
 if(result.truncated||rows.length>limit)container.append(textElement('p','panel-inline-note','Preview truncated'));
 const code=document.createElement('div');code.className='panel-code'+(diff?' panel-diff':'');code.dataset.wrap=String(wrap);code.dataset.layout=diff?diffLayout:'unified';code.setAttribute('role','region');code.setAttribute('aria-label',diff?'File diff':'File contents');
 function lineNode(line,side){
  const row=document.createElement('div');row.className='code-line '+(line?.kind||'diff-empty');if(!line)return row;
  if(diff&&!side){const old=textElement('span','code-number',line.old??'');old.setAttribute('aria-hidden','true');row.append(old);}
  const number=textElement('span','code-number',side==='left'?line.old??'':line.new??'');number.setAttribute('aria-hidden','true');
  const mark=textElement('span','code-sign',line.kind==='addition'?'+':line.kind==='deletion'?'−':'');mark.setAttribute('aria-hidden','true');
  const content=textElement('code','code-text',line.text||' ');row.append(number,mark,content);paint.push({line,element:content});return row;
 }
 if(diff&&diffLayout==='split'){
  const labels=document.createElement('div');labels.className='split-diff-labels';labels.append(textElement('span','','Before'),textElement('span','','After'));code.append(labels);
  for(const pair of splitDiffRows(sourceRows)){if(pair.hunk){const header=textElement('div','code-line hunk split-hunk',pair.hunk.text);code.append(header);continue;}const row=document.createElement('div');row.className='split-diff-row';row.append(lineNode(pair.left,'left'),lineNode(pair.right,'right'));code.append(row);}
 }else for(const line of sourceRows)code.append(lineNode(line));
 if(!rows.length)container.append(textElement('p','panel-inline-note',diff?'No text diff':'Empty file'));else container.append(code);
 if(paint.length)void import('./code-highlight.js').then(async({highlightLines,appendTokens})=>{
  const tokens=await highlightLines(paint.map(({line})=>line.kind==='hunk'?'':line.text).join('\n'),result.path);
  if(!code.isConnected)return;paint.forEach(({element,line},index)=>{if(line.kind!=='hunk')appendTokens(element,tokens[index]||[]);});
 }).catch(()=>{});
 if(diff){const added=result.added===null?null:result.added??rows.filter(line=>line.kind==='addition').length,removed=result.removed===null?null:result.removed??rows.filter(line=>line.kind==='deletion').length;const stats=document.createElement('span');stats.className='panel-diff-stats';stats.setAttribute('aria-label',added===null||removed===null?'Line counts unavailable':`${added} additions, ${removed} deletions`);if(added)stats.append(textElement('span','diff-added','+'+added));if(removed)stats.append(textElement('span','diff-removed','−'+removed));const bar=container.parentElement.querySelector('.panel-content-bar');bar?.querySelector('.panel-diff-stats')?.remove();bar?.insertBefore(stats,bar.querySelector('.editor-view-options'));}
}

export function filterFileTreeRows(rows,query){
 const needle=query.toLowerCase().trim(),visiblePaths=new Set();
 if(needle)for(const row of rows){
  if(!row.dataset.path.toLowerCase().includes(needle))continue;
  // Add each match and its ancestors once, rather than scanning matches per row.
  let path=row.dataset.path;
  while(!visiblePaths.has(path)){
   visiblePaths.add(path);
   const slash=path.lastIndexOf('/');
   if(slash<0)break;
   path=path.slice(0,slash);
  }
 }
 for(const row of rows)row.hidden=!!needle&&!visiblePaths.has(row.dataset.path);
 const available=rows.filter(row=>!row.hidden&&!row.disabled);
 rows.forEach(row=>row.tabIndex=row===available[0]?0:-1);
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
 return query=>filterFileTreeRows([...tree.querySelectorAll('.tree-row')],query);
}

export function renderChanges(container,{entries,collapsed=[],onGroup,onFile}){
 const closed=new Set(collapsed),root={path:'',folders:new Map(),files:[]},groups=[];
 for(const entry of entries){const parts=entry.path.split('/'),name=parts.pop();let node=root;for(const part of parts){const path=node.path?node.path+'/'+part:part;if(!node.folders.has(part))node.folders.set(part,{path,name:part,folders:new Map(),files:[]});node=node.folders.get(part);}node.files.push({...entry,name});}
 const tree=document.createElement('div');tree.className='changes-tree';tree.setAttribute('role','tree');tree.setAttribute('aria-label','Changed files');container.append(tree);
 const navigation=createCollectionNavigation(tree,{items:()=>[...tree.querySelectorAll('.tree-row')].filter(row=>!row.closest('[hidden],[inert]')),tabStop:true,key:row=>row.dataset.path,preferred:row=>row.classList.contains('is-selected')});
 function build(node,parent,level){
  for(const child of [...node.folders.values()].sort((a,b)=>a.name.localeCompare(b.name))){
   const group=document.createElement('section');group.className='change-group';group.dataset.folderGroup=child.path;
   const heading=document.createElement('button');heading.type='button';heading.className='panel-file-row tree-row change-folder explorer-folder-row';heading.setAttribute('role','treeitem');heading.setAttribute('aria-level',String(level));heading.setAttribute('aria-expanded',String(!closed.has(child.path)));heading.dataset.path=child.path;heading.dataset.folder='true';heading.innerHTML=icon('chevron','tree-chevron');heading.append(textElement('span','panel-file-name',child.name),textElement('span','change-folder-dot',''));
   const body=document.createElement('div');body.className='change-group-files';body.setAttribute('role','group');body.hidden=closed.has(child.path);body.inert=body.hidden;group.append(heading,body);parent.append(group);groups.push({path:child.path,group,heading,body});
   heading.addEventListener('click',event=>{const expanded=heading.getAttribute('aria-expanded')!=='true';heading.setAttribute('aria-expanded',String(expanded));expanded?closed.delete(child.path):closed.add(child.path);if(event.detail===0){body.hidden=!expanded;body.inert=!expanded;}else setProjectGroupExpanded(body,expanded);onGroup(child.path);navigation.sync();});build(child,body,level+1);
  }
  for(const entry of node.files.sort((a,b)=>a.name.localeCompare(b.name))){
   const row=document.createElement('button');row.type='button';row.className='panel-file-row tree-row change-row';row.title=entry.path;row.dataset.path=entry.path;row.setAttribute('role','treeitem');row.setAttribute('aria-level',String(level));row.setAttribute('aria-selected','false');row.append(fileIcon(entry.path),textElement('span','panel-file-name',entry.name));
   const kind=entry.status==='??'||entry.status.includes('A')?'added':entry.status.includes('D')?'deleted':/[RC]/.test(entry.status)?'renamed':'modified';row.dataset.kind=kind;
   const stats=document.createElement('span');stats.className='change-file-stats';if(entry.added)stats.append(textElement('span','diff-added','+'+entry.added));if(entry.removed)stats.append(textElement('span','diff-removed','−'+entry.removed));row.append(stats);
   const status=document.createElement('span');status.className='panel-file-status';status.dataset.kind=kind;status.innerHTML=icon(kind==='added'?'diff-add':kind==='deleted'?'diff-delete':'diff-modify');status.setAttribute('aria-hidden','true');row.append(status);
   row.setAttribute('aria-label',entry.name);row.setAttribute('aria-description',`${{added:'New file',deleted:'Deleted file',modified:'Modified file',renamed:'Renamed file'}[kind]}${entry.binary?', binary':entry.added===null?', line counts unavailable':`, ${entry.added||0} additions, ${entry.removed||0} deletions`}`);row.addEventListener('click',()=>onFile(entry.path));parent.append(row);
  }
 }
 build(root,tree,1);navigation.sync();
 tree.addEventListener('keydown',event=>{const row=event.target.closest('.tree-row');if(!row)return;
  if(event.key==='ArrowRight'&&row.dataset.folder==='true'){event.preventDefault();if(row.getAttribute('aria-expanded')==='false')row.click();else navigation.focus(row.nextElementSibling.querySelector('.tree-row'));return;}
  if(event.key==='ArrowLeft'){const group=(row.dataset.folder==='true'?row.parentElement.parentElement:row.parentElement).closest('.change-group');if(row.dataset.folder==='true'&&row.getAttribute('aria-expanded')==='true'){event.preventDefault();row.click();}else if(group){event.preventDefault();navigation.focus(group.querySelector(':scope > .change-folder'));}return;}
  navigation.keydown(event);
 });
 const cleanup=new MutationObserver(()=>{if(!tree.isConnected){navigation.destroy();cleanup.disconnect();}});cleanup.observe(container.closest('.panel-editor')?.parentElement||container,{childList:true,subtree:true});
 return query=>{const needle=query.trim().toLowerCase();for(const row of tree.querySelectorAll('.change-row'))row.hidden=!!needle&&!row.dataset.path.toLowerCase().includes(needle);
  for(const {path,group,heading,body} of [...groups].reverse()){group.hidden=!!needle&&![...body.querySelectorAll('.change-row')].some(row=>!row.hidden);body.hidden=!needle&&closed.has(path);body.inert=body.hidden;heading.setAttribute('aria-expanded',String(!body.hidden));}navigation.sync();
 };
}

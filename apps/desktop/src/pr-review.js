// Right-panel "Pull request" tab: overview, checks, files and a diff of the current branch's PR. Read-only.
import {icon} from './ui.js';
import {fileIcon} from './file-icons.js';
import {renderCode,textElement} from './panel-content.js';

const TABS=[['overview','Overview'],['checks','Checks'],['files','Files'],['diff','Diff']];
const EMPTY={
 'no-repo':['Not a git repository',''],
 'no-remote':['No GitHub remote','Add a remote named origin that points to github.com'],
 'no-pr':['No pull request',''],
 'no-gh':['GitHub CLI not found','Install gh to see pull requests'],
 'no-auth':['Sign in to GitHub','Run gh auth login in a terminal'],
 error:['Couldn’t load the pull request',''],
};
const STATUS={open:'Open',draft:'Draft',merged:'Merged',closed:'Closed'};
const CHECK={passed:['check','Passed'],failed:['close','Failed'],skipped:['slash','Skipped'],pending:['clock','Running']};
const REVIEW={APPROVED:['check','Approved','passed'],CHANGES_REQUESTED:['warning','Changes requested','failed'],COMMENTED:['message','Commented','skipped'],DISMISSED:['slash','Dismissed','skipped'],REQUESTED:['clock','Requested','pending']};
const el=(tag,className,text)=>textElement(tag,className,text??'');
const glyph=(name,status)=>{const span=el('span','pq-glyph');span.dataset.status=status;span.innerHTML=icon(name);span.setAttribute('aria-hidden','true');return span;};
const stats=(added,removed)=>{const wrap=el('span','pq-stats');if(added)wrap.append(el('span','diff-added','+'+added));if(removed)wrap.append(el('span','diff-removed','−'+removed));return wrap;};
function button(label,glyphName,onClick){const b=document.createElement('button');b.type='button';b.className='button button--ghost pq-icon-button';b.title=label;b.setAttribute('aria-label',label);b.innerHTML=icon(glyphName);b.addEventListener('click',onClick);return b;}
function empty(data,onRefresh){
 const [title,detail]=EMPTY[data.state]||EMPTY.error,box=el('div','panel-empty pq-empty');box.dataset.state=data.state;
 box.append(el('p','',title));const text=data.state==='no-pr'||data.state==='error'?data.reason:detail;if(text)box.append(el('p','panel-empty-detail',text));
 if(['no-pr','error','no-auth','no-gh'].includes(data.state)){const retry=document.createElement('button');retry.type='button';retry.className='button button--subtle';retry.textContent=data.state==='error'?'Try again':'Refresh';retry.addEventListener('click',onRefresh);box.append(retry);}
 return box;
}
function section(title,count){const s=el('section','pq-section'),h=el('h3','pq-section-title',title);if(count!==undefined)h.append(el('span','pq-count',String(count)));s.append(h);return s;}
function overview(data){
 const {pr}=data,root=el('div','pq-overview'),wells=el('div','pq-wells');
 const failed=data.checks.filter(c=>c.status==='failed').length,pending=data.checks.filter(c=>c.status==='pending').length;
 for(const [label,value] of [['Files',String(data.files.length)],['Changes',null],['Checks',data.checks.length?failed?`${failed} failed`:pending?`${pending} running`:'All passed':'None']]){
  const well=el('div','pq-well');well.append(el('span','pq-well-label',label));
  if(value===null){const v=el('span','pq-well-value');v.append(stats(pr.additions,pr.deletions));if(!pr.additions&&!pr.deletions)v.textContent='None';well.append(v);}else{const v=el('span','pq-well-value',value);if(label==='Checks'&&data.checks.length)v.dataset.status=failed?'failed':pending?'pending':'passed';well.append(v);}
  wells.append(well);
 }
 root.append(wells);
 const people=section('Reviewers',pr.reviewers.length);
 if(!pr.reviewers.length)people.append(el('p','pq-none','No reviewers'));
 for(const r of pr.reviewers){const [g,label,status]=REVIEW[r.state]||REVIEW.COMMENTED,row=el('div','pq-row');row.append(glyph(g,status),el('span','pq-row-name',r.login),el('span','pq-row-note',label));people.append(row);}
 const tags=section('Labels',pr.labels.length);
 if(!pr.labels.length)tags.append(el('p','pq-none','No labels'));
 else{const list=el('div','pq-labels');for(const l of pr.labels){const chip=el('span','pq-label',l.name);if(l.color)chip.style.setProperty('--label',`#${l.color}`);list.append(chip);}tags.append(list);}
 root.append(people,tags);return root;
}
function checks(data,onOpen){
 const s=section('Checks',data.checks.length);
 if(!data.checks.length)s.append(el('p','pq-none','No checks ran for this commit'));
 for(const c of data.checks){const [g,label]=CHECK[c.status],row=el('div','pq-row pq-check');row.dataset.status=c.status;row.append(glyph(g,c.status),el('span','pq-row-name',c.name),el('span','pq-row-note',label));if(c.url)row.append(button('Open '+c.name+' on GitHub','external',()=>onOpen(c.url)));s.append(row);}
 return s;
}
function files(data,onView){
 const s=section('Files',data.files.length);
 if(!data.files.length)s.append(el('p','pq-none','No changed files'));
 for(const f of data.files){
  const row=document.createElement('button');row.type='button';row.className='panel-file-row pq-file';row.dataset.path=f.path;row.title=f.path;
  const name=f.path.split('/').pop(),dir=f.path.slice(0,f.path.length-name.length);
  const status=el('span','panel-file-status');status.dataset.kind=f.status==='renamed'?'modified':f.status;status.innerHTML=icon(f.status==='added'?'diff-add':f.status==='deleted'?'diff-delete':'diff-modify');status.setAttribute('aria-hidden','true');
  const label=el('span','panel-file-name',name);if(dir)label.append(el('span','pq-dir',' '+dir.replace(/\/$/,'')));
  row.append(fileIcon(f.path),label,stats(f.additions,f.deletions),status);row.addEventListener('click',()=>onView({tab:'diff',file:f.path}));s.append(row);
 }
 return s;
}
const FILE_LIMIT=30;
function diff(data,view){
 const root=el('div','pq-diff');
 if(!data.files.length)root.append(el('p','pq-none','No changed files'));
 for(const f of data.files.slice(0,FILE_LIMIT)){
  const block=el('section','pq-diff-file');block.dataset.path=f.path;block.dataset.selected=String(view.file===f.path);
  const head=el('header','pq-diff-head');head.append(fileIcon(f.path),el('span','panel-file-name',f.path),stats(f.additions,f.deletions));
  const code=el('div','pq-diff-code');block.append(head,code);root.append(block);
  renderCode(code,{text:f.patch||'',path:f.path,added:f.additions,removed:f.deletions},true,{wrap:false,diffLayout:'unified'});
 }
 if(data.files.length>FILE_LIMIT)root.append(el('p','pq-none',`${data.files.length-FILE_LIMIT} more files. Open the pull request on GitHub to see them.`));
 return root;
}

export function renderPullRequest(body,data,{view,onView,onRefresh,onOpen}){
 body.replaceChildren();
 if(data.state!=='ok'){body.append(empty(data,onRefresh));return;}
 const {pr}=data,panel=el('div','pq-panel');
 const head=el('header','pq-head'),top=el('div','pq-title-row');
 const pill=el('span','pq-status',STATUS[pr.status]);pill.dataset.status=pr.status;
 top.append(pill,el('h2','pq-title',pr.title),el('span','pq-number','#'+pr.number));
 const actions=el('span','pq-actions');actions.append(button('Refresh pull request','refresh',onRefresh));if(pr.url)actions.append(button('Open on GitHub','external',()=>onOpen(pr.url)));top.append(actions);
 const meta=el('p','pq-meta');meta.append(el('span','pq-branch',pr.head),document.createTextNode(' → '),el('span','pq-branch',pr.base),...(pr.author?[document.createTextNode(' · '+pr.author)]:[]));
 head.append(top,meta);
 const tabs=el('div','pq-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Pull request sections');
 const count={checks:data.checks.length,files:data.files.length};
 for(const [id,label] of TABS){const tab=document.createElement('button');tab.type='button';tab.className='pq-tab';tab.setAttribute('role','tab');tab.dataset.tab=id;tab.id='pq-tab-'+id;tab.setAttribute('aria-selected',String(view.tab===id));tab.setAttribute('aria-controls','pq-view');tab.tabIndex=view.tab===id?0:-1;tab.append(el('span','',label));if(count[id])tab.append(el('span','pq-count',String(count[id])));tab.addEventListener('click',()=>onView({tab:id}));tabs.append(tab);}
 tabs.addEventListener('keydown',event=>{const order=TABS.map(t=>t[0]),i=order.indexOf(view.tab),next={ArrowRight:i+1,ArrowLeft:i-1,Home:0,End:order.length-1}[event.key];if(next===undefined)return;event.preventDefault();onView({tab:order[(next+order.length)%order.length],focus:true});});
 const pane=el('div','pq-view');pane.id='pq-view';pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby','pq-tab-'+view.tab);
 pane.append(view.tab==='checks'?checks(data,onOpen):view.tab==='files'?files(data,onView):view.tab==='diff'?diff(data,view):overview(data));
 panel.append(head,tabs,pane);body.append(panel);
 if(view.focus)tabs.querySelector('[aria-selected=true]')?.focus({preventScroll:true});
 if(view.tab==='diff'&&view.file)pane.querySelector(`[data-path="${CSS.escape(view.file)}"]`)?.scrollIntoView({block:'start'});
}

import {threadViewState} from './thread-view-state.js';
import {projectBadge} from './thread-row.js';
import {icon} from './ui.js';
import {showPopover,hidePopover} from './popover-motion.js';

function projectFolder(project){const badge=projectBadge({project:project?.name,...project});badge.classList.add('project-badge');return badge;}

export function connectProjects({api,toast}){
 document.querySelector('.repo-button')?.remove();
 const area=document.querySelector('.agent-area'),bar=document.createElement('div');bar.className='project-bar';
 const trigger=document.createElement('button');trigger.type='button';trigger.className='button project-picker';trigger.setAttribute('aria-label','Choose project');trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
 const name=document.createElement('span');name.className='project-name';name.textContent='Select project';trigger.append(projectFolder(),name);trigger.insertAdjacentHTML('beforeend',icon('chevron'));
 const git=document.createElement('span');git.className='git-pill';git.hidden=true;bar.append(trigger,git);area.prepend(bar);
 const menu=document.createElement('div');menu.className='popover project-menu';menu.hidden=true;menu.setAttribute('role','dialog');menu.setAttribute('aria-label','Projects');
 const search=document.createElement('input');search.className='project-search';search.placeholder='Search projects';search.setAttribute('aria-label','Search projects');
 const list=document.createElement('div');list.className='project-options';list.setAttribute('role','group');list.setAttribute('aria-label','Saved projects');
 const add=document.createElement('button');add.type='button';add.className='menu-item project-add';add.innerHTML=icon('plus')+'<span>New project</span>';menu.append(search,list,add);document.body.append(menu);
 let selected=null,projects=[],pending=null,selectionRevision=0;
 try{projects=JSON.parse(localStorage.getItem('suffice-project-list-v1')||'[]');if(!Array.isArray(projects))projects=[];}catch{}
 function refreshProjects(){if(pending)return pending;pending=api.projects().then(items=>{projects=items;try{localStorage.setItem('suffice-project-list-v1',JSON.stringify(items));}catch{}if(trigger.getAttribute('aria-expanded')==='true')render();return items;}).finally(()=>{pending=null;if(trigger.getAttribute('aria-expanded')==='true')render();});return pending;}
 threadViewState.subscribe(event=>{if(event.type==='select')selectionRevision++;});
 function close(focus=false){hidePopover(menu);trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();}
 function apply(project){selected=project;name.textContent=project.name;trigger.querySelector('.project-badge').replaceWith(projectFolder(project));trigger.title=project.path;git.hidden=false;git.innerHTML=icon(project.git?.branch?'branch':'monitor');const label=document.createElement('span');label.textContent=project.git?.branch||'No Git';git.append(label);git.title=project.git?.detached?'Detached HEAD':label.textContent;try{localStorage.setItem('suffice-project',project.id);}catch{}}
 function render(){list.replaceChildren();for(const project of projects.filter(p=>p.name.toLowerCase().includes(search.value.toLowerCase()))){const row=document.createElement('button');row.type='button';row.className='menu-item project-option';row.setAttribute('aria-pressed',String(project.id===selected?.id));row.append(projectFolder(project));const text=document.createElement('span');text.className='project-name';text.textContent=project.name;row.append(text);row.addEventListener('click',async()=>{const revision=++selectionRevision;apply(project);close(true);try{const updated=await api.selectProject(project.id);if(revision===selectionRevision&&!threadViewState.id)apply(updated);}catch(error){if(revision===selectionRevision)toast(error.message);}});list.append(row);}if(!list.children.length){const empty=document.createElement('div');empty.className='project-list-status';empty.role='status';empty.textContent=search.value?'No matching projects':pending?'Loading projects':'No saved projects';list.append(empty);}}
 trigger.addEventListener('click',()=>{if(trigger.getAttribute('aria-expanded')==='true'){close();return;}search.value='';render();const rect=trigger.getBoundingClientRect();menu.style.left=`${Math.max(12,Math.min(rect.left,innerWidth-292))}px`;menu.style.top=`${Math.min(rect.bottom+6,innerHeight-300)}px`;menu.style.setProperty('--popover-origin','top left');showPopover(menu);trigger.setAttribute('aria-expanded','true');search.focus();void refreshProjects().catch(error=>toast(error.message));});
 search.addEventListener('input',render);
 menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close(true);}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const items=[search,...list.querySelectorAll('button'),add];const index=items.indexOf(document.activeElement),step=event.key==='ArrowDown'?1:-1;items[(index+step+items.length)%items.length].focus();}});
 add.addEventListener('click',async()=>{close();try{const project=await api.chooseProject();if(project)apply(project);}catch(error){toast(error.message);}});
 document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target)&&!trigger.contains(event.target))close();});
 window.addEventListener('resize',()=>close());
 const initialRevision=selectionRevision,storedId=localStorage.getItem('suffice-project'),cached=projects.find(project=>project.id===storedId);if(cached)apply(cached);
 void refreshProjects().then(async items=>{if(selectionRevision!==initialRevision||threadViewState.id)return;const project=items.find(project=>project.id===storedId);if(project){apply(project);const updated=await api.selectProject(project.id);if(selectionRevision===initialRevision&&!threadViewState.id)apply(updated);}}).catch(error=>toast(error.message));
}

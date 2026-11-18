import {connectBranchPicker} from './branch-picker.js';
import {connectOverlayScrollbar} from './overlay-scrollbar.js';
import {preference} from './settings-preferences.js';
import {threadViewState} from './thread-view-state.js';
import {projectBadge} from './thread-row.js';
import {icon} from './ui.js';
import {showPopover,hidePopover} from './popover-motion.js';
import {createCollectionNavigation} from './components/ui/collection-navigation.js';

function projectFolder(project){const badge=projectBadge({project:project?.name,...project});badge.classList.add('project-badge');return badge;}

export function connectProjects({api,toast}){
 document.querySelector('.repo-button')?.remove();
 const area=document.querySelector('.agent-area'),bar=document.createElement('div');bar.className='project-bar';
 const trigger=document.createElement('button');trigger.type='button';trigger.className='button project-picker';trigger.setAttribute('aria-label','Choose project');trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
 const name=document.createElement('span');name.className='project-name';name.textContent='Select project';trigger.append(projectFolder(),name);trigger.insertAdjacentHTML('beforeend',icon('chevron'));
 const git=document.createElement('button');git.type='button';git.className='git-pill';git.setAttribute('aria-label','Choose branch');git.setAttribute('aria-expanded','false');git.hidden=true;const own=document.createElement('button');own.type='button';own.className='button worktree-toggle';own.setAttribute('role','switch');own.hidden=true;own.title='Run new threads in their own git worktree';own.innerHTML=icon('worktree')+'<span>Own worktree</span>';
 const composer=document.querySelector('.composer');let ownOn=false;try{ownOn=localStorage.getItem('suffice-own-worktree')==='1';}catch{}
 function syncOwn(){own.setAttribute('aria-checked',String(ownOn));own.setAttribute('aria-pressed',String(ownOn));own.hidden=!selected?.git?.branch||!!threadViewState.id;if(composer)composer.ownWorktree=ownOn&&!!selected?.git?.branch;}
 own.addEventListener('click',()=>{ownOn=!ownOn;try{localStorage.setItem('suffice-own-worktree',ownOn?'1':'0');}catch{}syncOwn();});
 bar.append(trigger,git,own);area.prepend(bar);
 const menu=document.createElement('div');menu.className='popover project-menu';menu.hidden=true;menu.setAttribute('role','dialog');menu.setAttribute('aria-label','Projects');
 const search=document.createElement('input');search.className='project-search';search.placeholder='Search projects';search.setAttribute('aria-label','Search projects');
 const list=document.createElement('div');list.className='project-options';list.setAttribute('role','group');list.setAttribute('aria-label','Saved projects');
 const add=document.createElement('button');add.type='button';add.className='menu-item project-add';add.innerHTML=icon('plus')+'<span>New project</span>';menu.append(search,list,add);document.body.append(menu);
 connectOverlayScrollbar(list,{variant:'menu'});
 const navigation=createCollectionNavigation(menu,{items:()=>[search,...list.querySelectorAll('button'),add]});
 let selected=null,projects=[],pending=null,selectionRevision=0;
 try{projects=JSON.parse(localStorage.getItem('suffice-project-list-v1')||'[]');if(!Array.isArray(projects))projects=[];}catch{}
 function refreshProjects(){if(pending)return pending;pending=api.projects().then(items=>{projects=items;try{localStorage.setItem('suffice-project-list-v1',JSON.stringify(items));}catch{}if(trigger.getAttribute('aria-expanded')==='true')render();return items;}).finally(()=>{pending=null;if(trigger.getAttribute('aria-expanded')==='true')render();});return pending;}
 document.addEventListener('suffice-projects-updated',()=>{void refreshProjects().then(items=>{if(!selected)return;const updated=items.find(item=>item.id===selected.id);if(updated)apply({...updated,git:selected.git},true);else{selected=null;name.textContent='Select project';git.hidden=true;trigger.querySelector('.project-badge').replaceWith(projectFolder());try{localStorage.removeItem('suffice-project');}catch{}}}).catch(error=>toast(error.message));});
 threadViewState.subscribe(event=>{if(event.type==='select'){selectionRevision++;syncOwn();}});
 function close(focus=false){navigation.reset();hidePopover(menu);trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();}
 function apply(project,restored=false){selected=project;syncOwn();if(!restored)document.dispatchEvent(new Event('suffice-project-selected'));name.textContent=project.name;trigger.querySelector('.project-badge').replaceWith(projectFolder(project));trigger.title=project.path;git.hidden=false;git.disabled=!project.git?.branch;git.classList.toggle('button',!!project.git?.branch);git.setAttribute('aria-haspopup',project.git?.branch?'dialog':'false');git.dataset.worktree=String(!!project.git?.worktree);git.innerHTML=icon(project.git?.branch?(project.git.worktree||git.dataset.newWorktree==='true'?'worktree':'branch'):'monitor');const label=document.createElement('span');label.textContent=project.git?.branch||'No Git';git.append(label);if(project.git?.branch)git.insertAdjacentHTML('beforeend',icon('chevron'));git.title=project.git?.detached?'Detached HEAD':label.textContent;try{localStorage.setItem('suffice-project',project.id);}catch{}}
 const branchPicker=connectBranchPicker({api,trigger:git,toast,onSelected:project=>{selectionRevision++;if(project.newWorktree)document.querySelector('.new-session').click();apply(project,true);void refreshProjects().catch(()=>{});}});
 function render(){list.replaceChildren();for(const project of projects.filter(p=>p.name.toLowerCase().includes(search.value.toLowerCase()))){const row=document.createElement('button');row.type='button';row.className='menu-item project-option';row.setAttribute('aria-label',project.name);row.setAttribute('aria-pressed',String(project.id===selected?.id));row.append(projectFolder(project));const text=document.createElement('span');text.className='project-name';text.textContent=project.name;row.append(text);row.addEventListener('click',async()=>{const revision=++selectionRevision,previous=selected;apply(project);close(true);try{const updated=await (document.querySelector('.composer').projectSelection=api.selectProject(project.id));if(updated.openedNewWindow){if(previous)apply(previous);return;}if(revision===selectionRevision&&!threadViewState.id)apply(updated);}catch(error){if(revision===selectionRevision)toast(error.message);}});list.append(row);}if(!list.children.length){const empty=document.createElement('div');empty.className='project-list-status';empty.role='status';empty.textContent=search.value?'No matching projects':pending?'Loading projects':'No saved projects';list.append(empty);}}
 trigger.addEventListener('click',()=>{if(trigger.getAttribute('aria-expanded')==='true'){close();return;}branchPicker.close();search.value='';render();const rect=trigger.getBoundingClientRect();menu.style.left=`${Math.max(12,Math.min(rect.left,innerWidth-292))}px`;menu.style.top=`${Math.min(rect.bottom+6,innerHeight-300)}px`;menu.style.setProperty('--popover-origin','top left');showPopover(menu);trigger.setAttribute('aria-expanded','true');search.focus();void refreshProjects().catch(error=>toast(error.message));});
 search.addEventListener('input',render);
 menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close(true);}navigation.keydown(event);});
 add.addEventListener('click',async()=>{close();try{const project=await api.chooseProject();if(project&&!project.openedNewWindow){apply(project);document.dispatchEvent(new Event('suffice-projects-updated'));}}catch(error){toast(error.message);}});
 document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target)&&!trigger.contains(event.target))close();},true);
 window.addEventListener('resize',()=>close());
 void api.initialProject?.().then(project=>{if(project&&!threadViewState.id)apply(project);}).catch(()=>{});
 const initialRevision=selectionRevision,storedId=localStorage.getItem('suffice-project'),cached=projects.find(project=>project.id===storedId);if(cached&&preference('restore-project',true))apply(cached,true);
 void refreshProjects().then(async items=>{if(selectionRevision!==initialRevision||threadViewState.id||!preference('restore-project',true))return;const project=items.find(project=>project.id===storedId);if(project){apply(project,true);const updated=await api.selectProject(project.id,{restore:true});if(selectionRevision===initialRevision&&!threadViewState.id)apply(updated,true);}}).catch(error=>toast(error.message));
}

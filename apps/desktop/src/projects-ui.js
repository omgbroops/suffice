import {icon} from './ui.js';
import {showPopover,hidePopover} from './popover-motion.js';

function projectFolder(){
 const badge=document.createElement('span');badge.className='project-badge project-folder';badge.setAttribute('aria-hidden','true');badge.innerHTML=icon('folder');return badge;
}

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
 let selected=null,projects=[],waiting=null,choosing=false;
 function settle(value){waiting?.(value);waiting=null;}
 function close(focus=false){hidePopover(menu);trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();if(!choosing)settle(false);}
 function apply(project){selected=project;name.textContent=project.name;trigger.querySelector('.project-badge').replaceWith(projectFolder());trigger.title=project.path;git.hidden=false;git.innerHTML=icon(project.git?.branch?'branch':'monitor');const label=document.createElement('span');label.textContent=project.git?.branch||'No Git';git.append(label);git.title=project.git?.detached?'Detached HEAD':label.textContent;try{localStorage.setItem('suffice-project',project.id);}catch{}settle(true);}
 function render(){search.hidden=!projects.length;list.replaceChildren();for(const project of projects.filter(p=>p.name.toLowerCase().includes(search.value.toLowerCase()))){const row=document.createElement('button');row.type='button';row.className='menu-item project-option';row.setAttribute('aria-pressed',String(project.id===selected?.id));row.append(projectFolder());const text=document.createElement('span');text.className='project-name';text.textContent=project.name;row.append(text);row.addEventListener('click',async()=>{try{apply(await api.selectProject(project.id));close(true);}catch(error){toast(error.message);}});list.append(row);}}
 async function open(){try{projects=await api.projects();search.value='';render();const rect=trigger.getBoundingClientRect();menu.style.left=`${Math.max(12,Math.min(rect.left,innerWidth-292))}px`;menu.style.top=`${Math.min(rect.bottom+6,innerHeight-300)}px`;menu.style.setProperty('--popover-origin','top left');showPopover(menu);trigger.setAttribute('aria-expanded','true');(search.hidden?menu.querySelector('button'):search)?.focus();}catch(error){toast(error.message);settle(false);}}
 trigger.addEventListener('click',()=>{if(trigger.getAttribute('aria-expanded')==='true')close();else void open();});
 search.addEventListener('input',render);
 menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close(true);}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const items=[search,...list.querySelectorAll('button'),add];const index=items.indexOf(document.activeElement),step=event.key==='ArrowDown'?1:-1;items[(index+step+items.length)%items.length].focus();}});
 add.addEventListener('click',async()=>{choosing=true;close();try{const project=await api.chooseProject();if(project)apply(project);}catch(error){toast(error.message);}finally{choosing=false;settle(false);}});
 document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target)&&!trigger.contains(event.target))close();});
 window.addEventListener('resize',()=>close());
 const ready=api.projects().then(async items=>{projects=items;const id=localStorage.getItem('suffice-project');if(items.some(p=>p.id===id))apply(await api.selectProject(id));}).catch(error=>toast(error.message));
 // Sending with no project opens the picker; resolves true once one is picked, false if dismissed.
 return {ready,async ensure(){await ready;if(selected)return true;const picked=new Promise(resolve=>{settle(false);waiting=resolve;});await open();return picked;}};
}

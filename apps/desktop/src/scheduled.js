import {mountAutomations} from './automations-settings.js';
import './scheduled.css';

// Scheduled sidebar page: the same engine and controls as Settings > Automations, as a full page.
export function connectScheduled({api}){
 const nav=document.querySelector('.scheduled-nav'),workspace=document.querySelector('.workspace'),newSession=document.querySelector('.new-session');
 if(!nav||!workspace||!api.automations)return;
 const view=document.createElement('section');view.className='scheduled-view';view.hidden=true;view.setAttribute('aria-label','Scheduled');
 view.innerHTML='<div class="scheduled-page"><header class="scheduled-head"><h1 class="scheduled-title" tabindex="-1">Scheduled</h1></header></div>';
 workspace.append(view);
 const page=view.querySelector('.scheduled-page'),title=view.querySelector('.scheduled-title');
 let isOpen=false,underlay=[];
 function open(){
  if(isOpen){view.querySelector('button')?.focus();return;}
  if(workspace.classList.contains('issues-open'))document.querySelector('.issues-nav')?.click();
  if(workspace.classList.contains('needs-open'))document.querySelector('.needs-nav')?.click();
  isOpen=true;
  // A fresh host per open: the old one disconnects, so its event listener retires and Settings never sees a second card.
  view.querySelector('.scheduled-body')?.remove();const body=document.createElement('div');body.className='scheduled-body';page.append(body);mountAutomations(body,api);
  underlay=[...workspace.querySelectorAll('.home,.thread-transcript,.thread-header')].map(element=>({element,inert:element.inert}));for(const {element} of underlay)element.inert=true;
  view.hidden=false;workspace.classList.add('scheduled-open');nav.setAttribute('aria-current','page');newSession?.removeAttribute('aria-current');
  title.focus({preventScroll:true});
 }
 function close(restoreFocus=true){
  if(!isOpen)return;isOpen=false;
  for(const {element,inert} of underlay)element.inert=inert;underlay=[];
  view.querySelector('.scheduled-body')?.remove();view.hidden=true;workspace.classList.remove('scheduled-open');nav.removeAttribute('aria-current');
  if(!workspace.classList.contains('thread-view'))newSession?.setAttribute('aria-current','page');
  if(restoreFocus)nav.focus({preventScroll:true});
 }
 document.addEventListener('click',event=>{
  if(event.target.closest?.('.scheduled-nav')){isOpen?close():open();return;}
  if(isOpen&&event.target.closest?.('.thread-row,.new-session,.brand-home,[data-action=settings],.needs-nav,.issues-nav'))close(false);
 },true);
 document.addEventListener('keydown',event=>{if(isOpen&&event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('dialog[open],.popover:not([hidden])')){event.preventDefault();close();}});
 new MutationObserver(()=>{if(document.documentElement.classList.contains('settings-open'))close(false);}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
 document.addEventListener('suffice-open-scheduled',open);
}

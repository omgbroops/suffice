import {WHATS_NEW,SECTIONS,RELEASE,seen,markSeen} from './whats-new-data.js';
import {paintStarterImage} from './start-cards.js';
import {icon} from './ui.js';
import './whats-new.css';
// "What's new" sheet: shown once after an update, and from Cmd+K. A row runs `run(item)`, which opens the feature.
export function createWhatsNew({run}){
 const dialog=document.createElement('dialog');dialog.className='whats-new';dialog.setAttribute('aria-labelledby','whats-new-title');
 dialog.innerHTML=`<header class="whats-new-head"><h2 id="whats-new-title">What's new</h2><button type="button" class="whats-new-close" aria-label="Close">${icon('close')}</button></header><div class="whats-new-scroll"></div><footer class="whats-new-foot"><button type="button" class="whats-new-done">Done</button></footer>`;
 document.body.append(dialog);
 const scroll=dialog.querySelector('.whats-new-scroll'),banners=[];
 SECTIONS.forEach((sec,index)=>{
  const section=document.createElement('section');section.className='whats-new-section';section.style.setProperty('--wn-tint',sec.tint.join(' '));
  const canvas=document.createElement('canvas');canvas.className='whats-new-banner';canvas.width=520;canvas.height=120;canvas.setAttribute('aria-hidden','true');banners.push([canvas,sec.tint,index]);
  const heading=document.createElement('h3');heading.textContent=sec.title;
  const list=document.createElement('ul');list.className='whats-new-list';
  for(const item of WHATS_NEW.filter(i=>i.section===sec.id)){
   const li=document.createElement('li');li.dataset.id=item.id;
   const go=document.createElement('button');go.type='button';go.className='whats-new-item';
   const lead=document.createElement('strong');lead.textContent=item.title;go.append(lead,' '+item.line);
   go.addEventListener('click',()=>{close();run(item);});
   li.append(go);list.append(li);
  }
  section.append(canvas,heading,list);scroll.append(section);
 });
 let previous;
 function close(){if(!dialog.open)return;markSeen();dialog.close();previous?.focus?.({preventScroll:true});}
 dialog.querySelector('.whats-new-close').addEventListener('click',close);dialog.querySelector('.whats-new-done').addEventListener('click',close);
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
 function open(){if(dialog.open)return;previous=document.activeElement;for(const [canvas,tint,index] of banners)paintStarterImage(canvas,tint,index);dialog.showModal();dialog.querySelector('.whats-new-item').focus();}
 // A hidden window (tests, background launch) never auto-opens; the sheet waits for a visible one.
 function maybeShow(){if(seen()===RELEASE||document.visibilityState!=='visible'||window.sufficeDesktop?.testHidden)return false;open();return true;}
 return {open,close,maybeShow};
}

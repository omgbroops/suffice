import {preference} from './settings-preferences.js';
const KEY=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘,':'Ctrl ,';
// Bottom-left account row: GitHub photo (or initials), name, plan. Its menu holds everything that used to sit in the sidebar header.
export const accountItems=()=>[
 {label:'Settings',icon:'gear',action:'account:settings',key:KEY},
 {label:'Usage',icon:'usage',action:'account:usage'},
 {label:'Get help',icon:'help',action:'account:help',separator:true},
 {label:"What's new",icon:'bolt',action:'account:whatsnew'},
 {label:'Log out',icon:'logout',action:'account:logout',separator:true}];
export function connectAccount({api}){
 const avatar=document.querySelector('.account-avatar'),name=document.querySelector('.account-name'),plan=document.querySelector('.account-plan'),teamwork=document.querySelector('.teamwork-nav');
 let account={login:null,avatar:null};
 const paint=()=>{
  const login=account.login||'';name.textContent=login||'Account';plan.textContent='Free';
  avatar.replaceChildren();avatar.dataset.photo='false';
  if(account.avatar&&preference('account-avatar','GitHub')==='GitHub'){const img=document.createElement('img');img.alt='';img.src=account.avatar;img.addEventListener('error',()=>{img.remove();avatar.textContent=initials();avatar.dataset.photo='false';},{once:true});avatar.append(img);avatar.dataset.photo='true';}
  else avatar.textContent=initials();
 };
 const initials=()=>(account.login||'A').slice(0,2).toUpperCase();
 const showTeamwork=()=>{teamwork.hidden=!preference('sidebar-teamwork',false);};
 paint();showTeamwork();
 document.addEventListener('suffice-preference',event=>{if(event.detail?.id==='account-avatar')paint();if(event.detail?.id==='sidebar-teamwork')showTeamwork();});
 void api.account?.().then(value=>{if(value){account=value;paint();}}).catch(()=>{});
}

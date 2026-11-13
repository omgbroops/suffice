import {icon} from './ui.js';
import {showPopover,hidePopover} from './popover-motion.js';

// Sign-in stays visible in the project bar until it's done; sending while signed out opens it and sends after.
export function connectSignIn({api,toast}){
 const bar=document.querySelector('.project-bar');
 const pill=document.createElement('button');pill.type='button';pill.className='button git-pill sign-in-pill';pill.hidden=true;pill.setAttribute('aria-haspopup','dialog');pill.setAttribute('aria-expanded','false');
 pill.innerHTML=icon('globe')+'<span>Sign in</span>';bar?.append(pill);
 const menu=document.createElement('div');menu.className='popover project-menu sign-in-menu';menu.hidden=true;menu.setAttribute('role','dialog');menu.setAttribute('aria-label','Sign in');
 const status=document.createElement('p');status.className='sign-in-status';status.setAttribute('role','status');
 const start=document.createElement('button');start.type='button';start.className='menu-item sign-in-start';
 const paste=document.createElement('input');paste.className='project-search sign-in-paste';paste.placeholder='Paste the login response';paste.setAttribute('aria-label','Login response');paste.hidden=true;
 const cancel=document.createElement('button');cancel.type='button';cancel.className='menu-item sign-in-cancel';cancel.textContent='Cancel';cancel.hidden=true;
 menu.append(status,start,paste,cancel);document.body.append(menu);
 let signedIn=false,running=false,url=null,waiting=null;
 function settle(value){waiting?.(value);waiting=null;}
 function draw(){
  status.textContent=running?(url?'Finish signing in in your browser.':'Opening your browser…'):'Sign in with your OpenAI account to start sessions.';
  start.innerHTML=icon(running?'refresh':'external')+`<span>${running?'Open the sign-in page again':'Continue in browser'}</span>`;start.disabled=running&&!url;cancel.hidden=!running;
 }
 function close(focus=false){hidePopover(menu);pill.setAttribute('aria-expanded','false');if(focus&&!pill.hidden)pill.focus();if(!running)settle(false);}
 function open(){draw();const rect=(pill.offsetParent?pill:document.querySelector('.send-button')).getBoundingClientRect();menu.style.left=`${Math.max(12,Math.min(rect.left,innerWidth-292))}px`;menu.style.top=`${Math.min(rect.bottom+6,innerHeight-300)}px`;menu.style.setProperty('--popover-origin','top left');showPopover(menu);pill.setAttribute('aria-expanded','true');start.focus();}
 function done(){signedIn=true;running=false;url=null;pill.hidden=true;paste.hidden=true;settle(true);close();toast('Signed in');document.dispatchEvent(new Event('suffice:signed-in'));}
 async function begin(){
  running=true;url=null;paste.value='';draw();
  try{const result=await api.login();if(result?.authenticated)done();else{running=false;draw();toast('Sign-in did not finish. Try again.');}}
  catch(error){running=false;paste.hidden=true;draw();if(!/cancelled/i.test(error.message))toast(error.message);}
 }
 api.onEvent(event=>{
  if(event.event==='login_url'){url=event.url;draw();}
  if(event.event==='login_prompt'){paste.hidden=false;paste.placeholder=event.message||'Paste the login response';if(!menu.hidden)paste.focus();}
 });
 start.addEventListener('click',()=>{if(running&&url)void api.loginOpen().catch(error=>toast(error.message));else void begin();});
 paste.addEventListener('keydown',event=>{if(event.key==='Enter'&&paste.value.trim()){event.preventDefault();void api.loginInput(paste.value.trim()).catch(error=>toast(error.message));paste.value='';}});
 cancel.addEventListener('click',()=>{void api.loginCancel();running=false;close(true);});
 pill.addEventListener('click',()=>{if(pill.getAttribute('aria-expanded')==='true')close();else open();});
 menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close(true);}});
 document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target)&&!pill.contains(event.target))close();});
 window.addEventListener('resize',()=>close());
 const ready=api.status().then(result=>{signedIn=Boolean(result.authenticated);pill.hidden=signedIn;}).catch(error=>toast(error.message));
 return {async ensure(){await ready;if(signedIn)return true;const result=new Promise(resolve=>{settle(false);waiting=resolve;});open();return result;}};
}

import {icon} from './ui.js';
import './browser-panel.css';

const webAddress=text=>{
  const value=text.trim();
  if(!value)throw new Error('Enter a web address.');
  if(value==='about:blank')return value;
  const local=/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(?=[:/]|$)/i.test(value);
  const url=new URL(/^[\w+.-]+:\/\//.test(value)?value:(local?'http://':'https://')+value);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||/^[\w+.-]+:(?!\/\/|\d)/.test(value))throw new Error('Enter an HTTP or HTTPS address without a username or password.');
  return url.href;
};
export function createBrowserPanel(api,button){
 let instance;
 function create(thread){
  const token=crypto.randomUUID(),root=document.createElement('section'),bar=document.createElement('form'),address=document.createElement('input'),status=document.createElement('p'),viewport=document.createElement('div'),welcome=document.createElement('div');
  root.className='browser-panel';bar.className='browser-toolbar';bar.setAttribute('aria-label','Browser navigation');address.type='text';address.inputMode='url';address.autocomplete='off';address.spellcheck=false;address.placeholder='Enter web address';address.setAttribute('aria-label','Browser address');
  status.className='browser-status';status.role='status';status.hidden=true;viewport.className='browser-viewport';welcome.className='browser-welcome';
  const mark=document.createElement('span');mark.innerHTML=icon('globe');const heading=document.createElement('strong');heading.textContent='Browse the web';const note=document.createElement('span');note.textContent='Enter a web address above to open it beside your chat.';welcome.append(mark,heading,note);viewport.append(welcome);
  const back=button('Browser back','back'),forward=button('Browser forward','back'),refresh=button('Reload page','refresh');forward.classList.add('browser-forward');const dismiss=button('Close pop-up and return to previous page','close');dismiss.hidden=true;bar.append(back,forward,refresh,address,dismiss);root.append(bar,status,viewport);
  let active=false,loaded=false,lockAddress=false,lastUrl='',lastBounds='',raf=0,stopObserving=()=>{},gone=false,hasPage=false;
  function report(message){status.textContent=message;status.hidden=!message;}
  function draw(state){
   if(!state||state.token!==token||gone)return;
   const url=state.url||'about:blank';if(url!==lastUrl&&!lockAddress)address.value=url==='about:blank'?'':url;lastUrl=url;hasPage=url!=='about:blank'||state.loading||state.popupDepth>0;dismiss.hidden=!state.popupDepth;welcome.hidden=hasPage;
   back.disabled=!state.canBack;forward.disabled=!state.canForward;refresh.disabled=!hasPage;address.title=state.title||'Browser address';
   report(state.error||(state.loading?'Loading…':''));schedule();
  }
  function command(action,extra={}){
    return Promise.resolve().then(()=>api.browser({action,token,...extra})).catch(error=>{if(!gone)report(error.message);return null;});
  }
  function schedule(){if(active&&!gone&&!raf)raf=requestAnimationFrame(position);}
  function position(){
   raf=0;if(!active||!loaded||gone)return;
   const r=viewport.getBoundingClientRect(),bounds={x:Math.ceil(r.left),y:Math.ceil(r.top),width:Math.max(0,Math.floor(r.right)-Math.ceil(r.left)),height:Math.max(0,Math.floor(r.bottom)-Math.ceil(r.top))};
   const intersects=el=>{const b=el.getBoundingClientRect();return b.width&&b.height&&b.left<r.right&&b.right>r.left&&b.top<r.bottom&&b.bottom>r.top&&getComputedStyle(el).visibility!=='hidden';};
   const occluded=!!document.querySelector('dialog[open],html.settings-open')||[...document.querySelectorAll('.popover:not([hidden]),[role="menu"]:not([hidden])')].some(intersects);
   const show=hasPage&&r.width>8&&r.height>8&&!document.hidden&&!occluded&&getComputedStyle(viewport).visibility!=='hidden'&&root.isConnected;
   const key=show?JSON.stringify(bounds):'hidden';if(key===lastBounds)return;lastBounds=key;void command(show?'bounds':'hide',show?{bounds}:{});
  }
  function deactivate(){if(!active)return;active=false;stopObserving();cancelAnimationFrame(raf);raf=0;lastBounds='hidden';void command('hide');}
  function activate(body){
   if(!root.isConnected||root.parentNode!==body)body.replaceChildren(root);
   if(!active){active=true;const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{attributes:true,childList:true,subtree:true,attributeFilter:['class','style','open','hidden']});const size=new ResizeObserver(schedule);size.observe(viewport);
    for(const name of ['scroll','transitionend','visibilitychange'])document.addEventListener(name,schedule,true);
    stopObserving=()=>{observer.disconnect();size.disconnect();for(const name of ['scroll','transitionend','visibilitychange'])document.removeEventListener(name,schedule,true);};
   }schedule();
  }
  function close(){deactivate();gone=true;unsubscribe?.();void command('close');root.remove();}
  dismiss.onclick=()=>void command('dismiss-popup');
  back.onclick=()=>void command('back');forward.onclick=()=>void command('forward');refresh.onclick=()=>void command('reload');
  address.oninput=()=>{lockAddress=true;};address.onblur=()=>{lockAddress=false;};address.onkeydown=e=>{if(e.key==='Escape'){lockAddress=false;address.value=lastUrl==='about:blank'?'':lastUrl;address.select();}};
  bar.onsubmit=e=>{e.preventDefault();try{const url=webAddress(address.value);lockAddress=false;address.value=url;report('');void command('navigate',{url});}catch(error){report(error.message);}};
  const unsubscribe=api.onBrowserState?.(draw);
  void command('open').then(state=>{loaded=!!state;draw(state);});
  return {activate,deactivate,close,thread};
 }
 return {sync(thread,open,selected,stillExists){
   if(instance&&(instance.thread!==thread||!stillExists)){instance.close();instance=null;}
   if(instance&&(!open||!selected))instance.deactivate();
 },mount(body,thread){instance??=create(thread);instance.activate(body);}};
}

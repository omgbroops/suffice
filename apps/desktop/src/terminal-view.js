import {preference} from './settings-preferences.js';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './terminal.css';
export function createTerminalViews({api,onLabel}){
 const views=new Map();
 const key=(threadId,id)=>threadId+':'+id;
 function theme(){const root=getComputedStyle(document.querySelector('.sidebar')),light=document.documentElement.dataset.theme==='light';return {background:root.backgroundColor,foreground:getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),cursor:getComputedStyle(document.documentElement).getPropertyValue('--text-strong').trim(),selectionBackground:light?'#00000020':'#ffffff26',black:light?'#202020':'#343434',red:'#e06c75',green:light?'#26864c':'#98c379',yellow:light?'#9d7620':'#e5c07b',blue:light?'#3976c9':'#61afef',magenta:light?'#8e4ca7':'#c678dd',cyan:light?'#25818c':'#56b6c2',white:light?'#6f6f6f':'#dddddd',brightBlack:light?'#858585':'#727272',brightRed:'#ef8188',brightGreen:'#a8d38a',brightYellow:'#eed08b',brightBlue:'#81baff',brightMagenta:'#da9be9',brightCyan:'#7ed5df',brightWhite:light?'#151515':'#f0f0f0'};}
 document.addEventListener('suffice-preference',()=>{for(const view of views.values()){view.term.options.fontFamily=preference('terminal-font','JetBrains Mono')+', monospace';view.term.options.fontSize=parseInt(preference('terminal-size','12 px'));view.term.options.cursorStyle=preference('cursor','Bar').toLowerCase();view.term.options.cursorBlink=preference('cursor-blink',true)&&!preference('reduced-motion',false)&&!matchMedia('(prefers-reduced-motion:reduce)').matches;view.term.options.scrollback=parseInt(preference('scrollback','5,000 lines').replace(',',''));view.fit.fit();}});
 const updateTheme=()=>{for(const view of views.values())view.term.options.theme=theme();};new MutationObserver(updateTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
 function ended(view,code){if(view.exited)return;view.exited=true;view.disposeInput?.();view.term.options.disableStdin=true;view.term.write(`\r\n\x1b[90m[Process exited${Number.isInteger(code)?' '+code:''}]\x1b[0m\r\n`);}
 api.onTerminalEvent(event=>{const view=views.get(key(event.threadId,event.id));if(!view||view.closed)return;if(!view.ready){view.queued.push(event);return;}if(event.type==='data'&&event.sequence>view.sequence){view.sequence=event.sequence;view.term.write(event.data);}if(event.type==='exit')ended(view,event.exitCode);});
 async function mount(body,threadId,id,ordinal=1,extra){
  const name=key(threadId,id);let view=views.get(name);
  if(!view){const node=document.createElement('div');node.className='terminal-session';node.setAttribute('aria-label','Terminal session');
   const term=new Terminal({fontFamily:preference('terminal-font','JetBrains Mono')+', monospace',fontSize:parseInt(preference('terminal-size','12 px')),fontWeight:400,lineHeight:1.3,letterSpacing:0,cursorStyle:preference('cursor','Bar').toLowerCase(),cursorWidth:1,cursorBlink:preference('cursor-blink',true)&&!preference('reduced-motion',false)&&!matchMedia('(prefers-reduced-motion: reduce)').matches,scrollback:parseInt(preference('scrollback','5,000 lines').replace(',','')),theme:theme(),allowTransparency:false,allowProposedApi:false});const fit=new FitAddon();term.loadAddon(fit);
   view={node,term,fit,ready:false,queued:[],sequence:0,closed:false,threadId,id};views.set(name,view);body.replaceChildren(node);term.open(node);
   // Output may never read or replace the system clipboard using OSC 52.
   term.parser.registerOscHandler(52,()=>true);
   let pendingInput='',inputTimer,inputBlocked=false,inputTail=Promise.resolve();
   function flushInput(){if(!view.ready||view.closed||view.exited||inputBlocked)return;while(pendingInput){const data=pendingInput.slice(0,65536);pendingInput=pendingInput.slice(data.length);inputTail=inputTail.then(()=>{if(!view.closed&&!view.exited)return api.terminalWrite({threadId,id,data});}).catch(()=>{});}}
   // Inbox ConPTY can still be redrawing Readline after focus or resize. Preserve
   // early keys in order instead of letting that redraw consume the first key.
   function settleInput(){if(!view.windowsPty)return;inputBlocked=true;clearTimeout(inputTimer);inputTimer=setTimeout(()=>{inputBlocked=false;flushInput();},300);}
   view.settleInput=settleInput;
   view.disposeInput=()=>{clearTimeout(inputTimer);pendingInput='';};
   term.textarea.addEventListener('focus',settleInput);
   term.onData(data=>{if(!view.closed&&!view.exited){pendingInput+=data;flushInput();}});
   term.onResize(({cols,rows})=>{if(view.ready&&!view.exited){settleInput();void api.terminalResize({threadId,id,cols,rows}).catch(()=>{});}});
   // ConPTY repaints asynchronously; coalesce drag bursts before changing both grids.
   view.resize=new ResizeObserver(()=>{clearTimeout(view.resizeTimer);view.resizeTimer=setTimeout(()=>{view.frame=requestAnimationFrame(()=>{if(node.isConnected&&node.clientWidth&&node.clientHeight)fit.fit();});},75);});view.resize.observe(node);
   view.start=(async()=>{try{await document.fonts.ready;fit.fit();const snapshot=await api.terminalCreate({...extra,threadId,id,ordinal,cols:Math.max(2,term.cols),rows:Math.max(1,term.rows)});if(view.closed){void api.terminalClose({threadId,id});return;}if(snapshot.windowsPty){view.windowsPty=snapshot.windowsPty;term.options.windowsPty=snapshot.windowsPty;}view.ready=true;settleInput();flushInput();view.sequence=snapshot.sequence;term.write(snapshot.output);onLabel(threadId,id,snapshot.label);if(snapshot.exited)ended(view,snapshot.exitCode);for(const event of view.queued){if(event.type==='data'&&event.sequence>view.sequence){view.sequence=event.sequence;term.write(event.data);}if(event.type==='exit')ended(view,event.exitCode);}view.queued=[];
    if(node.isConnected){fit.fit();term.focus();}
   }catch(error){if(!view.closed)term.write('\x1b[90m'+String(error.message).replace(/[\x00-\x1f\x7f]/g,' ')+'\x1b[0m\r\n');}})();
  }else if(view.node.parentElement!==body){body.replaceChildren(view.node);requestAnimationFrame(()=>{if(view.node.isConnected){view.fit.fit();view.term.focus();}});}
  return view;
 }
 function close(threadId,id){const name=key(threadId,id),view=views.get(name);for(const other of views.values())if(other!==view)other.settleInput();if(view){view.closed=true;clearTimeout(view.resizeTimer);cancelAnimationFrame(view.frame);view.resize.disconnect();view.disposeInput();view.term.dispose();views.delete(name);}void api.terminalClose({threadId,id}).catch(()=>{});}
 return {mount,close};
}

import {preference} from './settings-preferences.js';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import {Unicode11Addon} from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';
import './terminal.css';
export function createTerminalViews({api,onLabel}){
 const views=new Map();
 const key=(threadId,id)=>threadId+':'+id;
 // Only the ground colours follow the app so text stays readable; the 16 ANSI colours are xterm's standard palette and 256/true colour pass through untouched.
 function theme(){const css=getComputedStyle(document.documentElement),light=document.documentElement.dataset.theme==='light';return {background:'#00000000',foreground:css.getPropertyValue('--text').trim(),cursor:css.getPropertyValue('--text-strong').trim(),selectionBackground:light?'#00000020':'#ffffff26'};}
 const updateTheme=()=>{for(const view of views.values())view.term.options.theme=theme();};new MutationObserver(updateTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
 function ended(view,code){if(view.exited)return;view.exited=true;view.disposeInput?.();view.term.options.disableStdin=true;view.term.write(`\r\n\x1b[90m[Process exited${Number.isInteger(code)?' '+code:''}]\x1b[0m\r\n`);}
 api.onTerminalEvent(event=>{const view=views.get(key(event.threadId,event.id));if(!view||view.closed)return;if(!view.ready){view.queued.push(event);return;}if(event.type==='data'&&event.sequence>view.sequence){view.sequence=event.sequence;view.term.write(event.data);}if(event.type==='exit')ended(view,event.exitCode);});
 async function mount(body,threadId,id,ordinal=1,extra){
  const name=key(threadId,id);let view=views.get(name);
  if(!view){const node=document.createElement('div');node.className='terminal-session';node.setAttribute('aria-label','Terminal session');
   const term=new Terminal({fontFamily:'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace',fontSize:12,lineHeight:1,scrollback:parseInt(preference('scrollback','5,000 lines').replace(',','')),theme:theme(),allowTransparency:true,allowProposedApi:true});const fit=new FitAddon();term.loadAddon(fit);term.loadAddon(new Unicode11Addon());term.unicode.activeVersion='11';
   view={node,term,fit,ready:false,queued:[],sequence:0,closed:false,threadId,id};views.set(name,view);body.replaceChildren(node);term.open(node);
   // Output may never read or replace the system clipboard using OSC 52.
   term.parser.registerOscHandler(52,()=>true);
   // One chunk in flight at a time: a Ctrl-C drops the unsent rest of a paste (as a tty flushes on interrupt) and goes out at once.
   let pendingInput='',inputTimer,inputBlocked=false,sending=false;
   function flushInput(){if(!view.ready||view.closed||view.exited||inputBlocked||sending||!pendingInput)return;const data=pendingInput.slice(0,65536);pendingInput=pendingInput.slice(data.length);sending=true;Promise.resolve(api.terminalWrite({threadId,id,data})).catch(()=>{}).finally(()=>{sending=false;flushInput();});}
   // Inbox ConPTY can still be redrawing Readline after focus or resize. Preserve
   // early keys in order instead of letting that redraw consume the first key.
   function settleInput(){if(!view.windowsPty)return;inputBlocked=true;clearTimeout(inputTimer);inputTimer=setTimeout(()=>{inputBlocked=false;flushInput();},300);}
   view.settleInput=settleInput;
   view.disposeInput=()=>{clearTimeout(inputTimer);pendingInput='';};
   term.textarea.addEventListener('focus',settleInput);
   term.onData(data=>{if(!view.closed&&!view.exited){pendingInput=data.includes('\x03')?data:pendingInput+data;flushInput();}});
   term.onResize(({cols,rows})=>{if(view.ready&&!view.exited){settleInput();void api.terminalResize({threadId,id,cols,rows}).catch(()=>{});}});
   // ConPTY repaints asynchronously; coalesce drag bursts before changing both grids.
   let wasEmpty=true;view.resize=new ResizeObserver(()=>{const empty=!node.clientWidth||!node.clientHeight,shown=wasEmpty&&!empty;wasEmpty=empty;clearTimeout(view.resizeTimer);const run=()=>{view.frame=requestAnimationFrame(()=>{if(node.isConnected&&node.clientWidth&&node.clientHeight)fit.fit();});};if(shown)run();else view.resizeTimer=setTimeout(run,75);});view.resize.observe(node);
   view.start=(async()=>{try{await document.fonts.ready;fit.fit();const snapshot=await api.terminalCreate({...extra,threadId,id,ordinal,cols:Math.max(2,term.cols),rows:Math.max(1,term.rows)});if(view.closed){void api.terminalClose({threadId,id});return;}if(snapshot.windowsPty){view.windowsPty=snapshot.windowsPty;term.options.windowsPty=snapshot.windowsPty;}view.ready=true;settleInput();flushInput();view.sequence=snapshot.sequence;term.write(snapshot.output);onLabel(threadId,id,snapshot.label);if(snapshot.exited)ended(view,snapshot.exitCode);for(const event of view.queued){if(event.type==='data'&&event.sequence>view.sequence){view.sequence=event.sequence;term.write(event.data);}if(event.type==='exit')ended(view,event.exitCode);}view.queued=[];
    if(node.isConnected){fit.fit();term.focus();}
   }catch(error){if(!view.closed)term.write('\x1b[90m'+String(error.message).replace(/[\x00-\x1f\x7f]/g,' ')+'\x1b[0m\r\n');}})();
  }else if(view.node.parentElement!==body){body.replaceChildren(view.node);requestAnimationFrame(()=>{if(view.node.isConnected){view.fit.fit();view.term.focus();}});}
  return view;
 }
 function close(threadId,id){const name=key(threadId,id),view=views.get(name);for(const other of views.values())if(other!==view)other.settleInput();if(view){view.closed=true;clearTimeout(view.resizeTimer);cancelAnimationFrame(view.frame);view.resize.disconnect();view.disposeInput();view.term.dispose();views.delete(name);}void api.terminalClose({threadId,id}).catch(()=>{});}
 return {mount,close};
}
